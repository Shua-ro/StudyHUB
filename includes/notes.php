<?php

require_once __DIR__ . '/db.php';

// all notes for a user, shaped like app.js expects
function get_notes_for_user($conn, $userId)
{
    $sql = 'SELECT id, title, body, remark, created_at
            FROM notes
            WHERE user_id = ?
            ORDER BY created_at DESC';
    $stmt = mysqli_prepare($conn, $sql);
    mysqli_stmt_bind_param($stmt, 'i', $userId);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $rows = mysqli_fetch_all($result, MYSQLI_ASSOC);

    $notes = [];
    foreach ($rows as $row) {
        $notes[] = [
            'id'        => 'NOTE-' . $row['id'],
            'title'     => $row['title'],
            'body'      => $row['body'],
            'remark'    => $row['remark'] ?? '',
            'createdAt' => str_replace(' ', 'T', $row['created_at']),
        ];
    }

    return $notes;
}