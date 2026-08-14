const express = require('express');
const { query } = require('../db');
const { mapPrisonerRow } = require('../mappers');
const { requireAuth, requireRole, PRISONER_MODIFY_ROLES } = require('../auth-service');

const router = express.Router();

router.use(requireAuth());

function validatePayload(body, { partial = false } = {}) {
  const errors = [];
  const required = partial
    ? []
    : ['firstName', 'lastName', 'institutionId', 'sentenceStartDate', 'sentenceEndDate'];
  required.forEach((field) => {
    if (!body[field] || String(body[field]).trim() === '') errors.push(`${field} is required.`);
  });
  if (body.sentenceStartDate && body.sentenceEndDate
    && new Date(body.sentenceStartDate) >= new Date(body.sentenceEndDate)) {
    errors.push('sentenceEndDate must be after sentenceStartDate.');
  }
  return errors;
}

async function nextPrisonerNumber() {
  const rows = await query(
    `SELECT prisoner_number FROM prisoners
     WHERE prisoner_number REGEXP '^PR-[0-9]+$'
     ORDER BY CAST(SUBSTRING(prisoner_number, 4) AS UNSIGNED) DESC LIMIT 1`
  );
  const last = rows[0]?.prisoner_number;
  const seq = last ? parseInt(last.slice(3), 10) + 1 : 1;
  return `PR-${String(seq).padStart(6, '0')}`;
}

router.get('/', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM prisoners ORDER BY created_at DESC');
    res.json({ success: true, data: rows.map(mapPrisonerRow) });
  } catch (err) {
    console.error('GET /api/prisoners', err);
    res.status(500).json({ success: false, error: 'Failed to load prisoners.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM prisoners WHERE id = ? OR prisoner_number = ? LIMIT 1',
      [req.params.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Prisoner not found.' });
    res.json({ success: true, data: mapPrisonerRow(rows[0]) });
  } catch (err) {
    console.error('GET /api/prisoners/:id', err);
    res.status(500).json({ success: false, error: 'Failed to load prisoner.' });
  }
});

router.post('/', requireRole(PRISONER_MODIFY_ROLES), async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validatePayload(body);
    if (errors.length) return res.status(400).json({ success: false, error: errors.join(' ') });

    const prisonerNumber = body.prisonerNumber || body.id || (await nextPrisonerNumber());
    const id = body.id || prisonerNumber;

    await query(
      `INSERT INTO prisoners
        (id, prisoner_number, institution_id, first_name, last_name, date_of_birth, gender,
         offense, sentence_start_date, sentence_end_date, status, documents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, prisonerNumber, body.institutionId.trim(), body.firstName.trim(), body.lastName.trim(),
        body.dateOfBirth || null, body.gender || null, body.offense?.trim() || null,
        body.sentenceStartDate, body.sentenceEndDate, body.status || 'Awaiting Eligibility',
        JSON.stringify(body.documents || []),
      ]
    );

    const rows = await query('SELECT * FROM prisoners WHERE id = ? LIMIT 1', [id]);
    res.status(201).json({
      success: true,
      message: 'Prisoner record created successfully.',
      data: mapPrisonerRow(rows[0]),
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'Prisoner ID already exists.' });
    }
    console.error('POST /api/prisoners', err);
    res.status(500).json({ success: false, error: 'Failed to create prisoner record.' });
  }
});

router.put('/:id', requireRole(PRISONER_MODIFY_ROLES), async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validatePayload(body, { partial: true });
    if (errors.length) return res.status(400).json({ success: false, error: errors.join(' ') });

    const existing = await query(
      'SELECT id FROM prisoners WHERE id = ? OR prisoner_number = ? LIMIT 1',
      [req.params.id, req.params.id]
    );
    if (!existing.length) return res.status(404).json({ success: false, error: 'Prisoner not found.' });

    await query(
      `UPDATE prisoners SET
        first_name = ?, last_name = ?, date_of_birth = ?, gender = ?,
        institution_id = ?, offense = ?, sentence_start_date = ?, sentence_end_date = ?,
        status = COALESCE(?, status), documents = COALESCE(?, documents)
       WHERE id = ?`,
      [
        body.firstName.trim(), body.lastName.trim(), body.dateOfBirth || null, body.gender || null,
        body.institutionId.trim(), body.offense?.trim() || null,
        body.sentenceStartDate, body.sentenceEndDate, body.status || null,
        body.documents ? JSON.stringify(body.documents) : null,
        existing[0].id,
      ]
    );

    const rows = await query('SELECT * FROM prisoners WHERE id = ? LIMIT 1', [existing[0].id]);
    res.json({ success: true, message: 'Prisoner record updated successfully.', data: mapPrisonerRow(rows[0]) });
  } catch (err) {
    console.error('PUT /api/prisoners/:id', err);
    res.status(500).json({ success: false, error: 'Failed to update prisoner record.' });
  }
});

module.exports = router;
