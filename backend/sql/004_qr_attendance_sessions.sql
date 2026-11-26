-- Stored QR codes for an open attendance session.
-- Applied by npm run db:init. Safe to run again: the table is created only when missing.
-- session_id is the attendance session. class_id is the course offering.
-- doctor_id is the instructor user who generated the code.
-- qr_token is a JWT the student scan route already accepts (`sid` signed with the session secret).
-- It also carries the class id, a timestamp, and a random nonce, and it expires after 15 minutes.

CREATE TABLE IF NOT EXISTS qr_attendance_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  class_id INT NOT NULL,
  doctor_id INT NOT NULL,
  qr_token VARCHAR(512) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_qr_attendance_token (qr_token),
  KEY idx_qr_attendance_session (session_id, expires_at),
  CONSTRAINT fk_qr_att_session FOREIGN KEY (session_id) REFERENCES attendance_sessions (id) ON DELETE CASCADE,
  CONSTRAINT fk_qr_att_class FOREIGN KEY (class_id) REFERENCES course_offerings (id),
  CONSTRAINT fk_qr_att_doctor FOREIGN KEY (doctor_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
