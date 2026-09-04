const express = require('express');
const { requireAuth } = require('../auth-service');
const { buildEventsForUser, loadCalendarPayload } = require('../calendar-events');

const router = express.Router();

/** GET /api/calendar/events — user-specific upcoming calendar events */
router.get('/events', requireAuth(), async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const { user, data } = await loadCalendarPayload(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const events = buildEventsForUser(user, data);
    res.json({ success: true, events });
  } catch (err) {
    console.error('GET /api/calendar/events', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to load calendar events.' });
  }
});

module.exports = router;
