USE studyhub;

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