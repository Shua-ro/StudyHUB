<?php
// logout.php
// Ends the PHP session completely, then sends the visitor to the login page.

require __DIR__ . '/includes/auth.php';   // starts the session

// Record who signed out (read straight from the session; no re-validation needed).
if (!empty($_SESSION['user']['id'])) {
    $id = (int) $_SESSION['user']['id'];
    log_security_event('LOGOUT', $id, $id, 'Signed out');
}

// 1. Empty the session data on the server.
$_SESSION = [];

// 2. Expire the session cookie in the browser.
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

// 3. Delete the session file on the server.
session_destroy();

// 4. Don't let the browser show a cached logged-in page with the Back button.
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Location: login.html');
exit;
