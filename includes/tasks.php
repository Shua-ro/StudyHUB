<?php

require_once __DIR__ . '/db.php';

// all of a user's tasks incl. archived, shaped like app.js expects
function get_tasks_for_user($conn, $userId)
{
    $sql = 'SELECT id, title, subject, description, due_date, priority,
                   status, estimated_minutes, tags, reminder_date, created_at
            FROM tasks
            WHERE user_id = ?
            ORDER BY created_at DESC';
    $stmt = mysqli_prepare($conn, $sql);
    mysqli_stmt_bind_param($stmt, 'i', $userId);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $rows = mysqli_fetch_all($result, MYSQLI_ASSOC);

    // status history for those tasks
    $sql = 'SELECT h.task_id, h.previous_status, h.next_status,
                   h.action_label, h.changed_at
            FROM task_history h
            JOIN tasks t ON t.id = h.task_id
            WHERE t.user_id = ?
            ORDER BY h.changed_at ASC';
    $stmt = mysqli_prepare($conn, $sql);
    mysqli_stmt_bind_param($stmt, 'i', $userId);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $historyRows = mysqli_fetch_all($result, MYSQLI_ASSOC);

    // group history by task
    $historyByTask = [];
    foreach ($historyRows as $h) {
        $historyByTask[$h['task_id']][] = [
            'timestamp'      => str_replace(' ', 'T', $h['changed_at']),
            'previousStatus' => $h['previous_status'],
            'nextStatus'     => $h['next_status'],
            'actionLabel'    => $h['action_label'] ?? '',
        ];
    }

    // build what app.js needs
    $tasks = [];
    foreach ($rows as $row) {
        $tasks[] = [
            'id'               => 'TASK-' . $row['id'],
            'title'            => $row['title'],
            'subject'          => $row['subject'],
            'description'      => $row['description'] ?? '',
            'dueDate'          => $row['due_date'] ?? '',
            'priority'         => $row['priority'],
            'status'           => $row['status'],
            'createdAt'        => str_replace(' ', 'T', $row['created_at']),
            'estimatedMinutes' => (int) $row['estimated_minutes'],
            'tags'             => ($row['tags'] ?? '') === '' ? [] : explode(',', $row['tags']),
            'hasReminder'      => $row['reminder_date'] !== null,
            'reminderDate'     => $row['reminder_date'],
            'workflowHistory'  => $historyByTask[$row['id']] ?? [],
        ];
    }

    return $tasks;
}
