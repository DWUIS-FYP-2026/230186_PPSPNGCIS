/**
 * PMS Eligibility Engine — automatic parole eligibility dates and prisoner status derivation.
 */
const PMSEligibility = (() => {
  const LEGACY_STATUS_MAP = {
    'In Custody': 'Awaiting Eligibility',
    'Eligible for Parole': 'Eligible for Parole Application',
    'Parole Application Pending': 'Assessment in Progress',
    'On Parole': 'Approved',
  };

  const ASSESSMENT_APP_STATUSES = [
    'Draft', 'Submitted', 'Under DJAG Review', 'Returned for Correction', 'Pre-Parole Report Prepared',
  ];
  const HEARING_APP_STATUSES = ['Hearing Scheduled', 'Hearing In Progress', 'Pending Board Review'];

  function normalizeStatus(status) {
    return LEGACY_STATUS_MAP[status] || status;
  }

  function validateSentenceDates(ssd, sed) {
    if (!ssd || !sed) return { valid: false, error: 'Sentence Start Date and Sentence End Date are required.' };
    const start = new Date(ssd);
    const end = new Date(sed);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { valid: false, error: 'Invalid date format. Use a valid calendar date.' };
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    if (start >= end) return { valid: false, error: 'Sentence End Date must be after Sentence Start Date.' };
    return { valid: true, start, end };
  }

  function formatDateISO(d) {
    if (!d) return null;
    const x = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(x.getTime())) return null;
    return x.toISOString().split('T')[0];
  }

  function getActiveApplication(prisonerId, applications) {
    const apps = (applications || []).filter((a) => a.prisonerId === prisonerId);
    if (!apps.length) return null;
    const terminal = new Set(['Approved', 'Refused', 'Deferred']);
    const active = apps.filter((a) => !terminal.has(a.status));
    if (active.length) {
      return active.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
    }
    return apps.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
  }

  function isEligibleByDate(prisoner, progress) {
    if (!progress?.eligibilityDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const elig = new Date(progress.eligibilityDate);
    elig.setHours(0, 0, 0, 0);
    return today >= elig;
  }

  function derivePrisonerStatus(prisoner, context = {}) {
    const { applications = [], today = new Date() } = context;
    const p = { ...prisoner, status: normalizeStatus(prisoner.status) };
    const progress = typeof PMSStorage !== 'undefined' ? PMSStorage.getPrisonerProgress(p) : null;

    if (p.sentenceEndDate) {
      const sed = new Date(p.sentenceEndDate);
      sed.setHours(0, 0, 0, 0);
      const now = new Date(today);
      now.setHours(0, 0, 0, 0);
      if (now > sed) {
        if (p.status === 'Approved' || p.status === 'Released') return 'Released';
        return 'Sentence Completed';
      }
    }

    if (p.status === 'Released') return 'Released';

    const app = getActiveApplication(p.id, applications);
    if (app) {
      if (app.status === 'Approved' || app.boardDecision?.outcome === 'Approved') return 'Approved';
      if (app.status === 'Refused' || app.boardDecision?.outcome === 'Refused') return 'Rejected';
      if (HEARING_APP_STATUSES.includes(app.status)) return 'Hearing Scheduled';
      if (ASSESSMENT_APP_STATUSES.includes(app.status)) return 'Assessment in Progress';
      if (app.status === 'Deferred') return 'Eligible for Parole Application';
    }

    if (isEligibleByDate(p, progress)) return 'Eligible for Parole Application';
    return 'Awaiting Eligibility';
  }

  function enrichPrisoner(prisoner, context = {}) {
    if (!prisoner) return prisoner;
    const progress = PMSStorage.getPrisonerProgress(prisoner);
    prisoner.paroleEligibilityDate = formatDateISO(progress?.eligibilityDate);
    prisoner.sentenceDurationMonths = progress?.totalMonths ?? 0;
    prisoner.sentenceServedPercent = Math.round(progress?.percent ?? 0);
    const derived = derivePrisonerStatus(prisoner, context);
    prisoner.computedStatus = derived;
    return prisoner;
  }

  function syncPrisonerStatus(prisoner, actor, context = {}) {
    if (!prisoner) return prisoner;
    enrichPrisoner(prisoner, context);
    const previous = normalizeStatus(prisoner.status);
    const next = prisoner.computedStatus;
    if (previous !== next) {
      prisoner.status = next;
      prisoner.statusUpdatedAt = new Date().toISOString();
      if (actor?.id && typeof PMSStorage !== 'undefined' && PMSStorage.logAudit) {
        PMSStorage.logAudit(actor,
          'STATUS_AUTO', 'Prisoner', prisoner.id,
          `Status ${previous} → ${next} (eligibility: ${prisoner.paroleEligibilityDate || '—'})`,
          { previousValues: { status: previous }, newValues: { status: next, paroleEligibilityDate: prisoner.paroleEligibilityDate } });
      }
    }
    return prisoner;
  }

  function syncAllPrisoners(actor, applications) {
    const apps = applications || (typeof PMSStorage !== 'undefined' ? PMSStorage.getParoleApplications() : []);
    const prisoners = typeof PMSStorage !== 'undefined' ? PMSStorage.getPrisoners() : [];
    prisoners.forEach((p) => syncPrisonerStatus(p, actor, { applications: apps }));
    return prisoners;
  }

  return {
    normalizeStatus,
    validateSentenceDates,
    derivePrisonerStatus,
    enrichPrisoner,
    syncPrisonerStatus,
    syncAllPrisoners,
    LEGACY_STATUS_MAP,
  };
})();
