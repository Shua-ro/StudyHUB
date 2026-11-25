-- StudyHub: database for login and signup only.
-- Import in phpMyAdmin (Import tab) or run: mysql -u root -p < schema.sql
-- Safe to re-run: every statement uses IF NOT EXISTS.

CREATE DATABASE IF NOT EXISTS studyhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE studyhub;

-- One row per account (signup creates a row, login reads it).
CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)     NOT NULL PRIMARY KEY,                 -- UUID
  username      VARCHAR(190) NOT NULL,                             -- lowercase email
  display_name  VARCHAR(100) NOT NULL,
  role          ENUM('student','teacher','admin') NOT NULL DEFAULT 'student',
  password_hash VARCHAR(255) NOT NULL,                             -- bcrypt from PHP password_hash(), never plain text
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username)                          -- blocks duplicate signups
) ENGINE=InnoDB;

-- Optional: lets login block repeated wrong passwords (5 tries, then 15 minutes).
-- Skip this table if you don't want that feature.
CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  identifier   VARCHAR(190)    NOT NULL,
  ip           VARCHAR(45)     NOT NULL,
  attempted_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_attempts_identifier_time (identifier, attempted_at)
) ENGINE=InnoDB;
