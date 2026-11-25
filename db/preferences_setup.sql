-- User preferences table for StudyHub
-- Run this in phpMyAdmin (inside the studyhub database)

USE studyhub;

CREATE TABLE user_preferences (
  user_id         BIGINT UNSIGNED NOT NULL,
  theme           ENUM('dark','light','system') NOT NULL DEFAULT 'system',
  filter_status   ENUM('ALL','To do','In progress','In review','Done','Archived') NOT NULL DEFAULT 'ALL',
  filter_priority ENUM('ALL','High','Medium','Low') NOT NULL DEFAULT 'ALL',
  sort_key        ENUM('title','subject','dueDate','createdAt','priority','status') NOT NULL DEFAULT 'dueDate',
  sort_direction  ENUM('asc','desc') NOT NULL DEFAULT 'asc',
  page_size       ENUM('5','10','15') NOT NULL DEFAULT '10',
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB;

-- Default preferences for user 1
INSERT INTO user_preferences (user_id, theme, filter_status, filter_priority, sort_key, sort_direction, page_size)
VALUES (1, 'system', 'ALL', 'ALL', 'dueDate', 'asc', '10')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;