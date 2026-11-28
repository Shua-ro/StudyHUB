<?php
// full db dump as .sql, super admin only.
// it has everything incl. password hashes, so every download gets logged.
// restore with phpMyAdmin -> Import.
// POST only so a link preview/prefetch can't trigger it

require __DIR__ . '/../includes/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    api_refuse(405, 'Use the Download button on the Settings page.', 'method');
}

$user = api_user();
$reason = permission_denied($user, 'backup.full');
if ($reason !== null) {
    log_security_event('PERMISSION_DENIED', $user['id'], null, "backup.full: $reason");
    api_refuse(403, $reason, 'forbidden');
}

$database = mysqli_fetch_row(mysqli_query($conn, 'SELECT DATABASE()'))[0];
$tables = array_column(
    mysqli_fetch_all(mysqli_query($conn, "SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'"), MYSQLI_NUM),
    0
);

log_security_event('BACKUP_DOWNLOADED', $user['id'], null,
    'Full database backup (' . count($tables) . ' tables)');

$filename = 'studyhub-backup-' . date('Ymd-His') . '.sql';
header('Content-Type: application/sql; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$quoteValue = function ($value) use ($conn) {
    return $value === null ? 'NULL' : "'" . mysqli_real_escape_string($conn, (string) $value) . "'";
};

echo "-- StudyHub full database backup\n";
echo "-- Database: $database\n";
echo '-- Created:  ' . date('Y-m-d H:i:s') . " by {$user['username']}\n";
echo "-- Contains password hashes and logs: keep this file private.\n";
echo "-- Restore: phpMyAdmin -> select the database -> Import this file.\n\n";
echo "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n";

foreach ($tables as $table) {
    $safe = str_replace('`', '``', $table);
    $create = mysqli_fetch_row(mysqli_query($conn, "SHOW CREATE TABLE `$safe`"))[1];

    echo "-- ----------------------------------------\n-- Table `$safe`\n-- ----------------------------------------\n";
    echo "DROP TABLE IF EXISTS `$safe`;\n$create;\n\n";

    // 100 rows per INSERT
    $result = mysqli_query($conn, "SELECT * FROM `$safe`", MYSQLI_USE_RESULT);
    $columns = null;
    $batch = [];
    while ($row = mysqli_fetch_assoc($result)) {
        if ($columns === null) {
            $columns = '(`' . implode('`, `', array_map(fn ($c) => str_replace('`', '``', $c), array_keys($row))) . '`)';
        }
        $batch[] = '(' . implode(', ', array_map($quoteValue, array_values($row))) . ')';
        if (count($batch) === 100) {
            echo "INSERT INTO `$safe` $columns VALUES\n  " . implode(",\n  ", $batch) . ";\n";
            $batch = [];
        }
    }
    if ($batch) {
        echo "INSERT INTO `$safe` $columns VALUES\n  " . implode(",\n  ", $batch) . ";\n";
    }
    mysqli_free_result($result);
    echo "\n";
}

echo "SET FOREIGN_KEY_CHECKS = 1;\n-- End of backup\n";
