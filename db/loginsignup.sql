-- StudyHub: database for login and signup only.
-- Run this in the phpMyAdmin SQL tab (from the home page, not inside a database).
-- Safe to re-run: it never deletes data.
--
-- IMPORTANT: db/setup.sql starts with DROP DATABASE, which erases everything.
-- Run setup.sql FIRST, then the other *_setup.sql files, then this file LAST.

CREATE DATABASE IF NOT EXISTS studyhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE studyhub;

-- One row per account (signup creates a row, login reads it).
-- id is BIGINT UNSIGNED AUTO_INCREMENT so it matches user_id in tasks, notes,
-- schedules, audit_log and user_preferences (index.php also casts it to int).
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(190)    NOT NULL,                          -- lowercase email
  display_name  VARCHAR(100)    NOT NULL,
  role          ENUM('student','teacher','admin') NOT NULL DEFAULT 'student',
  password_hash VARCHAR(255)    NOT NULL,                          -- from PHP password_hash(), never plain text
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)                          -- blocks duplicate signups
) ENGINE=InnoDB;

-- Lets login block repeated wrong passwords (5 tries, then a short lockout).
CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  identifier   VARCHAR(190)    NOT NULL,
  ip           VARCHAR(45)     NOT NULL,
  attempted_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attempts_identifier_time (identifier, attempted_at)
) ENGINE=InnoDB;

-- If you imported the OLD version of this file, the users table has a UUID id.
-- Uncomment these two lines once to throw the old tables away, then re-run the file.
-- DROP TABLE IF EXISTS login_attempts;
-- DROP TABLE IF EXISTS users;
