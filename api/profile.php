<?php
// lets anyone logged in edit their OWN account. never takes a user id from the request,
// always the session user.
//   update_details  - name + email (email change needs the current password)
//   change_password - current + new
// wrong passwords count toward a lockout (5 tries / 15 min) so nobody can guess
// on a computer someone left logged in

require __DIR__ . '/../includes/auth.php';

header('Content-Type: application/json; charset=utf-8');

const MAX_WRONG_PASSWORDS = 5;
const WRONG_PASSWORD_WINDOW = 900;   // seconds
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;             // bcrypt only uses the first 72 bytes

function reply($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(['ok' => false, 'message' => 'Use POST.'], 405);
}

$user = api_user(true);   // still has to work after a reset
$userId = $user['id'];

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    reply(['ok' => false, 'message' => 'Bad data.'], 400);
}
$action = $input['action'] ?? '';

// after an admin reset, changing the password is the only thing allowed
if ($user['must_change_password'] && $action !== 'change_password') {
    api_refuse(403, 'Choose a new password first.', 'must_change_password');
}

// helpers

// checks the current password, with lockout
function verify_current_password(mysqli $conn, int $userId, string $password): void
{
    if ($password === '') {
        reply(['ok' => false, 'message' => 'Enter your current password to make this change.', 'field' => 'currentPassword'], 422);
    }
    $key = "profile:$userId";
    $window = (int) WRONG_PASSWORD_WINDOW;
    $stmt = mysqli_prepare($conn,
        "SELECT COUNT(*) AS n FROM login_attempts
         WHERE identifier = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL $window SECOND)");
    mysqli_stmt_bind_param($stmt, 's', $key);
    mysqli_stmt_execute($stmt);
    if ((int) mysqli_fetch_assoc(mysqli_stmt_get_result($stmt))['n'] >= MAX_WRONG_PASSWORDS) {
        reply(['ok' => false, 'message' => 'Too many wrong passwords. Try again in a few minutes.'], 429);
    }

    $stmt = mysqli_prepare($conn, 'SELECT password_hash FROM users WHERE id = ?');
    mysqli_stmt_bind_param($stmt, 'i', $userId);
    mysqli_stmt_execute($stmt);
    $hash = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt))['password_hash'] ?? '';

    if ($password === '' || !password_verify($password, $hash)) {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $stmt = mysqli_prepare($conn, 'INSERT INTO login_attempts (identifier, ip) VALUES (?, ?)');
        mysqli_stmt_bind_param($stmt, 'ss', $key, $ip);
        mysqli_stmt_execute($stmt);
        log_security_event('PASSWORD_CHECK_FAILED', $userId, $userId, 'Wrong current password on the profile page');
        reply(['ok' => false, 'message' => 'Your current password is incorrect.', 'field' => 'currentPassword'], 403);
    }

    $stmt = mysqli_prepare($conn, 'DELETE FROM login_attempts WHERE identifier = ?');
    mysqli_stmt_bind_param($stmt, 's', $key);
    mysqli_stmt_execute($stmt);
}

try {

    // name + email
    if ($action === 'update_details') {
        $name  = trim((string) ($input['name'] ?? ''));
        $email = strtolower(trim((string) ($input['email'] ?? '')));

        if ($name === '' || mb_strlen($name) > 100) {
            reply(['ok' => false, 'message' => 'Enter your full name (max 100 characters).', 'field' => 'name'], 422);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
            reply(['ok' => false, 'message' => 'Enter a valid email address.', 'field' => 'email'], 422);
        }

        $emailChanged = $email !== $user['username'];
        $nameChanged  = $name !== $user['name'];
        if (!$emailChanged && !$nameChanged) {
            reply(['ok' => true, 'name' => $name, 'email' => $email, 'message' => 'Nothing changed.']);
        }

        if ($emailChanged) {
            verify_current_password($conn, $userId, (string) ($input['currentPassword'] ?? ''));

            $stmt = mysqli_prepare($conn, 'SELECT id FROM users WHERE username = ? AND id <> ?');
            mysqli_stmt_bind_param($stmt, 'si', $email, $userId);
            mysqli_stmt_execute($stmt);
            if (mysqli_fetch_assoc(mysqli_stmt_get_result($stmt))) {
                reply(['ok' => false, 'message' => 'Another account already uses that email.', 'field' => 'email'], 409);
            }
        }

        try {
            $stmt = mysqli_prepare($conn, 'UPDATE users SET display_name = ?, username = ? WHERE id = ?');
            mysqli_stmt_bind_param($stmt, 'ssi', $name, $email, $userId);
            mysqli_stmt_execute($stmt);
        } catch (mysqli_sql_exception $e) {
            if ($e->getCode() === 1062) {   // someone grabbed the email at the same time
                reply(['ok' => false, 'message' => 'Another account already uses that email.', 'field' => 'email'], 409);
            }
            throw $e;
        }

        if ($nameChanged) {
            log_security_event('NAME_CHANGED', $userId, $userId, "Name changed from \"{$user['name']}\" to \"$name\"");
        }
        if ($emailChanged) {
            log_security_event('EMAIL_CHANGED', $userId, $userId, "Email changed from {$user['username']} to $email");
        }
        reply(['ok' => true, 'name' => $name, 'email' => $email, 'message' => 'Your details were saved.']);
    }

    // password
    if ($action === 'change_password') {
        $current = (string) ($input['currentPassword'] ?? '');
        $new     = (string) ($input['newPassword'] ?? '');

        if (strlen($new) < MIN_PASSWORD) {
            reply(['ok' => false, 'message' => 'Your new password must be at least 8 characters.', 'field' => 'newPassword'], 422);
        }
        if (strlen($new) > MAX_PASSWORD) {
            reply(['ok' => false, 'message' => 'Your new password can be at most 72 characters.', 'field' => 'newPassword'], 422);
        }

        verify_current_password($conn, $userId, $current);

        if (hash_equals($current, $new)) {
            reply(['ok' => false, 'message' => 'Choose a password different from your current one.', 'field' => 'newPassword'], 422);
        }

        // new hash, clear must_change, bump session version so every other device gets logged out
        $hash = password_hash($new, PASSWORD_DEFAULT);
        $stmt = mysqli_prepare($conn,
            'UPDATE users SET password_hash = ?, must_change_password = 0, session_version = session_version + 1 WHERE id = ?');
        mysqli_stmt_bind_param($stmt, 'si', $hash, $userId);
        mysqli_stmt_execute($stmt);

        // ...but keep this one logged in
        $stmt = mysqli_prepare($conn, 'SELECT session_version FROM users WHERE id = ?');
        mysqli_stmt_bind_param($stmt, 'i', $userId);
        mysqli_stmt_execute($stmt);
        $_SESSION['user']['v'] = (int) mysqli_fetch_assoc(mysqli_stmt_get_result($stmt))['session_version'];
        session_regenerate_id(true);

        log_security_event('PASSWORD_CHANGED', $userId, $userId, 'Changed own password; other sessions signed out');
        reply(['ok' => true, 'message' => 'Your password was changed. Other devices were signed out.']);
    }

    reply(['ok' => false, 'message' => 'Unknown action.'], 400);

} catch (mysqli_sql_exception $e) {
    error_log('api/profile.php error: ' . $e->getMessage());
    reply(['ok' => false, 'message' => 'Database error. Nothing was changed.'], 500);
}
