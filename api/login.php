<?php
// api/login.php
// Checks username + password. Receives JSON, answers with JSON.

require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/db.php';

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
    // Too many recent wrong passwords for this username?
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
        reply(['error' => 'Too many attempts. Please try again in a few minutes.'], 429);
    }

    // Find the account.
    $stmt = mysqli_prepare($conn, 'SELECT id, display_name, role, password_hash FROM users WHERE username = ?');
    mysqli_stmt_bind_param($stmt, 's', $username);
    mysqli_stmt_execute($stmt);
    $user = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt));

    $ok = $user ? password_verify($password, $user['password_hash']) : false;

    if (!$ok) {
        $stmt = mysqli_prepare($conn, 'INSERT INTO login_attempts (identifier, ip) VALUES (?, ?)');
        mysqli_stmt_bind_param($stmt, 'ss', $username, $ip);
        mysqli_stmt_execute($stmt);
        reply(['error' => 'Incorrect username or password.'], 401);
    }

    // Admins can sign in with either choice; everyone else must pick their own role.
    if ($user['role'] !== 'admin' && $user['role'] !== $role) {
        reply(['error' => 'The selected role does not match this account.'], 403);
    }

    // Success: forget the failed tries.
    $stmt = mysqli_prepare($conn, 'DELETE FROM login_attempts WHERE identifier = ?');
    mysqli_stmt_bind_param($stmt, 's', $username);
    mysqli_stmt_execute($stmt);
} catch (mysqli_sql_exception $e) {
    reply(['error' => 'Database error. Did you import db/loginsignup.sql?'], 500);
}

session_regenerate_id(true);
$_SESSION['user'] = [
    'id'   => (int) $user['id'],
    'name' => $user['display_name'],
    'role' => $user['role'],
];

reply(['ok' => true, 'redirect' => 'index.php']);
