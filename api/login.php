<?php
// api/login.php
// Checks username + password. Receives JSON, answers with JSON.
//
// Order of checks (so we never reveal an account's status to someone
// who doesn't know its password):
//   1. too many recent failures?      -> 429
//   2. wrong username or password?    -> 401 (same message for both)
//   3. account pending/suspended/banned? -> 403 with the reason
//   4. regular user picked the wrong role button? -> 403
//   5. success: start the session

require __DIR__ . '/../includes/auth.php';

header('Content-Type: application/json; charset=utf-8');

const MAX_FAILED_LOGINS = 5;     // wrong tries allowed...
const LOCKOUT_SECONDS   = 900;   // ...within this many seconds (15 minutes)

function reply($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(['error' => 'Use POST.'], 405);
}

$in       = json_decode(file_get_contents('php://input'), true) ?: [];
$username = strtolower(trim((string) ($in['username'] ?? '')));
$password = (string) ($in['password'] ?? '');
$role     = (string) ($in['role'] ?? 'student');

if ($username === '' || $password === '') {
    reply(['error' => 'Enter your username and password.'], 422);
}

$ip = $_SERVER['REMOTE_ADDR'] ?? '';

try {
    // 1. Too many recent wrong passwords for this username?
    $window = (int) LOCKOUT_SECONDS;
    $stmt = mysqli_prepare(
        $conn,
        "SELECT COUNT(*) AS n FROM login_attempts
         WHERE identifier = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL $window SECOND)"
    );
    mysqli_stmt_bind_param($stmt, 's', $username);
    mysqli_stmt_execute($stmt);
    $row = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt));
    if ((int) $row['n'] >= MAX_FAILED_LOGINS) {
        log_security_event('LOGIN_LOCKED', null, null, "Too many attempts for $username");
        reply(['error' => 'Too many attempts. Please try again in a few minutes.'], 429);
    }

    // 2. Find the account and check the password.
    $stmt = mysqli_prepare($conn,
        'SELECT id, display_name, role, status, status_reason, password_hash, session_version
         FROM users WHERE username = ?');
    mysqli_stmt_bind_param($stmt, 's', $username);
    mysqli_stmt_execute($stmt);
    $user = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt));

    $ok = $user ? password_verify($password, $user['password_hash']) : false;

    if (!$ok) {
        $stmt = mysqli_prepare($conn, 'INSERT INTO login_attempts (identifier, ip) VALUES (?, ?)');
        mysqli_stmt_bind_param($stmt, 'ss', $username, $ip);
        mysqli_stmt_execute($stmt);
        log_security_event('LOGIN_FAILED', null, $user ? (int) $user['id'] : null,
            ($user ? 'Wrong password' : 'Unknown username') . " for $username");
        reply(['error' => 'Incorrect username or password.'], 401);
    }

    $userId = (int) $user['id'];

    // 3. Is the account allowed to sign in?
    if ($user['status'] !== 'active') {
        $messages = [
            'pending'   => 'Your account is waiting for an administrator to approve it.',
            'suspended' => 'Your account has been suspended.',
            'banned'    => 'This account has been banned.',
        ];
        $message = $messages[$user['status']] ?? 'This account cannot sign in.';
        if ($user['status'] !== 'pending' && !empty($user['status_reason'])) {
            $reason = rtrim($user['status_reason']);
            $message .= ' Reason: ' . $reason . (preg_match('/[.!?]$/', $reason) ? '' : '.');
        }
        if ($user['status'] === 'suspended') {
            $message .= ' Contact an administrator if you think this is a mistake.';
        }
        log_security_event('LOGIN_BLOCKED', null, $userId, "Account is {$user['status']}");
        reply(['error' => $message, 'status' => $user['status']], 403);
    }

    // 4. Admins and Super Admins can use either role button; everyone else must pick their own.
    if (!is_staff_role($user['role']) && $user['role'] !== $role) {
        reply(['error' => 'The selected role does not match this account.'], 403);
    }

    // Success: forget the failed tries.
    $stmt = mysqli_prepare($conn, 'DELETE FROM login_attempts WHERE identifier = ?');
    mysqli_stmt_bind_param($stmt, 's', $username);
    mysqli_stmt_execute($stmt);
} catch (mysqli_sql_exception $e) {
    reply(['error' => 'Database error. Did you import db/studyhub.sql (or run the db/migrate_*.sql files on an older database)?'], 500);
}

// 5. Start the session. Only the id and session version matter; everything
//    else is re-read from the database on each request (includes/auth.php).
session_regenerate_id(true);
$_SESSION['user'] = [
    'id'   => $userId,
    'name' => $user['display_name'],
    'role' => $user['role'],
    'v'    => (int) $user['session_version'],
];
log_security_event('LOGIN', $userId, $userId, 'Signed in as ' . role_label($user['role']));

reply(['ok' => true, 'redirect' => 'index.php']);
