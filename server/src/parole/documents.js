/**
 * Parole Act 1991 — printable document payloads (PDF-ready JSON/HTML templates).
 */
const { PARAMOUNT_FACTOR } = require('./constants');
const { buildForm1Payload, renderForm1Html } = require('./form1-builder');

function prisonerFullName(prisoner) {
  return prisoner.full_legal_name
    || `${prisoner.first_name || prisoner.firstName || ''} ${prisoner.last_name || prisoner.lastName || ''}`.trim();
}

function generateForm1Document(bundle, form1Row = null, overrides = {}) {
  const form1 = buildForm1Payload({
    prisoner: bundle.prisoner,
    application: bundle.application,
    institution: bundle.institution,
    form1Row: form1Row || {},
    sectionDOverrides: overrides.sectionD || overrides,
    sectionEOverrides: overrides.sectionE || {},
  });
  form1.printableHtml = renderForm1Html(form1);
  return form1;
}

function generateParoleOrder(bundle, conditions = []) {
  const { application, prisoner } = bundle;
  const condList = Array.isArray(conditions) ? conditions : [];
  return {
    documentType: 'Order for Parole',
    generatedAt: new Date().toISOString(),
    caseNumber: application.caseNumber,
    prisonerName: prisonerFullName(prisoner),
    prisonerNumber: prisoner.prisoner_number,
    paramountConsideration: PARAMOUNT_FACTOR,
    conditions: condList,
    supervisionRequired: true,
    printableHtml: `
      <article class="pms-doc">
        <header><h1>Order for Parole</h1></header>
        <p>Parole is GRANTED for <strong>${prisonerFullName(prisoner)}</strong> (${prisoner.prisoner_number}).</p>
        <p><em>Paramount consideration: ${PARAMOUNT_FACTOR}</em></p>
        <h2>Conditions</h2>
        <ol>${condList.map((c) => `<li>${c}</li>`).join('') || '<li>Standard reporting conditions apply.</li>'}</ol>
      </article>`,
  };
}

function generateRefusalNotice(bundle, reason, cooldownUntil) {
  const { application, prisoner } = bundle;
  return {
    documentType: 'Notice of Parole Refusal',
    generatedAt: new Date().toISOString(),
    caseNumber: application.caseNumber,
    prisonerName: prisonerFullName(prisoner),
    prisonerNumber: prisoner.prisoner_number,
    reason: reason || 'Application refused by Parole Board.',
    cooldownUntil: cooldownUntil || application.cooldownUntil,
    reapplicationNote: `Reapplication permitted after ${cooldownUntil || 'cooldown period'}.`,
    printableHtml: `
      <article class="pms-doc">
        <header><h1>Notice of Parole Refusal</h1></header>
        <p>Parole is DENIED for <strong>${prisonerFullName(prisoner)}</strong>.</p>
        <p><strong>Reason:</strong> ${reason || '—'}</p>
        <p><strong>Reapplication after:</strong> ${cooldownUntil || '—'}</p>
      </article>`,
  };
}

module.exports = {
  generateForm1Document,
  generateParoleOrder,
  generateRefusalNotice,
  renderForm1Html,
  buildForm1Payload,
};
