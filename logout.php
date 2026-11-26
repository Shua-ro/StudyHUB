<?php
// logout.php - ends the session and returns to the login page.
// (index.php's "Sign out" button sends the browser here.)
require __DIR__ . '/includes/auth.php';

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
}
session_destroy();

header('Location: login.html');
exit;