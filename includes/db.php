<?php
// This file connects PHP to MySQL with mysqli.
//
// How to use it in any other PHP file:
//   require_once __DIR__ . '/db.php';
// After that, the variable $conn is ready. Use it to run queries.

// Step 1: Read the settings from config.php
$config = require __DIR__ . '/config.php';

// Step 2: Try to connect
try {
    $conn = mysqli_connect(
        $config['host'],
        $config['user'],
        $config['pass'],
        $config['name'],
        $config['port']
    );
    mysqli_set_charset($conn, $config['charset']);
} catch (Exception $e) {
    // The connection failed. Stop and show a short message.
    die('Cannot connect to the database. Is MySQL running? Check includes/config.php.');
}
