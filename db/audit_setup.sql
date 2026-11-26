-- Audit log table for StudyHub
-- Run this in phpMyAdmin (inside the studyhub database)

USE studyhub;

CREATE TABLE audit_log (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         BIGINT UNSIGNED NOT NULL,
  action          VARCHAR(50)     NOT NULL,     -- CREATE, UPDATE, DELETE, STATUS_CHANGE, ARCHIVE
  entity_type     VARCHAR(30)     NOT NULL,     -- task, schedule, note
  entity_id       VARCHAR(64)     NOT NULL,     -- TASK-1, SCH-5, NOTE-3
  details         TEXT            NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_user (user_id, created_at),
  KEY idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB;