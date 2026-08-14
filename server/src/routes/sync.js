const express = require('express');
const { loadAll, saveAll, seedIfEmpty } = require('../db-sync');
const { getEntityCounts } = require('../sync-status');
const { ensureSchema, SCHEMA_VERSION } = require('../schema-sync');

const router = express.Router();

/** GET /api/sync/status — entity counts + schema version */
router.get('/status', async (_req, res) => {
  try {
    const counts = await getEntityCounts();
    res.json({
      success: true,
      schemaVersion: SCHEMA_VERSION,
      counts,
      complete: counts.institutions >= 19,
    });
  } catch (err) {
    console.error('GET /api/sync/status', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/sync/schema — ensure tables/columns exist */
router.post('/schema', async (_req, res) => {
  try {
    const result = await ensureSchema();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('POST /api/sync/schema', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/sync/full — push full client snapshot (alias for PUT /api/bootstrap) */
router.post('/full', async (req, res) => {
  try {
    const payload = req.body?.data || req.body;
    if (!payload || !Array.isArray(payload.institutions)) {
      return res.status(400).json({ success: false, error: 'Invalid payload: expected institutions array.' });
    }
    await saveAll(payload, req.body?.demoPasswords || {});
    const counts = await getEntityCounts();
    res.json({ success: true, message: 'Full database sync complete.', counts });
  } catch (err) {
    console.error('POST /api/sync/full', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/sync/seed — seed all demo entities */
router.post('/seed', async (req, res) => {
  try {
    await ensureSchema();
    const result = await seedIfEmpty(req.body?.force === true);
    const data = await loadAll();
    const counts = await getEntityCounts();
    res.json({ success: true, ...result, counts, data });
  } catch (err) {
    console.error('POST /api/sync/seed', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
