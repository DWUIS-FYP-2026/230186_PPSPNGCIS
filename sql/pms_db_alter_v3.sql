-- Schema v3: prisoner_documents + api_sessions
-- Applied automatically by npm run migrate (schema-sync.js)



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

-- Migrate legacy JSON documents into prisoner_documents (run once if upgrading)
INSERT IGNORE INTO prisoner_documents (id, prisoner_id, name, mime_type, file_size, data_url, uploaded_at)
SELECT
  JSON_UNQUOTE(JSON_EXTRACT(doc.value, '$.id')),
  p.id,
  JSON_UNQUOTE(JSON_EXTRACT(doc.value, '$.name')),
  JSON_UNQUOTE(JSON_EXTRACT(doc.value, '$.type')),
  JSON_EXTRACT(doc.value, '$.size'),
  JSON_UNQUOTE(JSON_EXTRACT(doc.value, '$.dataUrl')),
  NOW()
FROM prisoners p
CROSS JOIN JSON_TABLE(p.documents, '$[*]' COLUMNS (value JSON PATH '$')) doc
WHERE p.documents IS NOT NULL AND JSON_LENGTH(p.documents) > 0;

UPDATE prisoners SET documents = JSON_ARRAY() WHERE documents IS NOT NULL AND JSON_LENGTH(documents) > 0;
