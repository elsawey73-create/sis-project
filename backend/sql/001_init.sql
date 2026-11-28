-- Unidex initial schema. Applied by `npm run db:init` on an empty database.
-- notifications.data is TEXT because the API JSON.parses the string itself.
-- A JSON column would be parsed by mysql2 first and then fail that parse.

CREATE TABLE departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  name_ar VARCHAR(200) NOT NULL,
  name_en VARCHAR(200) NOT NULL,
  UNIQUE KEY uq_departments_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  login_id VARCHAR(30) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name_ar VARCHAR(200) NOT NULL,
  full_name_en VARCHAR(200) NULL,
  email VARCHAR(255) NULL,
  role ENUM('student', 'instructor', 'admin') NOT NULL,
  preferred_lang ENUM('ar', 'en') NULL,
  token_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_login (login_id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE students (
  user_id INT NOT NULL PRIMARY KEY,
  student_code VARCHAR(30) NOT NULL,
  department_id INT NOT NULL,
  level INT NOT NULL DEFAULT 1,
  admission_year INT NOT NULL,
  CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_students_department FOREIGN KEY (department_id) REFERENCES departments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE instructors (
  user_id INT NOT NULL PRIMARY KEY,
  department_id INT NOT NULL,
  CONSTRAINT fk_instructors_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_instructors_department FOREIGN KEY (department_id) REFERENCES departments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  name_ar VARCHAR(200) NOT NULL,
  name_en VARCHAR(200) NOT NULL,
  description_ar TEXT NULL,
  description_en TEXT NULL,
  credit_hours DECIMAL(4,1) NOT NULL,
  has_practical TINYINT(1) NOT NULL DEFAULT 0,
  department_id INT NOT NULL,
  UNIQUE KEY uq_courses_code (code),
  CONSTRAINT fk_courses_department FOREIGN KEY (department_id) REFERENCES departments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE course_prerequisites (
  course_id INT NOT NULL,
  prerequisite_id INT NOT NULL,
  PRIMARY KEY (course_id, prerequisite_id),
  CONSTRAINT fk_prereq_course FOREIGN KEY (course_id) REFERENCES courses (id),
  CONSTRAINT fk_prereq_required FOREIGN KEY (prerequisite_id) REFERENCES courses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE semesters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name_ar VARCHAR(200) NOT NULL,
  name_en VARCHAR(200) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  registration_start DATE NOT NULL,
  registration_end DATE NOT NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE course_offerings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  semester_id INT NOT NULL,
  instructor_id INT NOT NULL,
  section VARCHAR(20) NOT NULL DEFAULT '1',
  capacity INT NOT NULL DEFAULT 40,
  absence_limit_pct INT NULL,
  UNIQUE KEY uq_offering_section (course_id, semester_id, section),
  CONSTRAINT fk_offerings_course FOREIGN KEY (course_id) REFERENCES courses (id),
  CONSTRAINT fk_offerings_semester FOREIGN KEY (semester_id) REFERENCES semesters (id),
  CONSTRAINT fk_offerings_instructor FOREIGN KEY (instructor_id) REFERENCES instructors (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE offering_meetings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  offering_id INT NOT NULL,
  day_of_week ENUM('Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu') NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room VARCHAR(50) NOT NULL,
  type ENUM('lecture', 'section', 'lab') NOT NULL DEFAULT 'lecture',
  CONSTRAINT fk_meetings_offering FOREIGN KEY (offering_id) REFERENCES course_offerings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE enrollments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  offering_id INT NOT NULL,
  status ENUM('enrolled', 'dropped', 'completed', 'failed') NOT NULL DEFAULT 'enrolled',
  enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_enrollment (student_id, offering_id),
  CONSTRAINT fk_enrollments_student FOREIGN KEY (student_id) REFERENCES students (user_id),
  CONSTRAINT fk_enrollments_offering FOREIGN KEY (offering_id) REFERENCES course_offerings (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE grades (
  enrollment_id INT NOT NULL PRIMARY KEY,
  coursework DECIMAL(5,2) NULL,
  midterm DECIMAL(5,2) NULL,
  practical DECIMAL(5,2) NULL,
  final_exam DECIMAL(5,2) NULL,
  total DECIMAL(5,2) NULL,
  letter VARCHAR(3) NULL,
  points DECIMAL(3,1) NULL,
  published TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_grades_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attendance_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  offering_id INT NOT NULL,
  meeting_id INT NULL,
  session_date DATE NOT NULL,
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP NULL,
  opened_by INT NOT NULL,
  qr_secret VARCHAR(64) NOT NULL,
  status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  token_ttl_seconds INT NOT NULL DEFAULT 30,
  late_after_minutes INT NOT NULL DEFAULT 15,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  accuracy_m DECIMAL(8,1) NULL,
  radius_m INT NULL,
  auto_close_at DATETIME NULL,
  CONSTRAINT fk_sessions_offering FOREIGN KEY (offering_id) REFERENCES course_offerings (id),
  CONSTRAINT fk_sessions_meeting FOREIGN KEY (meeting_id) REFERENCES offering_meetings (id) ON DELETE SET NULL,
  CONSTRAINT fk_sessions_opener FOREIGN KEY (opened_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attendance_records (
  session_id INT NOT NULL,
  student_id INT NOT NULL,
  status ENUM('present', 'late', 'excused') NOT NULL,
  method VARCHAR(20) NOT NULL DEFAULT 'qr',
  scanned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  photo MEDIUMBLOB NULL,
  photo_mime VARCHAR(40) NULL,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  accuracy_m DECIMAL(8,1) NULL,
  distance_m DECIMAL(8,1) NULL,
  device_id VARCHAR(128) NULL,
  device_signals VARCHAR(128) NULL,
  marked_by INT NULL,
  PRIMARY KEY (session_id, student_id),
  KEY idx_records_device (session_id, device_id),
  CONSTRAINT fk_records_session FOREIGN KEY (session_id) REFERENCES attendance_sessions (id) ON DELETE CASCADE,
  CONSTRAINT fk_records_student FOREIGN KEY (student_id) REFERENCES students (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_id INT NOT NULL,
  receiver_id INT NOT NULL,
  offering_id INT NULL,
  parent_id INT NULL,
  subject VARCHAR(150) NULL,
  body TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users (id),
  CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_id) REFERENCES users (id),
  CONSTRAINT fk_messages_offering FOREIGN KEY (offering_id) REFERENCES course_offerings (id) ON DELETE SET NULL,
  CONSTRAINT fk_messages_parent FOREIGN KEY (parent_id) REFERENCES messages (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  data TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notifications_user (user_id, id),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
