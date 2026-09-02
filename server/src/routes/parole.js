const express = require('express');
const { requireAuth, requireRole, ADMIN_ROLES } = require('../auth-service');
const paroleService = require('../parole/service');
const { executeJob } = require('../jobs/parole-eligibility-job');
const { ACTION_ROLES, assertRole } = require('../parole/rbac');

const router = express.Router();

router.use(requireAuth());

/** GET /api/parole/eligible — CS Parole Clerk eligible list (spec alias) */
router.get('/eligible', async (req, res) => {
  try {
    const data = await paroleService.getEligibleList(req.user);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.message.includes('permission') ? 403 : 400).json({ success: false, error: err.message });
  }
});

router.get('/eligible-list', async (req, res) => {
  try {
    const data = await paroleService.getEligibleList(req.user);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.message.includes('permission') ? 403 : 400).json({ success: false, error: err.message });
  }
});

/** POST /api/parole/generate-form1/:prisonerId — generate Form 1 Sections A–E */
router.post('/generate-form1/:prisonerId', async (req, res) => {
  try {
    const data = await paroleService.generateForm1ForPrisoner(req.params.prisonerId, req.user, req.body || {});
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(err.message.includes('permission') ? 403 : 400).json({ success: false, error: err.message });
  }
});

/** POST /api/parole/record-consent/:applicationId */
router.post('/record-consent/:applicationId', async (req, res) => {
  try {
    const { consent, notes, signature, consentDate } = req.body || {};
    const data = await paroleService.recordConsent(req.params.applicationId, req.user, {
      consent, notes, signature, consentDate,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/** POST /api/parole/submit-detainee-report/:applicationId */
router.post('/submit-detainee-report/:applicationId', async (req, res) => {
  try {
    const data = await paroleService.submitDetaineeReport(req.params.applicationId, req.user, req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.message.includes('Only CS Officers') ? 403 : 400).json({ success: false, error: err.message });
  }
});

/** POST /api/parole/submit-preparole-report/:applicationId */
router.post('/submit-preparole-report/:applicationId', async (req, res) => {
  try {
    const data = await paroleService.submitPreParoleReport(req.params.applicationId, req.user, req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.message.includes('Only Probation') ? 403 : 400).json({ success: false, error: err.message });
  }
});

/** POST /api/parole/schedule-hearing/:applicationId */
router.post('/schedule-hearing/:applicationId', async (req, res) => {
  try {
    const data = await paroleService.scheduleHearing(req.params.applicationId, req.user, req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/** POST /api/parole/record-vote/:hearingId */
router.post('/record-vote/:hearingId', async (req, res) => {
  try {
    const { vote, observations } = req.body || {};
    const data = await paroleService.recordVoteByHearing(req.params.hearingId, req.user, { vote, observations });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/** POST /api/parole/finalize-decision/:applicationId */
router.post('/finalize-decision/:applicationId', async (req, res) => {
  try {
    const data = await paroleService.finalizeDecision(req.params.applicationId, req.user, req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/** GET /api/parole/form1/:applicationId/download — printable Form 1 (PDF via browser print) */
router.get('/form1/:applicationId/download', async (req, res) => {
  try {
    const { html, filename } = await paroleService.downloadForm1(req.params.applicationId, req.user);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(html);
  } catch (err) {
    res.status(err.message.includes('permission') ? 403 : 404).json({ success: false, error: err.message });
  }
});

/** GET /api/parole/form1/:applicationId — JSON Form 1 payload */
router.get('/form1/:applicationId', async (req, res) => {
  try {
    const doc = await paroleService.getDocument(req.params.applicationId, 'form1');
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

/* ---- Legacy / nested application routes ---- */

router.post('/applications', async (req, res) => {
  try {
    const { prisonerId } = req.body || {};
    if (!prisonerId) return res.status(400).json({ success: false, error: 'prisonerId is required.' });
    const application = await paroleService.ensureAct1991Application(prisonerId, req.user);
    res.status(201).json({ success: true, data: application });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/applications/:id', async (req, res) => {
  try {
    const data = await paroleService.getApplicationDetail(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

router.post('/applications/:id/recalculate-eligibility', async (req, res) => {
  try {
    const data = await paroleService.recalculateApplicationEligibility(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/applications/:id/initiate-consent', async (req, res) => {
  try {
    const data = await paroleService.initiateConsentPhase(req.params.id, req.user, req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/applications/:id/submit-consent', async (req, res) => {
  try {
    const { consent, notes, signature, consentDate } = req.body || {};
    const data = await paroleService.recordConsent(req.params.id, req.user, { consent, notes, signature, consentDate });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/applications/:id/detainee-report', async (req, res) => {
  try {
    const data = await paroleService.submitDetaineeReport(req.params.id, req.user, req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.message.includes('Only CS Officers') ? 403 : 400).json({ success: false, error: err.message });
  }
});

router.post('/applications/:id/pre-parole-report', async (req, res) => {
  try {
    const data = await paroleService.submitPreParoleReport(req.params.id, req.user, req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.message.includes('Only Probation') ? 403 : 400).json({ success: false, error: err.message });
  }
});

router.post('/applications/:id/schedule-hearing', async (req, res) => {
  try {
    const data = await paroleService.scheduleHearing(req.params.id, req.user, req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/applications/:id/record-vote', async (req, res) => {
  try {
    const { vote, observations } = req.body || {};
    const data = await paroleService.recordVote(req.params.id, req.user, { vote, observations });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/applications/:id/finalize-decision', async (req, res) => {
  try {
    const data = await paroleService.finalizeDecision(req.params.id, req.user, req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/applications/:id/documents/:type', async (req, res) => {
  try {
    const doc = await paroleService.getDocument(req.params.id, req.params.type);
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

router.post('/jobs/run-eligibility-check', requireRole(ADMIN_ROLES), async (req, res) => {
  try {
    assertRole(req.user, ACTION_ROLES.runEligibilityJob, 'run eligibility job');
    const results = await executeJob();
    res.json({ success: true, data: { promoted: results.length, cases: results } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
