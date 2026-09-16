-- PMS schema additions — safe to re-run (ALTER adds missing columns only)

-- Prisoner computed / enriched attributes (from eligibility-engine)
ALTER TABLE prisoners ADD COLUMN IF NOT EXISTS parole_eligibility_date DATE NULL AFTER status;
ALTER TABLE prisoners ADD COLUMN IF NOT EXISTS status_updated_at DATETIME NULL AFTER parole_eligibility_date;
ALTER TABLE prisoners ADD COLUMN IF NOT EXISTS extra_attributes JSON NULL AFTER documents;

-- Application optional form upload metadata
ALTER TABLE parole_applications ADD COLUMN IF NOT EXISTS form_uploads JSON NULL AFTER form_data;

-- Reports extended payload
ALTER TABLE reports ADD COLUMN IF NOT EXISTS content JSON NULL AFTER status;

-- Track schema version
CREATE TABLE IF NOT EXISTS schema_version (
  id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  version INT NOT NULL DEFAULT 1,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_version (id, version) VALUES (1, 2)
ON DUPLICATE KEY UPDATE version = GREATEST(version, 2);
