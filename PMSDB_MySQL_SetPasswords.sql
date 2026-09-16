-- Set known login passwords for demo accounts.
-- Passwords stored in the user_credentials table (not users.PasswordHash).

-- 1. Make sure each user has a credentials row with the new password.
INSERT INTO user_credentials (username, password)
VALUES
  ('j.dole@cs.gov.pg',    'Password123!'),
  ('m.kila@djag.gov.pg',  'Password123!'),
  ('s.tau@cs.gov.pg',     'Password123!'),
  ('h.morris@djag.gov.pg','Password123!'),
  ('r.sine@health.gov.pg','Password123!'),
  ('t.bain@cs.gov.pg',    'Password123!'),
  ('p.koroma@cs.gov.pg',  'Password123!')
ON DUPLICATE KEY UPDATE password = VALUES(password);

-- 2. Verify
SELECT u.id, u.username, u.role, u.status, c.password
FROM users u
LEFT JOIN user_credentials c ON c.username = u.username;