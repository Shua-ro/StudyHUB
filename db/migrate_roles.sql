-- StudyHub: roles + account status (Super Admin / Admin / Regular user).
-- Run this in phpMyAdmin (inside the studyhub database). SAFE TO RE-RUN.
-- Needs MariaDB (XAMPP's default) for "ADD COLUMN IF NOT EXISTS".
-- (New install? Import db/studyhub.sql instead - it already has all of this.)
--
-- What it adds:
--   users.role                 + 'super_admin'
--   users.status               active | pending | suspended | banned
--   users.status_reason        shown to the user when they are blocked
--   users.must_change_password set after an admin resets a password
--   users.session_version      bumping it signs the user out everywhere
--   security_log               logins, failed logins, role/status changes
--                              (Super Admin only; separate from audit_log)

USE studyhub;

ALTER TABLE users
  MODIFY role ENUM('student','teacher','admin','super_admin') NOT NULL DEFAULT 'student';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status ENUM('active','pending','suspended','banned')
      NOT NULL DEFAULT 'active' AFTER role,
  ADD COLUMN IF NOT EXISTS status_reason VARCHAR(255) NULL AFTER status,
  ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash,
  ADD COLUMN IF NOT EXISTS session_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER must_change_password;

CREATE TABLE IF NOT EXISTS security_log (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id       BIGINT UNSIGNED NULL,          -- who did it (NULL = not logged in)
  target_user_id BIGINT UNSIGNED NULL,          -- whose account it affected
  event          VARCHAR(40)  NOT NULL,         -- LOGIN, LOGIN_FAILED, ROLE_CHANGE, ...
  details        VARCHAR(500) NULL,
  ip             VARCHAR(45)  NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_security_time (created_at),
  KEY idx_security_target (target_user_id, created_at),
  KEY idx_security_event (event, created_at)
) ENGINE=InnoDB;

SELECT 'Roles migration done. Make your first Super Admin with:
UPDATE users SET role = ''super_admin'' WHERE username = ''you@example.com'';' AS next_step;
