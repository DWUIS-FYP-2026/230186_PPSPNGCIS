/**
 * PMS Form 1 — server-side validation (mirrors js/form1-validation.js).
 */
const CRITERIA = [
  { id: 'sentence_threshold', label: 'Minimum sentence served (one-half / 1/2 of total sentence)', auto: true },
  { id: 'sentence_dates_valid', label: 'Valid sentence dates (SSD before SED)', auto: true },
  { id: 'prisoner_status', label: 'Prisoner status permits parole eligibility screening', auto: true },
  { id: 'no_active_detainers', label: 'No active detainers or holds preventing parole consideration', auto: false },
  { id: 'no_disqualifying_disciplinary', label: 'No disqualifying disciplinary record for current sentence', auto: false },
  { id: 'statutory_exemption_clear', label: 'Not subject to statutory exemption from parole', auto: false },
];

function computeProgress(prisoner, settings) {
  const fraction = settings?.paroleEligibilityFraction ?? 1 / 2;
  if (!prisoner?.sentence_start_date || !prisoner?.sentence_end_date) {
    return { percent: 0, eligible: false, eligibilityDate: null, totalMonths: 0 };
  }
  const start = new Date(prisoner.sentence_start_date);
  const end = new Date(prisoner.sentence_end_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const totalMonths = Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
  const servedMonths = Math.max(0, (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth()));
  const percent = totalMonths > 0 ? Math.min(100, (servedMonths / totalMonths) * 100) : 0;
  const elig = new Date(start);
  elig.setMonth(elig.getMonth() + Math.floor(totalMonths * fraction));
  const eligible = today >= elig;
  return {
    percent,
    eligible,
    eligibilityDate: elig.toISOString().split('T')[0],
    totalMonths,
  };
}

function computeAutoCriteria(prisoner, progress, settings) {
  const results = {};
  const thresholdPct = ((settings?.paroleEligibilityFraction ?? 1 / 2) * 100).toFixed(1);

  results.sentence_threshold = {
    result: progress?.eligible ? 'pass' : 'fail',
    verification: 'PMS eligibility engine',
    comments: progress?.eligible
      ? `Prisoner has served ${(progress.percent || 0).toFixed(1)}% (threshold: ${thresholdPct}%).`
      : `Prisoner has served ${(progress?.percent || 0).toFixed(1)}%; below threshold.`,
  };

  const datesValid = !!(prisoner?.sentence_start_date && prisoner?.sentence_end_date
    && new Date(prisoner.sentence_start_date) < new Date(prisoner.sentence_end_date));
  results.sentence_dates_valid = {
    result: datesValid ? 'pass' : 'fail',
    verification: 'PMS prisoner record',
    comments: datesValid ? 'SSD and SED are valid.' : 'Sentence dates missing or invalid.',
  };

  const allowed = ['Awaiting Eligibility', 'Eligible for Parole Application', 'Assessment in Progress'];
  const statusOk = allowed.includes(prisoner?.status) || progress?.eligible;
  results.prisoner_status = {
    result: statusOk ? 'pass' : 'fail',
    verification: 'PMS prisoner status',
    comments: `Current status: ${prisoner?.status || '—'}.`,
  };

  return results;
}

function validateForm1(form1, prisoner, settings, { submit = false, draft = false, supervisorReview = false } = {}) {
  const errors = [];
  if (!prisoner?.id) errors.push('A valid prisoner record must be linked.');

  if (supervisorReview) return { valid: errors.length === 0, errors, checklist: form1?.checklist || {} };

  const progress = computeProgress(prisoner, settings);
  const auto = computeAutoCriteria(prisoner, progress, settings);
  const checklist = { ...(form1?.checklist || {}) };

  CRITERIA.forEach((c) => {
    if (c.auto && auto[c.id]) {
      checklist[c.id] = { ...auto[c.id], criterion: c.label, source: 'system' };
    }
  });

  if (!draft) {
    CRITERIA.filter((c) => !c.auto).forEach((c) => {
      const row = checklist[c.id];
      if (!row?.result) errors.push(`Eligibility checklist: "${c.label}" must be verified.`);
    });
    if (!form1?.eligibilityOutcome) errors.push('Officer eligibility recommendation is required.');
    if (!form1?.recommendationReason?.trim()) errors.push('Recommendation reason is required.');
    if (!form1?.screeningDate) errors.push('Screening date is required.');
    if (!form1?.officerName?.trim()) errors.push('Officer name is required.');
    if (submit) {
      CRITERIA.forEach((c) => {
        const row = checklist[c.id];
        if (form1?.eligibilityOutcome === 'eligible' && (!row || !['pass', 'na'].includes(row.result))) {
          errors.push(`Cannot submit as eligible: "${c.label}" must pass or be N/A.`);
        }
      });
      if (form1?.statutoryExemptionApplicable === 'yes' && form1?.eligibilityOutcome === 'eligible') {
        errors.push('Cannot recommend eligible when a statutory exemption applies.');
      }
    }
  }

  return { valid: errors.length === 0, errors, checklist };
}

function isForm1Complete(form1) {
  return !!(form1?.status === 'submitted' && form1?.eligibilityOutcome && form1?.officerName);
}

module.exports = {
  CRITERIA,
  computeProgress,
  validateForm1,
  isForm1Complete,
};
