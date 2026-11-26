USE studyhub;

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