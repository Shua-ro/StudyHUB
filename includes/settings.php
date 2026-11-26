<?php
// includes/settings.php
// App-wide switches (app_settings) and dashboard announcements.
// Reading is safe for everyone; CHANGING goes through api/admin.php, which
// checks permissions first.

require_once __DIR__ . '/db.php';

// Every known switch with its default. Anything not listed here is ignored.
const SETTING_DEFAULTS = [
    'allow_signups'         => '1',
    'allow_teacher_signups' => '1',
];

/** All switches as key => value, falling back to defaults (also if the table is missing). */
function get_settings(mysqli $conn): array
{
    $settings = SETTING_DEFAULTS;
    try {
        $result = mysqli_query($conn, 'SELECT setting_key, setting_value FROM app_settings');
        while ($row = mysqli_fetch_assoc($result)) {
            if (array_key_exists($row['setting_key'], $settings)) {
                $settings[$row['setting_key']] = $row['setting_value'];
            }
        }
    } catch (mysqli_sql_exception $e) {
        // Table not created yet (db/migrate_settings.sql not run): use the defaults.
    }
    return $settings;
}

function setting_on(mysqli $conn, string $key): bool
{
    return (get_settings($conn)[$key] ?? '0') === '1';
}

/** Announcements currently live for a role (admins see "all" ones). */
function get_active_announcements(mysqli $conn, string $role): array
{
    $audiences = in_array($role, ['student', 'teacher'], true) ? ['all', $role] : ['all'];
    try {
        $stmt = mysqli_prepare($conn,
            "SELECT id, title, body, audience, importance, starts_at, ends_at, updated_at
             FROM announcements
             WHERE audience IN (?, ?)
               AND (starts_at IS NULL OR starts_at <= NOW())
               AND (ends_at IS NULL OR ends_at > NOW())
             ORDER BY importance = 'important' DESC, COALESCE(starts_at, created_at) DESC
             LIMIT 5");
        mysqli_stmt_bind_param($stmt, 'ss', $audiences[0], $audiences[count($audiences) - 1]);
        mysqli_stmt_execute($stmt);
        $rows = mysqli_fetch_all(mysqli_stmt_get_result($stmt), MYSQLI_ASSOC);
    } catch (mysqli_sql_exception $e) {
        return [];   // table not created yet
    }
    return array_map(fn ($r) => [
        'id'         => (int) $r['id'],
        'title'      => $r['title'],
        'body'       => $r['body'],
        'importance' => $r['importance'],
        // Changes when the announcement is edited, so an edited one shows again.
        'version'    => $r['updated_at'],
    ], $rows);
}
