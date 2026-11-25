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

-- Sample schedules for user 1 (matching the app.js sample data)
INSERT INTO schedules (user_id, day, start_time, end_time, class_name, course_code, instructor)
VALUES
  (1, 'Monday',    '10:30', '11:30', 'Computer Engineering as a Discipline', 'CMPE 101', 'Prof. Ryan Evangelista'),
  (1, 'Monday',    '13:30', '16:30', 'Filipinolohiya at Pambansang Kaunlaran', 'GEED 032', 'Prof. Jhonley Cubacub'),
  (1, 'Tuesday',   '07:30', '10:30', '2D Animation',                          'CPET 201', 'Prof. Jerome De Guzman'),
  (1, 'Tuesday',   '10:30', '13:30', 'Data Structures and Algorithms',        'CMPE 201', 'Prof. Mylo Atencio'),
  (1, 'Tuesday',   '15:00', '18:00', 'Fundamentals of Electronic Circuits',   'ECEN 011', 'TBA'),
  (1, 'Wednesday', '10:00', '13:00', 'Discrete Mathematics',                  'CMPE 104', 'Prof. Mylo Atencio'),
  (1, 'Wednesday', '13:00', '16:00', 'Fundamentals of Electrical Circuits',   'ELEN 012', 'Prof. Ronald Fernando'),
  (1, 'Wednesday', '16:30', '18:30', 'Physical Activity Towards Health and Fitness 3', 'PATHFIT 3', 'Prof. Remus Laglagaron'),
  (1, 'Friday',    '07:30', '10:30', '2D Animation',                          'CPET 201', 'Prof. Jerome De Guzman'),
  (1, 'Friday',    '10:30', '13:30', 'Data Structures and Algorithms',        'CMPE 201', 'Prof. Mylo Atencio'),
  (1, 'Friday',    '15:00', '18:00', 'Fundamentals of Electronic Circuits',   'ECEN 011', 'TBA'),
  (1, 'Friday',    '18:00', '21:00', 'CPE Professional Course 1',             'CMPE-PC1', 'Prof. Jose Marie Dipay'),
  (1, 'Saturday',  '07:30', '10:30', 'Fundamentals of Electrical Circuits',   'ELEN 012', 'Prof. Ronald Fernando'),
  (1, 'Saturday',  '12:00', '14:00', 'CPE Professional Course 1',             'CMPE-PC1', 'Prof. Jose Marie Dipay');