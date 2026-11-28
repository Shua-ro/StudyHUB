<?php
// api/data.php
// Replaces ALL of the logged-in user's tasks, schedules and notes in one go.
// It receives JSON and answers with JSON.
//
// Actions:
//   import  - replace the user's data with the contents of a backup file
//   reset   - delete the user's data and restore default settings
//
// Both run inside one database transaction: either everything is replaced,
// or (on any error) nothing changes at all.

require __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';   // (auth.php already loads it)

header('Content-Type: application/json; charset=utf-8');

const MAX_BODY_BYTES = 5 * 1024 * 1024;   // 5 MB backup file
const MAX_TASKS      = 2000;
const MAX_SCHEDULES  = 500;
const MAX_NOTES      = 2000;
const MAX_HISTORY    = 200;               // status changes kept per task

// Backup file formats this server understands (schemaVersion in the JSON,
// SCHEMA_VERSION in js/app.js). Add a version here only together with the code
// that reads it; older versions would be converted in clean_backup().
const SUPPORTED_BACKUP_VERSIONS = [1];

const PRIORITIES = ['Low', 'Medium', 'High'];
const STATUSES   = ['To do', 'In progress', 'In review', 'Done', 'Archived'];
const DAYS       = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function reply($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// Thrown when the backup file has a bad record. The message is shown to the user.
class ImportError extends Exception {}

// ---------- Small cleaning helpers ----------

function text($value, $max)
{
    return mb_substr(trim((string) $value), 0, $max);
}

function required_text($value, $max, $what)
{
    if (!is_string($value) || trim($value) === '') {
        throw new ImportError("$what is missing.");
    }
    return text($value, $max);
}

// "2026-12-31" -> "2026-12-31", anything else -> null
function date_or_null($value)
{
    $value = (string) $value;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        return null;
    }
    [$y, $m, $d] = array_map('intval', explode('-', $value));
    return checkdate($m, $d, $y) ? $value : null;
}

// ISO timestamp from the browser -> "Y-m-d H:i:s" for MySQL (or now, if unreadable)
function datetime_or_now($value)
{
    $time = is_string($value) ? strtotime($value) : false;
    return date('Y-m-d H:i:s', $time === false ? time() : $time);
}

// "13:45" -> "13:45:00", anything else -> null
function time_or_null($value)
{
    $value = (string) $value;
    return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value) ? $value . ':00' : null;
}

function pick($value, $allowed, $default)
{
    return in_array($value, $allowed, true) ? $value : $default;
}

// ---------- Validate the whole backup BEFORE touching the database ----------

function clean_backup($data)
{
    if (!is_array($data)) {
        throw new ImportError('The backup is not in the expected format.');
    }
    foreach (['records', 'archivedRecords', 'schedules', 'notes'] as $key) {
        if (!isset($data[$key]) || !is_array($data[$key])) {
            throw new ImportError("The backup is missing its \"$key\" list.");
        }
    }

    $rawTasks = array_merge($data['records'], $data['archivedRecords']);
    if (count($rawTasks) > MAX_TASKS || count($data['schedules']) > MAX_SCHEDULES || count($data['notes']) > MAX_NOTES) {
        throw new ImportError('The backup is too large to import.');
    }

    $tasks = [];
    foreach ($rawTasks as $i => $t) {
        $n = $i + 1;
        if (!is_array($t)) throw new ImportError("Task #$n is not valid.");

        $history = [];
        foreach (array_slice(is_array($t['workflowHistory'] ?? null) ? $t['workflowHistory'] : [], 0, MAX_HISTORY) as $h) {
            if (!is_array($h)
                || !in_array($h['previousStatus'] ?? null, STATUSES, true)
                || !in_array($h['nextStatus'] ?? null, STATUSES, true)) {
                throw new ImportError("Task #$n has an invalid status history entry.");
            }
            $history[] = [
                'previous' => $h['previousStatus'],
                'next'     => $h['nextStatus'],
                'label'    => text($h['actionLabel'] ?? '', 60),
                'at'       => datetime_or_now($h['timestamp'] ?? null),
            ];
        }

        $status = $t['status'] ?? null;
        if (!in_array($status, STATUSES, true)) {
            throw new ImportError("Task #$n has an unknown status.");
        }

        $tags = is_array($t['tags'] ?? null)
            ? array_filter(array_map(fn ($tag) => text($tag, 40), $t['tags']), 'strlen')
            : [];

        $tasks[] = [
            'title'       => required_text($t['title'] ?? null, 100, "Task #$n title"),
            'subject'     => required_text($t['subject'] ?? null, 80, "Task #$n subject"),
            'description' => text($t['description'] ?? '', 5000),
            'due'         => date_or_null($t['dueDate'] ?? ''),
            'priority'    => pick($t['priority'] ?? null, PRIORITIES, 'Medium'),
            'status'      => $status,
            'minutes'     => max(1, min(6000, (int) ($t['estimatedMinutes'] ?? 60))),
            'tags'        => $tags ? mb_substr(implode(',', $tags), 0, 255) : null,
            'reminder'    => date_or_null($t['reminderDate'] ?? ''),
            'created'     => datetime_or_now($t['createdAt'] ?? null),
            'history'     => $history,
        ];
    }

    $schedules = [];
    foreach ($data['schedules'] as $i => $s) {
        $n = $i + 1;
        if (!is_array($s)) throw new ImportError("Class #$n is not valid.");
        $start = time_or_null($s['startTime'] ?? '');
        $end   = time_or_null($s['endTime'] ?? '');
        if (!in_array($s['day'] ?? null, DAYS, true) || !$start || !$end || $end <= $start) {
            throw new ImportError("Class #$n has an invalid day or time.");
        }
        $schedules[] = [
            'day'        => $s['day'],
            'start'      => $start,
            'end'        => $end,
            'class'      => required_text($s['className'] ?? null, 120, "Class #$n name"),
            'code'       => text($s['courseCode'] ?? '', 40),
            'instructor' => text($s['instructor'] ?? '', 100),
        ];
    }

    $notes = [];
    foreach ($data['notes'] as $i => $note) {
        $n = $i + 1;
        if (!is_array($note)) throw new ImportError("Note #$n is not valid.");
        $notes[] = [
            'title'  => required_text($note['title'] ?? null, 150, "Note #$n title"),
            'body'   => text($note['body'] ?? '', 20000),
            'remark' => text($note['remark'] ?? '', 255),
        ];
    }

    $p = is_array($data['preferences'] ?? null) ? $data['preferences'] : [];
    $pageSize = (int) ($p['pageSize'] ?? 5);
    $preferences = [
        'theme'     => pick($p['theme'] ?? null, ['dark', 'light', 'system'], 'system'),
        'status'    => pick($p['filters']['status'] ?? null, array_merge(['ALL'], STATUSES), 'ALL'),
        'priority'  => pick($p['filters']['priority'] ?? null, ['ALL', 'High', 'Medium', 'Low'], 'ALL'),
        'sortKey'   => pick($p['sort']['key'] ?? null, ['title', 'subject', 'dueDate', 'createdAt', 'priority', 'status'], 'dueDate'),
        'sortDir'   => pick($p['sort']['direction'] ?? null, ['asc', 'desc'], 'asc'),
        'pageSize'  => in_array($pageSize, [5, 10, 15], true) ? $pageSize : 5,
    ];

    return compact('tasks', 'schedules', 'notes', 'preferences');
}

// ---------- Write: wipe this user's data, then insert the cleaned backup ----------

function replace_user_data($conn, $userId, $clean)
{
    // Delete current data. task_history rows go with their tasks (ON DELETE CASCADE).
    foreach (['tasks', 'schedules', 'notes'] as $table) {
        $stmt = mysqli_prepare($conn, "DELETE FROM $table WHERE user_id = ?");
        mysqli_stmt_bind_param($stmt, 'i', $userId);
        mysqli_stmt_execute($stmt);
    }

    $taskStmt = mysqli_prepare($conn,
        'INSERT INTO tasks (user_id, title, subject, description, due_date, priority, status,
                            estimated_minutes, tags, reminder_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $historyStmt = mysqli_prepare($conn,
        'INSERT INTO task_history (task_id, previous_status, next_status, action_label, changed_at)
         VALUES (?, ?, ?, ?, ?)');

    foreach ($clean['tasks'] as $t) {
        mysqli_stmt_bind_param($taskStmt, 'issssssisss',
            $userId, $t['title'], $t['subject'], $t['description'], $t['due'], $t['priority'],
            $t['status'], $t['minutes'], $t['tags'], $t['reminder'], $t['created']);
        mysqli_stmt_execute($taskStmt);
        $taskId = mysqli_insert_id($conn);

        foreach ($t['history'] as $h) {
            mysqli_stmt_bind_param($historyStmt, 'issss',
                $taskId, $h['previous'], $h['next'], $h['label'], $h['at']);
            mysqli_stmt_execute($historyStmt);
        }
    }

    $scheduleStmt = mysqli_prepare($conn,
        'INSERT INTO schedules (user_id, day, start_time, end_time, class_name, course_code, instructor)
         VALUES (?, ?, ?, ?, ?, ?, ?)');
    foreach ($clean['schedules'] as $s) {
        mysqli_stmt_bind_param($scheduleStmt, 'issssss',
            $userId, $s['day'], $s['start'], $s['end'], $s['class'], $s['code'], $s['instructor']);
        mysqli_stmt_execute($scheduleStmt);
    }

    $noteStmt = mysqli_prepare($conn,
        'INSERT INTO notes (user_id, title, body, remark) VALUES (?, ?, ?, ?)');
    foreach ($clean['notes'] as $note) {
        mysqli_stmt_bind_param($noteStmt, 'isss', $userId, $note['title'], $note['body'], $note['remark']);
        mysqli_stmt_execute($noteStmt);
    }

    $p = $clean['preferences'];
    $pageSize = (string) $p['pageSize'];
    $stmt = mysqli_prepare($conn,
        'INSERT INTO user_preferences
           (user_id, theme, filter_status, filter_priority, sort_key, sort_direction, page_size)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           theme = VALUES(theme), filter_status = VALUES(filter_status),
           filter_priority = VALUES(filter_priority), sort_key = VALUES(sort_key),
           sort_direction = VALUES(sort_direction), page_size = VALUES(page_size)');
    mysqli_stmt_bind_param($stmt, 'issssss',
        $userId, $p['theme'], $p['status'], $p['priority'], $p['sortKey'], $p['sortDir'], $pageSize);
    mysqli_stmt_execute($stmt);
}

function write_audit($conn, $userId, $action, $details)
{
    $stmt = mysqli_prepare($conn,
        "INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, 'app', 'application', ?)");
    mysqli_stmt_bind_param($stmt, 'iss', $userId, $action, $details);
    mysqli_stmt_execute($stmt);
}

// ---------- Check the request ----------

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(['ok' => false, 'message' => 'Use POST.'], 405);
}

$user = api_user();   // 401 if signed out, 403 if a password change is required
$userId = (int) $user['id'];
if ($userId < 1) {
    // Guard against a very old users table whose id isn't a number
    // (db/studyhub.sql creates it correctly).
    reply(['ok' => false, 'message' => 'Your account id is invalid. The users table is outdated: recreate it from db/studyhub.sql, then sign in again.'], 409);
}

$raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
if (strlen($raw) > MAX_BODY_BYTES) {
    reply(['ok' => false, 'message' => 'The backup file is too large (5 MB maximum).'], 413);
}
$input = json_decode($raw, true);
if (!is_array($input)) {
    reply(['ok' => false, 'message' => 'Bad data.'], 400);
}

$action = $input['action'] ?? '';

// Build the cleaned data set for the chosen action.
try {
    if ($action === 'import') {
        $version = $input['data']['schemaVersion'] ?? null;
        if (!in_array($version, SUPPORTED_BACKUP_VERSIONS, true)) {
            throw new ImportError('This backup uses an unsupported format version ('
                . (is_scalar($version) ? $version : 'none') . '). Export a new backup and try again.');
        }
        $clean = clean_backup($input['data'] ?? null);
    } elseif ($action === 'reset') {
        $clean = clean_backup(['records' => [], 'archivedRecords' => [], 'schedules' => [], 'notes' => []]);
    } else {
        reply(['ok' => false, 'message' => 'Unknown action.'], 400);
    }
} catch (ImportError $e) {
    reply(['ok' => false, 'message' => $e->getMessage()], 422);
}

// Write it inside one transaction.
try {
    mysqli_begin_transaction($conn);

    replace_user_data($conn, $userId, $clean);

    $counts = [
        'tasks'     => count($clean['tasks']),
        'schedules' => count($clean['schedules']),
        'notes'     => count($clean['notes']),
    ];
    if ($action === 'import') {
        write_audit($conn, $userId, 'IMPORT',
            "Replaced data from backup: {$counts['tasks']} task(s), {$counts['schedules']} class(es), {$counts['notes']} note(s)");
    } else {
        write_audit($conn, $userId, 'RESET', 'Deleted all tasks, classes and notes; restored default settings');
    }

    mysqli_commit($conn);
    reply(['ok' => true, 'counts' => $counts, 'theme' => $clean['preferences']['theme']]);

} catch (Exception $e) {
    mysqli_rollback($conn);
    error_log('api/data.php error: ' . $e->getMessage());
    reply(['ok' => false, 'message' => 'Database error. Nothing was changed.'], 500);
}
