<?php
// api/preferences.php
// Save user preferences to the database.
// Actions:  update

require __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';   // (auth.php already loads it)

header('Content-Type: application/json; charset=utf-8');

function reply($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

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

    if ($action === 'update') {
        $prefs = $input['preferences'] ?? [];

        $theme           = in_array($prefs['theme'] ?? '', ['dark','light','system'], true) ? $prefs['theme'] : 'system';
        $filterStatus    = in_array($prefs['filters']['status'] ?? '', ['ALL','To do','In progress','In review','Done','Archived'], true) ? $prefs['filters']['status'] : 'ALL';
        $filterPriority  = in_array($prefs['filters']['priority'] ?? '', ['ALL','High','Medium','Low'], true) ? $prefs['filters']['priority'] : 'ALL';
        $sortKey         = in_array($prefs['sort']['key'] ?? '', ['title','subject','dueDate','createdAt','priority','status'], true) ? $prefs['sort']['key'] : 'dueDate';
        $sortDirection   = in_array($prefs['sort']['direction'] ?? '', ['asc','desc'], true) ? $prefs['sort']['direction'] : 'asc';
        $pageSize        = in_array($prefs['pageSize'] ?? '', ['5','10','15'], true) ? (int) $prefs['pageSize'] : 5;

        $sql = 'INSERT INTO user_preferences
                  (user_id, theme, filter_status, filter_priority, sort_key, sort_direction, page_size)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  theme = VALUES(theme),
                  filter_status = VALUES(filter_status),
                  filter_priority = VALUES(filter_priority),
                  sort_key = VALUES(sort_key),
                  sort_direction = VALUES(sort_direction),
                  page_size = VALUES(page_size)';
        $stmt = mysqli_prepare($conn, $sql);
        mysqli_stmt_bind_param($stmt, 'isssssi',
            $userId, $theme, $filterStatus, $filterPriority, $sortKey, $sortDirection, $pageSize);
        mysqli_stmt_execute($stmt);

        reply(['ok' => true]);
    }

    reply(['ok' => false, 'message' => 'Unknown action.'], 400);

} catch (Exception $e) {
    error_log('api/preferences.php error: ' . $e->getMessage());
    reply(['ok' => false, 'message' => 'Database error.'], 500);
}