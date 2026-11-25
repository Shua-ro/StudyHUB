-- Pomodoro preferences table for StudyHub
-- Run this in phpMyAdmin (inside the studyhub database)

USE studyhub;

CREATE TABLE user_pomodoro_preferences (
  user_id         BIGINT UNSIGNED NOT NULL,
  focus_duration  INT UNSIGNED NOT NULL DEFAULT 1500,  -- seconds (25 min default)
  short_duration  INT UNSIGNED NOT NULL DEFAULT 300,   -- seconds (5 min default)
  long_duration   INT UNSIGNED NOT NULL DEFAULT 900,   -- seconds (15 min default)
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB;

-- Default preferences for user 1
INSERT INTO user_pomodoro_preferences (user_id, focus_duration, short_duration, long_duration)
VALUES (1, 1500, 300, 900)
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;