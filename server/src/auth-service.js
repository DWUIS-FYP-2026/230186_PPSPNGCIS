const crypto = require('crypto');
const { query } = require('./db');
const config = require('./config');
const { mapUserRow, toMysqlDatetime } = require('./mappers');

const PRISONER_MODIFY_ROLES = ['PNGCS Parole Clerk', 'CS Parole Clerk'];
const ADMIN_ROLES = ['System Administrator', 'Admin'];

function normalizeRole(role) {
  const map = {
    Admin: 'System Administrator',
    'CS Parole Clerk': 'PNGCS Parole Clerk',
    'Board Member': 'Parole Board Member',
    Secretariat: 'DJAG Parole Clerk',
  };
  return map[role] || role;
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function cleanupExpiredSessions() {
  await query('DELETE FROM api_sessions WHERE expires_at < NOW()');
}

async function login(identifier, password) {
  const loginId = identifier.trim().toLowerCase();
  const rows = await query(
    `SELECT u.*, c.password AS credential_password
     FROM users u
     INNER JOIN user_credentials c ON c.username = u.username
     WHERE u.status = 'Active'
       AND (LOWER(u.username) = ? OR LOWER(u.email) = ?)
     LIMIT 1`,
    [loginId, loginId]
  );

  if (!rows.length) return null;
  const row = rows[0];
  if (row.employment_status === 'Inactive' || row.account_status === 'Suspended') return null;
  if (row.credential_password !== password) return null;

  await cleanupExpiredSessions();
  const token = createToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000);

  await query(
    'INSERT INTO api_sessions (token, user_id, role, expires_at) VALUES (?, ?, ?, ?)',
    [token, row.id, row.role, toMysqlDatetime(expiresAt.toISOString())]
  );

  await query('UPDATE users SET last_login = NOW() WHERE id = ?', [row.id]);

  const user = mapUserRow(row);
  user.lastLogin = new Date().toISOString();
  return { token, user };
}

async function logout(token) {
  if (!token) return;
  await query('DELETE FROM api_sessions WHERE token = ?', [token]);
}

async function getSession(token) {
  if (!token) return null;
  await cleanupExpiredSessions();
  const rows = await query(
    `SELECT s.token, s.user_id, s.role, s.expires_at, u.*
     FROM api_sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at >= NOW() AND u.status = 'Active'
     LIMIT 1`,
    [token]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    token: row.token,
    userId: row.user_id,
    role: normalizeRole(row.role),
    user: mapUserRow(row),
  };
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.headers['x-pms-token'] || null;
}

function requireAuth(options = {}) {
  const { optional = false } = options;
  return async (req, res, next) => {
    if (!config.authRequired) {
      req.user = req.user || null;
      return next();
    }

    const token = extractToken(req);
    if (!token) {
      if (optional) return next();
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    try {
      const session = await getSession(token);
      if (!session) {
        if (optional) return next();
        return res.status(401).json({ success: false, error: 'Invalid or expired session.' });
      }
      req.token = token;
      req.user = session.user;
      req.userRole = session.role;
      next();
    } catch (err) {
      console.error('Auth middleware error', err);
      res.status(500).json({ success: false, error: 'Authentication check failed.' });
    }
  };
}

function requireRole(allowedRoles) {
  const normalizedAllowed = allowedRoles.map(normalizeRole);
  return (req, res, next) => {
    if (!config.authRequired) return next();
    const role = normalizeRole(req.userRole || req.user?.role);
    if (!normalizedAllowed.includes(role)) {
      return res.status(403).json({ success: false, error: 'You do not have permission for this action.' });
    }
    next();
  };
}

function canModifyPrisoners(user) {
  return PRISONER_MODIFY_ROLES.includes(normalizeRole(user?.role));
}

module.exports = {
  login,
  logout,
  getSession,
  extractToken,
  requireAuth,
  requireRole,
  canModifyPrisoners,
  normalizeRole,
  ADMIN_ROLES,
  PRISONER_MODIFY_ROLES,
};
