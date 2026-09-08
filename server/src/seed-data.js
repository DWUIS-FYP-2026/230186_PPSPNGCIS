/**
 * Default PMS dataset — nationwide scope; mirrors js/storage.js seedData().
 */
const PNGCS_INSTITUTIONS = [
  { name: 'Bomana Correctional Institution', province: 'National Capital District', address: 'Port Moresby' },
  { name: 'Buimo Correctional Institution', province: 'Morobe', address: 'Lae' },
  { name: 'Baisu Correctional Institution', province: 'Western Highlands', address: 'Mount Hagen' },
  { name: 'Kerevat Correctional Institution', province: 'East New Britain', address: 'Kerevat' },
  { name: 'Barawagi Correctional Institution', province: 'Chimbu', address: 'Kundiawa' },
];

const BOARD_CONTRACT_YEARS = 5;

function agencyDomainForRole(role) {
  if (role === 'Doctor') return 'health.gov.pg';
  if (['DJAG Parole Clerk', 'DJAG Secretary'].includes(role)) return 'djag.gov.pg';
  if (role === 'System Administrator') return 'pms.gov.pg';
  return 'cs.gov.pg';
}

function formatAgencyUsername(firstName, lastName, role) {
  if (role === 'System Administrator') return 'admin';
  const initial = String(firstName || '').trim().charAt(0).toLowerCase();
  const surname = String(lastName || '').trim().toLowerCase().replace(/\s+/g, '');
  return `${initial}.${surname}@${agencyDomainForRole(role)}`;
}

function addYearsToDate(isoDate, years) {
  const d = new Date(isoDate);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

const DEMO_PASSWORDS = {
  admin: 'admin123',
  'j.dole@cs.gov.pg': 'Password123!',
  'm.kila@djag.gov.pg': 'Password123!',
  's.tau@cs.gov.pg': 'Password123!',
  'h.morris@djag.gov.pg': 'Password123!',
  'r.sine@health.gov.pg': 'Password123!',
  't.bain@cs.gov.pg': 'Password123!',
  'p.koroma@cs.gov.pg': 'Password123!',
};

function buildDefaultInstitutions() {
  return PNGCS_INSTITUTIONS.map((row, i) => {
    const id = `INS-${String(i + 1).padStart(6, '0')}`;
    return {
      id,
      code: id,
      name: row.name,
      province: row.province,
      address: row.address,
      location: row.address,
      status: 'Active',
      capacity: null,
      phone: '',
      email: '',
    };
  });
}

function boardUser(base) {
  const start = base.contractStartDate || base.dateAppointed || '2022-01-01';
  return {
    ...base,
    username: base.username || formatAgencyUsername(base.firstName, base.lastName, base.role),
    email: base.email || base.username || formatAgencyUsername(base.firstName, base.lastName, base.role),
    contractStartDate: start,
    contractExpiryDate: base.contractExpiryDate || addYearsToDate(start, BOARD_CONTRACT_YEARS),
    contractStatus: 'Active',
    dateAppointed: base.dateAppointed || start,
  };
}

function buildSeedData() {
  const now = new Date().toISOString();
  const institutions = buildDefaultInstitutions();
  if (institutions[0]) institutions[0].commanderId = 'USR-000028';

  const seed = {
    settings: {
      paroleEligibilityFraction: 1 / 3,
      paroleEligibilityLabel: 'One-third (1/3) of total sentence',
      systemName: 'Parole Management System',
    },
    institutions,
    users: [
      { id: 'USR-000001', officerId: null, employeeNumber: null, username: 'admin', email: 'admin@pms.gov.pg', firstName: 'System', lastName: 'Administrator', role: 'System Administrator', rank: 'Administrator', institutionId: null, province: '', position: 'Administrator', phone: '', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2018-01-01', lastLogin: '2026-07-30T09:00:00.000Z', profilePhoto: null },
      { id: 'USR-000002', officerId: 'OFF-000001', employeeNumber: 'EMP-000002', username: formatAgencyUsername('John', 'Dole', 'CS Parole Clerk'), email: formatAgencyUsername('John', 'Dole', 'CS Parole Clerk'), firstName: 'John', lastName: 'Dole', role: 'CS Parole Clerk', rank: 'Parole Clerk', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Clerk', phone: '+675 7123 4567', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2020-05-10', lastLogin: '2026-07-29T14:00:00.000Z', profilePhoto: null },
      { id: 'USR-000003', officerId: 'OFF-000002', employeeNumber: 'EMP-000003', username: formatAgencyUsername('Mary', 'Kila', 'DJAG Parole Clerk'), email: formatAgencyUsername('Mary', 'Kila', 'DJAG Parole Clerk'), firstName: 'Mary', lastName: 'Kila', role: 'DJAG Parole Clerk', rank: 'Parole Clerk', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Clerk', phone: '+675 7234 5678', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2021-03-22', lastLogin: '2026-07-28T11:00:00.000Z', profilePhoto: null },
      { id: 'USR-000024', officerId: 'OFF-000024', employeeNumber: 'EMP-000024', username: formatAgencyUsername('Samuel', 'Tau', 'CS Parole Officer'), email: formatAgencyUsername('Samuel', 'Tau', 'CS Parole Officer'), firstName: 'Samuel', lastName: 'Tau', role: 'CS Parole Officer', rank: 'Parole Officer', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Officer', phone: '+675 7123 4500', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2021-08-01', lastLogin: '2026-07-20T09:00:00.000Z', profilePhoto: null },
      boardUser({ id: 'USR-000025', officerId: 'OFF-000025', employeeNumber: 'EMP-000025', firstName: 'Helen', lastName: 'Morris', role: 'DJAG Secretary', rank: 'Secretary', institutionId: 'INS-000001', province: 'National Capital District', position: 'DJAG Secretary', phone: '+675 7234 5600', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'DJAG Secretary', status: 'Active', dateAppointed: '2022-01-01', lastLogin: null, profilePhoto: null }),
      boardUser({ id: 'USR-000026', officerId: 'OFF-000026', employeeNumber: 'EMP-000026', firstName: 'Ruth', lastName: 'Sine', role: 'Doctor', rank: 'Medical Officer', institutionId: 'INS-000001', province: 'National Capital District', position: 'Medical Board Member', phone: '+675 7345 6700', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'Medical Member', status: 'Active', dateAppointed: '2022-01-01', lastLogin: null, profilePhoto: null }),
      boardUser({ id: 'USR-000027', officerId: 'OFF-000027', employeeNumber: 'EMP-000027', firstName: 'Thomas', lastName: 'Bain', role: 'CS Commissioner', rank: 'Commissioner', institutionId: 'INS-000001', province: 'National Capital District', position: 'Commissioner PNGCS', phone: '+675 7345 6800', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'Commissioner PNGCS', status: 'Active', dateAppointed: '2022-01-01', lastLogin: null, profilePhoto: null }),
      { id: 'USR-000028', officerId: 'OFF-000028', employeeNumber: 'EMP-000028', username: formatAgencyUsername('Peter', 'Koroma', 'Jail Commander'), email: formatAgencyUsername('Peter', 'Koroma', 'Jail Commander'), firstName: 'Peter', lastName: 'Koroma', role: 'Jail Commander', rank: 'Commander', institutionId: 'INS-000001', province: 'National Capital District', position: 'Jail Commander — Bomana', phone: '+675 7123 4600', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2019-04-01', lastLogin: null, profilePhoto: null },
    ],
    prisoners: [
      { id: 'PR-000001', prisonerNumber: 'PR-000001', institutionId: 'INS-000001', firstName: 'Paul', lastName: 'Kaupa', dateOfBirth: '1992-04-10', gender: 'Male', offense: 'Armed Robbery', sentenceStartDate: '2020-01-15', sentenceEndDate: '2030-01-15', status: 'Eligible for Parole', documents: [] },
      { id: 'PR-000002', prisonerNumber: 'PR-000002', institutionId: 'INS-000001', firstName: 'Peter', lastName: 'Wama', dateOfBirth: '1988-09-18', gender: 'Male', offense: 'Unlawful Wounding', sentenceStartDate: '2019-06-01', sentenceEndDate: '2027-06-01', status: 'In Custody', documents: [] },
      { id: 'PR-000003', prisonerNumber: 'PR-000003', institutionId: 'INS-000001', firstName: 'Sarah', lastName: 'Tekate', dateOfBirth: '1995-12-01', gender: 'Female', offense: 'Grand Larceny', sentenceStartDate: '2022-03-10', sentenceEndDate: '2028-03-10', status: 'In Custody', documents: [] },
    ],
    applications: [
      {
        id: 'APP-000001', caseNumber: 'PMS-2026-000001', prisonerId: 'PR-000001', institutionId: 'INS-000001',
        status: 'Hearing Scheduled', submittedAt: '2026-06-15', submittedBy: 'USR-000002',
        formData: {
          form1: { formId: 'F1-000001', status: 'submitted', screeningDate: '2026-06-15', eligibilityOutcome: 'eligible', officerName: 'John Dole' },
          form2: { formId: 'F2-000001' }, form3: { formId: 'F3-000001', status: 'approved' }, form4: {}, form5: {},
        },
        boardDecision: null, workflowNotes: [], createdAt: now,
      },
      {
        id: 'APP-000004', caseNumber: 'PMS-2026-000004', prisonerId: 'PR-000003', institutionId: 'INS-000001', status: 'Pre-Parole Report Prepared',
        submittedAt: '2026-07-15', submittedBy: 'USR-000002',
        formData: {
          form1: {
            formId: 'F1-000003', status: 'submitted', screeningDate: '2026-07-01', eligibilityOutcome: 'eligible',
            recommendationReason: 'Meets eligibility threshold.', officerName: 'John Dole',
            submittedAt: '2026-07-01T09:00:00.000Z', submittedBy: 'USR-000002',
          },
          form2: {
            formId: 'F2-000003',
            sections: {
              ddr: { submitted: true, confirmed: true, status: 'submitted', officerName: 'John Dole', darOfficer: 'John Dole', submittedAt: '2026-07-10T10:00:00.000Z' },
              ppr: { submitted: true, confirmed: true, status: 'submitted', officerName: 'Mary Kila', submittedAt: '2026-07-12T11:00:00.000Z' },
            },
          },
          form3: {
            formId: 'F3-000002', status: 'approved', submitted: true,
            commanderRecommendation: 'Recommended', institutionalRecommendation: 'Recommended',
            officerName: 'Peter Koroma', submittedAt: '2026-07-14T15:00:00.000Z',
          },
          form4: { investigationSummary: 'Pre-parole investigation complete — Sarah Tekate' },
          form5: {},
        },
        preParoleReport: 'Institutional verification complete. Recommended for parole hearing.',
        commanderReview: { verifiedAt: '2026-07-14T15:00:00.000Z', recommendation: 'Recommended', verifiedBy: 'USR-000028' },
        boardDecision: null, workflowNotes: [], createdAt: now,
      },
    ],
    hearings: [
      { id: 'HRG-000001', applicationId: 'APP-000001', prisonerId: 'PR-000001', institutionId: 'INS-000001', scheduledDate: '2026-09-08', scheduledTime: '09:30', location: 'Parole Board Hearing Room A', notes: 'Board hearing — Paul Kaupa', status: 'Scheduled' },
      { id: 'HRG-000002', applicationId: 'APP-000001', prisonerId: 'PR-000001', institutionId: 'INS-000001', scheduledDate: '2026-09-18', scheduledTime: '14:00', location: 'Parole Board Hearing Room B', notes: 'Follow-up hearing', status: 'Upcoming' },
    ],
    notifications: [
      { id: 'NOT-000001', type: 'eligibility', title: 'Parole Eligibility Alert', message: 'Paul Kaupa (PR-000001) has reached parole eligibility threshold.', recipientRole: 'CS Parole Clerk', recipientUserId: 'USR-000002', institutionId: 'INS-000001', prisonerId: 'PR-000001', eligibleDate: '2026-09-10', linkPanel: 'eligibility', read: false, resolved: false, createdAt: '2026-01-15T08:00:00.000Z' },
      { id: 'NOT-000002', type: 'application', title: 'New Parole Application', message: 'PNGCS submitted application for Paul Kaupa — pending DJAG review.', recipientRole: 'DJAG Parole Clerk', institutionId: 'INS-000001', prisonerId: 'PR-000001', applicationId: 'APP-000001', linkPanel: 'applications', read: false, resolved: false, createdAt: '2026-06-15T10:30:00.000Z' },
      { id: 'NOT-000004', type: 'form2', title: 'Form 2 Requires Action', message: 'DAR completed — PPR section required for Sarah Tekate (PMS-2026-000004)', recipientRole: 'DJAG Parole Clerk', institutionId: 'INS-000001', prisonerId: 'PR-000003', applicationId: 'APP-000004', linkPanel: 'applications', read: false, resolved: false, createdAt: '2026-07-10T10:05:00.000Z' },
      { id: 'NOT-000005', type: 'hearing', title: 'Schedule Hearing Required', message: 'Case PMS-2026-000004 (Sarah Tekate) requires a parole hearing within 14 days of Form 3 verification.', recipientRole: 'DJAG Secretary', recipientUserId: 'USR-000025', institutionId: 'INS-000001', prisonerId: 'PR-000003', applicationId: 'APP-000004', linkPanel: 'hearings', read: false, resolved: false, createdAt: '2026-07-15T08:00:00.000Z' },
      { id: 'NOT-000006', type: 'board_review', title: 'Submit Board Assessment', message: 'Parole hearing scheduled for Paul Kaupa (PMS-2026-000001) — submit your Approve, Deny, or Defer vote when ready.', recipientRole: 'DJAG Secretary', recipientUserId: 'USR-000025', institutionId: 'INS-000001', prisonerId: 'PR-000001', applicationId: 'APP-000001', linkPanel: 'decisions', read: false, resolved: false, createdAt: '2026-06-20T09:00:00.000Z' },
    ],
    auditLogs: [
      { id: 'AUD-000001', userId: 'USR-000002', userName: 'John Dole', role: 'CS Parole Clerk', action: 'CREATE', entity: 'ParoleApplication', entityId: 'APP-000001', details: 'Submitted parole application for Paul Kaupa', timestamp: '2026-06-15T10:30:00.000Z' },
    ],
    reports: [],
    idCounters: {
      PR: 3, OFF: 22, USR: 23, APP: 4, INS: 1, F1: 3, F2: 3, F3: 1, F4: 0, F5: 0,
      HRG: 2, NOT: 6, AUD: 1, RPT: 0, DOC: 0, EMP: 23,
    },
  };

  return { seed, demoPasswords: { ...DEMO_PASSWORDS } };
}

module.exports = { buildSeedData, DEMO_PASSWORDS, formatAgencyUsername, BOARD_CONTRACT_YEARS };
