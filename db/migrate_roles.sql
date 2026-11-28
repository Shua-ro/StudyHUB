-- roles + account status. run in phpMyAdmin inside the studyhub db, safe to re-run.
-- needs MariaDB for ADD COLUMN IF NOT EXISTS (xampp has it).
-- fresh install? just import studyhub.sql instead.
-- adds users.role (super_admin), status, status_reason, must_change_password,
-- session_version, and the security_log table

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
