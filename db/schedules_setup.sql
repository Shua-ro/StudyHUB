-- Schedules table for StudyHub
-- Run this in phpMyAdmin (inside the studyhub database)

USE studyhub;

CREATE TABLE schedules (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  day               ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  class_name        VARCHAR(120) NOT NULL,
  course_code       VARCHAR(40) NOT NULL,
  instructor        VARCHAR(100) NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_schedules_user (user_id),
  KEY idx_schedules_user_day (user_id, day)
) ENGINE=InnoDB;
