const express = require('express');

const config = require('../config');

const { loadAll, saveAll, seedIfEmpty } = require('../db-sync');

const { requireAuth, requireRole, ADMIN_ROLES } = require('../auth-service');



const router = express.Router();



/** GET /api/bootstrap — load full dataset (same shape as localStorage pms_mock_data_v4) */

router.get('/', requireAuth({ optional: true }), async (req, res) => {

  try {

    let data = await loadAll();

    if (!data.institutions.length) {

      const result = await seedIfEmpty(false);

      if (result.seeded) {
        data = await loadAll();
        return res.json({ success: true, seeded: true, data });
      }

    }



    if (config.authRequired && !req.user) {

      return res.status(401).json({ success: false, error: 'Authentication required.' });

    }



    res.json({ success: true, data });

  } catch (err) {

    console.error('GET /api/bootstrap', err);

    res.status(500).json({ success: false, error: err.message || 'Failed to load data from database.' });

  }

});



/** PUT /api/bootstrap — persist full dataset snapshot */

// Any authenticated staff user may push the snapshot: every client syncs the whole store
// after a change (board votes, hearing sessions), so admin-only writes would strand
// each member's data in their own browser.
router.put('/', requireAuth(), async (req, res) => {

  try {

    const payload = req.body?.data || req.body;

    if (!payload || !Array.isArray(payload.institutions)) {

      return res.status(400).json({ success: false, error: 'Invalid payload: expected institutions array.' });

    }

    await saveAll(payload, req.body?.demoPasswords || {});

    res.json({

      success: true,

      message: 'Database synchronized.',

      counts: {

        institutions: payload.institutions.length,

        users: (payload.users || []).length,

        prisoners: (payload.prisoners || []).length,

        applications: (payload.applications || []).length,

      },

    });

  } catch (err) {

    console.error('PUT /api/bootstrap', err);

    res.status(500).json({ success: false, error: err.message || 'Failed to save data to database.' });

  }

});



/** POST /api/bootstrap/seed — force re-seed demo data (admin only) */

router.post('/seed', requireAuth(), requireRole(ADMIN_ROLES), async (req, res) => {

  try {

    const force = req.body?.force === true;

    const result = await seedIfEmpty(force);

    const data = await loadAll();

    res.json({ success: true, ...result, data });

  } catch (err) {

    console.error('POST /api/bootstrap/seed', err);

    res.status(500).json({ success: false, error: err.message || 'Failed to seed database.' });

  }

});



module.exports = router;


