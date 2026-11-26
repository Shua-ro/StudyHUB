-- StudyHub: full setup in one run.
-- WARNING: the first line DELETES the whole "studyhub" database.
-- Run it in the phpMyAdmin SQL tab, from the home page (not inside a database).

DROP DATABASE IF EXISTS studyhub;

CREATE DATABASE studyhub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE studyhub;

CREATE TABLE tasks (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id                 BIGINT UNSIGNED NOT NULL,
  title                   VARCHAR(100)    NOT NULL,
  subject                 VARCHAR(80)     NOT NULL,
  description             TEXT            NULL,
  due_date                DATE            NULL,
  priority                ENUM('Low','Medium','High') NOT NULL DEFAULT 'Medium',
  status                  ENUM('To do','In progress','In review','Done','Archived') NOT NULL DEFAULT 'To do',
  estimated_minutes       INT UNSIGNED    NOT NULL DEFAULT 60,
  tags                    VARCHAR(255)    NULL,
  reminder_date           DATE            NULL,
  classroom_assignment_id VARCHAR(64)     NULL,
  created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_user_status (user_id, status),
  KEY idx_tasks_user_due    (user_id, due_date)
) ENGINE=InnoDB;

CREATE TABLE task_history (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id         BIGINT UNSIGNED NOT NULL,
  previous_status ENUM('To do','In progress','In review','Done','Archived') NOT NULL,
  next_status     ENUM('To do','In progress','In review','Done','Archived') NOT NULL,
  action_label    VARCHAR(60)     NULL,
  changed_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_history_task (task_id),
  CONSTRAINT fk_history_task FOREIGN KEY (task_id)
    REFERENCES tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB;
