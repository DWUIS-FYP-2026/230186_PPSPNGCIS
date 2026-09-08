const express = require('express');
const { query, pool } = require('../db');
const { mapDocumentRow } = require('../mappers');
const { requireAuth, requireRole, canModifyPrisoners, PRISONER_MODIFY_ROLES } = require('../auth-service');

const router = express.Router({ mergeParams: true });

router.use(requireAuth());

/** GET /api/prisoners/:prisonerId/documents */
router.get('/', async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM prisoner_documents WHERE prisoner_id = ? ORDER BY uploaded_at DESC`,
      [req.params.prisonerId]
    );
    res.json({ success: true, data: rows.map(mapDocumentRow) });
  } catch (err) {
    console.error('GET documents', err);
    res.status(500).json({ success: false, error: 'Failed to load documents.' });
  }
});

/** POST /api/prisoners/:prisonerId/documents */
router.post('/', requireRole(PRISONER_MODIFY_ROLES), async (req, res) => {
  try {
    if (!canModifyPrisoners(req.user)) {
      return res.status(403).json({ success: false, error: 'Only CS Parole Clerks may upload documents.' });
    }

    const prisonerRows = await query('SELECT id FROM prisoners WHERE id = ? OR prisoner_number = ? LIMIT 1', [
      req.params.prisonerId,
      req.params.prisonerId,
    ]);
    if (!prisonerRows.length) {
      return res.status(404).json({ success: false, error: 'Prisoner not found.' });
    }

    const body = req.body || {};
    if (!body.name) {
      return res.status(400).json({ success: false, error: 'Document name is required.' });
    }

    const id = body.id || `DOC-${Date.now()}`;
    const prisonerId = prisonerRows[0].id;

    await query(
      `INSERT INTO prisoner_documents
        (id, prisoner_id, name, mime_type, file_size, data_url, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        prisonerId,
        body.name,
        body.type || body.mimeType || null,
        body.size || body.fileSize || null,
        body.dataUrl || null,
        req.user?.id || null,
      ]
    );

    const rows = await query('SELECT * FROM prisoner_documents WHERE id = ? LIMIT 1', [id]);
    res.status(201).json({
      success: true,
      message: 'Document uploaded.',
      data: mapDocumentRow(rows[0]),
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'Document ID already exists.' });
    }
    console.error('POST documents', err);
    res.status(500).json({ success: false, error: 'Failed to upload document.' });
  }
});

/** DELETE /api/prisoners/:prisonerId/documents/:docId */
router.delete('/:docId', requireRole(PRISONER_MODIFY_ROLES), async (req, res) => {
  try {
    const prisonerRows = await query(
      'SELECT id FROM prisoners WHERE id = ? OR prisoner_number = ? LIMIT 1',
      [req.params.prisonerId, req.params.prisonerId]
    );
    if (!prisonerRows.length) {
      return res.status(404).json({ success: false, error: 'Prisoner not found.' });
    }
    const [result] = await pool.execute(
      'DELETE FROM prisoner_documents WHERE id = ? AND prisoner_id = ?',
      [req.params.docId, prisonerRows[0].id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Document not found.' });
    }
    res.json({ success: true, message: 'Document removed.' });
  } catch (err) {
    console.error('DELETE document', err);
    res.status(500).json({ success: false, error: 'Failed to delete document.' });
  }
});

module.exports = router;
