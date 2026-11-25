<?php
// Functions that read audit log from the database.

require_once __DIR__ . '/db.php';

// Get audit log for one user (most recent first, limited to 200).
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
            'actor'     => 'User ' . $userId, // could join users table for name
            'action'    => $row['action'],
            'targetId'  => $row['entity_id'],
            'details'   => $row['details'] ?? '',
        ];
    }

    return $audit;
}