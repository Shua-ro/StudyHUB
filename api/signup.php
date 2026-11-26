<?php
// api/signup.php
// Creates a new account. Receives JSON, answers with JSON.
//
// Students are active immediately and signed in.
// Teachers start as "pending" and must be approved by an Admin before they
// can sign in (teachers manage classrooms, so a person checks them first).

require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/settings.php';

header('Content-Type: application/json; charset=utf-8');

function reply($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// GET: which sign-ups are open (signup.html uses this to adapt the form).
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $settings = get_settings($conn);
    reply([
        'allowSignups'        => $settings['allow_signups'] === '1',
        'allowTeacherSignups' => $settings['allow_signups'] === '1' && $settings['allow_teacher_signups'] === '1',
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(['error' => 'Use POST.'], 405);
}

// Super Admin switches (Settings): enforced here, not just hidden on the page.
if (!setting_on($conn, 'allow_signups')) {
    reply(['error' => 'Sign-ups are closed right now. Ask an administrator for an account.'], 403);
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
if ($role === 'teacher' && !setting_on($conn, 'allow_teacher_signups')) {
    reply(['error' => 'Teacher sign-ups are closed right now. Ask an administrator for a teacher account.'], 403);
}

// Is the email already used?
$stmt = mysqli_prepare($conn, 'SELECT id FROM users WHERE username = ?');
mysqli_stmt_bind_param($stmt, 's', $username);
mysqli_stmt_execute($stmt);
$found = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt));
if ($found) {
    reply(['error' => 'An account with this email already exists.'], 409);
}

$hash   = password_hash($password, PASSWORD_DEFAULT);
$status = $role === 'teacher' ? 'pending' : 'active';

try {
    $stmt = mysqli_prepare($conn,
        'INSERT INTO users (username, display_name, role, status, password_hash) VALUES (?, ?, ?, ?, ?)');
    mysqli_stmt_bind_param($stmt, 'sssss', $username, $name, $role, $status, $hash);
    mysqli_stmt_execute($stmt);
} catch (mysqli_sql_exception $e) {
    if ($e->getCode() === 1062) {   // duplicate key (two signups at the same time)
        reply(['error' => 'An account with this email already exists.'], 409);
    }
    reply(['error' => 'Could not create the account. Did you import db/studyhub.sql (or run the db/migrate_*.sql files on an older database)?'], 500);
}

$userId = (int) mysqli_insert_id($conn);
log_security_event('SIGNUP', $userId, $userId, role_label($role) . " account created ($status)");

// Teachers wait for approval: no session yet.
if ($status === 'pending') {
    reply([
        'ok'      => true,
        'pending' => true,
        'message' => 'Your teacher account was created. An administrator needs to approve it before you can log in.',
    ], 201);
}

// Students are signed in straight away.
session_regenerate_id(true);
$_SESSION['user'] = ['id' => $userId, 'name' => $name, 'role' => $role, 'v' => 0];
log_security_event('LOGIN', $userId, $userId, 'Signed in after signup');

reply(['ok' => true, 'redirect' => 'index.php']);
