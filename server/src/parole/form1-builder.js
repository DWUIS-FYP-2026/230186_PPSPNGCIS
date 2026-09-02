/**
 * Form 1 — Particulars of detainee eligible for parole (Sections A–E).
 * Parole Act 1991 / PNG Parole Board guidelines.
 */
const { deriveTotalSentenceYears } = require('./eligibility');
const { SENTENCE_TYPES } = require('./constants');

const OFFENSE_CATEGORIES = ['Violent', 'Property', 'Drug-related', 'Sexual', 'Other'];

function esc(value) {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function prisonerFullName(prisoner) {
  return prisoner.full_legal_name
    || prisoner.fullLegalName
    || `${prisoner.first_name || prisoner.firstName || ''} ${prisoner.last_name || prisoner.lastName || ''}`.trim();
}

function deriveOffenseCategory(prisoner) {
  const explicit = prisoner.offense_category || prisoner.offenseCategory;
  if (explicit && OFFENSE_CATEGORIES.includes(explicit)) return explicit;
  const text = (prisoner.offense || prisoner.current_offenses || '').toLowerCase();
  if (/drug|narcotic|substance/.test(text)) return 'Drug-related';
  if (/sexual|rape|indecent/.test(text)) return 'Sexual';
  if (/assault|murder|robbery|violence|manslaughter/.test(text)) return 'Violent';
  if (/theft|burglary|property|fraud/.test(text)) return 'Property';
  return 'Other';
}

function deriveSentenceLength(prisoner) {
  const sentenceType = prisoner.sentence_type || prisoner.sentenceType || SENTENCE_TYPES.STANDARD;
  if (sentenceType === SENTENCE_TYPES.LIFE) {
    return { years: null, months: null, display: 'Life imprisonment' };
  }
  let years = prisoner.total_sentence_years ?? prisoner.totalSentenceYears;
  if (years == null && prisoner.sentence_start_date && prisoner.sentence_end_date) {
    years = deriveTotalSentenceYears(prisoner.sentence_start_date, prisoner.sentence_end_date);
  }
  const totalMonths = prisoner.sentence_length_months ?? prisoner.sentenceLengthMonths
    ?? (years != null ? Math.round(years * 12) : null);
  const displayYears = years != null ? Math.floor(years) : null;
  const displayMonths = totalMonths != null ? totalMonths % 12 : null;
  let display = '—';
  if (displayYears != null) {
    display = `${displayYears} year(s)`;
    if (displayMonths) display += ` ${displayMonths} month(s)`;
  }
  return { years: displayYears, months: displayMonths, totalMonths, display };
}

function normalizeGender(gender) {
  if (!gender) return '—';
  const g = String(gender).trim();
  if (/^m/i.test(g)) return 'Male';
  if (/^f/i.test(g)) return 'Female';
  if (/other/i.test(g)) return 'Other';
  return g;
}

function buildSectionA(prisoner) {
  return {
    full_legal_name: prisonerFullName(prisoner),
    aliases: prisoner.aliases || prisoner.extra_attributes?.aliases || 'None recorded',
    ci_number: prisoner.ci_number || prisoner.ciNumber || prisoner.prisoner_number || prisoner.prisonerNumber,
    date_of_birth: prisoner.date_of_birth || prisoner.dateOfBirth || null,
    gender: normalizeGender(prisoner.gender),
  };
}

function buildSectionB(prisoner, application) {
  const sentence = deriveSentenceLength(prisoner);
  return {
    current_offenses: prisoner.offense || prisoner.current_offenses || '—',
    sentence_length_years: sentence.years,
    sentence_length_months: sentence.months,
    sentence_length_display: sentence.display,
    court_of_conviction: prisoner.court_of_conviction || prisoner.courtOfConviction || '—',
    sentence_commencement_date: prisoner.sentence_start_date || prisoner.sentenceStartDate,
    offense_category: deriveOffenseCategory(prisoner),
    sentence_type: prisoner.sentence_type || prisoner.sentenceType || SENTENCE_TYPES.STANDARD,
    eligibility_date: application?.eligibilityDate || application?.eligibility_date || null,
    notification_date: application?.notificationDate || application?.notification_date || null,
  };
}

function buildSectionC(prisoner, institution) {
  return {
    facility_name: institution?.name || institution?.facility_name || '—',
    facility_code: institution?.code || institution?.facility_code || prisoner.facility_code || '—',
    cell_block_or_unit: prisoner.cell_block_unit || prisoner.cell_block_or_unit || prisoner.cellBlockUnit || '—',
    province: institution?.province || prisoner.province || '—',
    address: institution?.address || institution?.location || '—',
  };
}

function buildSectionD(form1Row = {}, overrides = {}) {
  const src = { ...form1Row, ...overrides };
  return {
    sponsor_name: src.sponsor_name || src.sponsorName || '',
    sponsor_relationship: src.sponsor_relationship || src.sponsorRelationship || '',
    sponsor_contact: src.sponsor_contact || src.sponsorContact || '',
    sponsor_address: src.sponsor_address || src.sponsorAddress || '',
    proposed_residence: src.proposed_residence || src.proposedResidence || '',
    proposed_residence_province: src.proposed_residence_province || src.proposedResidenceProvince || '',
    employment_plans: src.employment_plans || src.employmentPlans || '',
    community_service_plans: src.community_service_plans || src.communityServicePlans || '',
  };
}

function buildSectionE(form1Row = {}, application = {}, overrides = {}) {
  const consent = overrides.prisoner_consent ?? overrides.prisonerConsent
    ?? form1Row.prisoner_consent ?? application.prisonerConsent;
  return {
    prisoner_consent: consent == null ? null : !!consent,
    consent_date: overrides.consent_date || overrides.consentDate
      || form1Row.consent_date || application.consentRecordedAt || null,
    signature: overrides.signature || form1Row.signature || form1Row.signature_placeholder || '',
  };
}

/**
 * Build complete Form 1 payload (Sections A–E + metadata).
 */
function buildForm1Payload({ prisoner, application, institution, form1Row, sectionDOverrides, sectionEOverrides }) {
  const sectionA = buildSectionA(prisoner);
  const sectionB = buildSectionB(prisoner, application);
  const sectionC = buildSectionC(prisoner, institution);
  const sectionD = buildSectionD(form1Row, sectionDOverrides);
  const sectionE = buildSectionE(form1Row, application, sectionEOverrides);

  const generatedAt = form1Row?.generated_date || new Date().toISOString();

  return {
    documentType: 'Form 1 — Particulars of detainee eligible for parole',
    formVersion: 'PNG-PMS-Form1-v1',
    legalBasis: 'Parole Act 1991 — one-half sentence rule (Life: 10 years)',
    paramountConsideration: 'Community Safety and Protection',
    caseNumber: application?.caseNumber || application?.case_number,
    applicationId: application?.id,
    generatedAt,
    printedAt: form1Row?.printed_date || null,
    sectionA,
    sectionB,
    sectionC,
    sectionD,
    sectionE,
    sections: { A: sectionA, B: sectionB, C: sectionC, D: sectionD, E: sectionE },
  };
}

function fieldRow(label, value, fullWidth = false) {
  const span = fullWidth ? ' style="grid-column:1/-1"' : '';
  return `<div class="field"${span}><span class="lbl">${esc(label)}</span><span class="val">${esc(value)}</span></div>`;
}

function renderForm1Html(form1) {
  const s = form1.sections;
  const consentName = s.A.full_legal_name;
  const consentYes = s.E.prisoner_consent == null ? 'Pending' : s.E.prisoner_consent ? 'Yes' : 'No';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Form 1 — ${esc(s.A.full_legal_name)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; font-size: 11pt; color: #1a1a2e; line-height: 1.45; background: #fff; }
    .container { max-width: 900px; margin: 0 auto; border-top: 5px solid #e63946; padding: 24px 28px; }
    .header { text-align: center; border-bottom: 3px double #1a1a2e; padding-bottom: 14px; margin-bottom: 20px; }
    .badge { display: inline-block; background: #e63946; color: #fff; font-size: 9pt; font-weight: 700; letter-spacing: 1px; padding: 3px 12px; border-radius: 20px; text-transform: uppercase; margin-bottom: 8px; }
    h1 { font-size: 18pt; font-weight: 700; color: #1a1a2e; margin-bottom: 4px; }
    .subtitle { font-size: 11pt; color: #555; }
    .form-id { margin-top: 6px; font-size: 10pt; color: #888; }
    .status-bar { display: flex; flex-wrap: wrap; gap: 10px 24px; background: #f8f9fc; padding: 10px 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e4e7ed; font-size: 10pt; }
    .status-bar strong { color: #1a1a2e; }
    .section { margin-bottom: 22px; border-left: 4px solid #e63946; padding-left: 16px; page-break-inside: avoid; }
    .section-title { font-size: 12pt; font-weight: 700; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
    .badge-letter { display: inline-block; background: #1a1a2e; color: #fff; font-size: 10pt; font-weight: 700; width: 24px; height: 24px; line-height: 24px; text-align: center; border-radius: 50%; }
    .section-desc { font-size: 9pt; color: #777; margin: -4px 0 10px; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; }
    .field { display: flex; flex-direction: column; gap: 2px; }
    .field .lbl { font-size: 9pt; font-weight: 600; color: #2d2d44; }
    .field .val { font-size: 10pt; padding: 6px 10px; border: 1px solid #d0d4dd; border-radius: 6px; background: #fafbfc; min-height: 28px; white-space: pre-wrap; }
    .consent-box { background: #f8f9fc; border: 2px solid #d0d4dd; border-radius: 8px; padding: 14px 18px; margin-top: 8px; font-size: 10pt; }
    .consent-check { font-weight: 600; margin-bottom: 6px; }
    .footer { margin-top: 28px; border-top: 2px solid #ddd; padding-top: 12px; font-size: 9pt; color: #888; text-align: center; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">Government of Papua New Guinea</div>
      <h1>Form 1 — Parole Application</h1>
      <p class="subtitle">Particulars of detainee eligible for parole</p>
      <p class="form-id"><strong>Application ID:</strong> ${esc(form1.caseNumber)} &nbsp;|&nbsp; <strong>Version:</strong> 2.0 (Parole Act 1991)</p>
    </div>

    <div class="status-bar">
      <span><strong>CI #:</strong> ${esc(s.A.ci_number)}</span>
      <span><strong>Eligibility Date:</strong> ${esc(s.B.eligibility_date)}</span>
      <span><strong>Notification Date:</strong> ${esc(s.B.notification_date)}</span>
      <span><strong>Generated:</strong> ${esc(form1.generatedAt?.slice?.(0, 10) || form1.generatedAt)}</span>
    </div>

    <div class="section">
      <div class="section-title"><span class="badge-letter">A</span> Section A — Detainee Identifiers &amp; Demographics</div>
      <p class="section-desc">Official identification details as per PNG Correctional Service records.</p>
      <div class="form-grid">
        ${fieldRow('Full Legal Name', s.A.full_legal_name, true)}
        ${fieldRow('Aliases / Other Names', s.A.aliases, true)}
        ${fieldRow('CI Number', s.A.ci_number)}
        ${fieldRow('Date of Birth', s.A.date_of_birth)}
        ${fieldRow('Gender', s.A.gender, true)}
      </div>
    </div>

    <div class="section">
      <div class="section-title"><span class="badge-letter">B</span> Section B — Sentencing and Conviction Particulars</div>
      <p class="section-desc">Court-ordered sentencing details (one-half rule; Life: 10 years).</p>
      <div class="form-grid">
        ${fieldRow('Current Offense(s)', s.B.current_offenses, true)}
        ${fieldRow('Sentence Length', s.B.sentence_length_display)}
        ${fieldRow('Offense Category', s.B.offense_category)}
        ${fieldRow('Court of Conviction', s.B.court_of_conviction)}
        ${fieldRow('Sentence Commencement Date', s.B.sentence_commencement_date, true)}
      </div>
    </div>

    <div class="section">
      <div class="section-title"><span class="badge-letter">C</span> Section C — Current Custodial Location</div>
      <div class="form-grid">
        ${fieldRow('Correctional Facility', s.C.facility_name)}
        ${fieldRow('Facility Code', s.C.facility_code)}
        ${fieldRow('Cell Block / Unit', s.C.cell_block_or_unit, true)}
      </div>
    </div>

    <div class="section">
      <div class="section-title"><span class="badge-letter">D</span> Section D — Proposed Post-Release &amp; Reintegration Details</div>
      <div class="form-grid">
        ${fieldRow('Sponsor / Guarantor Name', s.D.sponsor_name, true)}
        ${fieldRow('Relationship', s.D.sponsor_relationship)}
        ${fieldRow('Sponsor Contact', s.D.sponsor_contact)}
        ${fieldRow('Sponsor Address', s.D.sponsor_address, true)}
        ${fieldRow('Proposed Residence', s.D.proposed_residence)}
        ${fieldRow('Province', s.D.proposed_residence_province)}
        ${fieldRow('Employment or Business Plans', s.D.employment_plans, true)}
        ${fieldRow('Community Service Obligations', s.D.community_service_plans, true)}
      </div>
    </div>

    <div class="section">
      <div class="section-title"><span class="badge-letter">E</span> Section E — Declaration &amp; Consent</div>
      <div class="consent-box">
        <p class="consent-check">Consent to be considered for parole: <strong>${consentYes}</strong></p>
        <p>I, ${esc(consentName)}, hereby formally acknowledge that I wish to be considered for parole.</p>
        <p style="margin-top:8px"><strong>Consent Date:</strong> ${esc(s.E.consent_date || '—')}</p>
        <p style="margin-top:6px"><strong>Signature:</strong> ${esc(s.E.signature || 'Recorded in PMS')}</p>
      </div>
      <p style="margin-top:8px;font-size:9pt;color:#777">Community Safety and Protection is the paramount consideration under the Parole Act 1991.</p>
    </div>

    <div class="footer">
      <p>Generated by PMS — Papua New Guinea Parole Management System · Form 1 v2.0 · Parole Act 1991</p>
      <p>This is an official document. Any alteration or forgery is a criminal offense.</p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  OFFENSE_CATEGORIES,
  buildForm1Payload,
  buildSectionA,
  buildSectionB,
  buildSectionC,
  buildSectionD,
  buildSectionE,
  renderForm1Html,
  deriveOffenseCategory,
  deriveSentenceLength,
};
