const express = require('express');
const { query } = require('../db');
const { mapInstitutionRow } = require('../mappers');
const { requireAuth } = require('../auth-service');

const router = express.Router();

router.use(requireAuth());

router.get('/', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM institutions ORDER BY name');
    res.json({ success: true, data: rows.map(mapInstitutionRow) });
  } catch (err) {
    console.error('GET /api/institutions', err);
    res.status(500).json({ success: false, error: 'Failed to load institutions.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM institutions WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Institution not found.' });
    res.json({ success: true, data: mapInstitutionRow(rows[0]) });
  } catch (err) {
    console.error('GET /api/institutions/:id', err);
    res.status(500).json({ success: false, error: 'Failed to load institution.' });
  }
});

module.exports = router;
