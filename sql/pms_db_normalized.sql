-- PMS Normalized Relational Schema (Sections 34)
-- Complements pms_db_schema.sql with fully normalized entities and foreign keys.
-- Run after base schema or standalone on a fresh database.

CREATE DATABASE IF NOT EXISTS pms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pms_db;

CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  description VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS permissions (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  module VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  UNIQUE KEY uq_perm (module, action)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id VARCHAR(32) NOT NULL,
  permission_id VARCHAR(32) NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (permission_id) REFERENCES permissions(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id VARCHAR(32) NOT NULL,
  role_id VARCHAR(32) NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS offenses (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  offense_name VARCHAR(255) NOT NULL,
  category VARCHAR(64) NULL,
  court_name VARCHAR(255) NULL,
  sentence_length VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS prisoner_offenses (
  prisoner_id VARCHAR(32) NOT NULL,
  offense_id VARCHAR(32) NOT NULL,
  PRIMARY KEY (prisoner_id, offense_id),
  FOREIGN KEY (prisoner_id) REFERENCES prisoners(id),
  FOREIGN KEY (offense_id) REFERENCES offenses(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS parole_cases (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_number VARCHAR(32) NOT NULL UNIQUE,
  prisoner_id VARCHAR(32) NOT NULL,
  institution_id VARCHAR(32) NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'Draft',
  submitted_at DATE NULL,
  submitted_by VARCHAR(32) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (prisoner_id) REFERENCES prisoners(id),
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  INDEX idx_cases_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS eligibility_assessments (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL,
  prisoner_id VARCHAR(32) NOT NULL,
  eligible TINYINT(1) NOT NULL DEFAULT 0,
  eligibility_date DATE NULL,
  assessed_by VARCHAR(32) NULL,
  assessed_at DATETIME NULL,
  FOREIGN KEY (case_id) REFERENCES parole_cases(id),
  FOREIGN KEY (prisoner_id) REFERENCES prisoners(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS form1 (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL,
  submitted_at DATETIME NULL,
  submitted_by VARCHAR(32) NULL,
  payload JSON NOT NULL,
  FOREIGN KEY (case_id) REFERENCES parole_cases(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS form2 (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL,
  submitted_at DATETIME NULL,
  FOREIGN KEY (case_id) REFERENCES parole_cases(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS form2_sections (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  form2_id VARCHAR(32) NOT NULL,
  section_key ENUM('ddr','ppr') NOT NULL,
  contributor_id VARCHAR(32) NULL,
  contributor_role VARCHAR(64) NULL,
  submitted_at DATETIME NULL,
  payload JSON NOT NULL,
  UNIQUE KEY uq_form2_section (form2_id, section_key),
  FOREIGN KEY (form2_id) REFERENCES form2(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS form3 (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL UNIQUE,
  commander_id VARCHAR(32) NULL,
  status VARCHAR(32) NOT NULL,
  payload JSON NOT NULL,
  FOREIGN KEY (case_id) REFERENCES parole_cases(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS form4 (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL UNIQUE,
  decision VARCHAR(64) NOT NULL DEFAULT 'Parole Granted',
  final_percent DECIMAL(5,2) NULL,
  payload JSON NOT NULL,
  recorded_at DATETIME NULL,
  FOREIGN KEY (case_id) REFERENCES parole_cases(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS form5 (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL UNIQUE,
  decision VARCHAR(64) NOT NULL DEFAULT 'Parole Refused',
  final_percent DECIMAL(5,2) NULL,
  payload JSON NOT NULL,
  recorded_at DATETIME NULL,
  FOREIGN KEY (case_id) REFERENCES parole_cases(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_id VARCHAR(32) NULL,
  prisoner_id VARCHAR(32) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(64) NULL,
  category VARCHAR(64) NOT NULL,
  uploaded_by VARCHAR(32) NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  storage_ref TEXT NULL,
  FOREIGN KEY (case_id) REFERENCES parole_cases(id),
  FOREIGN KEY (prisoner_id) REFERENCES prisoners(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS hearing_members (
  hearing_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  role VARCHAR(64) NOT NULL,
  PRIMARY KEY (hearing_id, user_id),
  FOREIGN KEY (hearing_id) REFERENCES hearings(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS board_assessments (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL,
  role ENUM('Doctor','CS Commissioner','DJAG Secretary') NOT NULL,
  assessor_id VARCHAR(32) NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  feedback TEXT NULL,
  submitted_at DATETIME NOT NULL,
  UNIQUE KEY uq_case_role (case_id, role),
  FOREIGN KEY (case_id) REFERENCES parole_cases(id),
  FOREIGN KEY (assessor_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS decisions (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL UNIQUE,
  outcome VARCHAR(64) NOT NULL,
  final_percent DECIMAL(5,2) NULL,
  decided_by VARCHAR(32) NULL,
  decided_at DATETIME NULL,
  notes TEXT NULL,
  FOREIGN KEY (case_id) REFERENCES parole_cases(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS approvals (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL,
  approver_id VARCHAR(32) NOT NULL,
  role VARCHAR(64) NOT NULL,
  decision VARCHAR(32) NOT NULL,
  comments TEXT NULL,
  approved_at DATETIME NOT NULL,
  FOREIGN KEY (case_id) REFERENCES parole_cases(id),
  FOREIGN KEY (approver_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS guarantors (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL,
  name VARCHAR(200) NOT NULL,
  relationship VARCHAR(100) NULL,
  address TEXT NULL,
  contact_number VARCHAR(50) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES parole_cases(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS prisoner_guarantors (
  prisoner_id VARCHAR(32) NOT NULL,
  guarantor_id VARCHAR(32) NOT NULL,
  PRIMARY KEY (prisoner_id, guarantor_id),
  FOREIGN KEY (prisoner_id) REFERENCES prisoners(id),
  FOREIGN KEY (guarantor_id) REFERENCES guarantors(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS releases (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL UNIQUE,
  prisoner_id VARCHAR(32) NOT NULL,
  release_date DATE NOT NULL,
  authorized_by VARCHAR(32) NOT NULL,
  notes TEXT NULL,
  authorized_at DATETIME NOT NULL,
  FOREIGN KEY (case_id) REFERENCES parole_cases(id),
  FOREIGN KEY (prisoner_id) REFERENCES prisoners(id),
  FOREIGN KEY (authorized_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS board_members (
  user_id VARCHAR(32) NOT NULL PRIMARY KEY,
  position VARCHAR(64) NULL,
  appointment_date DATE NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS board_contracts (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  appointment_date DATE NOT NULL,
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  contract_status VARCHAR(32) NOT NULL DEFAULT 'Active',
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_contract_expiry (expiry_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS workflow_history (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL,
  from_status VARCHAR(64) NULL,
  to_status VARCHAR(64) NOT NULL,
  actor_id VARCHAR(32) NULL,
  notes TEXT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES parole_cases(id)
) ENGINE=InnoDB;

-- Audit logs reference case via entity_id when entity = ParoleApplication
-- notifications reference case_id via application_id column in base schema
