-- Additive tables for settings, audit, notification preferences, announcements,
-- exams, and anonymous course evaluations.
-- Applied once by npm run db:init. Each statement is safe to run again.

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  updated_by INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
  ('attendance_radius_m', '20'),
  ('attendance_accuracy_cap_m', '40'),
  ('absence_limit_pct', '25');

CREATE TABLE IF NOT EXISTS activity_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id INT NULL,
  action VARCHAR(64) NOT NULL,
  entity VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NULL,
  detail VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_activity_created (created_at),
  KEY idx_activity_actor (actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, type),
  CONSTRAINT fk_notif_pref_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_dedup (
  user_id INT NOT NULL,
  dedup_key VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, dedup_key),
  CONSTRAINT fk_notif_dedup_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  offering_id INT NOT NULL,
  author_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_announcements_offering (offering_id, id),
  CONSTRAINT fk_ann_offering FOREIGN KEY (offering_id) REFERENCES course_offerings (id) ON DELETE CASCADE,
  CONSTRAINT fk_ann_author FOREIGN KEY (author_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_exams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  offering_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  exam_at DATETIME NOT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_exams_at (exam_at),
  CONSTRAINT fk_exam_offering FOREIGN KEY (offering_id) REFERENCES course_offerings (id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_author FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_reminder_sent (
  exam_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (exam_id, user_id),
  CONSTRAINT fk_exam_sent_exam FOREIGN KEY (exam_id) REFERENCES course_exams (id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_sent_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS course_evaluations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  offering_id INT NOT NULL,
  student_id INT NOT NULL,
  rating TINYINT NOT NULL,
  comment VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_eval_student (offering_id, student_id),
  CONSTRAINT fk_eval_offering FOREIGN KEY (offering_id) REFERENCES course_offerings (id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_student FOREIGN KEY (student_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
