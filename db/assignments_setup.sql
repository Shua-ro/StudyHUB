-- StudyHub: Assignments (teacher feature).
-- Run this in phpMyAdmin AFTER db/setup.sql and db/loginsignup.sql
-- (it needs the `users` table to exist for the sample rows).

USE studyhub;

CREATE TABLE IF NOT EXISTS assignments (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  teacher_id  BIGINT UNSIGNED NOT NULL,          -- users.id of the teacher who made it
  title       VARCHAR(120)    NOT NULL,
  subject     VARCHAR(80)     NOT NULL,
  description TEXT            NULL,
  due_date    DATE            NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_assignments_teacher (teacher_id),
  KEY idx_assignments_due (due_date)
) ENGINE=InnoDB;

-- Sample rows for the demo. They go to the first teacher account found
-- (nothing is added if no teacher has signed up yet).
-- Run this part ONCE; running it again adds duplicates.
INSERT INTO assignments (teacher_id, title, subject, description, due_date)
SELECT t.id, v.title, v.subject, v.description, v.due_date
FROM (SELECT id FROM users WHERE role = 'teacher' ORDER BY id LIMIT 1) t
CROSS JOIN (
  SELECT 'Lab report: Ohm''s law' AS title, 'Physics' AS subject,
         'Measure voltage and current for three resistors and write up your results.' AS description,
         '2026-12-03' AS due_date
  UNION ALL
  SELECT 'Linked list exercises', 'Data Structures',
         'Implement insert and delete for a singly linked list.', '2026-12-05'
  UNION ALL
  SELECT 'Reading response: Chapter 5', 'Literature',
         'Write one page on the main theme of chapter 5.', '2026-12-08'
) v;