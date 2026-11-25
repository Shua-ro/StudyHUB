<?php
declare(strict_types=1);
require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/api.php';

$in       = read_json_body();
$username = strtolower(trim((string) ($in['username'] ?? '')));
$password = (string) ($in['password'] ?? '');
$role     = (string) ($in['role'] ?? 'student');

if ($username === '' || $password === '') {
    json_out(422, ['error' => 'Enter your username and password.']);
}

$pdo = db();
$ip  = $_SERVER['REMOTE_ADDR'] ?? '';

// Rate limit: too many recent failures for this account name.
$window = (int) LOCKOUT_SECONDS;
$stmt = $pdo->prepare(
    "SELECT COUNT(*) FROM login_attempts
     WHERE identifier = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL $window SECOND)"
);
$stmt->execute([$username]);
if ((int) $stmt->fetchColumn() >= MAX_FAILED_LOGINS) {
    json_out(429, ['error' => 'Too many attempts. Please try again in a few minutes.']);
}

$stmt = $pdo->prepare('SELECT id, display_name, role, password_hash FROM users WHERE username = ?');
$stmt->execute([$username]);
$row = $stmt->fetch();

if ($row) {
    $ok = password_verify($password, $row['password_hash']);
} else {
    password_hash($password, PASSWORD_DEFAULT); // similar timing for unknown users
    $ok = false;
}

if (!$ok) {
    $pdo->prepare('INSERT INTO login_attempts (identifier, ip) VALUES (?, ?)')->execute([$username, $ip]);
    json_out(401, ['error' => 'Incorrect username or password.']);
}

// Admins may sign in through either role; everyone else must match.
if ($row['role'] !== 'admin' && $row['role'] !== $role) {
    json_out(403, ['error' => 'The selected role does not match this account.']);
}

$pdo->prepare('DELETE FROM login_attempts WHERE identifier = ?')->execute([$username]);
if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
    $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        ->execute([password_hash($password, PASSWORD_DEFAULT), $row['id']]);
}

login_user($row);
json_out(200, ['ok' => true, 'redirect' => 'index.php']);
