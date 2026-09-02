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
    if (sectionKey === 'ddr') {
      errors.push(required(data.officerName || data.darOfficer, 'Officer name'));
      errors.push(required(data.institutionName || data.facilityName, 'Institution'));
      errors.push(required(data.assessmentSummary || data.conductLog || data.summary, 'Assessment summary'));
    }
    if (sectionKey === 'ppr') {
      errors.push(required(data.clerkName || data.pprOfficer, 'Clerk name'));
      errors.push(required(data.personalParticulars || data.victimStatements || data.communitySummary, 'Personal particulars review'));
    }
    if (data.confirmed !== true) errors.push('Section must be confirmed before submission.');
    return { valid: !errors.filter(Boolean).length, errors: errors.filter(Boolean) };
  }

  function validateForm3(data) {
    const errors = [];
    errors.push(required(data.commanderName, 'Commander name'));
    errors.push(required(data.institutionalReport, 'Institutional report'));
    errors.push(required(data.recommendation, 'Recommendation'));
    return { valid: !errors.filter(Boolean).length, errors: errors.filter(Boolean) };
  }

  function validateAssessment(assessment) {
    const errors = [];
    errors.push(required(assessment.score, 'Assessment score'));
    errors.push(percentage(assessment.score, 'Assessment score'));
    errors.push(required(assessment.feedback, 'Assessment feedback'));
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
    validateAssessment,
    validateGuarantor,
    showFieldErrors,
    MAX_FILE_BYTES,
    ALLOWED_FILE_TYPES,
  };
})();
