-- PMS full schema — matches js/storage.js entity structure (WampServer / MySQL Workbench)

CREATE TABLE IF NOT EXISTS institutions (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(200) NOT NULL,
  province VARCHAR(100) NULL,
  address VARCHAR(255) NULL,
  location VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Active',
  commander_id VARCHAR(32) NULL,
  capacity INT NULL,
  phone VARCHAR(50) NULL,
  email VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_institutions_status (status),
  INDEX idx_institutions_commander (commander_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  officer_id VARCHAR(32) NULL,
  employee_number VARCHAR(32) NULL,
  username VARCHAR(120) NOT NULL UNIQUE,
  email VARCHAR(120) NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(64) NOT NULL,
  `rank` VARCHAR(64) NULL,
  institution_id VARCHAR(32) NULL,
  province VARCHAR(100) NULL,
  position VARCHAR(100) NULL,
  phone VARCHAR(50) NULL,
  employment_status VARCHAR(32) NULL,
  account_status VARCHAR(32) NULL,
  board_position VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Active',
  date_appointed DATE NULL,
  last_login DATETIME NULL,
  profile_photo TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_institution (institution_id),
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_credentials (
  username VARCHAR(120) NOT NULL PRIMARY KEY,
  password VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prisoners (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  prisoner_number VARCHAR(32) NOT NULL UNIQUE,
  institution_id VARCHAR(32) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NULL,
  gender VARCHAR(20) NULL,
  offense VARCHAR(255) NULL,
  sentence_start_date DATE NOT NULL,
  sentence_end_date DATE NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'Awaiting Eligibility',
  parole_eligibility_date DATE NULL,
  status_updated_at DATETIME NULL,
  documents JSON NULL,
  extra_attributes JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_prisoners_institution (institution_id),
  INDEX idx_prisoners_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parole_applications (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  prisoner_id VARCHAR(32) NOT NULL,
  institution_id VARCHAR(32) NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'Draft',
  submitted_at DATE NULL,
  submitted_by VARCHAR(32) NULL,
  form_data JSON NULL,
  form_uploads JSON NULL,
  board_decision JSON NULL,
  workflow_notes JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_applications_prisoner (prisoner_id),
  INDEX idx_applications_institution (institution_id),
  INDEX idx_applications_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hearings (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  application_id VARCHAR(32) NOT NULL,
  prisoner_id VARCHAR(32) NOT NULL,
  institution_id VARCHAR(32) NOT NULL,
  scheduled_date DATE NULL,
  scheduled_time VARCHAR(16) NULL,
  location VARCHAR(200) NULL,
  notes TEXT NULL,
  status VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hearings_application (application_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  type VARCHAR(64) NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  recipient_role VARCHAR(64) NULL,
  recipient_user_id VARCHAR(32) NULL,
  institution_id VARCHAR(32) NULL,
  prisoner_id VARCHAR(32) NULL,
  eligible_date DATE NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  is_resolved TINYINT(1) NOT NULL DEFAULT 0,
  meta JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_role (recipient_role),
  INDEX idx_notifications_user (recipient_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  user_id VARCHAR(32) NULL,
  user_name VARCHAR(120) NULL,
  role VARCHAR(64) NULL,
  action VARCHAR(64) NOT NULL,
  entity VARCHAR(64) NULL,
  entity_id VARCHAR(64) NULL,
  details TEXT NULL,
  logged_at DATETIME NOT NULL,
  ip_address VARCHAR(64) NULL,
  previous_values JSON NULL,
  new_values JSON NULL,
  denied TINYINT(1) NOT NULL DEFAULT 0,
  success TINYINT(1) NOT NULL DEFAULT 1,
  INDEX idx_audit_entity (entity, entity_id),
  INDEX idx_audit_logged_at (logged_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  institution_id VARCHAR(32) NULL,
  type VARCHAR(64) NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(32) NULL,
  content JSON NULL,
  created_by VARCHAR(32) NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_reports_institution (institution_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_settings (
  id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  settings JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS id_counters (
  id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  counters JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_version (
  id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  version INT NOT NULL DEFAULT 1,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prisoner_documents (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  prisoner_id VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NULL,
  file_size INT NULL,
  data_url MEDIUMTEXT NULL,
  uploaded_by VARCHAR(32) NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prisoner_documents_prisoner (prisoner_id),
  CONSTRAINT fk_prisoner_documents_prisoner
    FOREIGN KEY (prisoner_id) REFERENCES prisoners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_sessions (
  token VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  role VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  INDEX idx_api_sessions_user (user_id),
  INDEX idx_api_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
