-- Notes table for StudyHub
-- Run this in phpMyAdmin (inside the studyhub database)

USE studyhub;

CREATE TABLE notes (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  title             VARCHAR(150) NOT NULL,
  body              TEXT NOT NULL,
  remark            VARCHAR(255) NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notes_user (user_id)
) ENGINE=InnoDB;
