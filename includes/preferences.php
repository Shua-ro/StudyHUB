<?php

require_once __DIR__ . '/db.php';

// user prefs, keys match app.js
function get_preferences_for_user($conn, $userId)
{
    $sql = 'SELECT theme, filter_status, filter_priority, sort_key, sort_direction, page_size
            FROM user_preferences
            WHERE user_id = ?';
    $stmt = mysqli_prepare($conn, $sql);
    mysqli_stmt_bind_param($stmt, 'i', $userId);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $row = mysqli_fetch_assoc($result);

    if ($row) {
        return [
            'theme'   => $row['theme'],
            'filters' => [
                'status'   => $row['filter_status'],
                'priority' => $row['filter_priority'],
            ],
            'sort' => [
                'key'      => $row['sort_key'],
                'direction' => $row['sort_direction'],
            ],
            'pageSize' => (int) $row['page_size'],
        ];
    }

    // no row yet = defaults
    return [
        'theme'   => 'system',
        'filters' => ['status' => 'ALL', 'priority' => 'ALL'],
        'sort'    => ['key' => 'dueDate', 'direction' => 'asc'],
        'pageSize' => 5,
    ];
}

// pomodoro prefs, in seconds
function get_pomodoro_preferences_for_user($conn, $userId)
{
    $sql = 'SELECT focus_duration, short_duration, long_duration
            FROM user_pomodoro_preferences
            WHERE user_id = ?';
    $stmt = mysqli_prepare($conn, $sql);
    mysqli_stmt_bind_param($stmt, 'i', $userId);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $row = mysqli_fetch_assoc($result);

    if ($row) {
        return [
            'focusDuration' => (int) $row['focus_duration'],
            'shortDuration' => (int) $row['short_duration'],
            'longDuration'  => (int) $row['long_duration'],
        ];
    }

    // defaults (seconds)
    return [
        'focusDuration' => 1500,  // 25 min
        'shortDuration' => 300,   // 5 min
        'longDuration'  => 900,   // 15 min
    ];
}