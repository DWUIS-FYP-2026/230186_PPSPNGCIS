const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../auth-service');
const { jsonParse, jsonStringify, mapPrisonerRow } = require('../mappers');
const { validateForm1 } = require('../form1-validation');

const router = express.Router({ mergeParams: true });

const FORM1_EDIT_ROLES = new Set(['PNGCS Parole Clerk', 'CS Parole Clerk', 'System Administrator', 'Admin']);
const SUPERVISOR_ROLES = new Set(['Jail Commander', 'System Administrator', 'Admin']);

async function loadApplication(appId) {
  const rows = await query('SELECT * FROM parole_applications WHERE id = ? LIMIT 1', [appId]);
  return rows[0] || null;
}

async function loadPrisoner(prisonerId) {
  const rows = await query('SELECT * FROM prisoners WHERE id = ? LIMIT 1', [prisonerId]);
  return rows[0] || null;
}

async function loadSettings() {
  const rows = await query('SELECT settings FROM system_settings WHERE id = 1 LIMIT 1');
  const settings = jsonParse(rows[0]?.settings, {});
  return {
    paroleEligibilityFraction: settings.paroleEligibilityFraction ?? 1 / 3,
    paroleEligibilityLabel: settings.paroleEligibilityLabel ?? 'One-third (1/3) of total sentence',
    ...settings,
  };
}

/** POST /api/applications/:id/form1 — save or submit Form 1 with server-side validation */
router.post('/:id/form1', requireAuth(), async (req, res) => {
  try {
    const appId = req.params.id;
    const { form1, submit = false, supervisorReview = false, draft = !submit } = req.body || {};
    if (!form1 || typeof form1 !== 'object') {
      return res.status(400).json({ success: false, error: 'form1 payload is required.' });
    }

    const appRow = await loadApplication(appId);
    if (!appRow) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const prisonerRow = await loadPrisoner(appRow.prisoner_id);
    if (!prisonerRow) {
      return res.status(404).json({ success: false, error: 'Linked prisoner record not found.' });
    }

    const userRole = req.user.role;
    const existingFormData = jsonParse(appRow.form_data, {});
    const existingForm1 = existingFormData.form1 || {};

    if (supervisorReview) {
      if (!SUPERVISOR_ROLES.has(userRole)) {
        return res.status(403).json({ success: false, error: 'Only supervisors may record Form 1 review.' });
      }
      if (existingForm1.status !== 'submitted') {
        return res.status(400).json({ success: false, error: 'Supervisory review requires a submitted Form 1.' });
      }
      existingFormData.form1 = {
        ...existingForm1,
        supervisorReview: form1.supervisorReview || form1,
      };
    } else {
      if (!FORM1_EDIT_ROLES.has(userRole)) {
        return res.status(403).json({ success: false, error: 'You do not have permission to edit Form 1.' });
      }
      if (existingForm1.status === 'submitted' && submit) {
        return res.status(400).json({ success: false, error: 'Form 1 has already been submitted.' });
      }

      const settings = await loadSettings();
      const validation = validateForm1(form1, prisonerRow, settings, { submit, draft, supervisorReview });
      if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.errors.join(' '), errors: validation.errors });
      }

      const merged = {
        ...existingForm1,
        ...form1,
        checklist: validation.checklist,
        prisonerId: prisonerRow.id,
        applicationId: appId,
      };

      if (submit) {
        merged.status = 'submitted';
        merged.submittedAt = new Date().toISOString();
        merged.submittedBy = req.user.id;
        merged.submittedByName = `${req.user.firstName} ${req.user.lastName}`;
      } else if (!merged.status) {
        merged.status = 'draft';
      }

      existingFormData.form1 = merged;
    }

    await query(
      'UPDATE parole_applications SET form_data = ?, updated_at = NOW() WHERE id = ?',
      [jsonStringify(existingFormData), appId]
    );

    await query(
      `INSERT INTO audit_logs
        (id, user_id, user_name, role, action, entity, entity_id, details, logged_at, success)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)`,
      [
        `AUD-${Date.now()}`,
        req.user.id,
        `${req.user.firstName} ${req.user.lastName}`,
        req.user.role,
        submit ? 'SUBMIT' : 'SAVE',
        'Form',
        existingFormData.form1?.formId || `${appId}-form1`,
        submit ? 'Form 1 — Parole Eligibility Screening submitted' : 'Form 1 draft saved',
      ]
    );

    res.json({
      success: true,
      data: {
        applicationId: appId,
        form1: existingFormData.form1,
        prisoner: mapPrisonerRow(prisonerRow),
      },
    });
  } catch (err) {
    console.error('POST /api/applications/:id/form1', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to save Form 1.' });
  }
});

module.exports = router;
