-- StudyHub db, everything in one file
--
-- phpMyAdmin -> SQL tab (from the home page, not inside a db) -> paste/import -> Go
-- safe to re-run, it only creates what's missing and won't duplicate the sample data
--
-- sample accounts, password for all of them: Password123!
--   superadmin@studyhub.test  super admin
--   admin@studyhub.test       admin
--   teacher@studyhub.test     teacher
--   student@studyhub.test     student
--   student2@studyhub.test    student
--   newteacher@studyhub.test  teacher (pending)
--   suspended@studyhub.test   student (suspended)
-- change/delete these before using it for real
--
-- older db? CREATE TABLE IF NOT EXISTS won't add new columns, so run
-- migrate_roles.sql and migrate_settings.sql first, then this

CREATE DATABASE IF NOT EXISTS studyhub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE studyhub;


-- accounts & security

-- one row per account. signup makes students (active) and teachers (pending till approved).
-- roles low to high: student/teacher < admin < super_admin
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

-- wrong passwords, for the 5 tries / 15 min lockout
CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  identifier   VARCHAR(190)    NOT NULL,                           -- username, or "profile:<user id>"
  ip           VARCHAR(45)     NOT NULL,
  attempted_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attempts_identifier_time (identifier, attempted_at)
) ENGINE=InnoDB;

-- logins, failed logins, account changes. super admin only.
-- kept even when the account gets deleted
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


-- app-wide settings

-- on/off switches (super admin > settings)
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key   VARCHAR(60)     NOT NULL,
  setting_value VARCHAR(255)    NOT NULL,
  updated_by    BIGINT UNSIGNED NULL,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB;

-- defaults: signups open. INSERT IGNORE keeps what's already set
INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
  ('allow_signups', '1'),
  ('allow_teacher_signups', '1');

-- admin announcements on dashboards
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


-- study data (each row belongs to a user)

-- workflow: To do -> In progress -> In review -> Done -> Archived
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

-- every status change, deleted with its task
CREATE TABLE IF NOT EXISTS task_history (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id         BIGINT UNSIGNED NOT NULL,
  previous_status ENUM('To do','In progress','In review','Done','Archived') NOT NULL,
  next_status     ENUM('To do','In progress','In review','Done','Archived') NOT NULL,
  action_label    VARCHAR(60)     NULL,                            -- like "Submit for review"
  changed_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_history_task (task_id),
  CONSTRAINT fk_history_task FOREIGN KEY (task_id)
    REFERENCES tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- weekly class schedule
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

-- notes
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


-- per-user settings (no row = defaults)

-- theme + tasks page filters/sort
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id         BIGINT UNSIGNED NOT NULL,
  theme           ENUM('dark','light','system') NOT NULL DEFAULT 'system',
  filter_status   ENUM('ALL','To do','In progress','In review','Done','Archived') NOT NULL DEFAULT 'ALL',
  filter_priority ENUM('ALL','High','Medium','Low') NOT NULL DEFAULT 'ALL',
  sort_key        ENUM('title','subject','dueDate','createdAt','priority','status') NOT NULL DEFAULT 'dueDate',
  sort_direction  ENUM('asc','desc') NOT NULL DEFAULT 'asc',
  page_size       ENUM('5','10','15') NOT NULL DEFAULT '5',
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB;

-- pomodoro lengths in seconds
CREATE TABLE IF NOT EXISTS user_pomodoro_preferences (
  user_id        BIGINT UNSIGNED NOT NULL,
  focus_duration INT UNSIGNED    NOT NULL DEFAULT 1500,            -- 25 min
  short_duration INT UNSIGNED    NOT NULL DEFAULT 300,             -- 5 min
  long_duration  INT UNSIGNED    NOT NULL DEFAULT 900,             -- 15 min
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB;


-- activity

-- what each user did (their audit trail in settings + admin > logs > activity).
-- admin removals show up for the owner as MODERATION_DELETE
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


-- classroom (teachers run classes, students join w/ the code)

-- a class. teacher account gets deleted = their classes go too
CREATE TABLE IF NOT EXISTS classrooms (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  teacher_id  BIGINT UNSIGNED NOT NULL,
  class_code  VARCHAR(20)     NOT NULL,                            -- like CLS-4F2A9C, students join with it
  title       VARCHAR(150)    NOT NULL,
  subject     VARCHAR(100)    NOT NULL DEFAULT 'General',
  section     VARCHAR(60)     NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_classrooms_code (class_code),
  KEY idx_classrooms_teacher (teacher_id),
  CONSTRAINT fk_classrooms_teacher FOREIGN KEY (teacher_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- who's in which class
CREATE TABLE IF NOT EXISTS classroom_members (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  classroom_id  BIGINT UNSIGNED NOT NULL,
  student_id    BIGINT UNSIGNED NOT NULL,
  joined_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_classroom_student (classroom_id, student_id),
  KEY idx_member_student (student_id),
  CONSTRAINT fk_member_classroom FOREIGN KEY (classroom_id)
    REFERENCES classrooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_member_student FOREIGN KEY (student_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- teacher posts (announcements, materials)
CREATE TABLE IF NOT EXISTS classroom_posts (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  classroom_id  BIGINT UNSIGNED NOT NULL,
  author_id     BIGINT UNSIGNED NULL,                              -- NULL if the author's account was deleted
  title         VARCHAR(150)    NOT NULL,
  content       TEXT            NOT NULL,
  resource_link VARCHAR(255)    NULL,                              -- optional http(s) link
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_posts_classroom (classroom_id, created_at),
  CONSTRAINT fk_posts_classroom FOREIGN KEY (classroom_id)
    REFERENCES classrooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_posts_author FOREIGN KEY (author_id)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- assignments
CREATE TABLE IF NOT EXISTS classroom_tasks (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  classroom_id  BIGINT UNSIGNED NOT NULL,
  teacher_id    BIGINT UNSIGNED NOT NULL,
  title         VARCHAR(150)    NOT NULL,
  description   TEXT            NOT NULL,
  due_date      DATE            DEFAULT NULL,
  max_score     DECIMAL(6,2)    NOT NULL DEFAULT 100.00,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ctasks_classroom (classroom_id),
  KEY idx_ctasks_teacher (teacher_id),
  CONSTRAINT fk_ctasks_classroom FOREIGN KEY (classroom_id)
    REFERENCES classrooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_ctasks_teacher FOREIGN KEY (teacher_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- student submissions + grades. graded = locked
CREATE TABLE IF NOT EXISTS classroom_submissions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id         BIGINT UNSIGNED NOT NULL,
  student_id      BIGINT UNSIGNED NOT NULL,
  submission_text TEXT            NOT NULL,
  status          ENUM('submitted', 'graded') NOT NULL DEFAULT 'submitted',
  score           DECIMAL(6,2)    DEFAULT NULL,
  feedback        TEXT            DEFAULT NULL,
  submitted_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  graded_at       DATETIME        DEFAULT NULL,
  graded_by       BIGINT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_submission_task_student (task_id, student_id),
  KEY idx_sub_student (student_id),
  KEY idx_sub_status (status),
  CONSTRAINT fk_sub_task FOREIGN KEY (task_id)
    REFERENCES classroom_tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_student FOREIGN KEY (student_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_grader FOREIGN KEY (graded_by)
    REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB;


-- sample data
-- matched by username / class code so re-running won't duplicate anything or touch
-- accounts you made yourself. dates are relative to today so they always look current

-- accounts (password: Password123!)
INSERT IGNORE INTO users (username, display_name, role, status, status_reason, password_hash) VALUES
  ('superadmin@studyhub.test', 'Alex Santos',   'super_admin', 'active',    NULL, '$2y$12$T1FPESKmTW1SwKIGIRhKQum1u1.0tuNW8fwt.U6.8iQWo0J5.PW3G'),
  ('admin@studyhub.test',      'Bea Cruz',      'admin',       'active',    NULL, '$2y$12$T1FPESKmTW1SwKIGIRhKQum1u1.0tuNW8fwt.U6.8iQWo0J5.PW3G'),
  ('teacher@studyhub.test',    'Carlo Mendoza', 'teacher',     'active',    NULL, '$2y$12$T1FPESKmTW1SwKIGIRhKQum1u1.0tuNW8fwt.U6.8iQWo0J5.PW3G'),
  ('student@studyhub.test',    'Dana Lim',      'student',     'active',    NULL, '$2y$12$T1FPESKmTW1SwKIGIRhKQum1u1.0tuNW8fwt.U6.8iQWo0J5.PW3G'),
  ('student2@studyhub.test',   'Eli Navarro',   'student',     'active',    NULL, '$2y$12$T1FPESKmTW1SwKIGIRhKQum1u1.0tuNW8fwt.U6.8iQWo0J5.PW3G'),
  ('newteacher@studyhub.test', 'Faye Ramos',    'teacher',     'pending',   NULL, '$2y$12$T1FPESKmTW1SwKIGIRhKQum1u1.0tuNW8fwt.U6.8iQWo0J5.PW3G'),
  ('suspended@studyhub.test',  'Gio Torres',    'student',     'suspended', 'Repeated spam in class posts.', '$2y$12$T1FPESKmTW1SwKIGIRhKQum1u1.0tuNW8fwt.U6.8iQWo0J5.PW3G');

-- personal tasks
INSERT INTO tasks (user_id, title, subject, description, due_date, priority, status, estimated_minutes, tags, reminder_date)
SELECT u.id, s.title, s.subject, s.description, CURDATE() + INTERVAL s.due_in DAY, s.priority, s.status, s.minutes, s.tags,
       IF(s.remind, CURDATE() + INTERVAL (s.due_in - 1) DAY, NULL)
FROM (
  SELECT 'student@studyhub.test' AS email, 'Database normalization worksheet' AS title, 'Database Systems' AS subject,
         'Normalize the sample tables to 3NF and explain each step.' AS description, 3 AS due_in, 'High' AS priority,
         'In progress' AS status, 90 AS minutes, 'database,homework' AS tags, 1 AS remind
  UNION ALL SELECT 'student@studyhub.test', 'Build login page', 'Web Development',
         'HTML/CSS login form with validation for the StudyHub project.', 5, 'High', 'To do', 120, 'web,project', 1
  UNION ALL SELECT 'student@studyhub.test', 'Read chapter 4: Joins', 'Database Systems',
         'Inner, left and right joins with examples.', 1, 'Medium', 'To do', 45, 'reading', 0
  UNION ALL SELECT 'student@studyhub.test', 'Statistics problem set 2', 'Statistics',
         'Questions 1-15 on probability distributions.', 7, 'Medium', 'In review', 60, 'math,homework', 0
  UNION ALL SELECT 'student@studyhub.test', 'Ethics reflection paper', 'IT Ethics',
         '500-word reflection on data privacy.', -2, 'Low', 'Done', 60, 'writing', 0
  UNION ALL SELECT 'student@studyhub.test', 'Old quiz review', 'Web Development',
         'Reviewed answers from quiz 1.', -10, 'Low', 'Archived', 30, 'review', 0
  UNION ALL SELECT 'student2@studyhub.test', 'JavaScript arrays exercise', 'Web Development',
         'map, filter and reduce practice.', 2, 'Medium', 'To do', 40, 'web,practice', 0
  UNION ALL SELECT 'student2@studyhub.test', 'Group presentation slides', 'IT Ethics',
         'Slides 5-8 for the group report.', 4, 'High', 'In progress', 90, 'group', 1
) s
JOIN users u ON u.username = s.email
WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.user_id = u.id AND t.title = s.title);

-- history for the tasks that already moved
INSERT INTO task_history (task_id, previous_status, next_status, action_label)
SELECT t.id, h.prev_status, h.next_status, h.label
FROM (
  SELECT 'Database normalization worksheet' AS title, 'To do' AS prev_status, 'In progress' AS next_status, 'Start work' AS label
  UNION ALL SELECT 'Statistics problem set 2', 'To do',       'In progress', 'Start work'
  UNION ALL SELECT 'Statistics problem set 2', 'In progress', 'In review',   'Submit for review'
  UNION ALL SELECT 'Ethics reflection paper',  'To do',       'In progress', 'Start work'
  UNION ALL SELECT 'Ethics reflection paper',  'In progress', 'In review',   'Submit for review'
  UNION ALL SELECT 'Ethics reflection paper',  'In review',   'Done',        'Approve'
  UNION ALL SELECT 'Old quiz review',          'Done',        'Archived',    'Archive'
  UNION ALL SELECT 'Group presentation slides','To do',       'In progress', 'Start work'
) h
JOIN tasks t ON t.title = h.title
JOIN users u ON u.id = t.user_id AND u.username IN ('student@studyhub.test', 'student2@studyhub.test')
WHERE NOT EXISTS (SELECT 1 FROM task_history x
                  WHERE x.task_id = t.id AND x.previous_status = h.prev_status AND x.next_status = h.next_status);

-- schedule
INSERT INTO schedules (user_id, day, start_time, end_time, class_name, course_code, instructor)
SELECT u.id, s.day, s.start_time, s.end_time, s.class_name, s.course_code, s.instructor
FROM (
  SELECT 'student@studyhub.test' AS email, 'Monday' AS day, '08:00:00' AS start_time, '09:30:00' AS end_time,
         'Database Systems' AS class_name, 'IT 223' AS course_code, 'Carlo Mendoza' AS instructor
  UNION ALL SELECT 'student@studyhub.test', 'Monday',    '10:00:00', '11:30:00', 'Web Development', 'IT 221', 'Carlo Mendoza'
  UNION ALL SELECT 'student@studyhub.test', 'Wednesday', '13:00:00', '14:30:00', 'Statistics',      'MATH 201', 'R. Villanueva'
  UNION ALL SELECT 'student@studyhub.test', 'Friday',    '09:00:00', '10:30:00', 'IT Ethics',       'IT 210', 'M. Bautista'
  UNION ALL SELECT 'student2@studyhub.test','Tuesday',   '10:00:00', '11:30:00', 'Web Development', 'IT 221', 'Carlo Mendoza'
) s
JOIN users u ON u.username = s.email
WHERE NOT EXISTS (SELECT 1 FROM schedules x
                  WHERE x.user_id = u.id AND x.day = s.day AND x.start_time = s.start_time AND x.course_code = s.course_code);

-- notes
INSERT INTO notes (user_id, title, body, remark)
SELECT u.id, s.title, s.body, s.remark
FROM (
  SELECT 'student@studyhub.test' AS email, 'SQL JOIN cheat sheet' AS title,
         'INNER JOIN = only matching rows. LEFT JOIN = all rows from the left table, NULLs where no match.' AS body,
         'Review before Friday quiz' AS remark
  UNION ALL SELECT 'student@studyhub.test', 'Normal forms',
         '1NF: atomic values. 2NF: no partial dependency. 3NF: no transitive dependency.', NULL
  UNION ALL SELECT 'student@studyhub.test', 'CSS flexbox',
         'justify-content = main axis, align-items = cross axis.', NULL
  UNION ALL SELECT 'student2@studyhub.test', 'Array methods',
         'map returns a new array; filter keeps matches; reduce folds into one value.', 'Practice reduce'
) s
JOIN users u ON u.username = s.email
WHERE NOT EXISTS (SELECT 1 FROM notes x WHERE x.user_id = u.id AND x.title = s.title);

-- two classes for the sample teacher
INSERT IGNORE INTO classrooms (teacher_id, class_code, title, subject, section)
SELECT u.id, s.code, s.title, s.subject, s.section
FROM (
  SELECT 'CLS-WEB221' AS code, 'Web Development' AS title, 'IT 221' AS subject, 'BSIT 2-A' AS section
  UNION ALL SELECT 'CLS-DB223', 'Database Systems', 'IT 223', 'BSIT 2-A'
) s
JOIN users u ON u.username = 'teacher@studyhub.test';

-- rosters
INSERT IGNORE INTO classroom_members (classroom_id, student_id)
SELECT c.id, u.id
FROM (
  SELECT 'CLS-WEB221' AS code, 'student@studyhub.test' AS email
  UNION ALL SELECT 'CLS-DB223',  'student@studyhub.test'
  UNION ALL SELECT 'CLS-WEB221', 'student2@studyhub.test'
) s
JOIN classrooms c ON c.class_code = s.code
JOIN users u ON u.username = s.email;

-- class posts
INSERT INTO classroom_posts (classroom_id, author_id, title, content, resource_link)
SELECT c.id, u.id, s.title, s.content, s.link
FROM (
  SELECT 'CLS-WEB221' AS code, 'Week 4 lecture slides' AS title,
         'Slides on forms and validation are up. Read them before Thursday.' AS content,
         'https://developer.mozilla.org/en-US/docs/Learn/Forms' AS link
  UNION ALL SELECT 'CLS-DB223', 'Quiz on Friday',
         'Covers joins and normalization (chapters 3-4).', NULL
) s
JOIN classrooms c ON c.class_code = s.code
JOIN users u ON u.username = 'teacher@studyhub.test'
WHERE NOT EXISTS (SELECT 1 FROM classroom_posts x WHERE x.classroom_id = c.id AND x.title = s.title);

-- class assignments
INSERT INTO classroom_tasks (classroom_id, teacher_id, title, description, due_date, max_score)
SELECT c.id, c.teacher_id, s.title, s.description, CURDATE() + INTERVAL s.due_in DAY, s.max_score
FROM (
  SELECT 'CLS-WEB221' AS code, 'Responsive landing page' AS title,
         'Build a one-page site that works on phone and desktop. Submit the GitHub link.' AS description,
         6 AS due_in, 100.00 AS max_score
  UNION ALL SELECT 'CLS-WEB221', 'HTML forms lab', 'Create a sign-up form with client-side validation.', -1, 50.00
  UNION ALL SELECT 'CLS-DB223',  'ER diagram: library system', 'Draw the ER diagram with cardinalities and keys.', 4, 100.00
) s
JOIN classrooms c ON c.class_code = s.code
WHERE NOT EXISTS (SELECT 1 FROM classroom_tasks x WHERE x.classroom_id = c.id AND x.title = s.title);

-- submissions: one graded (locked), two waiting
INSERT IGNORE INTO classroom_submissions (task_id, student_id, submission_text, status, score, feedback, graded_at, graded_by)
SELECT ct.id, st.id, s.answer, s.status, s.score, s.feedback,
       IF(s.status = 'graded', NOW(), NULL), IF(s.status = 'graded', ct.teacher_id, NULL)
FROM (
  SELECT 'HTML forms lab' AS task, 'student@studyhub.test' AS email,
         'https://github.com/example/forms-lab' AS answer, 'graded' AS status, 46.00 AS score,
         'Good validation. Add labels for accessibility.' AS feedback
  UNION ALL SELECT 'HTML forms lab', 'student2@studyhub.test',
         'https://github.com/example/forms-lab-eli', 'submitted', NULL, NULL
  UNION ALL SELECT 'Responsive landing page', 'student@studyhub.test',
         'https://github.com/example/landing-page', 'submitted', NULL, NULL
) s
JOIN classroom_tasks ct ON ct.title = s.task
JOIN classrooms c ON c.id = ct.classroom_id AND c.class_code IN ('CLS-WEB221', 'CLS-DB223')
JOIN users st ON st.username = s.email;

-- dashboard announcement from the admin
INSERT INTO announcements (title, body, audience, importance, created_by)
SELECT 'Welcome to StudyHub', 'Midterm week starts Monday. Keep your tasks and schedule up to date!', 'all', 'info', u.id
FROM users u
WHERE u.username = 'admin@studyhub.test'
  AND NOT EXISTS (SELECT 1 FROM announcements x WHERE x.title = 'Welcome to StudyHub');


SELECT 'StudyHub ready: 17 tables + sample records. Sign in as superadmin@studyhub.test / Password123!' AS result;
