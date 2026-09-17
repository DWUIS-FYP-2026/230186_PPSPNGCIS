const express = require('express');
const { login, logout, getSession, extractToken, requestPasswordReset } = require('../auth-service');
const { mapUserRow } = require('../mappers');

const router = express.Router();

/** POST /api/auth/login */
router.post('/login', async (req, res) => {
  try {
    const { identifier, username, email, password } = req.body || {};
    const loginId = identifier || username || email;
    if (!loginId || !password) {
      return res.status(400).json({ success: false, error: 'Username/email and password are required.' });
    }

    const result = await login(loginId, password);
    if (!result) {
      return res.status(401).json({ success: false, error: 'Invalid credentials or inactive account.' });
    }

    res.json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (err) {
    console.error('POST /api/auth/login', err);
    res.status(500).json({ success: false, error: 'Login failed.' });
  }
});

/** POST /api/auth/password-reset-request */
router.post('/password-reset-request', async (req, res) => {
  try {
    const { identifier, username, email } = req.body || {};
    const loginId = identifier || username || email;
    if (!loginId) {
      return res.status(400).json({ success: false, error: 'Username or email is required.' });
    }
    await requestPasswordReset(loginId);
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/auth/password-reset-request', err);
    res.status(500).json({ success: false, error: 'Could not submit the reset request.' });
  }
});

/** POST /api/auth/logout */
router.post('/logout', async (req, res) => {
  try {
    await logout(extractToken(req));
    res.json({ success: true, message: 'Signed out.' });
  } catch (err) {
    console.error('POST /api/auth/logout', err);
    res.status(500).json({ success: false, error: 'Logout failed.' });
  }
});

/** GET /api/auth/me */
router.get('/me', async (req, res) => {
  try {
    const session = await getSession(extractToken(req));
    if (!session) {
      return res.status(401).json({ success: false, error: 'Not authenticated.' });
    }
    res.json({ success: true, user: mapUserRow(session.user) });
  } catch (err) {
    console.error('GET /api/auth/me', err);
    res.status(500).json({ success: false, error: 'Session check failed.' });
  }
});

module.exports = router;
