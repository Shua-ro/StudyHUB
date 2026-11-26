<?php
// includes/auth.php
// Session start, login check and account re-validation. Used by every protected page.
//
// The session only remembers WHO you are (your user id + a session version).
// On every request current_user() re-reads your account from the database, so:
//   - a suspension or ban takes effect immediately (you are signed out),
//   - a role change takes effect immediately,
//   - bumping users.session_version signs you out everywhere
//     (used after an admin resets your password).

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
    session_start();
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/permissions.php';

// Why the last current_user() call returned null (for a helpful message).
// One of: '' (no session) | 'signed_out' | 'pending' | 'suspended' | 'banned'
$GLOBALS['AUTH_FAILURE'] = '';

/** Return the logged-in user, or null. Re-checked against the database once per request. */
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

    // Account deleted, or signed out everywhere (password reset, etc.).
    if (!$row || (int) $row['session_version'] !== (int) ($sessionUser['v'] ?? 0)) {
        end_session('signed_out', $row ? (int) $row['id'] : null);
        return null;
    }

    // Suspended / banned / pending while logged in: sign out now.
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
    // Keep the session copy fresh (e.g. after a role change).
    $_SESSION['user']['name'] = $user['name'];
    $_SESSION['user']['role'] = $user['role'];
    return $user;
}

/** Throw away the session because the account may no longer use it. */
function end_session(string $reason, ?int $userId): void
{
    $GLOBALS['AUTH_FAILURE'] = $reason;
    $_SESSION = [];
    session_regenerate_id(true);
    if ($userId !== null) {
        log_security_event('SESSION_ENDED', null, $userId, "Signed out automatically: $reason");
    }
}

/** A short message explaining why the request was refused (for 401 replies). */
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

/** A machine-readable code the page can use to show the right notice on login.html. */
function auth_failure_code(): string
{
    return $GLOBALS['AUTH_FAILURE'] ?: 'not_logged_in';
}

/** Stop a JSON API request with an error. */
function api_refuse(int $httpCode, string $message, string $code): void
{
    http_response_code($httpCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'message' => $message, 'code' => $code]);
    exit;
}

/**
 * The user for a JSON API request, or stop with:
 *   401  not logged in / signed out / suspended / banned
 *   403  an admin reset the password and a new one hasn't been chosen yet
 *        (only api/profile.php passes $allowPasswordChange = true)
 */
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

/** Send the visitor to login.html if not logged in. */
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

/**
 * Record a security event (logins, failed logins, role/status changes, ...).
 * Never throws: a logging problem must not break login.
 */
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
