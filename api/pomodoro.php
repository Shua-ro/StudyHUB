<?php
// api/pomodoro.php
// Save/load user Pomodoro preferences to/from the database.
// Actions: get, update

require __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/db.php';   // (auth.php already loads it)

header('Content-Type: application/json; charset=utf-8');

function reply($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

if (!in_array($_SERVER['REQUEST_METHOD'], ['POST', 'GET'], true)) {
    reply(['ok' => false, 'message' => 'Use POST or GET.'], 405);
}

$user = api_user();   // 401 if signed out, 403 if a password change is required
$userId = (int) $user['id'];

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET' || ($_SERVER['REQUEST_METHOD'] === 'POST' && ($input['action'] ?? '') === 'get')) {
        // GET preferences
        $sql = 'SELECT focus_duration, short_duration, long_duration
                FROM user_pomodoro_preferences
                WHERE user_id = ?';
        $stmt = mysqli_prepare($conn, $sql);
        mysqli_stmt_bind_param($stmt, 'i', $userId);
        mysqli_stmt_execute($stmt);
        $result = mysqli_stmt_get_result($stmt);
        $row = mysqli_fetch_assoc($result);

        if ($row) {
            reply([
                'ok' => true,
                'preferences' => [
                    'focusDuration' => (int) $row['focus_duration'],
                    'shortDuration' => (int) $row['short_duration'],
                    'longDuration'  => (int) $row['long_duration'],
                ]
            ]);
        } else {
            // Defaults
            reply([
                'ok' => true,
                'preferences' => [
                    'focusDuration' => 1500,
                    'shortDuration' => 300,
                    'longDuration'  => 900,
                ]
            ]);
        }
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            reply(['ok' => false, 'message' => 'Bad data.'], 400);
        }

        $action = $input['action'] ?? '';

        if ($action === 'update') {
            $prefs = $input['preferences'] ?? [];

            // Validate durations (1-180 minutes = 60-10800 seconds)
            $focusDuration  = isset($prefs['focusDuration'])  ? max(60, min(10800, (int) $prefs['focusDuration']))  : 1500;
            $shortDuration  = isset($prefs['shortDuration'])  ? max(60, min(10800, (int) $prefs['shortDuration']))  : 300;
            $longDuration   = isset($prefs['longDuration'])   ? max(60, min(10800, (int) $prefs['longDuration']))   : 900;

            $sql = 'INSERT INTO user_pomodoro_preferences
                      (user_id, focus_duration, short_duration, long_duration)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                      focus_duration  = VALUES(focus_duration),
                      short_duration  = VALUES(short_duration),
                      long_duration   = VALUES(long_duration)';
            $stmt = mysqli_prepare($conn, $sql);
            mysqli_stmt_bind_param($stmt, 'iiii', $userId, $focusDuration, $shortDuration, $longDuration);
            mysqli_stmt_execute($stmt);

            reply(['ok' => true]);
        }

        reply(['ok' => false, 'message' => 'Unknown action.'], 400);
    }

} catch (Exception $e) {
    error_log('api/pomodoro.php error: ' . $e->getMessage());
    reply(['ok' => false, 'message' => 'Database error.'], 500);
}