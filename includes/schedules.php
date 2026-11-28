<?php

require_once __DIR__ . '/db.php';

// all schedules for a user, shaped like app.js expects
function get_schedules_for_user($conn, $userId)
{
    $sql = 'SELECT id, day, start_time, end_time, class_name, course_code, instructor, created_at
            FROM schedules
            WHERE user_id = ?
            ORDER BY FIELD(day, "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"), start_time';
    $stmt = mysqli_prepare($conn, $sql);
    mysqli_stmt_bind_param($stmt, 'i', $userId);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $rows = mysqli_fetch_all($result, MYSQLI_ASSOC);

    $schedules = [];
    foreach ($rows as $row) {
        $schedules[] = [
            'id'          => 'SCH-' . $row['id'],
            'day'         => $row['day'],
            'startTime'   => substr($row['start_time'], 0, 5),
            'endTime'     => substr($row['end_time'], 0, 5),
            'className'   => $row['class_name'],
            'courseCode'  => $row['course_code'],
            'instructor'  => $row['instructor'],
            'createdAt'   => str_replace(' ', 'T', $row['created_at']),
        ];
    }

    return $schedules;
}