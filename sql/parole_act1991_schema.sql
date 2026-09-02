-- Parole Act 1991 module tables (column alters applied via schema-sync.js)

CREATE TABLE IF NOT EXISTS detainee_assessment_reports (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  application_id VARCHAR(32) NOT NULL,
  created_by_cs_officer_id VARCHAR(32) NOT NULL,
  risk_level ENUM('Low', 'Medium', 'High') NOT NULL,
  report_content TEXT NOT NULL,
  institutional_behavior TEXT NULL,
  programs_completed TEXT NULL,
  submission_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dar_application (application_id),
  INDEX idx_dar_officer (created_by_cs_officer_id),
  CONSTRAINT fk_dar_application FOREIGN KEY (application_id) REFERENCES parole_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pre_parole_reports (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  application_id VARCHAR(32) NOT NULL,
  created_by_probation_officer_id VARCHAR(32) NOT NULL,
  victim_views TEXT NULL,
  community_perspectives TEXT NULL,
  family_circumstances TEXT NULL,
  custom_matters TEXT NULL,
  rehabilitation_plan TEXT NULL,
  community_safety_assessment TEXT NULL,
  submission_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ppr_application (application_id),
  INDEX idx_ppr_officer (created_by_probation_officer_id),
  CONSTRAINT fk_ppr_application FOREIGN KEY (application_id) REFERENCES parole_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS board_hearings (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  application_id VARCHAR(32) NOT NULL,
  hearing_date DATE NOT NULL,
  hearing_time VARCHAR(16) NULL,
  location VARCHAR(255) NULL,
  interview_notes TEXT NULL,
  face_to_face_conducted TINYINT(1) NOT NULL DEFAULT 0,
  chairman_id VARCHAR(32) NULL COMMENT 'DJAG Secretary',
  doctor_id VARCHAR(32) NULL,
  cs_commissioner_id VARCHAR(32) NULL,
  scheduled_by VARCHAR(32) NULL,
  status ENUM('Scheduled', 'In Progress', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Scheduled',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bh_application (application_id),
  INDEX idx_bh_date (hearing_date),
  CONSTRAINT fk_bh_application FOREIGN KEY (application_id) REFERENCES parole_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS board_decisions (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  hearing_id VARCHAR(32) NOT NULL,
  application_id VARCHAR(32) NOT NULL,
  chairman_vote ENUM('Grant', 'Deny') NULL,
  doctor_vote ENUM('Grant', 'Deny') NULL,
  commissioner_vote ENUM('Grant', 'Deny') NULL,
  chairman_observations TEXT NULL,
  doctor_behavioral_observations TEXT NULL,
  commissioner_correctional_review TEXT NULL,
  final_decision ENUM('Grant', 'Deny') NULL,
  decision_reason TEXT NULL,
  conditions JSON NULL,
  cooldown_period_months INT NULL,
  community_safety_primary TINYINT(1) NOT NULL DEFAULT 1,
  finalized_at DATETIME NULL,
  finalized_by VARCHAR(32) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bd_hearing (hearing_id),
  INDEX idx_bd_application (application_id),
  CONSTRAINT fk_bd_hearing FOREIGN KEY (hearing_id) REFERENCES board_hearings(id) ON DELETE CASCADE,
  CONSTRAINT fk_bd_application FOREIGN KEY (application_id) REFERENCES parole_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parole_supervision (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  application_id VARCHAR(32) NOT NULL,
  assigned_parole_officer_id VARCHAR(32) NOT NULL,
  supervision_start_date DATE NOT NULL,
  supervision_end_date DATE NULL,
  compliance_notes TEXT NULL,
  order_document JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ps_application (application_id),
  INDEX idx_ps_officer (assigned_parole_officer_id),
  CONSTRAINT fk_ps_application FOREIGN KEY (application_id) REFERENCES parole_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parole_state_transitions (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  application_id VARCHAR(32) NOT NULL,
  from_status VARCHAR(64) NOT NULL,
  to_status VARCHAR(64) NOT NULL,
  actor_id VARCHAR(32) NULL,
  actor_role VARCHAR(64) NULL,
  notes TEXT NULL,
  transitioned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pst_application (application_id),
  CONSTRAINT fk_pst_application FOREIGN KEY (application_id) REFERENCES parole_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parole_notification_log (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  application_id VARCHAR(32) NOT NULL,
  prisoner_id VARCHAR(32) NOT NULL,
  notification_type VARCHAR(64) NOT NULL,
  notification_date DATE NOT NULL,
  recipient_role VARCHAR(64) NOT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pnl_app_type (application_id, notification_type),
  INDEX idx_pnl_prisoner (prisoner_id),
  CONSTRAINT fk_pnl_application FOREIGN KEY (application_id) REFERENCES parole_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS form1_data (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  application_id VARCHAR(32) NOT NULL,
  sponsor_name VARCHAR(200) NULL,
  sponsor_relationship VARCHAR(100) NULL,
  sponsor_contact VARCHAR(120) NULL,
  sponsor_address TEXT NULL,
  proposed_residence TEXT NULL,
  proposed_residence_province VARCHAR(100) NULL,
  employment_plans TEXT NULL,
  community_service_plans TEXT NULL,
  prisoner_consent TINYINT(1) NULL,
  consent_date DATE NULL,
  signature_placeholder VARCHAR(255) NULL,
  section_snapshot JSON NULL COMMENT 'Immutable A–E snapshot at generation/print',
  generated_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  printed_date DATETIME NULL,
  generated_by VARCHAR(32) NULL,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_form1_application (application_id),
  CONSTRAINT fk_form1_application FOREIGN KEY (application_id) REFERENCES parole_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
