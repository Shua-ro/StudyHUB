<?php
// api/signup.php
// Creates a new account. Receives JSON, answers with JSON.

require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/db.php';

header('Content-Type: application/json; charset=utf-8');

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
$name     = trim((string) ($in['name'] ?? ''));
$username = strtolower(trim((string) ($in['username'] ?? '')));
$password = (string) ($in['password'] ?? '');
$role     = (string) ($in['role'] ?? 'student');

if ($name === '' || mb_strlen($name) > 100) {
    reply(['error' => 'Enter your full name (max 100 characters).'], 422);
}
if (!filter_var($username, FILTER_VALIDATE_EMAIL) || strlen($username) > 190) {
    reply(['error' => 'Enter a valid email address.'], 422);
}
if (strlen($password) < 8) {
    reply(['error' => 'Password must be at least 8 characters.'], 422);
}
// Signup can only make students and teachers. Admins are made by hand in the database.
if ($role !== 'student' && $role !== 'teacher') {
    $role = 'student';
}

// Is the email already used?
$stmt = mysqli_prepare($conn, 'SELECT id FROM users WHERE username = ?');
mysqli_stmt_bind_param($stmt, 's', $username);
mysqli_stmt_execute($stmt);
$found = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt));
if ($found) {
    reply(['error' => 'An account with this email already exists.'], 409);
}

$hash = password_hash($password, PASSWORD_DEFAULT);

try {
    $stmt = mysqli_prepare($conn, 'INSERT INTO users (username, display_name, role, password_hash) VALUES (?, ?, ?, ?)');
    mysqli_stmt_bind_param($stmt, 'ssss', $username, $name, $role, $hash);
    mysqli_stmt_execute($stmt);
} catch (mysqli_sql_exception $e) {
    if ($e->getCode() === 1062) {   // duplicate key (two signups at the same time)
        reply(['error' => 'An account with this email already exists.'], 409);
    }
    reply(['error' => 'Could not create the account. Did you import db/loginsignup.sql?'], 500);
}

$userId = (int) mysqli_insert_id($conn);

// Log the new user in.
session_regenerate_id(true);
$_SESSION['user'] = ['id' => $userId, 'name' => $name, 'role' => $role];

reply(['ok' => true, 'redirect' => 'index.php']);
