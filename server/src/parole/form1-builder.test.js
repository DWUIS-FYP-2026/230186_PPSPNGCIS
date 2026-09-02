const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildForm1Payload, deriveOffenseCategory, renderForm1Html } = require('./form1-builder');

describe('Form 1 builder — Sections A–E', () => {
  const prisoner = {
    first_name: 'Paul',
    last_name: 'Kaupa',
    full_legal_name: 'Paul Kaupa',
    aliases: 'P. Kaupa',
    prisoner_number: 'PR-000001',
    ci_number: 'CI-88421',
    date_of_birth: '1985-04-12',
    gender: 'Male',
    offense: 'Armed robbery',
    sentence_start_date: '2020-01-01',
    sentence_end_date: '2028-01-01',
    sentence_type: 'Standard',
    court_of_conviction: 'National Court, Port Moresby',
    cell_block_unit: 'Block C / Unit 3',
    institution_id: 'INS-000001',
  };

  const application = {
    id: 'APP-1',
    caseNumber: 'PC-000001',
    eligibilityDate: '2024-01-01',
    notificationDate: '2023-07-01',
  };

  const institution = {
    name: 'Bomana Correctional Institution',
    code: 'BOM-001',
    province: 'National Capital District',
    address: 'Port Moresby',
  };

  it('builds all five sections with required fields', () => {
    const form1 = buildForm1Payload({
      prisoner,
      application,
      institution,
      form1Row: {},
      sectionDOverrides: {
        sponsor_name: 'Grace Wama',
        sponsor_relationship: 'Sister',
        sponsor_contact: '+675 7123 4567',
        proposed_residence_province: 'Central Province',
      },
    });

    assert.equal(form1.sectionA.full_legal_name, 'Paul Kaupa');
    assert.equal(form1.sectionA.ci_number, 'CI-88421');
    assert.equal(form1.sectionB.offense_category, 'Violent');
    assert.equal(form1.sectionC.facility_name, 'Bomana Correctional Institution');
    assert.equal(form1.sectionD.sponsor_name, 'Grace Wama');
    assert.equal(form1.sectionE.prisoner_consent, null);
  });

  it('classifies drug offenses correctly', () => {
    assert.equal(deriveOffenseCategory({ offense: 'Unlawful possession of dangerous drugs' }), 'Drug-related');
  });

  it('renders printable HTML containing all section headings', () => {
    const form1 = buildForm1Payload({ prisoner, application, institution });
    const html = renderForm1Html(form1);
    assert.match(html, /Section A/);
    assert.match(html, /Section B/);
    assert.match(html, /Section C/);
    assert.match(html, /Section D/);
    assert.match(html, /Section E/);
    assert.match(html, /Paul Kaupa/);
  });
});
