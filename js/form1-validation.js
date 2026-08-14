/**
 * PMS Form 1 — Parole Eligibility Screening validation and criteria (client).
 * Uses existing PMS eligibility rule: one-third (1/3) of total sentence served.
 */
const PMSForm1Validation = (() => {
  const CRITERIA = [
    {
      id: 'sentence_threshold',
      label: 'Minimum sentence served (one-third / 1/3 of total sentence)',
      source: 'system',
      auto: true,
    },
    {
      id: 'sentence_dates_valid',
      label: 'Valid sentence dates (SSD before SED)',
      source: 'system',
      auto: true,
    },
    {
      id: 'prisoner_status',
      label: 'Prisoner status permits parole eligibility screening',
      source: 'system',
      auto: true,
    },
    {
      id: 'no_active_detainers',
      label: 'No active detainers or holds preventing parole consideration',
      source: 'officer',
      auto: false,
    },
    {
      id: 'no_disqualifying_disciplinary',
      label: 'No disqualifying disciplinary record for current sentence',
      source: 'officer',
      auto: false,
    },
    {
      id: 'statutory_exemption_clear',
      label: 'Not subject to statutory exemption from parole',
      source: 'officer',
      auto: false,
    },
  ];

  function computeAutoCriteria(prisoner, progress, settings) {
    const results = {};
    const thresholdPct = ((settings?.paroleEligibilityFraction ?? 1 / 3) * 100).toFixed(1);

    results.sentence_threshold = {
      result: progress?.eligible ? 'pass' : 'fail',
      verification: 'PMS eligibility engine',
      comments: progress?.eligible
        ? `Prisoner has served ${(progress.percent || 0).toFixed(1)}% (threshold: ${thresholdPct}% — ${settings?.paroleEligibilityLabel || 'one-third rule'}).`
        : `Prisoner has served ${(progress?.percent || 0).toFixed(1)}%; eligibility date: ${progress?.eligibilityDate || '—'}.`,
    };

    const datesValid = !!(prisoner?.sentenceStartDate && prisoner?.sentenceEndDate
      && new Date(prisoner.sentenceStartDate) < new Date(prisoner.sentenceEndDate));
    results.sentence_dates_valid = {
      result: datesValid ? 'pass' : 'fail',
      verification: 'PMS prisoner record',
      comments: datesValid ? 'SSD and SED are valid.' : 'Sentence dates missing or invalid.',
    };

    const allowedStatuses = ['Awaiting Eligibility', 'Eligible for Parole Application', 'Assessment in Progress'];
    const normalized = prisoner?.status || '';
    const statusOk = allowedStatuses.includes(normalized) || progress?.eligible;
    results.prisoner_status = {
      result: statusOk ? 'pass' : 'fail',
      verification: 'PMS prisoner status',
      comments: `Current status: ${normalized || '—'}.`,
    };

    return results;
  }

  function mergeChecklist(form1, autoCriteria) {
    const checklist = { ...(form1?.checklist || {}) };
    CRITERIA.forEach((c) => {
      if (c.auto && autoCriteria[c.id]) {
        checklist[c.id] = {
          ...autoCriteria[c.id],
          criterion: c.label,
          source: c.source,
          verifiedAt: new Date().toISOString(),
        };
      } else if (checklist[c.id]) {
        checklist[c.id].criterion = c.label;
        checklist[c.id].source = c.source;
      }
    });
    return checklist;
  }

  function isForm1Complete(form1) {
    if (!form1 || form1.status !== 'submitted') return false;
    if (!form1.eligibilityOutcome || !form1.screeningDate) return false;
    if (!form1.officerId || !form1.officerName) return false;
    const checklist = form1.checklist || {};
    return CRITERIA.every((c) => {
      const row = checklist[c.id];
      return row && (row.result === 'pass' || row.result === 'na');
    });
  }

  function validateForm1(form1, prisoner, progress, settings, { submit = false, draft = false } = {}) {
    const errors = [];
    if (!prisoner?.id) errors.push('A valid prisoner record must be selected.');

    const auto = computeAutoCriteria(prisoner, progress, settings);
    const checklist = mergeChecklist(form1, auto);

    if (!draft) {
      CRITERIA.filter((c) => !c.auto).forEach((c) => {
        const row = checklist[c.id];
        if (!row?.result) errors.push(`Eligibility checklist: "${c.label}" must be verified.`);
        else if (!['pass', 'fail', 'na'].includes(row.result)) {
          errors.push(`Eligibility checklist: invalid result for "${c.label}".`);
        }
      });

      if (form1?.statutoryExemptionApplicable === 'yes') {
        if (!form1.statutoryExemptionType?.trim()) errors.push('Statutory exemption type is required when exemption applies.');
        if (!form1.statutoryExemptionReason?.trim()) errors.push('Statutory exemption reason is required.');
      }

      if (!form1?.eligibilityOutcome) errors.push('Officer eligibility recommendation is required.');
      if (!form1?.recommendationReason?.trim()) errors.push('Recommendation reason is required.');
      if (!form1?.screeningDate) errors.push('Screening date is required.');
      if (!form1?.officerName?.trim()) errors.push('Officer name is required.');

      if (submit) {
        CRITERIA.forEach((c) => {
          const row = checklist[c.id];
          if (!row || !['pass', 'na'].includes(row.result)) {
            if (form1?.eligibilityOutcome === 'eligible') {
              errors.push(`Cannot submit as eligible: "${c.label}" must pass or be marked N/A.`);
            }
          }
        });
        if (form1?.statutoryExemptionApplicable === 'yes' && form1?.eligibilityOutcome === 'eligible') {
          errors.push('Cannot recommend eligible when a statutory exemption applies.');
        }
      }
    }

    return { valid: errors.length === 0, errors, checklist, autoCriteria: auto };
  }

  return {
    CRITERIA,
    computeAutoCriteria,
    mergeChecklist,
    isForm1Complete,
    validateForm1,
  };
})();
