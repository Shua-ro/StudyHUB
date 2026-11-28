<?php
// admin + super admin tools. everything goes through permissions.php first,
// and any change to someone else's account gets logged (who, to whom, why).
// full db backup is its own thing in backup.php

require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/settings.php';

header('Content-Type: application/json; charset=utf-8');

const PAGE_SIZE = 20;

function reply($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// 403 + log it if they're not allowed
function require_permission(array $actor, string $action, ?array $target = null, array $extra = []): void
{
    $reason = permission_denied($actor, $action, $target, $extra);
    if ($reason !== null) {
        log_security_event('PERMISSION_DENIED', $actor['id'], $target['id'] ?? null, "$action: $reason");
        reply(['ok' => false, 'message' => $reason], 403);
    }
}

// grab the target account or 404
function load_target(mysqli $conn, $id): array
{
    $id = (int) $id;
    $stmt = mysqli_prepare($conn,
        'SELECT id, username, display_name, role, status, status_reason FROM users WHERE id = ?');
    mysqli_stmt_bind_param($stmt, 'i', $id);
    mysqli_stmt_execute($stmt);
    $row = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt));
    if (!$row) {
        reply(['ok' => false, 'message' => 'That account no longer exists.'], 404);
    }
    $row['id'] = (int) $row['id'];
    return $row;
}

// need a reason for anything that restricts an account
function required_reason(array $input): string
{
    $reason = trim((string) ($input['reason'] ?? ''));
    if (mb_strlen($reason) < 3) {
        reply(['ok' => false, 'message' => 'Give a short reason (at least 3 characters).', 'field' => 'reason'], 422);
    }
    return mb_substr($reason, 0, 255);
}

// temp password like "Hq7k-Mz3p-W9tc", skips 0/O and 1/l/I so nobody misreads it
function temporary_password(): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    $groups = [];
    for ($g = 0; $g < 3; $g++) {
        $chunk = '';
        for ($i = 0; $i < 4; $i++) {
            $chunk .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $groups[] = $chunk;
    }
    return implode('-', $groups);
}

// which buttons the page should show for this account
function allowed_actions(array $actor, array $row): array
{
    $can = [];
    foreach (['user.edit', 'user.reset_password', 'user.suspend', 'user.ban', 'user.reactivate',
              'user.approve', 'user.change_role', 'user.delete', 'content.view', 'content.delete'] as $action) {
        $extra = $action === 'user.change_role' ? ['new_role' => $row['role'] === 'student' ? 'teacher' : 'student'] : [];
        if (permission_denied($actor, $action, $row, $extra) === null) {
            // "user.suspend" -> "suspend", "content.view" -> "view_content"
            $can[] = str_starts_with($action, 'content.')
                ? substr($action, 8) . '_content'
                : substr($action, 5);
        }
    }
    // depends on their current status
    $status = $row['status'];
    $can = array_values(array_filter($can, function ($a) use ($status) {
        if ($a === 'approve')    return $status === 'pending';
        if ($a === 'reactivate') return $status === 'suspended' || $status === 'banned';
        if ($a === 'suspend')    return $status === 'active';
        if ($a === 'ban')        return $status !== 'banned';
        return true;
    }));
    return $can;
}

// why there's nothing to do (like an admin looking at another admin)
function locked_reason(array $actor, array $row): ?string
{
    return permission_denied($actor, 'user.view', $row);
}

// valid email that nobody else is using
function clean_email(mysqli $conn, $value, int $exceptId = 0): string
{
    $email = strtolower(trim((string) $value));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
        reply(['ok' => false, 'message' => 'Enter a valid email address.', 'field' => 'email'], 422);
    }
    $stmt = mysqli_prepare($conn, 'SELECT id FROM users WHERE username = ? AND id <> ?');
    mysqli_stmt_bind_param($stmt, 'si', $email, $exceptId);
    mysqli_stmt_execute($stmt);
    if (mysqli_fetch_assoc(mysqli_stmt_get_result($stmt))) {
        reply(['ok' => false, 'message' => 'Another account already uses that email.', 'field' => 'email'], 409);
    }
    return $email;
}

const LOG_PAGE_SIZE = 25;

// "7" = last 7 days, anything else = all time
function period_condition(array $input, string $column): string
{
    $days = (int) ($input['period'] ?? 0);
    return in_array($days, [1, 7, 30, 90], true)
        ? "$column >= DATE_SUB(NOW(), INTERVAL $days DAY)"
        : '';
}

// paged log query. $base has to end with "FROM ... " (joins included)
function paged_log(mysqli $conn, string $select, string $base, array $where, string $types, array $params, string $order, int $page): array
{
    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

    $stmt = mysqli_prepare($conn, "SELECT COUNT(*) AS n $base $whereSql");
    if ($params) mysqli_stmt_bind_param($stmt, $types, ...$params);
    mysqli_stmt_execute($stmt);
    $total = (int) mysqli_fetch_assoc(mysqli_stmt_get_result($stmt))['n'];

    $pages = max(1, (int) ceil($total / LOG_PAGE_SIZE));
    $page = min($pages, max(1, $page));
    $offset = ($page - 1) * LOG_PAGE_SIZE;

    $stmt = mysqli_prepare($conn, "$select $base $whereSql ORDER BY $order LIMIT " . LOG_PAGE_SIZE . " OFFSET $offset");
    if ($params) mysqli_stmt_bind_param($stmt, $types, ...$params);
    mysqli_stmt_execute($stmt);
    $rows = mysqli_fetch_all(mysqli_stmt_get_result($stmt), MYSQLI_ASSOC);

    return ['rows' => $rows, 'total' => $total, 'page' => $page, 'pages' => $pages];
}

// for the type filter dropdown
function distinct_values(mysqli $conn, string $sql): array
{
    return array_column(mysqli_fetch_all(mysqli_query($conn, $sql), MYSQLI_NUM), 0);
}

function like_term(string $search): string
{
    return '%' . addcslashes($search, '%_\\') . '%';
}

function clean_name($value): string
{
    $name = trim((string) $value);
    if ($name === '' || mb_strlen($name) > 100) {
        reply(['ok' => false, 'message' => 'Enter a full name (max 100 characters).', 'field' => 'name'], 422);
    }
    return $name;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(['ok' => false, 'message' => 'Use POST.'], 405);
}

$user = api_user();

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    reply(['ok' => false, 'message' => 'Bad data.'], 400);
}
$action = $input['action'] ?? '';
$me = $user['id'];

try {

    // dashboard counts
    if ($action === 'overview') {
        require_permission($user, 'reports.view');

        $byRole   = array_fill_keys(array_keys(ROLE_RANK), 0);
        $byStatus = ['active' => 0, 'pending' => 0, 'suspended' => 0, 'banned' => 0];
        $result = mysqli_query($conn, 'SELECT role, status, COUNT(*) AS n FROM users GROUP BY role, status');
        $total = 0;
        while ($row = mysqli_fetch_assoc($result)) {
            $n = (int) $row['n'];
            $total += $n;
            $byRole[$row['role']]     = ($byRole[$row['role']] ?? 0) + $n;
            $byStatus[$row['status']] = ($byStatus[$row['status']] ?? 0) + $n;
        }
        reply(['ok' => true, 'total' => $total, 'byRole' => $byRole, 'byStatus' => $byStatus]);
    }

    // user list
    if ($action === 'list_users') {
        require_permission($user, 'users.list');

        $where = [];
        $types = '';
        $params = [];

        $search = trim((string) ($input['search'] ?? ''));
        if ($search !== '') {
            $like = '%' . addcslashes($search, '%_\\') . '%';
            $where[] = '(u.display_name LIKE ? OR u.username LIKE ?)';
            $types .= 'ss';
            array_push($params, $like, $like);
        }
        $role = (string) ($input['role'] ?? '');
        if (isset(ROLE_RANK[$role])) {
            $where[] = 'u.role = ?';
            $types .= 's';
            $params[] = $role;
        }
        $status = (string) ($input['status'] ?? '');
        if (in_array($status, ['active', 'pending', 'suspended', 'banned'], true)) {
            $where[] = 'u.status = ?';
            $types .= 's';
            $params[] = $status;
        }
        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $stmt = mysqli_prepare($conn, "SELECT COUNT(*) AS n FROM users u $whereSql");
        if ($params) mysqli_stmt_bind_param($stmt, $types, ...$params);
        mysqli_stmt_execute($stmt);
        $total = (int) mysqli_fetch_assoc(mysqli_stmt_get_result($stmt))['n'];

        $pages = max(1, (int) ceil($total / PAGE_SIZE));
        $page  = min($pages, max(1, (int) ($input['page'] ?? 1)));
        $offset = ($page - 1) * PAGE_SIZE;

        // pending first since they need attention, then newest
        $sql = "SELECT u.id, u.username, u.display_name, u.role, u.status, u.status_reason, u.created_at,
                       (SELECT MAX(s.created_at) FROM security_log s
                         WHERE s.target_user_id = u.id AND s.event = 'LOGIN') AS last_login
                FROM users u $whereSql
                ORDER BY (u.status = 'pending') DESC, u.created_at DESC, u.id DESC
                LIMIT " . PAGE_SIZE . " OFFSET $offset";
        $stmt = mysqli_prepare($conn, $sql);
        if ($params) mysqli_stmt_bind_param($stmt, $types, ...$params);
        mysqli_stmt_execute($stmt);
        $result = mysqli_stmt_get_result($stmt);

        $users = [];
        while ($row = mysqli_fetch_assoc($result)) {
            $row['id'] = (int) $row['id'];
            $isMe = $row['id'] === $me;
            $users[] = [
                'id'           => $row['id'],
                'name'         => $row['display_name'],
                'email'        => $row['username'],
                'role'         => $row['role'],
                'roleLabel'    => role_label($row['role']),
                'status'       => $row['status'],
                'statusReason' => $row['status_reason'],
                'createdAt'    => $row['created_at'],
                'lastLogin'    => $row['last_login'],
                'isMe'         => $isMe,
                'can'          => allowed_actions($user, $row),
                'lockedReason' => $isMe ? 'This is you. Use your Profile page.' : locked_reason($user, $row),
            ];
        }

        reply([
            'ok'    => true,
            'users' => $users,
            'total' => $total,
            'page'  => $page,
            'pages' => $pages,
            'viewer' => [
                'canCreate'       => permission_denied($user, 'users.create') === null,
                'assignableRoles' => array_map(fn ($r) => ['value' => $r, 'label' => role_label($r)], ASSIGNABLE_ROLES),
            ],
        ]);
    }

    // usage report
    if ($action === 'reports') {
        require_permission($user, 'reports.view');
        $one = fn (string $sql) => (int) mysqli_fetch_row(mysqli_query($conn, $sql))[0];

        // sign-ins per day for the last 14 days incl. today, empty days = 0
        $days = [];
        for ($i = 13; $i >= 0; $i--) {
            $days[date('Y-m-d', strtotime("-$i day"))] = 0;
        }
        $result = mysqli_query($conn,
            "SELECT DATE(created_at) AS d, COUNT(*) AS n FROM security_log
             WHERE event = 'LOGIN' AND created_at >= CURDATE() - INTERVAL 13 DAY
             GROUP BY DATE(created_at)");
        while ($row = mysqli_fetch_assoc($result)) {
            if (isset($days[$row['d']])) $days[$row['d']] = (int) $row['n'];
        }

        $tasksTotal = $one('SELECT COUNT(*) FROM tasks');
        $tasksDone  = $one("SELECT COUNT(*) FROM tasks WHERE status IN ('Done','Archived')");

        $report = [
            'ok'       => true,
            'accounts' => [
                'new7'    => $one('SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL 7 DAY'),
                'new30'   => $one('SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL 30 DAY'),
                'active7' => $one("SELECT COUNT(DISTINCT target_user_id) FROM security_log
                                   WHERE event = 'LOGIN' AND created_at >= NOW() - INTERVAL 7 DAY"),
            ],
            'signIns'  => array_map(fn ($d, $n) => ['date' => $d, 'count' => $n], array_keys($days), $days),
            'content'  => [
                'tasks'          => $tasksTotal,
                'tasksCreated7'  => $one('SELECT COUNT(*) FROM tasks WHERE created_at >= NOW() - INTERVAL 7 DAY'),
                'completionRate' => $tasksTotal ? (int) round($tasksDone / $tasksTotal * 100) : 0,
                'classes'        => $one('SELECT COUNT(*) FROM schedules'),
                'notes'          => $one('SELECT COUNT(*) FROM notes'),
            ],
        ];

        // super admin only
        if (permission_denied($user, 'logs.security') === null) {
            $report['security'] = [
                'failed7'  => $one("SELECT COUNT(*) FROM security_log WHERE event = 'LOGIN_FAILED' AND created_at >= NOW() - INTERVAL 7 DAY"),
                'blocked7' => $one("SELECT COUNT(*) FROM security_log WHERE event IN ('LOGIN_BLOCKED','LOGIN_LOCKED') AND created_at >= NOW() - INTERVAL 7 DAY"),
                'denied7'  => $one("SELECT COUNT(*) FROM security_log WHERE event = 'PERMISSION_DENIED' AND created_at >= NOW() - INTERVAL 7 DAY"),
            ];
        }
        reply($report);
    }

    // activity log
    if ($action === 'activity_log') {
        require_permission($user, 'logs.activity');
        $isSuper = permission_denied($user, 'logs.security') === null;

        $where = [];
        $types = '';
        $params = [];
        // admins only get regular users, super admins get everyone
        if (!$isSuper) {
            $where[] = "u.role IN ('student','teacher')";
        }
        if (($search = trim((string) ($input['search'] ?? ''))) !== '') {
            $where[] = '(u.display_name LIKE ? OR u.username LIKE ? OR a.details LIKE ? OR a.entity_id LIKE ?)';
            $types .= 'ssss';
            array_push($params, ...array_fill(0, 4, like_term($search)));
        }
        if (($type = (string) ($input['type'] ?? '')) !== '') {
            $where[] = 'a.action = ?';
            $types .= 's';
            $params[] = $type;
        }
        if (($uid = (int) ($input['userId'] ?? 0)) > 0) {
            $where[] = 'a.user_id = ?';
            $types .= 'i';
            $params[] = $uid;
        }
        if ($cond = period_condition($input, 'a.created_at')) {
            $where[] = $cond;
        }

        $log = paged_log($conn,
            'SELECT a.id, a.created_at, a.action, a.entity_type, a.entity_id, a.details,
                    a.user_id, u.display_name, u.username, u.role',
            'FROM audit_log a ' . ($isSuper ? 'LEFT' : 'INNER') . ' JOIN users u ON u.id = a.user_id',
            $where, $types, $params, 'a.created_at DESC, a.id DESC', (int) ($input['page'] ?? 1));

        $log['rows'] = array_map(fn ($r) => [
            'id'      => (int) $r['id'],
            'time'    => $r['created_at'],
            'type'    => $r['action'],
            'target'  => trim($r['entity_type'] . ' ' . $r['entity_id']),
            'details' => $r['details'],
            'user'    => $r['username'] !== null
                ? ['id' => (int) $r['user_id'], 'name' => $r['display_name'], 'email' => $r['username'], 'role' => role_label($r['role'])]
                : ['id' => (int) $r['user_id'], 'name' => 'Deleted account', 'email' => '', 'role' => ''],
        ], $log['rows']);
        $log['types'] = distinct_values($conn, 'SELECT DISTINCT action FROM audit_log ORDER BY action');
        reply(['ok' => true] + $log);
    }

    // security log (super admin only)
    if ($action === 'security_log') {
        require_permission($user, 'logs.security');

        $where = [];
        $types = '';
        $params = [];
        if (($search = trim((string) ($input['search'] ?? ''))) !== '') {
            $where[] = '(actor.display_name LIKE ? OR actor.username LIKE ? OR target.display_name LIKE ?
                         OR target.username LIKE ? OR s.details LIKE ? OR s.ip LIKE ?)';
            $types .= 'ssssss';
            array_push($params, ...array_fill(0, 6, like_term($search)));
        }
        if (($type = (string) ($input['type'] ?? '')) !== '') {
            $where[] = 's.event = ?';
            $types .= 's';
            $params[] = $type;
        }
        if (($uid = (int) ($input['userId'] ?? 0)) > 0) {
            $where[] = '(s.actor_id = ? OR s.target_user_id = ?)';
            $types .= 'ii';
            array_push($params, $uid, $uid);
        }
        if ($cond = period_condition($input, 's.created_at')) {
            $where[] = $cond;
        }

        $log = paged_log($conn,
            'SELECT s.id, s.created_at, s.event, s.details, s.ip, s.actor_id, s.target_user_id,
                    actor.display_name AS actor_name, actor.username AS actor_email,
                    target.display_name AS target_name, target.username AS target_email',
            'FROM security_log s
             LEFT JOIN users actor  ON actor.id  = s.actor_id
             LEFT JOIN users target ON target.id = s.target_user_id',
            $where, $types, $params, 's.created_at DESC, s.id DESC', (int) ($input['page'] ?? 1));

        $person = function ($id, $name, $email) {
            if ($id === null) return null;   // failed login, no user
            return $email !== null
                ? ['id' => (int) $id, 'name' => $name, 'email' => $email]
                : ['id' => (int) $id, 'name' => 'Deleted account', 'email' => ''];
        };
        $log['rows'] = array_map(fn ($r) => [
            'id'      => (int) $r['id'],
            'time'    => $r['created_at'],
            'type'    => $r['event'],
            'details' => $r['details'],
            'ip'      => $r['ip'],
            'actor'   => $person($r['actor_id'], $r['actor_name'], $r['actor_email']),
            'target'  => $person($r['target_user_id'], $r['target_name'], $r['target_email']),
        ], $log['rows']);
        $log['types'] = distinct_values($conn, 'SELECT DISTINCT event FROM security_log ORDER BY event');
        reply(['ok' => true] + $log);
    }

    // announcements
    if ($action === 'list_announcements') {
        require_permission($user, 'announcements.manage');
        $rows = mysqli_fetch_all(mysqli_query($conn,
            "SELECT a.id, a.title, a.body, a.audience, a.importance, a.starts_at, a.ends_at, a.updated_at,
                    u.display_name AS author,
                    CASE WHEN a.starts_at IS NOT NULL AND a.starts_at > NOW() THEN 'scheduled'
                         WHEN a.ends_at IS NOT NULL AND a.ends_at <= NOW() THEN 'ended'
                         ELSE 'live' END AS state
             FROM announcements a LEFT JOIN users u ON u.id = a.created_by
             ORDER BY (state = 'live') DESC, a.updated_at DESC
             LIMIT 100"), MYSQLI_ASSOC);
        reply(['ok' => true, 'announcements' => array_map(fn ($r) => [
            'id' => (int) $r['id'], 'title' => $r['title'], 'body' => $r['body'],
            'audience' => $r['audience'], 'importance' => $r['importance'],
            'startsAt' => $r['starts_at'], 'endsAt' => $r['ends_at'],
            'state' => $r['state'], 'author' => $r['author'] ?? 'Deleted account', 'updatedAt' => $r['updated_at'],
        ], $rows)]);
    }

    if ($action === 'save_announcement') {
        require_permission($user, 'announcements.manage');
        $id    = (int) ($input['id'] ?? 0);
        $title = trim((string) ($input['title'] ?? ''));
        $body  = trim((string) ($input['body'] ?? ''));
        if ($title === '' || mb_strlen($title) > 120) {
            reply(['ok' => false, 'message' => 'Give the announcement a title (max 120 characters).', 'field' => 'title'], 422);
        }
        if ($body === '' || mb_strlen($body) > 2000) {
            reply(['ok' => false, 'message' => 'Write the message (max 2000 characters).', 'field' => 'body'], 422);
        }
        $audience   = in_array($input['audience'] ?? '', ['all', 'student', 'teacher'], true) ? $input['audience'] : 'all';
        $importance = ($input['importance'] ?? '') === 'important' ? 'important' : 'info';

        // from datetime-local, like "2026-12-01T08:00" (or empty)
        $when = function ($value, $field) {
            $value = trim((string) $value);
            if ($value === '') return null;
            $time = strtotime($value);
            if ($time === false) {
                reply(['ok' => false, 'message' => 'That date is not valid.', 'field' => $field], 422);
            }
            return date('Y-m-d H:i:s', $time);
        };
        $starts = $when($input['startsAt'] ?? '', 'startsAt');
        $ends   = $when($input['endsAt'] ?? '', 'endsAt');
        if ($starts && $ends && $ends <= $starts) {
            reply(['ok' => false, 'message' => 'The end must be after the start.', 'field' => 'endsAt'], 422);
        }

        if ($id > 0) {
            $stmt = mysqli_prepare($conn,
                'UPDATE announcements SET title = ?, body = ?, audience = ?, importance = ?, starts_at = ?, ends_at = ? WHERE id = ?');
            mysqli_stmt_bind_param($stmt, 'ssssssi', $title, $body, $audience, $importance, $starts, $ends, $id);
            mysqli_stmt_execute($stmt);
            if (mysqli_stmt_affected_rows($stmt) === 0 && !mysqli_fetch_row(mysqli_query($conn, "SELECT 1 FROM announcements WHERE id = $id"))) {
                reply(['ok' => false, 'message' => 'That announcement no longer exists.'], 404);
            }
        } else {
            $stmt = mysqli_prepare($conn,
                'INSERT INTO announcements (title, body, audience, importance, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
            mysqli_stmt_bind_param($stmt, 'ssssssi', $title, $body, $audience, $importance, $starts, $ends, $me);
            mysqli_stmt_execute($stmt);
            $id = (int) mysqli_insert_id($conn);
        }
        log_security_event('ANNOUNCEMENT_SAVED', $me, null, "#$id \"$title\" for $audience");
        reply(['ok' => true, 'id' => $id, 'message' => 'Announcement saved.']);
    }

    if ($action === 'delete_announcement') {
        require_permission($user, 'announcements.manage');
        $id = (int) ($input['id'] ?? 0);
        $stmt = mysqli_prepare($conn, 'SELECT title FROM announcements WHERE id = ?');
        mysqli_stmt_bind_param($stmt, 'i', $id);
        mysqli_stmt_execute($stmt);
        $row = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt));
        if (!$row) {
            reply(['ok' => false, 'message' => 'That announcement no longer exists.'], 404);
        }
        $stmt = mysqli_prepare($conn, 'DELETE FROM announcements WHERE id = ?');
        mysqli_stmt_bind_param($stmt, 'i', $id);
        mysqli_stmt_execute($stmt);
        log_security_event('ANNOUNCEMENT_DELETED', $me, null, "#$id \"{$row['title']}\"");
        reply(['ok' => true, 'message' => 'Announcement removed.']);
    }

    // global settings
    if ($action === 'get_settings') {
        require_permission($user, 'settings.global');
        $s = get_settings($conn);
        reply(['ok' => true, 'settings' => [
            'allowSignups'        => $s['allow_signups'] === '1',
            'allowTeacherSignups' => $s['allow_teacher_signups'] === '1',
        ]]);
    }

    if ($action === 'save_settings') {
        require_permission($user, 'settings.global');
        $wanted = [
            'allow_signups'         => !empty($input['allowSignups']) ? '1' : '0',
            'allow_teacher_signups' => !empty($input['allowTeacherSignups']) ? '1' : '0',
        ];
        $before = get_settings($conn);
        $stmt = mysqli_prepare($conn,
            'INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)');
        $changes = [];
        foreach ($wanted as $key => $value) {
            mysqli_stmt_bind_param($stmt, 'ssi', $key, $value, $me);
            mysqli_stmt_execute($stmt);
            if (($before[$key] ?? null) !== $value) {
                $changes[] = "$key: " . ($value === '1' ? 'on' : 'off');
            }
        }
        if ($changes) {
            log_security_event('SETTINGS_CHANGED', $me, null, implode(', ', $changes));
        }
        reply(['ok' => true, 'message' => $changes ? 'Settings saved.' : 'Nothing changed.']);
    }

    // everything below is about one account
    if (in_array($action, ['approve', 'set_status', 'reset_password', 'edit_user', 'change_role', 'delete_user',
                           'user_content', 'delete_content'], true)) {
        $target = load_target($conn, $input['id'] ?? 0);
    }

    // moderation - view someone's stuff
    if ($action === 'user_content') {
        require_permission($user, 'content.view', $target);

        $fetch = function (string $sql) use ($conn, $target) {
            $stmt = mysqli_prepare($conn, $sql);
            mysqli_stmt_bind_param($stmt, 'i', $target['id']);
            mysqli_stmt_execute($stmt);
            return mysqli_fetch_all(mysqli_stmt_get_result($stmt), MYSQLI_ASSOC);
        };

        $tasks = array_map(fn ($r) => [
            'id' => (int) $r['id'], 'title' => $r['title'], 'subject' => $r['subject'],
            'status' => $r['status'], 'priority' => $r['priority'], 'dueDate' => $r['due_date'],
            'description' => $r['description'] ?? '', 'createdAt' => $r['created_at'],
        ], $fetch('SELECT id, title, subject, description, status, priority, due_date, created_at
                   FROM tasks WHERE user_id = ? ORDER BY created_at DESC, id DESC'));

        $classes = array_map(fn ($r) => [
            'id' => (int) $r['id'], 'title' => $r['class_name'], 'day' => $r['day'],
            'time' => substr($r['start_time'], 0, 5) . '–' . substr($r['end_time'], 0, 5),
            'courseCode' => $r['course_code'], 'instructor' => $r['instructor'],
        ], $fetch("SELECT id, class_name, day, start_time, end_time, course_code, instructor
                   FROM schedules WHERE user_id = ?
                   ORDER BY FIELD(day,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time"));

        $notes = array_map(fn ($r) => [
            'id' => (int) $r['id'], 'title' => $r['title'], 'body' => $r['body'],
            'remark' => $r['remark'] ?? '', 'createdAt' => $r['created_at'],
        ], $fetch('SELECT id, title, body, remark, created_at FROM notes WHERE user_id = ? ORDER BY created_at DESC, id DESC'));

        // viewing someone's private stuff gets logged too
        log_security_event('CONTENT_VIEWED', $me, $target['id'],
            sprintf('Viewed %d task(s), %d class(es), %d note(s)', count($tasks), count($classes), count($notes)));

        reply(['ok' => true, 'user' => ['id' => $target['id'], 'name' => $target['display_name']],
               'tasks' => $tasks, 'classes' => $classes, 'notes' => $notes]);
    }

    // moderation - delete an item (needs a reason, owner gets told)
    if ($action === 'delete_content') {
        require_permission($user, 'content.delete', $target);

        $types = [
            'task'  => ['table' => 'tasks',     'title' => 'title',      'label' => 'task',  'prefix' => 'TASK'],
            'class' => ['table' => 'schedules', 'title' => 'class_name', 'label' => 'class', 'prefix' => 'SCH'],
            'note'  => ['table' => 'notes',     'title' => 'title',      'label' => 'note',  'prefix' => 'NOTE'],
        ];
        $type = $types[$input['type'] ?? ''] ?? null;
        if (!$type) {
            reply(['ok' => false, 'message' => 'Unknown item type.'], 400);
        }
        $reason = required_reason($input);
        $itemId = (int) ($input['itemId'] ?? 0);

        // make sure it actually belongs to this user, don't just trust the id
        $stmt = mysqli_prepare($conn, "SELECT {$type['title']} AS title FROM {$type['table']} WHERE id = ? AND user_id = ?");
        mysqli_stmt_bind_param($stmt, 'ii', $itemId, $target['id']);
        mysqli_stmt_execute($stmt);
        $item = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt));
        if (!$item) {
            reply(['ok' => false, 'message' => 'That item no longer exists.'], 404);
        }

        mysqli_begin_transaction($conn);
        $stmt = mysqli_prepare($conn, "DELETE FROM {$type['table']} WHERE id = ? AND user_id = ?");
        mysqli_stmt_bind_param($stmt, 'ii', $itemId, $target['id']);
        mysqli_stmt_execute($stmt);   // history goes with it (cascade)

        // shows up in the owner's audit trail so they know
        $entityId = "{$type['prefix']}-$itemId";
        $ownerNote = "Removed by an administrator: \"{$item['title']}\" (reason: $reason)";
        $stmt = mysqli_prepare($conn,
            'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)');
        $auditAction = 'MODERATION_DELETE';
        mysqli_stmt_bind_param($stmt, 'issss', $target['id'], $auditAction, $type['label'], $entityId, $ownerNote);
        mysqli_stmt_execute($stmt);

        // and log which admin did it
        log_security_event('CONTENT_DELETED', $me, $target['id'],
            "Removed {$type['label']} $entityId \"{$item['title']}\" (reason: $reason)");
        mysqli_commit($conn);

        reply(['ok' => true, 'message' => ucfirst($type['label']) . " \"{$item['title']}\" was removed. "
            . "{$target['display_name']} will see a note in their audit trail."]);
    }

    // approve pending account
    if ($action === 'approve') {
        require_permission($user, 'user.approve', $target);
        if ($target['status'] !== 'pending') {
            reply(['ok' => false, 'message' => 'This account is not waiting for approval.'], 409);
        }
        $stmt = mysqli_prepare($conn, "UPDATE users SET status = 'active', status_reason = NULL WHERE id = ?");
        mysqli_stmt_bind_param($stmt, 'i', $target['id']);
        mysqli_stmt_execute($stmt);
        log_security_event('USER_APPROVED', $me, $target['id'], role_label($target['role']) . " account approved");
        reply(['ok' => true, 'message' => "{$target['display_name']} can now sign in."]);
    }

    // suspend / ban / reactivate
    if ($action === 'set_status') {
        $map = ['suspended' => 'user.suspend', 'banned' => 'user.ban', 'active' => 'user.reactivate'];
        $newStatus = (string) ($input['status'] ?? '');
        if (!isset($map[$newStatus])) {
            reply(['ok' => false, 'message' => 'Unknown status.'], 400);
        }
        require_permission($user, $map[$newStatus], $target);

        if ($newStatus === $target['status']) {
            reply(['ok' => false, 'message' => 'The account already has that status.'], 409);
        }
        if ($newStatus === 'active' && !in_array($target['status'], ['suspended', 'banned'], true)) {
            reply(['ok' => false, 'message' => 'Only suspended or banned accounts can be reactivated.'], 409);
        }
        if ($guard = last_super_admin_guard($conn, $target, null, $newStatus)) {
            reply(['ok' => false, 'message' => $guard], 409);
        }

        $reason = $newStatus === 'active' ? null : required_reason($input);
        $stmt = mysqli_prepare($conn, 'UPDATE users SET status = ?, status_reason = ? WHERE id = ?');
        mysqli_stmt_bind_param($stmt, 'ssi', $newStatus, $reason, $target['id']);
        mysqli_stmt_execute($stmt);

        $verb = ['suspended' => 'suspended', 'banned' => 'banned', 'active' => 'reactivated'][$newStatus];
        log_security_event('STATUS_CHANGE', $me, $target['id'],
            "{$target['status']} -> $newStatus" . ($reason ? " (reason: $reason)" : ''));
        reply(['ok' => true, 'message' => "{$target['display_name']} was $verb."
            . ($newStatus !== 'active' ? ' They are signed out immediately.' : '')]);
    }

    // reset password (temp one, they change it on next login)
    if ($action === 'reset_password') {
        require_permission($user, 'user.reset_password', $target);
        $reason = required_reason($input);

        $temp = temporary_password();
        $hash = password_hash($temp, PASSWORD_DEFAULT);
        $stmt = mysqli_prepare($conn,
            'UPDATE users SET password_hash = ?, must_change_password = 1, session_version = session_version + 1 WHERE id = ?');
        mysqli_stmt_bind_param($stmt, 'si', $hash, $target['id']);
        mysqli_stmt_execute($stmt);

        // don't log the actual password obv
        log_security_event('PASSWORD_RESET', $me, $target['id'], "Temporary password issued (reason: $reason)");
        reply([
            'ok'                => true,
            'temporaryPassword' => $temp,
            'message'           => "Give this temporary password to {$target['display_name']}. "
                                 . 'It is shown only once. They must choose a new one when they sign in.',
        ]);
    }

    // edit name/email
    if ($action === 'edit_user') {
        require_permission($user, 'user.edit', $target);
        $name  = clean_name($input['name'] ?? '');
        $email = clean_email($conn, $input['email'] ?? '', $target['id']);

        $stmt = mysqli_prepare($conn, 'UPDATE users SET display_name = ?, username = ? WHERE id = ?');
        mysqli_stmt_bind_param($stmt, 'ssi', $name, $email, $target['id']);
        mysqli_stmt_execute($stmt);

        $changes = [];
        if ($name !== $target['display_name']) $changes[] = "name \"{$target['display_name']}\" -> \"$name\"";
        if ($email !== $target['username'])    $changes[] = "email {$target['username']} -> $email";
        if ($changes) {
            log_security_event('USER_EDITED', $me, $target['id'], implode('; ', $changes));
        }
        reply(['ok' => true, 'message' => $changes ? 'Details saved.' : 'Nothing changed.']);
    }

    // change role
    if ($action === 'change_role') {
        $newRole = (string) ($input['role'] ?? '');
        require_permission($user, 'user.change_role', $target, ['new_role' => $newRole]);
        if ($guard = last_super_admin_guard($conn, $target, $newRole)) {
            reply(['ok' => false, 'message' => $guard], 409);
        }
        $note = mb_substr(trim((string) ($input['reason'] ?? '')), 0, 200);

        $stmt = mysqli_prepare($conn, 'UPDATE users SET role = ? WHERE id = ?');
        mysqli_stmt_bind_param($stmt, 'si', $newRole, $target['id']);
        mysqli_stmt_execute($stmt);

        log_security_event('ROLE_CHANGE', $me, $target['id'],
            role_label($target['role']) . ' -> ' . role_label($newRole) . ($note !== '' ? " (reason: $note)" : ''));
        reply(['ok' => true, 'message' => "{$target['display_name']} is now " . role_label($newRole) . '.']);
    }

    // create account
    if ($action === 'create_user') {
        require_permission($user, 'users.create');
        $name  = clean_name($input['name'] ?? '');
        $email = clean_email($conn, $input['email'] ?? '');
        $role  = (string) ($input['role'] ?? '');
        if (!in_array($role, ASSIGNABLE_ROLES, true)) {
            reply(['ok' => false, 'message' => 'That role cannot be assigned here.', 'field' => 'role'], 422);
        }

        $temp = temporary_password();
        $hash = password_hash($temp, PASSWORD_DEFAULT);
        $stmt = mysqli_prepare($conn,
            "INSERT INTO users (username, display_name, role, status, password_hash, must_change_password)
             VALUES (?, ?, ?, 'active', ?, 1)");
        mysqli_stmt_bind_param($stmt, 'ssss', $email, $name, $role, $hash);
        mysqli_stmt_execute($stmt);
        $newId = (int) mysqli_insert_id($conn);

        log_security_event('USER_CREATED', $me, $newId, role_label($role) . " account created for $email");
        reply([
            'ok'                => true,
            'id'                => $newId,
            'temporaryPassword' => $temp,
            'message'           => "Account created. Give this temporary password to $name. It is shown only once.",
        ]);
    }

    // delete account
    if ($action === 'delete_user') {
        require_permission($user, 'user.delete', $target);
        if ($guard = last_super_admin_guard($conn, $target, null, null, true)) {
            reply(['ok' => false, 'message' => $guard], 409);
        }
        // they have to type the email so nobody nukes the wrong account
        if (strtolower(trim((string) ($input['confirmEmail'] ?? ''))) !== $target['username']) {
            reply(['ok' => false, 'message' => "Type the account's email exactly to confirm.", 'field' => 'confirmEmail'], 422);
        }
        $reason = required_reason($input);

        // their data goes too (history cascades with tasks)
        // audit + security logs stay, that's the record of what happened
        mysqli_begin_transaction($conn);
        foreach (['tasks', 'schedules', 'notes', 'user_preferences', 'user_pomodoro_preferences'] as $table) {
            $stmt = mysqli_prepare($conn, "DELETE FROM $table WHERE user_id = ?");
            mysqli_stmt_bind_param($stmt, 'i', $target['id']);
            mysqli_stmt_execute($stmt);
        }
        $stmt = mysqli_prepare($conn, 'DELETE FROM users WHERE id = ?');
        mysqli_stmt_bind_param($stmt, 'i', $target['id']);
        mysqli_stmt_execute($stmt);
        log_security_event('USER_DELETED', $me, $target['id'],
            role_label($target['role']) . " {$target['username']} deleted (reason: $reason)");
        mysqli_commit($conn);

        reply(['ok' => true, 'message' => "{$target['display_name']}'s account and data were deleted."]);
    }

    reply(['ok' => false, 'message' => 'Unknown action.'], 400);

} catch (mysqli_sql_exception $e) {
    try {
        mysqli_rollback($conn);   // undo if it died halfway
    } catch (Throwable $ignored) {
    }
    if ($e->getCode() === 1062) {
        reply(['ok' => false, 'message' => 'Another account already uses that email.', 'field' => 'email'], 409);
    }
    error_log('api/admin.php error: ' . $e->getMessage());
    reply(['ok' => false, 'message' => 'Database error. Nothing was changed.'], 500);
}
