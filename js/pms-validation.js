/**
 * PMS Validation — shared client-side validation for forms, dates, files, and business rules.
 */
const PMSValidation = (() => {
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

  function parseDate(v) {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function required(value, label) {
    if (value == null || String(value).trim() === '') return `${label} is required.`;
    return null;
  }

  function percentage(value, label = 'Score') {
    const n = Number(value);
    if (Number.isNaN(n)) return `${label} must be a number.`;
    if (n < 0 || n > 100) return `${label} must be between 0 and 100.`;
    return null;
  }

  function validateSentenceDates(ssd, sed) {
    const start = parseDate(ssd);
    const end = parseDate(sed);
    const errors = [];
    if (!start) errors.push('Sentence start date (SSD) is invalid or missing.');
    if (!end) errors.push('Sentence end date (SED) is invalid or missing.');
    if (start && end && end <= start) errors.push('Sentence end date must be after sentence start date.');
    return { valid: !errors.length, errors };
  }

  function validateHearingDate(scheduledDate, app) {
    const d = parseDate(scheduledDate);
    if (!d) return { valid: false, errors: ['Hearing date is invalid.'] };
    const errors = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d < today) errors.push('Hearing date cannot be in the past.');
    if (app && typeof PMSStorage !== 'undefined') {
      const info = PMSStorage.getHearingDeadlineInfo(app);
      if (info?.deadlineAt && d > new Date(info.deadlineAt)) {
        errors.push(`Hearing must be scheduled within the ${PMSStorage.HEARING_DEADLINE_DAYS || 14}-day deadline.`);
      }
    }
    return { valid: !errors.length, errors };
  }

  function validateFile(file) {
    const errors = [];
    if (!file) return { valid: true, errors };
    if (file.size > MAX_FILE_BYTES) errors.push(`File "${file.name}" exceeds the 5 MB limit.`);
    if (file.type && !ALLOWED_FILE_TYPES.includes(file.type)) {
      errors.push(`File type "${file.type}" is not permitted. Use PDF, JPEG, PNG, or Word documents.`);
    }
    return { valid: !errors.length, errors };
  }

  function findDuplicatePrisoner(prisoner, prisoners) {
    const num = (prisoner.prisonerNumber || '').trim().toLowerCase();
    const idNum = (prisoner.identificationNumber || prisoner.extraAttributes?.identificationNumber || '').trim().toLowerCase();
    return prisoners.find((p) => {
      if (prisoner.id && p.id === prisoner.id) return false;
      if (num && p.prisonerNumber?.trim().toLowerCase() === num) return true;
      const otherId = (p.identificationNumber || p.extraAttributes?.identificationNumber || '').trim().toLowerCase();
      return idNum && otherId && idNum === otherId;
    }) || null;
  }

  function findDuplicateCase(prisonerId, applications, excludeId = null) {
    return applications.find((a) => a.prisonerId === prisonerId && !['Approved', 'Refused', 'Released', 'Deferred'].includes(a.status) && a.id !== excludeId) || null;
  }

  function validateForm2Section(sectionKey, data) {
    const errors = [];
    if (!data) return { valid: false, errors: ['Section data is missing.'] };
    const key = String(sectionKey || '').toLowerCase();
    const isDar = key === 'ddr' || key === 'dar';
    const isPpr = key === 'ppr';
    if (isDar) {
      errors.push(required(data.officerName || data.darOfficer, 'Officer name'));
      errors.push(required(
        data.institutionName || data.facilityName || data.pprFacility,
        'Institution'
      ));
      errors.push(required(
        data.assessmentSummary
          || data.conductLog
          || data.summary
          || data.trainingProgress
          || [data.conductLog, data.trainingProgress, data.recidivismNotes].filter(Boolean).join('\n\n'),
        'Assessment summary'
      ));
    }
    if (isPpr) {
      errors.push(required(data.clerkName || data.pprOfficer, 'Clerk name'));
      errors.push(required(
        data.personalParticulars
          || data.pprFamilyHistory
          || data.victimStatements
          || data.communitySummary
          || data.communityStatements,
        'Personal particulars review'
      ));
    }
    if (data.confirmed !== true) errors.push('Section must be confirmed before submission.');
    return { valid: !errors.filter(Boolean).length, errors: errors.filter(Boolean) };
  }

  function validateForm3(data) {
    if (data?.checkpointPassed && data?.submitted) return { valid: true, errors: [] };
    const errors = [];
    errors.push(required(data.hearingProceedings, 'Hearing proceedings summary'));
    errors.push(required(data.boardMembersPresent, 'Board members present'));
    errors.push(required(data.officerName || data.commanderName, 'Recording officer name'));
    return { valid: !errors.filter(Boolean).length, errors: errors.filter(Boolean) };
  }

  function validateForm3Checkpoint(app) {
    if (!app || typeof PMSStorage === 'undefined') {
      return { valid: false, allPassed: false, errors: ['Application not found.'], items: [] };
    }
    const fd = app.formData || {};
    const prisoner = PMSStorage.getPrisonerById(app.prisonerId);
    const items = [];
    const errors = [];

    const f1 = fd.form1 || {};
    const hasParoleSections = !!(f1.sections?.E || f1.sectionE || f1.prisonerDetails);
    const f1Complete = PMSStorage.isForm1Complete(f1);
    let f1Valid = f1Complete;
    let f1Detail = f1Complete ? 'Submitted' : (hasParoleSections ? 'Draft saved — submit Form 1 to continue' : 'Not completed');
    let f1FieldErrors = [];

    if (f1Complete && typeof PMSForm1Validation !== 'undefined' && prisoner) {
      const progress = PMSStorage.getPrisonerProgress(prisoner);
      const settings = PMSStorage.DEFAULT_SETTINGS || {};
      const v = PMSForm1Validation.validateForm1(f1, prisoner, progress, settings, { submit: true });
      f1Valid = v.valid;
      f1FieldErrors = v.errors || [];
      f1Detail = v.valid
        ? `Outcome: ${f1.eligibilityOutcome || 'recorded'} · Officer: ${f1.officerName || '—'} · Date: ${f1.screeningDate || '—'}`
        : f1FieldErrors.slice(0, 3).join('; ');
    } else if (!f1Complete) {
      f1FieldErrors = ['Form 1 must be submitted before Form 3.'];
    }

    items.push({
      id: 'form1',
      label: 'Form 1 — Parole Eligibility Screening',
      ok: f1Complete && f1Valid,
      detail: f1Detail,
      errors: f1FieldErrors,
      fixForm: 1,
    });
    if (!f1Complete || !f1Valid) errors.push(...f1FieldErrors);

    const ddr = fd.form2?.sections?.ddr || {};
    const darSubmitted = !!(ddr.submitted && ddr.confirmed);
    let darValid = darSubmitted;
    let darErrors = [];
    if (darSubmitted) {
      const v = validateForm2Section('ddr', { ...ddr, confirmed: true });
      darValid = v.valid;
      darErrors = v.errors;
    } else {
      darErrors = ['DAR section has not been submitted by CS Parole Clerk.'];
    }

    items.push({
      id: 'form2-dar',
      label: 'Form 2 — DAR (Detainee Assessment Report)',
      ok: darSubmitted && darValid,
      detail: darSubmitted
        ? `${ddr.officerName || ddr.darOfficer || 'Officer recorded'} · ${ddr.status || 'submitted'}`
        : 'Awaiting CS Parole Clerk submission',
      errors: darErrors,
      fixForm: 2,
      fixSection: 'dar',
    });
    if (!darSubmitted || !darValid) errors.push(...darErrors);

    const ppr = fd.form2?.sections?.ppr || {};
    const pprSubmitted = !!(ppr.submitted && ppr.confirmed);
    let pprValid = pprSubmitted;
    let pprErrors = [];
    if (pprSubmitted) {
      const v = validateForm2Section('ppr', { ...ppr, confirmed: true });
      pprValid = v.valid;
      pprErrors = v.errors;
    } else {
      pprErrors = ['PPR section has not been submitted by DJAG Parole Clerk.'];
    }

    items.push({
      id: 'form2-ppr',
      label: 'Form 2 — PPR (Pre-Parole Report)',
      ok: pprSubmitted && pprValid,
      detail: pprSubmitted
        ? `${ppr.clerkName || ppr.pprOfficer || ppr.officerName || 'Clerk recorded'} · ${ppr.status || 'submitted'}`
        : 'Awaiting DJAG Parole Clerk submission',
      errors: pprErrors,
      fixForm: 2,
      fixSection: 'ppr',
    });
    if (!pprSubmitted || !pprValid) errors.push(...pprErrors);

    items.push({
      id: 'case-link',
      label: 'Application linked to detainee record',
      ok: !!(app.prisonerId && prisoner),
      detail: prisoner
        ? `${prisoner.firstName} ${prisoner.lastName} (${prisoner.prisonerNumber || prisoner.id})`
        : 'Prisoner record missing',
      errors: prisoner ? [] : ['Link a valid prisoner to this application.'],
      fixForm: null,
    });
    if (!prisoner) errors.push('Application must be linked to a detainee record.');

    const allPassed = items.every((item) => item.ok);
    return { valid: allPassed, allPassed, errors: [...new Set(errors.filter(Boolean))], items };
  }

  function validateAssessment(assessment) {
    const errors = [];
    const vote = assessment?.vote;
    if (!vote) errors.push('Board vote is required (Approve, Deny, or Defer).');
    else if (!['Approved', 'Refused', 'Deferred'].includes(vote)) errors.push('Invalid board vote.');
    if (assessment?.score != null && assessment.score !== '') {
      errors.push(percentage(assessment.score, 'Assessment score'));
    }
    return { valid: !errors.filter(Boolean).length, errors: errors.filter(Boolean) };
  }

  function validateGuarantor(g) {
    const errors = [];
    errors.push(required(g.name, 'Guarantor name'));
    errors.push(required(g.relationship, 'Relationship'));
    errors.push(required(g.address, 'Address'));
    errors.push(required(g.contactNumber, 'Contact number'));
    return { valid: !errors.filter(Boolean).length, errors: errors.filter(Boolean) };
  }

  function showFieldErrors(container, errors) {
    if (!container) return;
    container.querySelectorAll('.field-error').forEach((el) => el.remove());
    errors.forEach((msg) => {
      const p = document.createElement('p');
      p.className = 'field-error';
      p.textContent = msg;
      container.prepend(p);
    });
  }

  return {
    parseDate,
    required,
    percentage,
    validateSentenceDates,
    validateHearingDate,
    validateFile,
    findDuplicatePrisoner,
    findDuplicateCase,
    validateForm2Section,
    validateForm3,
    validateForm3Checkpoint,
    validateAssessment,
    validateGuarantor,
    showFieldErrors,
    MAX_FILE_BYTES,
    ALLOWED_FILE_TYPES,
  };
})();
