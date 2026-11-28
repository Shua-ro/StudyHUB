<?php
// logout: kill the session and go back to login

require __DIR__ . '/includes/auth.php';   // starts the session

// log who logged out (straight from the session)
if (!empty($_SESSION['user']['id'])) {
    $id = (int) $_SESSION['user']['id'];
    log_security_event('LOGOUT', $id, $id, 'Signed out');
}

// clear session data
$_SESSION = [];

// expire the cookie
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires'  => time() - 42000,
        'path'     => $params['path'],
        'domain'   => $params['domain'],
        'secure'   => $params['secure'],
        'httponly' => $params['httponly'],
        'samesite' => $params['samesite'] ?: 'Lax',
    ]);
}

// delete the session file
session_destroy();

// so Back doesn't show a cached logged in page
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Location: login.html');
exit;
