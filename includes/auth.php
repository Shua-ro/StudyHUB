<?php
// session + login check, used by every protected page.
// session only stores the user id + session version. current_user() re-reads the account
// from the db every request, so bans/role changes kick in right away, and bumping
// session_version logs you out everywhere (used after a password reset)

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
    session_start();
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/permissions.php';

// why current_user() last returned null: '' | 'signed_out' | 'pending' | 'suspended' | 'banned'
$GLOBALS['AUTH_FAILURE'] = '';

// logged in user or null, checked against the db once per request
function current_user(): ?array
{
    static $checked = false;
    static $user = null;
    if ($checked) {
        return $user;
    }
    $checked = true;

    $sessionUser = $_SESSION['user'] ?? null;
    if (!$sessionUser || empty($sessionUser['id'])) {
        return null;
    }

    global $conn;
    $stmt = mysqli_prepare($conn,
        'SELECT id, username, display_name, role, status, status_reason, must_change_password, session_version
         FROM users WHERE id = ?');
    $id = (int) $sessionUser['id'];
    mysqli_stmt_bind_param($stmt, 'i', $id);
    mysqli_stmt_execute($stmt);
    $row = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt));

    // account deleted or logged out everywhere
    if (!$row || (int) $row['session_version'] !== (int) ($sessionUser['v'] ?? 0)) {
        end_session('signed_out', $row ? (int) $row['id'] : null);
        return null;
    }

    // got suspended/banned while logged in, kick them out
    if ($row['status'] !== 'active') {
        end_session($row['status'], (int) $row['id']);
        return null;
    }

    $user = [
        'id'                   => (int) $row['id'],
        'username'             => $row['username'],   // the login email
        'name'                 => $row['display_name'],
        'role'                 => $row['role'],   // student | teacher | admin | super_admin
        'must_change_password' => (bool) $row['must_change_password'],
    ];
    // keep the session copy up to date (role changes etc)
    $_SESSION['user']['name'] = $user['name'];
    $_SESSION['user']['role'] = $user['role'];
    return $user;
}

// kill the session, account can't use it anymore
function end_session(string $reason, ?int $userId): void
{
    $GLOBALS['AUTH_FAILURE'] = $reason;
    $_SESSION = [];
    session_regenerate_id(true);
    if ($userId !== null) {
        log_security_event('SESSION_ENDED', null, $userId, "Signed out automatically: $reason");
    }
}

// short msg for why it got refused (401s)
function auth_failure_message(): string
{
    switch ($GLOBALS['AUTH_FAILURE']) {
        case 'suspended':  return 'Your account has been suspended. Contact an administrator.';
        case 'banned':     return 'This account has been banned.';
        case 'pending':    return 'Your account is waiting for an administrator to approve it.';
        case 'signed_out': return 'You were signed out. Please log in again.';
        default:           return 'You are not logged in.';
    }
}

// code for login.html so it shows the right notice
function auth_failure_code(): string
{
    return $GLOBALS['AUTH_FAILURE'] ?: 'not_logged_in';
}

function api_refuse(int $httpCode, string $message, string $code): void
{
    http_response_code($httpCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'message' => $message, 'code' => $code]);
    exit;
}

// user for an API request, otherwise stops with
//   401 not logged in / signed out / suspended / banned
//   403 has to set a new password after a reset (only profile.php passes true)
function api_user(bool $allowPasswordChange = false): array
{
    $user = current_user();
    if (!$user) {
        api_refuse(401, auth_failure_message(), auth_failure_code());
    }
    if ($user['must_change_password'] && !$allowPasswordChange) {
        api_refuse(403, 'An administrator reset your password. Choose a new one on your Profile page first.', 'must_change_password');
    }
    return $user;
}

function require_login(): array
{
    $user = current_user();
    if (!$user) {
        $notice = $GLOBALS['AUTH_FAILURE'];
        header('Location: login.html' . ($notice ? '?notice=' . urlencode($notice) : ''));
        exit;
    }
    return $user;
}

// log a security event (logins, fails, role/status changes).
// never throws, a logging problem shouldn't break login
function log_security_event(string $event, ?int $actorId, ?int $targetUserId, string $details = ''): void
{
    global $conn;
    try {
        $ip = $_SERVER['REMOTE_ADDR'] ?? null;
        $details = mb_substr($details, 0, 500);
        $stmt = mysqli_prepare($conn,
            'INSERT INTO security_log (actor_id, target_user_id, event, details, ip) VALUES (?, ?, ?, ?, ?)');
        mysqli_stmt_bind_param($stmt, 'iisss', $actorId, $targetUserId, $event, $details, $ip);
        mysqli_stmt_execute($stmt);
    } catch (Throwable $e) {
        error_log('security_log write failed: ' . $e->getMessage());
    }
}
