<?php
// api/schedules.php
// The page sends schedule changes here. This file saves them in the database.
// It receives JSON and answers with JSON.
//
// Actions:  create  |  update  |  delete

require __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';   // (auth.php already loads it)

header('Content-Type: application/json; charset=utf-8');

// Send an answer and stop.
function reply($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// "SCH-12" -> 12
function schedule_number($id)
{
    return (int) str_replace('SCH-', '', (string) $id);
}

// Get one schedule, but only if it belongs to this user. Returns null if not found.
function find_schedule($conn, $scheduleId, $userId)
{
    $stmt = mysqli_prepare($conn, 'SELECT id FROM schedules WHERE id = ? AND user_id = ?');
    mysqli_stmt_bind_param($stmt, 'ii', $scheduleId, $userId);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    return mysqli_fetch_assoc($result);
}

// Validate time format HH:MM
function clean_time($value)
{
    $value = (string) $value;
    return preg_match('/^\d{2}:\d{2}$/', $value) ? $value : null;
}

// Validate day
function clean_day($value)
{
    $valid = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    return in_array($value, $valid, true) ? $value : null;
}

// Write an audit log entry.
function write_audit($conn, $userId, $action, $entityType, $entityId, $details = '')
{
    $stmt = mysqli_prepare($conn,
        'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)');
    mysqli_stmt_bind_param($stmt, 'issss', $userId, $action, $entityType, $entityId, $details);
    mysqli_stmt_execute($stmt);
}

// ---------- Check the request ----------

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(['ok' => false, 'message' => 'Use POST.'], 405);
}

$user = api_user();   // 401 if signed out, 403 if a password change is required
$userId = (int) $user['id'];

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    reply(['ok' => false, 'message' => 'Bad data.'], 400);
}

$action = $input['action'] ?? '';

try {

    // ---------- CREATE a schedule ----------
    if ($action === 'create') {
        $s = $input['schedule'] ?? [];

        $day        = clean_day($s['day'] ?? '');
        $startTime  = clean_time($s['startTime'] ?? '');
        $endTime    = clean_time($s['endTime'] ?? '');
        $className  = mb_substr(trim($s['className'] ?? ''), 0, 120);
        $courseCode = mb_substr(trim($s['courseCode'] ?? ''), 0, 40);
        $instructor = mb_substr(trim($s['instructor'] ?? ''), 0, 100);

        if ($day === null || $startTime === null || $endTime === null || $className === '' || $courseCode === '' || $instructor === '') {
            reply(['ok' => false, 'message' => 'All fields are required.'], 400);
        }
        if ($endTime <= $startTime) {
            reply(['ok' => false, 'message' => 'End time must be after start time.'], 400);
        }

        $sql = 'INSERT INTO schedules
                  (user_id, day, start_time, end_time, class_name, course_code, instructor)
                VALUES (?, ?, ?, ?, ?, ?, ?)';
        $stmt = mysqli_prepare($conn, $sql);
        mysqli_stmt_bind_param($stmt, 'issssss',
            $userId, $day, $startTime, $endTime, $className, $courseCode, $instructor);
        mysqli_stmt_execute($stmt);

        $newId = 'SCH-' . mysqli_insert_id($conn);
        write_audit($conn, $userId, 'CREATE', 'schedule', $newId, "$className ($day $startTime-$endTime)");
        reply(['ok' => true, 'id' => $newId]);
    }

    // ---------- UPDATE a schedule ----------
    if ($action === 'update') {
        $scheduleId = schedule_number($input['id'] ?? '');
        if (!find_schedule($conn, $scheduleId, $userId)) {
            reply(['ok' => false, 'message' => 'Schedule not found.'], 404);
        }

        $u = $input['updates'] ?? [];
        $day        = clean_day($u['day'] ?? '');
        $startTime  = clean_time($u['startTime'] ?? '');
        $endTime    = clean_time($u['endTime'] ?? '');
        $className  = mb_substr(trim($u['className'] ?? ''), 0, 120);
        $courseCode = mb_substr(trim($u['courseCode'] ?? ''), 0, 40);
        $instructor = mb_substr(trim($u['instructor'] ?? ''), 0, 100);

        if ($day === null || $startTime === null || $endTime === null || $className === '' || $courseCode === '' || $instructor === '') {
            reply(['ok' => false, 'message' => 'All fields are required.'], 400);
        }
        if ($endTime <= $startTime) {
            reply(['ok' => false, 'message' => 'End time must be after start time.'], 400);
        }

        $sql = 'UPDATE schedules
                SET day = ?, start_time = ?, end_time = ?, class_name = ?, course_code = ?, instructor = ?
                WHERE id = ? AND user_id = ?';
        $stmt = mysqli_prepare($conn, $sql);
        mysqli_stmt_bind_param($stmt, 'ssssssii',
            $day, $startTime, $endTime, $className, $courseCode, $instructor, $scheduleId, $userId);
        mysqli_stmt_execute($stmt);

        $entityId = 'SCH-' . $scheduleId;
        write_audit($conn, $userId, 'UPDATE', 'schedule', $entityId, "$className ($day $startTime-$endTime)");
        reply(['ok' => true]);
    }

    // ---------- DELETE a schedule ----------
    if ($action === 'delete') {
        $scheduleId = schedule_number($input['id'] ?? '');
        if (!find_schedule($conn, $scheduleId, $userId)) {
            reply(['ok' => false, 'message' => 'Schedule not found.'], 404);
        }

        $stmt = mysqli_prepare($conn, 'DELETE FROM schedules WHERE id = ? AND user_id = ?');
        mysqli_stmt_bind_param($stmt, 'ii', $scheduleId, $userId);
        mysqli_stmt_execute($stmt);

        $entityId = 'SCH-' . $scheduleId;
        write_audit($conn, $userId, 'DELETE', 'schedule', $entityId, 'Schedule deleted');
        reply(['ok' => true]);
    }

    reply(['ok' => false, 'message' => 'Unknown action.'], 400);

} catch (Exception $e) {
    error_log('api/schedules.php error: ' . $e->getMessage());
    reply(['ok' => false, 'message' => 'Database error.'], 500);
}