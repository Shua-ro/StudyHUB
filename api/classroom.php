<?php
// api/classroom.php
// Classes (create / list / search / edit / delete), joining by code, and
// class posts. Used by js/classroom.js and the classroom block in js/app.js.
// Class tasks and submissions live in api/classroom_tasks.php.
//
//   GET  ?q=word   search classes by code, title, subject, section or teacher
//   POST action =  join_class | create_class | update_class | delete_class
//                  | create_post | delete_post
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

function write_audit($conn, $userId, $action, $entityType, $entityId, $details = '')
{
    try {
        $stmt = mysqli_prepare(
            $conn,
            'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)'
        );
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, 'issss', $userId, $action, $entityType, $entityId, $details);
            mysqli_stmt_execute($stmt);
        }
    } catch (Throwable $e) {
        // Ignore audit log errors
    }
}

function generate_class_code($conn)
{
    for ($i = 0; $i < 10; $i++) {
        $code = 'CLS-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
        $stmt = mysqli_prepare($conn, 'SELECT id FROM classrooms WHERE class_code = ? LIMIT 1');
        mysqli_stmt_bind_param($stmt, 's', $code);
        mysqli_stmt_execute($stmt);
        $res = mysqli_stmt_get_result($stmt);
        if (!mysqli_fetch_assoc($res)) {
            return $code;
        }
    }
    return 'CLS-' . strtoupper(uniqid());
}

try {
    $user = api_user();   // 401 if signed out, 403 if a password change is required

    $userId  = (int) $user['id'];
    $role    = (string) ($user['role'] ?? 'student');
    // Admins and Super Admins can see and manage every class.
    $isAdmin = in_array($role, ['admin', 'super_admin'], true);
    $isStaff = $isAdmin || $role === 'teacher';

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $q = mb_substr(trim((string) ($_GET['q'] ?? '')), 0, 100);
        $like = '%' . addcslashes($q, '%_\\') . '%';   // % and _ match literally
        $classrooms = [];

        if ($role === 'teacher') {
            if ($q !== '') {
                $stmt = mysqli_prepare(
                    $conn,
                    'SELECT c.*, u.display_name AS teacher_name
                     FROM classrooms c
                     LEFT JOIN users u ON u.id = c.teacher_id
                     WHERE c.teacher_id = ?
                       AND (c.class_code LIKE ? OR c.title LIKE ? OR c.subject LIKE ? OR c.section LIKE ?)
                     ORDER BY c.id DESC'
                );
                mysqli_stmt_bind_param($stmt, 'issss', $userId, $like, $like, $like, $like);
            } else {
                $stmt = mysqli_prepare(
                    $conn,
                    'SELECT c.*, u.display_name AS teacher_name
                     FROM classrooms c
                     LEFT JOIN users u ON u.id = c.teacher_id
                     WHERE c.teacher_id = ?
                     ORDER BY c.id DESC'
                );
                mysqli_stmt_bind_param($stmt, 'i', $userId);
            }
        } elseif ($isAdmin) {
            if ($q !== '') {
                $stmt = mysqli_prepare(
                    $conn,
                    'SELECT c.*, u.display_name AS teacher_name
                     FROM classrooms c
                     LEFT JOIN users u ON u.id = c.teacher_id
                     WHERE c.class_code LIKE ? OR c.title LIKE ? OR c.subject LIKE ? OR c.section LIKE ? OR u.display_name LIKE ?
                     ORDER BY c.id DESC'
                );
                mysqli_stmt_bind_param($stmt, 'sssss', $like, $like, $like, $like, $like);
            } else {
                $stmt = mysqli_prepare(
                    $conn,
                    'SELECT c.*, u.display_name AS teacher_name
                     FROM classrooms c
                     LEFT JOIN users u ON u.id = c.teacher_id
                     ORDER BY c.id DESC'
                );
            }
        } else {
            if ($q !== '') {
                $stmt = mysqli_prepare(
                    $conn,
                    'SELECT c.*, u.display_name AS teacher_name
                     FROM classroom_members m
                     INNER JOIN classrooms c ON c.id = m.classroom_id
                     LEFT JOIN users u ON u.id = c.teacher_id
                     WHERE m.student_id = ?
                       AND (c.class_code LIKE ? OR c.title LIKE ? OR c.subject LIKE ? OR c.section LIKE ? OR u.display_name LIKE ?)
                     ORDER BY c.id DESC'
                );
                mysqli_stmt_bind_param($stmt, 'isssss', $userId, $like, $like, $like, $like, $like);
            } else {
                $stmt = mysqli_prepare(
                    $conn,
                    'SELECT c.*, u.display_name AS teacher_name
                     FROM classroom_members m
                     INNER JOIN classrooms c ON c.id = m.classroom_id
                     LEFT JOIN users u ON u.id = c.teacher_id
                     WHERE m.student_id = ?
                     ORDER BY c.id DESC'
                );
                mysqli_stmt_bind_param($stmt, 'i', $userId);
            }
        }

        mysqli_stmt_execute($stmt);
        $res = mysqli_stmt_get_result($stmt);
        while ($row = mysqli_fetch_assoc($res)) {
            $classrooms[] = $row;
        }

        $posts = [];
        try {
            if ($isAdmin) {
                $pstmt = mysqli_prepare(
                    $conn,
                    'SELECT p.*, u.display_name AS author_name
                     FROM classroom_posts p
                     LEFT JOIN users u ON u.id = p.author_id
                     ORDER BY p.id DESC'
                );
                mysqli_stmt_execute($pstmt);
            } elseif ($role === 'teacher') {
                $pstmt = mysqli_prepare(
                    $conn,
                    'SELECT p.*, u.display_name AS author_name
                     FROM classroom_posts p
                     INNER JOIN classrooms c ON c.id = p.classroom_id
                     LEFT JOIN users u ON u.id = p.author_id
                     WHERE c.teacher_id = ?
                     ORDER BY p.id DESC'
                );
                mysqli_stmt_bind_param($pstmt, 'i', $userId);
                mysqli_stmt_execute($pstmt);
            } else {
                $pstmt = mysqli_prepare(
                    $conn,
                    'SELECT p.*, u.display_name AS author_name
                     FROM classroom_posts p
                     INNER JOIN classroom_members m ON m.classroom_id = p.classroom_id
                     LEFT JOIN users u ON u.id = p.author_id
                     WHERE m.student_id = ?
                     ORDER BY p.id DESC'
                );
                mysqli_stmt_bind_param($pstmt, 'i', $userId);
                mysqli_stmt_execute($pstmt);
            }

            $pres = mysqli_stmt_get_result($pstmt);
            while ($prow = mysqli_fetch_assoc($pres)) {
                $posts[] = $prow;
            }
        } catch (Throwable $pe) {
            $posts = [];
        }

        $students = [];
        try {
            if ($isStaff) {
                if ($isAdmin) {
                    $sstmt = mysqli_prepare(
                        $conn,
                        'SELECT DISTINCT u.id, u.display_name AS name, c.id AS classroom_id, c.title AS classroom_title
                         FROM classroom_members m
                         INNER JOIN users u ON u.id = m.student_id
                         INNER JOIN classrooms c ON c.id = m.classroom_id
                         ORDER BY u.display_name ASC'
                    );
                    mysqli_stmt_execute($sstmt);
                } else {
                    $sstmt = mysqli_prepare(
                        $conn,
                        'SELECT DISTINCT u.id, u.display_name AS name, c.id AS classroom_id, c.title AS classroom_title
                         FROM classroom_members m
                         INNER JOIN users u ON u.id = m.student_id
                         INNER JOIN classrooms c ON c.id = m.classroom_id
                         WHERE c.teacher_id = ?
                         ORDER BY u.display_name ASC'
                    );
                    mysqli_stmt_bind_param($sstmt, 'i', $userId);
                    mysqli_stmt_execute($sstmt);
                }
                $sres = mysqli_stmt_get_result($sstmt);
                while ($srow = mysqli_fetch_assoc($sres)) {
                    $srow['submitted'] = 0;
                    $srow['reviewed']  = 0;
                    $students[] = $srow;
                }
            }
        } catch (Throwable $se) {
            $students = [];
        }

        reply([
            'ok'         => true,
            'role'       => $role,
            'can_manage' => $isStaff,
            'classrooms' => $classrooms,
            'posts'      => $posts,
            'students'   => $students,
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $in = json_decode(file_get_contents('php://input'), true);
        if (!is_array($in)) {
            reply(['ok' => false, 'message' => 'Invalid request data.'], 400);
        }

        $action = (string) ($in['action'] ?? '');

        if ($action === 'join_class') {
            if ($role !== 'student') {
                reply(['ok' => false, 'message' => 'Only students can join classes with a code.'], 403);
            }

            $code = strtoupper(trim((string) ($in['code'] ?? '')));
            if ($code === '') {
                reply(['ok' => false, 'message' => 'Please enter a class code.'], 400);
            }

            $stmt = mysqli_prepare($conn, 'SELECT id, title FROM classrooms WHERE class_code = ? LIMIT 1');
            mysqli_stmt_bind_param($stmt, 's', $code);
            mysqli_stmt_execute($stmt);
            $classroom = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt));

            if (!$classroom) {
                reply(['ok' => false, 'message' => 'Class code not found.'], 404);
            }

            $classroomId = (int) $classroom['id'];
            $check = mysqli_prepare(
                $conn,
                'SELECT id FROM classroom_members WHERE classroom_id = ? AND student_id = ? LIMIT 1'
            );
            mysqli_stmt_bind_param($check, 'ii', $classroomId, $userId);
            mysqli_stmt_execute($check);
            if (mysqli_fetch_assoc(mysqli_stmt_get_result($check))) {
                reply(['ok' => false, 'message' => 'You have already joined this class.'], 409);
            }

            $ins = mysqli_prepare(
                $conn,
                'INSERT INTO classroom_members (classroom_id, student_id) VALUES (?, ?)'
            );
            mysqli_stmt_bind_param($ins, 'ii', $classroomId, $userId);
            mysqli_stmt_execute($ins);

            write_audit($conn, $userId, 'JOIN', 'classroom', 'CLASS-' . $classroomId, $code);
            reply(['ok' => true, 'message' => 'Joined ' . $classroom['title'] . '!']);
        }

        if (!$isStaff) {
            reply(['ok' => false, 'message' => 'Only teachers or admins can modify classrooms.'], 403);
        }

        if ($action === 'create_class') {
            $title   = trim((string) ($in['title'] ?? $in['name'] ?? ''));
            $section = trim((string) ($in['section'] ?? ''));
            $subject = trim((string) ($in['subject'] ?? ''));

            if ($title === '') {
                reply(['ok' => false, 'message' => 'Class name is required.'], 400);
            }
            if ($subject === '') {
                $subject = 'General';
            }

            $classCode = generate_class_code($conn);
            $stmt = mysqli_prepare(
                $conn,
                'INSERT INTO classrooms (teacher_id, class_code, title, subject, section)
                 VALUES (?, ?, ?, ?, ?)'
            );
            mysqli_stmt_bind_param($stmt, 'issss', $userId, $classCode, $title, $subject, $section);
            mysqli_stmt_execute($stmt);

            $newId = mysqli_insert_id($conn);
            write_audit($conn, $userId, 'CREATE', 'classroom', 'CLASS-' . $newId, $classCode . ' - ' . $title);
            reply([
                'ok'         => true,
                'id'         => (int) $newId,
                'class_code' => $classCode,
                'message'    => 'Class created! Share code: ' . $classCode,
            ]);
        }

        if ($action === 'update_class') {
            $id      = (int) ($in['id'] ?? 0);
            $title   = trim((string) ($in['title'] ?? ''));
            $section = trim((string) ($in['section'] ?? ''));
            $subject = trim((string) ($in['subject'] ?? ''));

            if ($id <= 0) {
                reply(['ok' => false, 'message' => 'Invalid class ID.'], 400);
            }
            if ($title === '') {
                reply(['ok' => false, 'message' => 'Class name is required.'], 400);
            }
            if ($subject === '') {
                reply(['ok' => false, 'message' => 'Subject is required.'], 400);
            }

            if ($isAdmin) {
                $stmt = mysqli_prepare(
                    $conn,
                    'UPDATE classrooms SET title = ?, subject = ?, section = ? WHERE id = ?'
                );
                mysqli_stmt_bind_param($stmt, 'sssi', $title, $subject, $section, $id);
            } else {
                $stmt = mysqli_prepare(
                    $conn,
                    'UPDATE classrooms SET title = ?, subject = ?, section = ? WHERE id = ? AND teacher_id = ?'
                );
                mysqli_stmt_bind_param($stmt, 'sssii', $title, $subject, $section, $id, $userId);
            }

            mysqli_stmt_execute($stmt);
            write_audit($conn, $userId, 'UPDATE', 'classroom', 'CLASS-' . $id, $title);
            reply(['ok' => true, 'message' => 'Class updated.']);
        }

        if ($action === 'delete_class') {
            $id = (int) ($in['id'] ?? 0);
            if ($id <= 0) {
                reply(['ok' => false, 'message' => 'Invalid class ID.'], 400);
            }

            if ($isAdmin) {
                $stmt = mysqli_prepare($conn, 'DELETE FROM classrooms WHERE id = ?');
                mysqli_stmt_bind_param($stmt, 'i', $id);
            } else {
                $stmt = mysqli_prepare($conn, 'DELETE FROM classrooms WHERE id = ? AND teacher_id = ?');
                mysqli_stmt_bind_param($stmt, 'ii', $id, $userId);
            }

            mysqli_stmt_execute($stmt);
            if (mysqli_stmt_affected_rows($stmt) === 0) {
                reply(['ok' => false, 'message' => 'Class not found or not owned by you.'], 404);
            }

            write_audit($conn, $userId, 'DELETE', 'classroom', 'CLASS-' . $id, 'Class deleted');
            reply(['ok' => true, 'message' => 'Class deleted.']);
        }

        if ($action === 'create_post') {
            $classroomId = (int) ($in['classroom_id'] ?? 0);
            $title       = trim((string) ($in['title'] ?? ''));
            $content     = trim((string) ($in['content'] ?? ''));
            $link        = trim((string) ($in['resource_link'] ?? ''));

            if ($classroomId <= 0) {
                reply(['ok' => false, 'message' => 'Please select a class.'], 400);
            }
            // Only plain web links (the page turns this into a clickable link).
            if ($link !== '' && (strlen($link) > 255
                    || !filter_var($link, FILTER_VALIDATE_URL)
                    || !preg_match('#^https?://#i', $link))) {
                reply(['ok' => false, 'message' => 'The resource link must be a web address starting with http:// or https://.'], 400);
            }
            $link = $link === '' ? null : $link;
            if ($title === '') {
                reply(['ok' => false, 'message' => 'Post title is required.'], 400);
            }
            if ($content === '') {
                reply(['ok' => false, 'message' => 'Post content is required.'], 400);
            }

            if (!$isAdmin) {
                $own = mysqli_prepare($conn, 'SELECT id FROM classrooms WHERE id = ? AND teacher_id = ? LIMIT 1');
                mysqli_stmt_bind_param($own, 'ii', $classroomId, $userId);
                mysqli_stmt_execute($own);
                if (!mysqli_fetch_assoc(mysqli_stmt_get_result($own))) {
                    reply(['ok' => false, 'message' => 'You can only post in your own classes.'], 403);
                }
            }

            $stmt = mysqli_prepare(
                $conn,
                'INSERT INTO classroom_posts (classroom_id, author_id, title, content, resource_link)
                 VALUES (?, ?, ?, ?, ?)'
            );
            mysqli_stmt_bind_param($stmt, 'iisss', $classroomId, $userId, $title, $content, $link);
            mysqli_stmt_execute($stmt);

            $newId = mysqli_insert_id($conn);
            write_audit($conn, $userId, 'CREATE', 'classroom_post', 'POST-' . $newId, $title);
            reply(['ok' => true, 'id' => (int) $newId, 'message' => 'Announcement posted!']);
        }

        if ($action === 'delete_post') {
            $id = (int) ($in['id'] ?? 0);
            if ($id <= 0) {
                reply(['ok' => false, 'message' => 'Invalid post ID.'], 400);
            }

            if ($isAdmin) {
                $stmt = mysqli_prepare($conn, 'DELETE FROM classroom_posts WHERE id = ?');
                mysqli_stmt_bind_param($stmt, 'i', $id);
            } else {
                $stmt = mysqli_prepare($conn, 'DELETE FROM classroom_posts WHERE id = ? AND author_id = ?');
                mysqli_stmt_bind_param($stmt, 'ii', $id, $userId);
            }

            mysqli_stmt_execute($stmt);
            if (mysqli_stmt_affected_rows($stmt) === 0) {
                reply(['ok' => false, 'message' => 'Post not found or not owned by you.'], 404);
            }

            write_audit($conn, $userId, 'DELETE', 'classroom_post', 'POST-' . $id, 'Post deleted');
            reply(['ok' => true, 'message' => 'Post deleted.']);
        }

        reply(['ok' => false, 'message' => 'Unknown action.'], 400);
    }

    reply(['ok' => false, 'message' => 'Method not allowed.'], 405);

} catch (Throwable $e) {
    error_log('api/classroom.php error: ' . $e->getMessage());
    reply(['ok' => false, 'message' => 'Server error: ' . $e->getMessage()], 500);
}