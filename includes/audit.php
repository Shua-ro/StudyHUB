<?php

require_once __DIR__ . '/db.php';

// user's audit log, newest first, max 200
function get_audit_for_user($conn, $userId, $limit = 200)
{
    $sql = 'SELECT id, action, entity_type, entity_id, details, created_at
            FROM audit_log
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?';
    $stmt = mysqli_prepare($conn, $sql);
    mysqli_stmt_bind_param($stmt, 'ii', $userId, $limit);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $rows = mysqli_fetch_all($result, MYSQLI_ASSOC);

    $audit = [];
    foreach ($rows as $row) {
        $audit[] = [
            'id'        => (int) $row['id'],
            'timestamp' => str_replace(' ', 'T', $row['created_at']),
            // everything in your own trail is you, except moderation stuff
            'actor'     => $row['action'] === 'MODERATION_DELETE' ? 'An administrator' : 'You',
            'action'    => $row['action'],
            'targetId'  => $row['entity_id'],
            'details'   => $row['details'] ?? '',
        ];
    }

    return $audit;
}