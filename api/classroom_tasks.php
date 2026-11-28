<?php
ob_start();
ini_set('display_errors', '0');

require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/db.php';

header('Content-Type: application/json; charset=utf-8');

function reply($data, $code = 200)
{
    if (ob_get_length()) {
        ob_clean();
    }
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function fetch_all_rows($conn, $sql, $types = '', $params = [])
{
    $stmt = mysqli_prepare($conn, $sql);
    if (!$stmt) {
        throw new RuntimeException('Prepare failed: ' . mysqli_error($conn));
    }
    if ($types !== '' && !empty($params)) {
        mysqli_stmt_bind_param($stmt, $types, ...$params);
    }
    if (!mysqli_stmt_execute($stmt)) {
        $err = mysqli_stmt_error($stmt);
        mysqli_stmt_close($stmt);
        throw new RuntimeException('Execute failed: ' . $err);
    }

    $rows = [];
    if (function_exists('mysqli_stmt_get_result')) {
        $res = @mysqli_stmt_get_result($stmt);
        if ($res instanceof mysqli_result) {
            while ($row = mysqli_fetch_assoc($res)) {
                $rows[] = $row;
            }
            mysqli_free_result($res);
        }
    }
    mysqli_stmt_close($stmt);
    return $rows;
}

function run_exec($conn, $sql, $types = '', $params = [])
{
    $stmt = mysqli_prepare($conn, $sql);
    if (!$stmt) {
        throw new RuntimeException('Prepare failed: ' . mysqli_error($conn));
    }
    if ($types !== '' && !empty($params)) {
        mysqli_stmt_bind_param($stmt, $types, ...$params);
    }
    if (!mysqli_stmt_execute($stmt)) {
        $err = mysqli_stmt_error($stmt);
        mysqli_stmt_close($stmt);
        throw new RuntimeException('Execute failed: ' . $err);
    }
    $info = [
        'affected_rows' => mysqli_stmt_affected_rows($stmt),
        'insert_id'     => mysqli_insert_id($conn),
    ];
    mysqli_stmt_close($stmt);
    return $info;
}

function write_audit($conn, $userId, $action, $entityType, $entityId, $details = '')
{
    try {
        run_exec(
            $conn,
            'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            'issss',
            [$userId, $action, $entityType, $entityId, $details]
        );
    } catch (Throwable $e) {
        // don't care if the audit log fails
    }
}

function clean_date_or_null($value)
{
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) ? $value : false;
}

try {
    $user = current_user();
    if (!$user) {
        reply(['ok' => false, 'message' => 'You are not logged in.'], 401);
    }

    while (mysqli_more_results($conn)) {
        mysqli_next_result($conn);
        if ($extra = mysqli_use_result($conn)) {
            mysqli_free_result($extra);
        }
    }

    $userId  = (int) $user['id'];
    $role    = (string) ($user['role'] ?? 'student');
    $isStaff = in_array($role, ['teacher', 'admin', 'super_admin'], true);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $tasks = [];
        $submissions = [];
        $classrooms = [];
        $students = [];
        $analyticsBars = [];
        $totalStudents = 0;
        $activeAssignments = 0;
        $totalSubmissions = 0;
        $pendingReviews = 0;
        $submissionRate = '0%';
        $reviewRate = '0%';
        $averageGrade = '—';

        if ($isStaff) {
            if (in_array($role, ['admin', 'super_admin'], true)) {
                $classrooms = fetch_all_rows(
                    $conn,
                    'SELECT c.id, c.title, c.class_code, c.subject, c.section, c.teacher_id
                     FROM classrooms c
                     ORDER BY c.id DESC'
                );

                $tasks = fetch_all_rows(
                    $conn,
                    'SELECT ct.*, c.title AS classroom_title, c.class_code, u.display_name AS teacher_name,
                            (SELECT COUNT(*) FROM classroom_members cm WHERE cm.classroom_id = ct.classroom_id) AS class_student_count
                     FROM classroom_tasks ct
                     INNER JOIN classrooms c ON c.id = ct.classroom_id
                     LEFT JOIN users u ON u.id = ct.teacher_id
                     ORDER BY ct.id DESC'
                );

                $submissions = fetch_all_rows(
                    $conn,
                    'SELECT cs.*, ct.title AS task_title, ct.max_score, ct.due_date,
                            c.id AS classroom_id, c.title AS classroom_title, c.class_code,
                            u.display_name AS student_name
                     FROM classroom_submissions cs
                     INNER JOIN classroom_tasks ct ON ct.id = cs.task_id
                     INNER JOIN classrooms c ON c.id = ct.classroom_id
                     INNER JOIN users u ON u.id = cs.student_id
                     ORDER BY cs.submitted_at DESC, cs.id DESC'
                );

                $students = fetch_all_rows(
                    $conn,
                    'SELECT cm.student_id AS id, u.display_name AS name,
                            cm.classroom_id, c.title AS classroom_title, c.class_code
                     FROM classroom_members cm
                     INNER JOIN classrooms c ON c.id = cm.classroom_id
                     INNER JOIN users u ON u.id = cm.student_id
                     ORDER BY u.display_name ASC, c.title ASC'
                );

                $stRows = fetch_all_rows(
                    $conn,
                    'SELECT COUNT(DISTINCT student_id) AS cnt FROM classroom_members'
                );
            } else {
                $classrooms = fetch_all_rows(
                    $conn,
                    'SELECT c.id, c.title, c.class_code, c.subject, c.section, c.teacher_id
                     FROM classrooms c
                     WHERE c.teacher_id = ?
                     ORDER BY c.id DESC',
                    'i',
                    [$userId]
                );

                $tasks = fetch_all_rows(
                    $conn,
                    'SELECT ct.*, c.title AS classroom_title, c.class_code, u.display_name AS teacher_name,
                            (SELECT COUNT(*) FROM classroom_members cm WHERE cm.classroom_id = ct.classroom_id) AS class_student_count
                     FROM classroom_tasks ct
                     INNER JOIN classrooms c ON c.id = ct.classroom_id
                     LEFT JOIN users u ON u.id = ct.teacher_id
                     WHERE c.teacher_id = ?
                     ORDER BY ct.id DESC',
                    'i',
                    [$userId]
                );

                $submissions = fetch_all_rows(
                    $conn,
                    'SELECT cs.*, ct.title AS task_title, ct.max_score, ct.due_date,
                            c.id AS classroom_id, c.title AS classroom_title, c.class_code,
                            u.display_name AS student_name
                     FROM classroom_submissions cs
                     INNER JOIN classroom_tasks ct ON ct.id = cs.task_id
                     INNER JOIN classrooms c ON c.id = ct.classroom_id
                     INNER JOIN users u ON u.id = cs.student_id
                     WHERE c.teacher_id = ?
                     ORDER BY cs.submitted_at DESC, cs.id DESC',
                    'i',
                    [$userId]
                );

                $students = fetch_all_rows(
                    $conn,
                    'SELECT cm.student_id AS id, u.display_name AS name,
                            cm.classroom_id, c.title AS classroom_title, c.class_code
                     FROM classroom_members cm
                     INNER JOIN classrooms c ON c.id = cm.classroom_id
                     INNER JOIN users u ON u.id = cm.student_id
                     WHERE c.teacher_id = ?
                     ORDER BY u.display_name ASC, c.title ASC',
                    'i',
                    [$userId]
                );

                $stRows = fetch_all_rows(
                    $conn,
                    'SELECT COUNT(DISTINCT cm.student_id) AS cnt
                     FROM classroom_members cm
                     INNER JOIN classrooms c ON c.id = cm.classroom_id
                     WHERE c.teacher_id = ?',
                    'i',
                    [$userId]
                );
            }

            $gradedCount = 0;
            $gradePctSum = 0.0;
            $gradePctCount = 0;
            $taskSubCounts = [];

            foreach ($submissions as $row) {
                $tid = (int) $row['task_id'];
                if (!isset($taskSubCounts[$tid])) {
                    $taskSubCounts[$tid] = 0;
                }
                $taskSubCounts[$tid]++;

                if ($row['status'] === 'graded') {
                    $gradedCount++;
                    if ($row['score'] !== null && (float) $row['max_score'] > 0) {
                        $gradePctSum += ((float) $row['score'] / (float) $row['max_score']) * 100.0;
                        $gradePctCount++;
                    }
                }
            }

            $totalStudents = (int) ($stRows[0]['cnt'] ?? 0);
            $activeAssignments = count($tasks);
            $totalSubmissions = count($submissions);
            $pendingReviews = max(0, $totalSubmissions - $gradedCount);

            $expectedTotal = 0;
            foreach ($tasks as $t) {
                $tid = (int) $t['id'];
                $cnt = (int) ($taskSubCounts[$tid] ?? 0);
                $classCount = (int) ($t['class_student_count'] ?? 0);
                $expectedTotal += $classCount;

                $pct = $classCount > 0 ? min(100, round(($cnt / $classCount) * 100)) : ($cnt > 0 ? 100 : 0);
                $analyticsBars[] = [
                    'task_id'         => $tid,
                    'classroom_id'    => (int) $t['classroom_id'],
                    'title'           => $t['title'],
                    'classroom_title' => $t['classroom_title'],
                    'class_code'      => $t['class_code'],
                    'submissions'     => $cnt,
                    'students'        => $classCount,
                    'percent'         => $pct,
                ];
            }

            if ($expectedTotal > 0) {
                $submissionRate = round(min(100, ($totalSubmissions / $expectedTotal) * 100)) . '%';
            } elseif ($totalSubmissions > 0) {
                $submissionRate = '100%';
            }

            if ($totalSubmissions > 0) {
                $reviewRate = round(($gradedCount / $totalSubmissions) * 100) . '%';
            }

            if ($gradePctCount > 0) {
                $averageGrade = round($gradePctSum / $gradePctCount, 1) . '%';
            }
        } else {
            $classrooms = fetch_all_rows(
                $conn,
                'SELECT c.id, c.title, c.class_code, c.subject, c.section, c.teacher_id
                 FROM classrooms c
                 INNER JOIN classroom_members cm ON cm.classroom_id = c.id
                 WHERE cm.student_id = ?
                 ORDER BY c.id DESC',
                'i',
                [$userId]
            );

            $tasks = fetch_all_rows(
                $conn,
                'SELECT ct.*, c.title AS classroom_title, c.class_code,
                        cs.id AS submission_id, cs.submission_text, cs.status AS submission_status,
                        cs.score, cs.feedback, cs.submitted_at, cs.graded_at
                 FROM classroom_tasks ct
                 INNER JOIN classroom_members cm ON cm.classroom_id = ct.classroom_id
                 INNER JOIN classrooms c ON c.id = ct.classroom_id
                 LEFT JOIN classroom_submissions cs ON cs.task_id = ct.id AND cs.student_id = ?
                 WHERE cm.student_id = ?
                 ORDER BY ct.due_date IS NULL, ct.due_date ASC, ct.id DESC',
                'ii',
                [$userId, $userId]
            );

            foreach ($tasks as $row) {
                if ($row['submission_id'] !== null) {
                    $submissions[] = $row;
                }
            }
        }

        reply([
            'ok'          => true,
            'role'        => $role,
            'classrooms'  => $classrooms,
            'students'    => $students,
            'tasks'       => $tasks,
            'submissions' => $submissions,
            'metrics'     => [
                'total_students'     => $totalStudents,
                'active_assignments' => $activeAssignments,
                'total_submissions'  => $totalSubmissions,
                'pending_reviews'    => $pendingReviews,
                'submission_rate'    => $submissionRate,
                'review_rate'        => $reviewRate,
                'average_grade'      => $averageGrade,
                'analytics_bars'     => $analyticsBars,
            ],
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) {
            reply(['ok' => false, 'message' => 'Invalid request data.'], 400);
        }

        $action = (string) ($in['action'] ?? '');

        if ($action === 'create_task') {
            if (!$isStaff) {
                reply(['ok' => false, 'message' => 'Only teachers or admins can create tasks.'], 403);
            }

            $classroomId = (int) ($in['classroom_id'] ?? 0);
            $title       = mb_substr(trim((string) ($in['title'] ?? '')), 0, 150);
            $description = trim((string) ($in['description'] ?? ''));
            $dueDate     = clean_date_or_null($in['due_date'] ?? '');
            $maxScore    = isset($in['max_score']) && $in['max_score'] !== '' ? (float) $in['max_score'] : 100.0;

            if ($classroomId <= 0) {
                reply(['ok' => false, 'message' => 'Please select a class.'], 400);
            }
            if ($title === '') {
                reply(['ok' => false, 'message' => 'Task title is required.'], 400);
            }
            if ($description === '') {
                reply(['ok' => false, 'message' => 'Task instructions are required.'], 400);
            }
            if ($dueDate === false) {
                reply(['ok' => false, 'message' => 'Due date must be YYYY-MM-DD.'], 400);
            }
            if ($maxScore <= 0 || $maxScore > 1000) {
                reply(['ok' => false, 'message' => 'Max score must be between 1 and 1000.'], 400);
            }

            if (!in_array($role, ['admin', 'super_admin'], true)) {
                $ownRows = fetch_all_rows(
                    $conn,
                    'SELECT id FROM classrooms WHERE id = ? AND teacher_id = ? LIMIT 1',
                    'ii',
                    [$classroomId, $userId]
                );
                if (empty($ownRows)) {
                    reply(['ok' => false, 'message' => 'You can only assign tasks to your own classes.'], 403);
                }
            }

            $ins = run_exec(
                $conn,
                'INSERT INTO classroom_tasks (classroom_id, teacher_id, title, description, due_date, max_score)
                 VALUES (?, ?, ?, ?, ?, ?)',
                'iisssd',
                [$classroomId, $userId, $title, $description, $dueDate, $maxScore]
            );

            $newId = (int) $ins['insert_id'];
            write_audit($conn, $userId, 'CREATE', 'classroom_task', 'CTASK-' . $newId, $title);
            reply(['ok' => true, 'id' => $newId, 'message' => 'Classroom task assigned!']);
        }

        if ($action === 'delete_task') {
            if (!$isStaff) {
                reply(['ok' => false, 'message' => 'Only teachers or admins can delete tasks.'], 403);
            }

            $taskId = (int) ($in['id'] ?? 0);
            if ($taskId <= 0) {
                reply(['ok' => false, 'message' => 'Invalid task ID.'], 400);
            }

            if (in_array($role, ['admin', 'super_admin'], true)) {
                $del = run_exec($conn, 'DELETE FROM classroom_tasks WHERE id = ?', 'i', [$taskId]);
            } else {
                $del = run_exec(
                    $conn,
                    'DELETE ct FROM classroom_tasks ct
                     INNER JOIN classrooms c ON c.id = ct.classroom_id
                     WHERE ct.id = ? AND c.teacher_id = ?',
                    'ii',
                    [$taskId, $userId]
                );
            }

            if ($del['affected_rows'] === 0) {
                reply(['ok' => false, 'message' => 'Task not found or not owned by you.'], 404);
            }

            write_audit($conn, $userId, 'DELETE', 'classroom_task', 'CTASK-' . $taskId, 'Classroom task deleted');
            reply(['ok' => true, 'message' => 'Task deleted.']);
        }

        if ($action === 'submit_task') {
            if ($role !== 'student') {
                reply(['ok' => false, 'message' => 'Only students can submit classroom tasks.'], 403);
            }

            $taskId         = (int) ($in['task_id'] ?? 0);
            $submissionText = trim((string) ($in['submission_text'] ?? ''));

            if ($taskId <= 0) {
                reply(['ok' => false, 'message' => 'Invalid task ID.'], 400);
            }
            if ($submissionText === '') {
                reply(['ok' => false, 'message' => 'Please enter your answer or submission link/notes.'], 400);
            }

            $chkRows = fetch_all_rows(
                $conn,
                'SELECT ct.id
                 FROM classroom_tasks ct
                 INNER JOIN classroom_members cm ON cm.classroom_id = ct.classroom_id
                 WHERE ct.id = ? AND cm.student_id = ?
                 LIMIT 1',
                'ii',
                [$taskId, $userId]
            );
            if (empty($chkRows)) {
                reply(['ok' => false, 'message' => 'Task not found in your enrolled classes.'], 404);
            }

            $existingSub = fetch_all_rows(
                $conn,
                'SELECT id, status FROM classroom_submissions WHERE task_id = ? AND student_id = ? LIMIT 1',
                'ii',
                [$taskId, $userId]
            );
            if (!empty($existingSub) && $existingSub[0]['status'] === 'graded') {
                reply(['ok' => false, 'message' => 'This submission is already graded and cannot be updated.'], 403);
            }

            run_exec(
                $conn,
                'INSERT INTO classroom_submissions (task_id, student_id, submission_text, status, submitted_at)
                 VALUES (?, ?, ?, \'submitted\', NOW())
                 ON DUPLICATE KEY UPDATE
                   submission_text = VALUES(submission_text),
                   status = \'submitted\',
                   submitted_at = NOW()',
                'iis',
                [$taskId, $userId, $submissionText]
            );

            write_audit($conn, $userId, 'SUBMIT', 'classroom_task', 'CTASK-' . $taskId, 'Submitted work');
            reply(['ok' => true, 'message' => 'Submission saved!']);
        }

        if ($action === 'grade_submission') {
            if (!$isStaff) {
                reply(['ok' => false, 'message' => 'Only teachers or admins can grade submissions.'], 403);
            }

            $submissionId = (int) ($in['submission_id'] ?? 0);
            $feedback     = trim((string) ($in['feedback'] ?? ''));

            if ($submissionId <= 0) {
                reply(['ok' => false, 'message' => 'Invalid submission ID.'], 400);
            }
            if (!isset($in['score']) || $in['score'] === '' || !is_numeric($in['score'])) {
                reply(['ok' => false, 'message' => 'Please enter a valid numeric score.'], 400);
            }

            $score = (float) $in['score'];

            if (in_array($role, ['admin', 'super_admin'], true)) {
                $subRows = fetch_all_rows(
                    $conn,
                    'SELECT cs.id, ct.max_score
                     FROM classroom_submissions cs
                     INNER JOIN classroom_tasks ct ON ct.id = cs.task_id
                     WHERE cs.id = ?
                     LIMIT 1',
                    'i',
                    [$submissionId]
                );
            } else {
                $subRows = fetch_all_rows(
                    $conn,
                    'SELECT cs.id, ct.max_score
                     FROM classroom_submissions cs
                     INNER JOIN classroom_tasks ct ON ct.id = cs.task_id
                     INNER JOIN classrooms c ON c.id = ct.classroom_id
                     WHERE cs.id = ? AND c.teacher_id = ?
                     LIMIT 1',
                    'ii',
                    [$submissionId, $userId]
                );
            }

            if (empty($subRows)) {
                reply(['ok' => false, 'message' => 'Submission not found or not in your class.'], 404);
            }

            $maxScore = (float) ($subRows[0]['max_score'] ?? 100.0);
            if ($score < 0 || $score > $maxScore) {
                reply(['ok' => false, 'message' => 'Score must be between 0 and ' . $maxScore . '.'], 400);
            }

            run_exec(
                $conn,
                'UPDATE classroom_submissions
                 SET score = ?, feedback = ?, status = \'graded\', graded_at = NOW(), graded_by = ?
                 WHERE id = ?',
                'dsii',
                [$score, $feedback, $userId, $submissionId]
            );

            write_audit($conn, $userId, 'GRADE', 'classroom_submission', 'CSUB-' . $submissionId, 'Score: ' . $score);
            reply(['ok' => true, 'message' => 'Grade and feedback saved!']);
        }

        reply(['ok' => false, 'message' => 'Unknown action.'], 400);
    }

    reply(['ok' => false, 'message' => 'Method not allowed.'], 405);

} catch (Throwable $e) {
    error_log('api/classroom_tasks.php error: ' . $e->getMessage());
    reply(['ok' => false, 'message' => 'Server error: ' . $e->getMessage()], 500);
}