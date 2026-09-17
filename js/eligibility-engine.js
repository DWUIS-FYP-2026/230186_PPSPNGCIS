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
    'Draft', 'Submitted', 'Under DJAG Review', 'Returned for Correction',
    'Pending Commander Review', 'Pre-Parole Report Prepared',
  ];
  const HEARING_APP_STATUSES = ['Hearing Scheduled', 'Hearing In Progress'];
  const APPLICATION_PROCESS_RANK = {
    Draft: 0,
    Submitted: 1,
    'Returned for Correction': 1,
    'Under DJAG Review': 2,
    'Pending Commander Review': 3,
    'Pre-Parole Report Prepared': 4,
    'Hearing Scheduled': 5,
    'Hearing In Progress': 6,
    'Pending Board Review': 7,
    Deferred: 7,
    'Parole Granted': 8,
    'Parole Refused': 8,
    'Pending Approval': 9,
    Approved: 10,
    Refused: 10,
    Released: 11,
  };

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
    if (!apps.length && typeof PMSStorage?.getCanonicalApplication === 'function') {
      return PMSStorage.getCanonicalApplication(prisonerId);
    }
    if (!apps.length) return null;
    return apps.slice().sort((a, b) => {
      const rankDelta = (APPLICATION_PROCESS_RANK[b.status] || 0) - (APPLICATION_PROCESS_RANK[a.status] || 0);
      if (rankDelta) return rankDelta;
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    })[0];
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

    if (p.status === 'Released' || p.status === 'Released on Parole') return p.status === 'Released' ? 'Released' : 'Released on Parole';

    const app = getActiveApplication(p.id, applications);
    if (app) {
      if (app.status === 'Released' || app.releaseInfo?.authorizedAt) return 'Released on Parole';
      if (app.status === 'Approved' || app.status === 'Parole Granted' || app.status === 'Pending Approval') return 'Approved';
      if (app.status === 'Refused' || app.status === 'Parole Refused') return 'Refused';
      if (app.status === 'Pending Board Review') return 'Board Review';
      if (HEARING_APP_STATUSES.includes(app.status)) return 'Hearing Scheduled';
      if (ASSESSMENT_APP_STATUSES.includes(app.status) && app.status !== 'Draft') return 'Assessment in Progress';
      if (app.status === 'Deferred') return 'Eligible for Parole Application';
      if (app.status === 'Draft') {
        if (isEligibleByDate(p, progress)) return 'Eligible for Parole Application';
      }
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
    const apps = applications
      || (typeof PMSStorage !== 'undefined' ? PMSStorage.getParoleApplications({ includeArchived: true }) : []);
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
