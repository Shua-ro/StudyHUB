<?php
// Session start and login check. Used by every protected page.

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

/** Return the logged-in user, or null. */
function current_user(): ?array
{
    $u = $_SESSION['user'] ?? null;
    if (!$u) {
        return null;
    }
    return [
        'id'   => $u['id'],
        'name' => $u['name'],
        'role' => $u['role'] ?? 'student',   // student | teacher | admin
    ];
}

/** Send the visitor to login.html if not logged in. */
function require_login(): array
{
    $user = current_user();
    if (!$user) {
        header('Location: login.html');
        exit;
    }
    return $user;
}
