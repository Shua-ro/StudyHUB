<?php
// api/notes.php
// The page sends note changes here. This file saves them in the database.
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

// "NOTE-12" -> 12
function note_number($id)
{
    return (int) str_replace('NOTE-', '', (string) $id);
}

// Get one note, but only if it belongs to this user. Returns null if not found.
function find_note($conn, $noteId, $userId)
{
    $stmt = mysqli_prepare($conn, 'SELECT id FROM notes WHERE id = ? AND user_id = ?');
    mysqli_stmt_bind_param($stmt, 'ii', $noteId, $userId);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    return mysqli_fetch_assoc($result);
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

    // ---------- CREATE a note ----------
    if ($action === 'create') {
        $n = $input['note'] ?? [];

        $title  = mb_substr(trim($n['title'] ?? ''), 0, 150);
        $body   = (string) ($n['body'] ?? '');
        $remark = mb_substr(trim($n['remark'] ?? ''), 0, 255);

        if ($title === '' || $body === '') {
            reply(['ok' => false, 'message' => 'Title and body are required.'], 400);
        }

        $sql = 'INSERT INTO notes
                  (user_id, title, body, remark)
                VALUES (?, ?, ?, ?)';
        $stmt = mysqli_prepare($conn, $sql);
        mysqli_stmt_bind_param($stmt, 'isss',
            $userId, $title, $body, $remark);
        mysqli_stmt_execute($stmt);

        $newId = 'NOTE-' . mysqli_insert_id($conn);
        write_audit($conn, $userId, 'CREATE', 'note', $newId, $title);
        reply(['ok' => true, 'id' => $newId]);
    }

    // ---------- UPDATE a note ----------
    if ($action === 'update') {
        $noteId = note_number($input['id'] ?? '');
        if (!find_note($conn, $noteId, $userId)) {
            reply(['ok' => false, 'message' => 'Note not found.'], 404);
        }

        $u = $input['updates'] ?? [];
        $title  = mb_substr(trim($u['title'] ?? ''), 0, 150);
        $body   = (string) ($u['body'] ?? '');
        $remark = mb_substr(trim($u['remark'] ?? ''), 0, 255);

        if ($title === '' || $body === '') {
            reply(['ok' => false, 'message' => 'Title and body are required.'], 400);
        }

        $sql = 'UPDATE notes
                SET title = ?, body = ?, remark = ?
                WHERE id = ? AND user_id = ?';
        $stmt = mysqli_prepare($conn, $sql);
        mysqli_stmt_bind_param($stmt, 'sssii',
            $title, $body, $remark, $noteId, $userId);
        mysqli_stmt_execute($stmt);

        $entityId = 'NOTE-' . $noteId;
        write_audit($conn, $userId, 'UPDATE', 'note', $entityId, $title);
        reply(['ok' => true]);
    }

    // ---------- DELETE a note ----------
    if ($action === 'delete') {
        $noteId = note_number($input['id'] ?? '');
        if (!find_note($conn, $noteId, $userId)) {
            reply(['ok' => false, 'message' => 'Note not found.'], 404);
        }

        $stmt = mysqli_prepare($conn, 'DELETE FROM notes WHERE id = ? AND user_id = ?');
        mysqli_stmt_bind_param($stmt, 'ii', $noteId, $userId);
        mysqli_stmt_execute($stmt);

        $entityId = 'NOTE-' . $noteId;
        write_audit($conn, $userId, 'DELETE', 'note', $entityId, 'Note deleted');
        reply(['ok' => true]);
    }

    reply(['ok' => false, 'message' => 'Unknown action.'], 400);

} catch (Exception $e) {
    error_log('api/notes.php error: ' . $e->getMessage());
    reply(['ok' => false, 'message' => 'Database error.'], 500);
}