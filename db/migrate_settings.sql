-- app settings + announcements. run in phpMyAdmin inside studyhub, safe to re-run.
-- fresh install? import studyhub.sql instead

USE studyhub;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key   VARCHAR(60)  NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  updated_by    BIGINT UNSIGNED NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB;

-- defaults: everything open. INSERT IGNORE keeps whatever was already set
INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
  ('allow_signups', '1'),
  ('allow_teacher_signups', '1');

CREATE TABLE IF NOT EXISTS announcements (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(120) NOT NULL,
  body        TEXT NOT NULL,
  audience    ENUM('all','student','teacher') NOT NULL DEFAULT 'all',
  importance  ENUM('info','important') NOT NULL DEFAULT 'info',
  starts_at   DATETIME NULL,              -- NULL = straight away
  ends_at     DATETIME NULL,              -- NULL = until removed
  created_by  BIGINT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_announcements_window (starts_at, ends_at)
) ENGINE=InnoDB;

SELECT 'Settings migration done.' AS result;
