-- Run this in MySQL Workbench after PMSDB.sql to set known login passwords.
-- Usernames follow initial.surname@agency (cs.gov.pg, djag.gov.pg, health.gov.pg).

USE PMSDB;

UPDATE Users SET PasswordHash = 'Password123!' WHERE Username IN (
  'j.dole@cs.gov.pg',
  'm.kila@djag.gov.pg',
  's.tau@cs.gov.pg',
  'h.morris@djag.gov.pg',
  'r.sine@health.gov.pg',
  't.bain@cs.gov.pg',
  'p.koroma@cs.gov.pg'
);

-- Verify
SELECT UserID, Username, Role, IsActive, LEFT(PasswordHash, 20) AS PasswordPreview FROM Users;
