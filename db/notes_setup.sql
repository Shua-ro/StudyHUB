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

-- Sample notes for user 1 (matching the app.js sample data)
INSERT INTO notes (user_id, title, body, remark)
VALUES
  (1, 'Electrical circuits', 'For a series circuit, the same current flows through every component. Add the resistances to find the total resistance.', 'Review before the next problem set.'),
  (1, 'Data structures', 'A linked list stores items in nodes. Each node points to the next node, so inserting or removing an item does not require shifting every later item.', 'Remember to trace the pointer changes.'),
  (1, 'Web development', 'Use semantic HTML elements to describe the purpose of each part of a page, and keep form labels connected to their controls.', 'Unit 1 review');