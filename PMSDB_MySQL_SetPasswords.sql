-- Run this in MySQL Workbench after PMSDB.sql to set known login passwords.
-- The original seed bcrypt hashes are placeholders and will NOT validate.

USE PMSDB;

-- Option A: Plain-text passwords (development — AuthHelper supports plain-text fallback)
UPDATE Users SET PasswordHash = 'Password123!' WHERE Username = 'john.dole@cs.gov.pg';
UPDATE Users SET PasswordHash = 'Password123!' WHERE Username = 'mary.kila@djag.gov.pg';
UPDATE Users SET PasswordHash = 'Password123!' WHERE Username = 'judge.kakaraya@justice.gov.pg';

-- Option B: BCrypt hashes for Password123! (uncomment to use instead of plain text)
-- UPDATE Users SET PasswordHash = '$2a$11$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' WHERE Username = 'john.dole@cs.gov.pg';
-- UPDATE Users SET PasswordHash = '$2a$11$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' WHERE Username = 'mary.kila@djag.gov.pg';
-- UPDATE Users SET PasswordHash = '$2a$11$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' WHERE Username = 'judge.kakaraya@justice.gov.pg';

-- Verify
SELECT UserID, Username, Role, IsActive, LEFT(PasswordHash, 20) AS PasswordPreview FROM Users;
