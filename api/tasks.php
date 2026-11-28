<?php
// task create/update/status/delete (delete = archived only). JSON in, JSON out

require __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';

header('Content-Type: application/json; charset=utf-8');

function reply($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// "TASK-12" -> 12
function task_number($id)
{
    return (int) str_replace('TASK-', '', (string) $id);
}

// only returns it if it's theirs, otherwise null
function find_task($conn, $taskId, $userId)
{
    $stmt = mysqli_prepare($conn, 'SELECT id, title, status FROM tasks WHERE id = ? AND user_id = ?');
    mysqli_stmt_bind_param($stmt, 'ii', $taskId, $userId);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    return mysqli_fetch_assoc($result);
}

// "2026-12-31" or null
function clean_date($value)
{
    $value = (string) $value;
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) ? $value : null;
}

function write_audit($conn, $userId, $action, $entityType, $entityId, $details = '')
{
    $stmt = mysqli_prepare($conn,
        'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)');
    mysqli_stmt_bind_param($stmt, 'issss', $userId, $action, $entityType, $entityId, $details);
    mysqli_stmt_execute($stmt);
}

// escape % and _ for LIKE
function like_escape($value)
{
    return addcslashes($value, '%_\\');
}

// search the user's tasks. every word has to show up somewhere (title, subject, desc, tags, etc).
// ranking: title starts with > title word > title anywhere > subject > rest, then due date.
// returns ['ids' => [...], 'archived' => count]
function search_tasks($conn, $userId, $query)
{
    $query  = str_replace(['-', '_'], ' ', $query);
    $tokens = array_slice(preg_split('/\s+/u', trim($query), -1, PREG_SPLIT_NO_EMPTY), 0, 8);
    if (!$tokens) {
        return ['ids' => [], 'archived' => 0];
    }

    $scoreParts = [];
    $scoreParams = [];
    $where = ['user_id = ?'];
    $whereParams = [$userId];

    foreach ($tokens as $token) {
        $safe = like_escape($token);
        $anywhere = '%' . $safe . '%';

        $scoreParts[] = 'CASE WHEN title LIKE ? THEN 100 WHEN title LIKE ? THEN 80
                              WHEN title LIKE ? THEN 60 WHEN subject LIKE ? THEN 30 ELSE 10 END';
        array_push($scoreParams, $safe . '%', '% ' . $safe . '%', $anywhere, $anywhere);

        $where[] = "(title LIKE ? OR subject LIKE ? OR description LIKE ? OR tags LIKE ?
                     OR priority LIKE ? OR status LIKE ? OR CAST(due_date AS CHAR) LIKE ?
                     OR CONCAT('TASK ', id) LIKE ?)";
        array_push($whereParams, ...array_fill(0, 8, $anywhere));
    }

    $sql = 'SELECT id, status, (' . implode(' + ', $scoreParts) . ') AS score
            FROM tasks
            WHERE ' . implode(' AND ', $where) . '
            ORDER BY score DESC, due_date IS NULL, due_date ASC, id ASC
            LIMIT 500';

    $params = array_merge($scoreParams, $whereParams);
    $types  = str_repeat('s', count($scoreParams)) . 'i' . str_repeat('s', count($whereParams) - 1);

    $stmt = mysqli_prepare($conn, $sql);
    mysqli_stmt_bind_param($stmt, $types, ...$params);
    mysqli_stmt_execute($stmt);
    $rows = mysqli_fetch_all(mysqli_stmt_get_result($stmt), MYSQLI_ASSOC);

    $ids = [];
    $archived = 0;
    foreach ($rows as $row) {
        if ($row['status'] === 'Archived') {
            $archived++;
        } else {
            $ids[] = 'TASK-' . $row['id'];
        }
    }
    return ['ids' => $ids, 'archived' => $archived];
}

$user = api_user();
$userId = (int) $user['id'];

// search (GET ?q=...)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $q = mb_substr(trim((string) ($_GET['q'] ?? '')), 0, 100);
    try {
        $found = search_tasks($conn, $userId, $q);
    } catch (Throwable $e) {
        error_log('api/tasks.php search: ' . $e->getMessage());
        reply(['ok' => false, 'message' => 'Search failed.'], 500);
    }
    reply(['ok' => true, 'query' => $q, 'ids' => $found['ids'], 'archived' => $found['archived']]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(['ok' => false, 'message' => 'Use GET to search or POST to save.'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    reply(['ok' => false, 'message' => 'Bad data.'], 400);
}

$action     = $input['action'] ?? '';
$priorities = ['Low', 'Medium', 'High'];
$statuses   = ['To do', 'In progress', 'In review', 'Done', 'Archived'];

try {

    // create
    if ($action === 'create') {
        $t = $input['task'] ?? [];

        $title   = mb_substr(trim($t['title'] ?? ''), 0, 100);
        $subject = mb_substr(trim($t['subject'] ?? ''), 0, 80);
        if ($title === '' || $subject === '') {
            reply(['ok' => false, 'message' => 'Title and subject are required.'], 400);
        }

        $description = (string) ($t['description'] ?? '');
        $dueDate     = clean_date($t['dueDate'] ?? '');
        $priority    = in_array($t['priority'] ?? '', $priorities, true) ? $t['priority'] : 'Medium';
        $minutes     = max(1, (int) ($t['estimatedMinutes'] ?? 60));
        $tags        = is_array($t['tags'] ?? null) ? mb_substr(implode(',', $t['tags']), 0, 255) : null;
        $reminder    = clean_date($t['reminderDate'] ?? '');

        $sql = 'INSERT INTO tasks
                  (user_id, title, subject, description, due_date, priority, estimated_minutes, tags, reminder_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = mysqli_prepare($conn, $sql);
        mysqli_stmt_bind_param($stmt, 'isssssiss',
            $userId, $title, $subject, $description, $dueDate, $priority, $minutes, $tags, $reminder);
        mysqli_stmt_execute($stmt);

        $newId = 'TASK-' . mysqli_insert_id($conn);
        write_audit($conn, $userId, 'CREATE', 'task', $newId, $title);
        reply(['ok' => true, 'id' => $newId]);
    }

    // update details
    if ($action === 'update') {
        $taskId = task_number($input['id'] ?? '');
        if (!find_task($conn, $taskId, $userId)) {
            reply(['ok' => false, 'message' => 'Task not found.'], 404);
        }

        $u = $input['updates'] ?? [];
        $title   = mb_substr(trim($u['title'] ?? ''), 0, 100);
        $subject = mb_substr(trim($u['subject'] ?? ''), 0, 80);
        if ($title === '' || $subject === '') {
            reply(['ok' => false, 'message' => 'Title and subject are required.'], 400);
        }
        $description = (string) ($u['description'] ?? '');
        $dueDate     = clean_date($u['dueDate'] ?? '');
        $priority    = in_array($u['priority'] ?? '', $priorities, true) ? $u['priority'] : 'Medium';

        $sql = 'UPDATE tasks
                SET title = ?, subject = ?, description = ?, due_date = ?, priority = ?
                WHERE id = ? AND user_id = ?';
        $stmt = mysqli_prepare($conn, $sql);
        mysqli_stmt_bind_param($stmt, 'sssssii',
            $title, $subject, $description, $dueDate, $priority, $taskId, $userId);
        mysqli_stmt_execute($stmt);

        $entityId = 'TASK-' . $taskId;
        write_audit($conn, $userId, 'UPDATE', 'task', $entityId, "Title: $title, Subject: $subject");
        reply(['ok' => true]);
    }

    // change status
    if ($action === 'status') {
        $taskId = task_number($input['id'] ?? '');
        $task = find_task($conn, $taskId, $userId);
        if (!$task) {
            reply(['ok' => false, 'message' => 'Task not found.'], 404);
        }

        $next = $input['status'] ?? '';
        if (!in_array($next, $statuses, true)) {
            reply(['ok' => false, 'message' => 'Bad status.'], 400);
        }
        $previous = $task['status'];
        $label    = mb_substr((string) ($input['actionLabel'] ?? ''), 0, 60);

        $stmt = mysqli_prepare($conn, 'UPDATE tasks SET status = ? WHERE id = ? AND user_id = ?');
        mysqli_stmt_bind_param($stmt, 'sii', $next, $taskId, $userId);
        mysqli_stmt_execute($stmt);

        // history entry
        $stmt = mysqli_prepare($conn,
            'INSERT INTO task_history (task_id, previous_status, next_status, action_label) VALUES (?, ?, ?, ?)');
        mysqli_stmt_bind_param($stmt, 'isss', $taskId, $previous, $next, $label);
        mysqli_stmt_execute($stmt);

        $entityId = 'TASK-' . $taskId;
        $auditAction = ($next === 'Archived') ? 'ARCHIVE' : 'STATUS_CHANGE';
        write_audit($conn, $userId, $auditAction, 'task', $entityId, "$previous → $next ($label)");

        reply(['ok' => true]);
    }

    // delete an archived task (permanent)
    if ($action === 'delete') {
        $taskId = task_number($input['id'] ?? '');
        $task = find_task($conn, $taskId, $userId);
        if (!$task) {
            reply(['ok' => false, 'message' => 'Task not found.'], 404);
        }
        // only archived stuff can be deleted, active tasks have to be done + archived first
        if ($task['status'] !== 'Archived') {
            reply(['ok' => false, 'message' => 'Only archived tasks can be deleted.'], 409);
        }

        // history rows get cascaded
        $stmt = mysqli_prepare($conn, 'DELETE FROM tasks WHERE id = ? AND user_id = ?');
        mysqli_stmt_bind_param($stmt, 'ii', $taskId, $userId);
        mysqli_stmt_execute($stmt);

        $entityId = 'TASK-' . $taskId;
        write_audit($conn, $userId, 'DELETE', 'task', $entityId, 'Deleted archived task: ' . $task['title']);
        reply(['ok' => true]);
    }

    reply(['ok' => false, 'message' => 'Unknown action.'], 400);

} catch (Exception $e) {
    error_log('api/tasks.php error: ' . $e->getMessage());
    reply(['ok' => false, 'message' => 'Database error.'], 500);
}
