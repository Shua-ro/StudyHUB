<?php
// mysqli connection. require this and use $conn

$config = require __DIR__ . '/config.php';

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
    die('Cannot connect to the database. Is MySQL running? Check includes/config.php.');
}
