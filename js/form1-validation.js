/**
 * PMS Form 1 — client validation (mirrors server/src/form1-validation.js).
 */
const PMSForm1Validation = (() => {
  const CRITERIA = [
    { id: 'sentence_threshold', label: 'Minimum sentence served (one-third / 1/3 of total sentence)', auto: true },
    { id: 'sentence_dates_valid', label: 'Valid sentence dates (SSD before SED)', auto: true },
    { id: 'prisoner_status', label: 'Prisoner status permits parole eligibility screening', auto: true },
    { id: 'no_active_detainers', label: 'No active detainers or holds preventing parole consideration', auto: false },
    { id: 'no_disqualifying_disciplinary', label: 'No disqualifying disciplinary record for current sentence', auto: false },
    { id: 'statutory_exemption_clear', label: 'Not subject to statutory exemption from parole', auto: false },
  ];

  function computeAutoCriteria(prisoner, progress) {
    const results = {};
    results.sentence_threshold = {
      result: progress?.eligible ? 'pass' : 'fail',
      verification: 'PMS eligibility engine',
      comments: progress?.eligible
        ? `Prisoner has served ${(progress.percent || 0).toFixed(1)}%.`
        : `Prisoner has served ${(progress?.percent || 0).toFixed(1)}%; below threshold.`,
    };
    const datesValid = !!(prisoner?.sentenceStartDate && prisoner?.sentenceEndDate
      && new Date(prisoner.sentenceStartDate) < new Date(prisoner.sentenceEndDate));
    results.sentence_dates_valid = {
      result: datesValid ? 'pass' : 'fail',
      verification: 'PMS prisoner record',
      comments: datesValid ? 'SSD and SED are valid.' : 'Sentence dates missing or invalid.',
    };
    const allowed = ['Awaiting Eligibility', 'Eligible for Parole Application', 'Eligible for Parole', 'Assessment in Progress'];
    const statusOk = allowed.includes(prisoner?.status) || progress?.eligible;
    results.prisoner_status = {
      result: statusOk ? 'pass' : 'fail',
      verification: 'PMS prisoner status',
      comments: `Current status: ${prisoner?.status || '—'}.`,
    };
    return results;
  }

  function validateSectionsForm(form1, { submit = false } = {}) {
    const errors = [];
    const secE = form1.sections?.E || form1.sectionE;
    if (submit) {
      if (!secE?.prisoner_consent && !secE?.prisonerConsent) {
        errors.push('Prisoner consent is required (Section E).');
      }
      if (!secE?.consent_date && !secE?.consentDate) {
        errors.push('Consent date is required (Section E).');
      }
    }
    return errors;
  }

  function validateForm1(form1, prisoner, progress, settings, { submit = false, draft = false, supervisorReview = false } = {}) {
    const errors = [];
    if (!prisoner?.id) errors.push('A valid prisoner record must be linked.');
    if (supervisorReview) return { valid: !errors.length, errors, checklist: form1?.checklist || {} };

    const auto = computeAutoCriteria(prisoner, progress);
    const checklist = { ...(form1?.checklist || {}) };
    CRITERIA.forEach((c) => {
      if (c.auto && auto[c.id]) {
        checklist[c.id] = { ...auto[c.id], criterion: c.label, source: 'system' };
      }
    });

    if (form1?.sections) {
      errors.push(...validateSectionsForm(form1, { submit }));
      if (draft) return { valid: !errors.length, errors, checklist };
      if (submit && errors.length) return { valid: false, errors, checklist };
      if (submit) return { valid: true, errors: [], checklist };
    }

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

    errors.push(...validateSectionsForm(form1, { submit }));
    return { valid: errors.length === 0, errors, checklist };
  }

  function isForm1Complete(form1) {
    if (!form1) return false;
    if (form1.status === 'submitted' || form1.status === 'verified') return true;
    const secE = form1.sections?.E || form1.sectionE;
    if ((secE?.prisoner_consent || secE?.prisonerConsent) && (form1.submittedAt || form1.status === 'submitted')) {
      return true;
    }
    return !!(form1.status === 'submitted' && form1.eligibilityOutcome && form1.officerName);
  }

  return { CRITERIA, validateForm1, isForm1Complete };
})();
