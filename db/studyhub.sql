-- =============================================================================
-- StudyHub - complete database schema (all tables, one file)
-- =============================================================================
--
-- HOW TO USE
--   phpMyAdmin -> SQL tab (from the home page, NOT inside a database) ->
--   paste/import this file -> Go.
--
--   Safe to run on a new OR an existing database: it only creates what is
--   missing (CREATE ... IF NOT EXISTS) and never deletes data.
--   No sample data is included - every account starts empty.
--
-- AFTER IMPORTING
--   1. Sign up on signup.html (that account starts as a Student).
--   2. Make it the first Super Admin (the app cannot create Super Admins):
--        UPDATE users SET role = 'super_admin' WHERE username = 'you@example.com';
--   3. Sign out and back in. Everything else can be done from the app.
--
-- UPGRADING AN OLDER DATABASE
--   CREATE TABLE IF NOT EXISTS skips tables that already exist, so it will NOT
--   add new columns to an old table. For an older copy run the migrations:
--     db/migrate_roles.sql      (roles, account status, security_log)
--     db/migrate_settings.sql   (app_settings, announcements)
--
-- TABLES (12)
--   Accounts & security : users, login_attempts, security_log
--   App-wide settings   : app_settings, announcements
--   Study data          : tasks, task_history, schedules, notes
--   Per-user settings   : user_preferences, user_pomodoro_preferences
--   Activity            : audit_log
--
-- Every user-owned row has a user_id that matches users.id (BIGINT UNSIGNED).
-- =============================================================================

CREATE DATABASE IF NOT EXISTS studyhub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE studyhub;


-- =============================================================================
-- ACCOUNTS & SECURITY
-- =============================================================================

-- One row per account. Signup creates students (active) and teachers (pending,
-- until an Admin approves them). Roles, lowest to highest:
--   student / teacher  <  admin  <  super_admin
CREATE TABLE IF NOT EXISTS users (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username             VARCHAR(190)    NOT NULL,                   -- lowercase email, used to log in
  display_name         VARCHAR(100)    NOT NULL,
  role                 ENUM('student','teacher','admin','super_admin') NOT NULL DEFAULT 'student',
  status               ENUM('active','pending','suspended','banned') NOT NULL DEFAULT 'active',
  status_reason        VARCHAR(255)    NULL,                       -- shown to the user when blocked
  password_hash        VARCHAR(255)    NOT NULL,                   -- PHP password_hash(), never plain text
  must_change_password TINYINT(1)      NOT NULL DEFAULT 0,         -- set after an admin password reset
  session_version      INT UNSIGNED    NOT NULL DEFAULT 0,         -- bump = sign out on every device
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

-- Wrong passwords (login and profile page), for the 5-tries / 15-minute lockout.
CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  identifier   VARCHAR(190)    NOT NULL,                           -- username, or "profile:<user id>"
  ip           VARCHAR(45)     NOT NULL,
  attempted_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attempts_identifier_time (identifier, attempted_at)
) ENGINE=InnoDB;

-- Sign-ins, failed sign-ins, and every change to an account. Super Admin only.
-- Kept when an account is deleted (it is the record of what happened).
CREATE TABLE IF NOT EXISTS security_log (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id       BIGINT UNSIGNED NULL,                             -- who did it (NULL = not signed in)
  target_user_id BIGINT UNSIGNED NULL,                             -- whose account it affected
  event          VARCHAR(40)     NOT NULL,                         -- LOGIN, LOGIN_FAILED, ROLE_CHANGE, ...
  details        VARCHAR(500)    NULL,
  ip             VARCHAR(45)     NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_security_time (created_at),
  KEY idx_security_target (target_user_id, created_at),
  KEY idx_security_event (event, created_at)
) ENGINE=InnoDB;


-- =============================================================================
-- APP-WIDE SETTINGS
-- =============================================================================

-- On/off switches (Super Admin > Settings).
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key   VARCHAR(60)     NOT NULL,
  setting_value VARCHAR(255)    NOT NULL,
  updated_by    BIGINT UNSIGNED NULL,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB;

-- Defaults: sign-ups open. INSERT IGNORE keeps any value already chosen.
INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
  ('allow_signups', '1'),
  ('allow_teacher_signups', '1');

-- Messages Admins post at the top of people's dashboards.
CREATE TABLE IF NOT EXISTS announcements (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(120)    NOT NULL,
  body        TEXT            NOT NULL,
  audience    ENUM('all','student','teacher') NOT NULL DEFAULT 'all',
  importance  ENUM('info','important') NOT NULL DEFAULT 'info',
  starts_at   DATETIME        NULL,                                -- NULL = straight away
  ends_at     DATETIME        NULL,                                -- NULL = until removed
  created_by  BIGINT UNSIGNED NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_announcements_window (starts_at, ends_at)
) ENGINE=InnoDB;


-- =============================================================================
-- STUDY DATA (each row belongs to one user)
-- =============================================================================

-- Tasks and their workflow: To do -> In progress -> In review -> Done -> Archived.
CREATE TABLE IF NOT EXISTS tasks (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id                 BIGINT UNSIGNED NOT NULL,
  title                   VARCHAR(100)    NOT NULL,
  subject                 VARCHAR(80)     NOT NULL,
  description             TEXT            NULL,
  due_date                DATE            NULL,
  priority                ENUM('Low','Medium','High') NOT NULL DEFAULT 'Medium',
  status                  ENUM('To do','In progress','In review','Done','Archived') NOT NULL DEFAULT 'To do',
  estimated_minutes       INT UNSIGNED    NOT NULL DEFAULT 60,
  tags                    VARCHAR(255)    NULL,                    -- comma-separated
  reminder_date           DATE            NULL,
  classroom_assignment_id VARCHAR(64)     NULL,
  created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_user_status (user_id, status),
  KEY idx_tasks_user_due    (user_id, due_date)
) ENGINE=InnoDB;

-- Every status change of a task. Deleted together with its task.
CREATE TABLE IF NOT EXISTS task_history (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id         BIGINT UNSIGNED NOT NULL,
  previous_status ENUM('To do','In progress','In review','Done','Archived') NOT NULL,
  next_status     ENUM('To do','In progress','In review','Done','Archived') NOT NULL,
  action_label    VARCHAR(60)     NULL,                            -- e.g. "Submit for review"
  changed_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_history_task (task_id),
  CONSTRAINT fk_history_task FOREIGN KEY (task_id)
    REFERENCES tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Weekly class schedule.
CREATE TABLE IF NOT EXISTS schedules (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  day         ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
  start_time  TIME            NOT NULL,
  end_time    TIME            NOT NULL,
  class_name  VARCHAR(120)    NOT NULL,
  course_code VARCHAR(40)     NOT NULL,
  instructor  VARCHAR(100)    NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_schedules_user (user_id),
  KEY idx_schedules_user_day (user_id, day)
) ENGINE=InnoDB;

-- Study notes.
CREATE TABLE IF NOT EXISTS notes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  title       VARCHAR(150)    NOT NULL,
  body        TEXT            NOT NULL,
  remark      VARCHAR(255)    NULL,                                -- optional reminder
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notes_user (user_id)
) ENGINE=InnoDB;


-- =============================================================================
-- PER-USER SETTINGS (one row per user; missing row = defaults)
-- =============================================================================

-- Theme and the Tasks page filters/sort.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id         BIGINT UNSIGNED NOT NULL,
  theme           ENUM('dark','light','system') NOT NULL DEFAULT 'system',
  filter_status   ENUM('ALL','To do','In progress','In review','Done','Archived') NOT NULL DEFAULT 'ALL',
  filter_priority ENUM('ALL','High','Medium','Low') NOT NULL DEFAULT 'ALL',
  sort_key        ENUM('title','subject','dueDate','createdAt','priority','status') NOT NULL DEFAULT 'dueDate',
  sort_direction  ENUM('asc','desc') NOT NULL DEFAULT 'asc',
  page_size       ENUM('5','10','15') NOT NULL DEFAULT '10',
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB;

-- Focus timer lengths, in seconds.
CREATE TABLE IF NOT EXISTS user_pomodoro_preferences (
  user_id        BIGINT UNSIGNED NOT NULL,
  focus_duration INT UNSIGNED    NOT NULL DEFAULT 1500,            -- 25 min
  short_duration INT UNSIGNED    NOT NULL DEFAULT 300,             -- 5 min
  long_duration  INT UNSIGNED    NOT NULL DEFAULT 900,             -- 15 min
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB;


-- =============================================================================
-- ACTIVITY
-- =============================================================================

-- What each user did with their tasks, classes and notes (their own audit trail
-- in Settings, and the Activity tab in Admin > Logs). Admin removals show up
-- here for the owner as MODERATION_DELETE.
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  action      VARCHAR(50)     NOT NULL,                            -- CREATE, UPDATE, DELETE, STATUS_CHANGE, ARCHIVE, IMPORT, RESET, MODERATION_DELETE
  entity_type VARCHAR(30)     NOT NULL,                            -- task, schedule, note, app
  entity_id   VARCHAR(64)     NOT NULL,                            -- TASK-1, SCH-5, NOTE-3, application
  details     TEXT            NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_user (user_id, created_at),
  KEY idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB;


SELECT 'StudyHub schema ready (12 tables). Next: sign up, then promote yourself to super_admin.' AS result;
