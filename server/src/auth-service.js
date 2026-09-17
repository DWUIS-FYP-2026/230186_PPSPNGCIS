const crypto = require('crypto');
const { query } = require('./db');
const config = require('./config');
const { mapUserRow, toMysqlDatetime } = require('./mappers');

const PRISONER_MODIFY_ROLES = ['CS Parole Clerk'];
const ADMIN_ROLES = ['System Administrator', 'Admin'];

function normalizeRole(role) {
  const map = {
    Admin: 'System Administrator',
    'PNGCS Parole Clerk': 'CS Parole Clerk',
    'PNG Parole Clerk': 'CS Parole Clerk',
    'Parole Board Member': 'DJAG Secretary',
    'Board Member': 'DJAG Secretary',
    Secretariat: 'DJAG Parole Clerk',
  };
  return map[role] || role;
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

// expires_at is written as a UTC datetime (see toMysqlDatetime), so compare against
// UTC_TIMESTAMP() — NOW() is server-local and would expire sessions instantly east of UTC.
async function cleanupExpiredSessions() {
  await query('DELETE FROM api_sessions WHERE expires_at < UTC_TIMESTAMP()');
}

function hashPassword(password) {
  let h = 5381;
  for (let i = 0; i < password.length; i += 1) {
    h = ((h << 5) + h) ^ password.charCodeAt(i);
  }
  return `sha1:${(h >>> 0).toString(16)}`;
}

function verifyPassword(stored, password) {
  if (!stored) return false;
  if (stored.startsWith('sha1:')) return stored === hashPassword(password);
  return stored === password;
}

async function findUserRowsByLogin(loginId, { activeOnly = false } = {}) {
  const id = String(loginId || '').trim().toLowerCase();
  if (!id) return [];
  const activeClause = activeOnly ? ` AND u.status = 'Active'` : '';
  const exact = await query(
    `SELECT u.*, c.password AS credential_password
     FROM users u
     LEFT JOIN user_credentials c ON c.username = u.username
     WHERE (LOWER(u.username) = ? OR LOWER(u.email) = ?)${activeClause}`,
    [id, id]
  );
  if (exact.length) return exact;
  if (id.includes('@')) return [];
  return query(
    `SELECT u.*, c.password AS credential_password
     FROM users u
     LEFT JOIN user_credentials c ON c.username = u.username
     WHERE (LOWER(u.username) LIKE ? OR LOWER(u.email) LIKE ?)${activeClause}`,
    [`${id}@%`, `${id}@%`]
  );
}

async function login(identifier, password) {
  const loginId = identifier.trim().toLowerCase();
  const rows = await findUserRowsByLogin(loginId, { activeOnly: true });
  if (rows.length !== 1) return null;
  const row = rows[0];
  if (row.employment_status === 'Inactive' || row.account_status === 'Suspended') return null;
  if (!verifyPassword(row.credential_password, password)) return null;

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
     WHERE s.token = ? AND s.expires_at >= UTC_TIMESTAMP() AND u.status = 'Active'
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

async function requestPasswordReset(identifier) {
  const loginId = String(identifier || '').trim().toLowerCase();
  if (!loginId) return { ok: true };
  const rows = await findUserRowsByLogin(loginId);
  if (rows.length !== 1) return { ok: true };
  const user = rows[0];
  const existing = await query(
    `SELECT id FROM notifications
     WHERE type = 'system' AND is_resolved = 0 AND title = 'Password Reset Request'
       AND message LIKE ?
     LIMIT 1`,
    [`%${user.username}%`]
  );
  if (existing.length) return { ok: true };
  const id = `NOT-${crypto.randomBytes(4).toString('hex')}`;
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const meta = JSON.stringify({ linkPanel: 'users', dedupeKey: `password-reset:${user.id}` });
  await query(
    `INSERT INTO notifications
      (id, type, title, message, recipient_role, institution_id, is_read, is_resolved, meta, created_at)
     VALUES (?, 'system', 'Password Reset Request', ?, 'System Administrator', ?, 0, 0, ?, ?)`,
    [
      id,
      `${name} (${user.username}) requested a password reset.`,
      user.institution_id || null,
      meta,
      toMysqlDatetime(new Date().toISOString()),
    ]
  );
  return { ok: true };
}

module.exports = {
  login,
  logout,
  getSession,
  extractToken,
  requireAuth,
  requireRole,
  canModifyPrisoners,
  requestPasswordReset,
  normalizeRole,
  ADMIN_ROLES,
  PRISONER_MODIFY_ROLES,
};
