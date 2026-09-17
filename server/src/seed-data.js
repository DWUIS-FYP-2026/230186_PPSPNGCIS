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

function demoForm1Submitted(formId, label) {
  return {
    formId,
    status: 'submitted',
    screeningDate: '2026-08-01',
    eligibilityOutcome: 'eligible',
    recommendationReason: label,
    officerName: 'John Dole',
    submittedAt: '2026-08-01T09:00:00.000Z',
    submittedBy: 'USR-000002',
  };
}

function demoForm2Complete(formId) {
  return {
    formId,
    sections: {
      ddr: { submitted: true, confirmed: true, status: 'submitted', officerName: 'John Dole', submittedAt: '2026-08-12T10:00:00.000Z' },
      ppr: { submitted: true, confirmed: true, status: 'submitted', officerName: 'Mary Kila', submittedAt: '2026-08-14T11:00:00.000Z' },
    },
  };
}

function demoForm3HearingComplete(formId) {
  return {
    formId,
    status: 'submitted',
    submitted: true,
    hearingProceedings: 'Board heard submissions; detainee answered questions on reintegration.',
    boardMembersPresent: 'Helen Morris (DJAG Secretary), Thomas Bain (PNGCS Commissioner), Ruth Sine (Psychiatrist)',
    officerName: 'John Dole',
    submittedAt: '2026-08-26T11:00:00.000Z',
  };
}

function demoCommanderReview(prisonerId, caseNumber) {
  return {
    verifiedAt: '2026-08-18T15:00:00.000Z',
    reviewedAt: '2026-08-18T15:00:00.000Z',
    decision: 'Verified',
    recommendation: 'Recommended',
    verifiedBy: 'USR-000028',
    commanderId: 'USR-000028',
    commanderName: 'Peter Koroma',
    finalized: true,
    prisonerId,
    caseNumber,
  };
}

function demoBoardAssessments(vote) {
  const roles = [
    { role: 'Doctor', assessorId: 'USR-000026', assessorName: 'Ruth Sine', score: 82 },
    { role: 'CS Commissioner', assessorId: 'USR-000027', assessorName: 'Thomas Bain' },
    { role: 'DJAG Secretary', assessorId: 'USR-000025', assessorName: 'Helen Morris' },
  ];
  return roles.map((r, i) => ({
    id: `ASM-DEMO-${vote}-${i + 1}`,
    role: r.role,
    assessorId: r.assessorId,
    assessorName: r.assessorName,
    vote,
    score: r.score,
    feedback: `Demo board vote — ${vote}`,
    conditions: vote === 'Approved' ? 'Report to supervising parole officer within 48 hours.' : '',
    denialReason: vote === 'Refused' ? 'Demo case — board declined parole at this time.' : '',
    submissionStatus: 'Submitted',
    submittedAt: '2026-08-26T10:00:00.000Z',
    updatedAt: '2026-08-26T10:00:00.000Z',
  }));
}

function buildDemoFormStageSeed(now) {
  const prisoners = [
    { id: 'PR-000004', prisonerNumber: 'PR-000004', institutionId: 'INS-000001', firstName: 'James', lastName: 'Kila', dateOfBirth: '1990-02-14', gender: 'Male', offense: 'Break and Enter', sentenceStartDate: '2021-04-01', sentenceEndDate: '2029-04-01', status: 'Case Started', documents: [] },
    { id: 'PR-000005', prisonerNumber: 'PR-000005', institutionId: 'INS-000001', firstName: 'Niko', lastName: 'Amos', dateOfBirth: '1987-11-03', gender: 'Male', offense: 'Assault', sentenceStartDate: '2020-08-15', sentenceEndDate: '2028-08-15', status: 'Assessment in Progress', documents: [] },
    { id: 'PR-000006', prisonerNumber: 'PR-000006', institutionId: 'INS-000001', firstName: 'Lea', lastName: 'Kuri', dateOfBirth: '1993-06-22', gender: 'Female', offense: 'Fraud', sentenceStartDate: '2021-01-10', sentenceEndDate: '2027-01-10', status: 'Hearing Scheduled', documents: [] },
    { id: 'PR-000007', prisonerNumber: 'PR-000007', institutionId: 'INS-000001', firstName: 'Mark', lastName: 'Grant', dateOfBirth: '1985-03-30', gender: 'Male', offense: 'Manslaughter', sentenceStartDate: '2018-05-01', sentenceEndDate: '2028-05-01', status: 'Board Review', documents: [] },
    { id: 'PR-000008', prisonerNumber: 'PR-000008', institutionId: 'INS-000001', firstName: 'Tina', lastName: 'Refused', dateOfBirth: '1991-09-09', gender: 'Female', offense: 'Drug Trafficking', sentenceStartDate: '2019-02-01', sentenceEndDate: '2029-02-01', status: 'Refused', documents: [] },
  ];

  const applications = [
    {
      id: 'APP-000005', caseNumber: 'PMS-2026-DEMO-F1', prisonerId: 'PR-000004', institutionId: 'INS-000001',
      status: 'Draft', submittedAt: null, submittedBy: 'USR-000002', demoStage: 'Form 1',
      formData: {
        form1: {
          formId: 'F1-000004', status: 'draft', screeningDate: '2026-09-10', eligibilityOutcome: 'eligible',
          recommendationReason: 'Demo case — complete and submit Form 1 (Parole Eligibility Screening).',
          officerName: 'John Dole',
        },
        form2: {}, form3: {}, form4: {}, form5: {},
      },
      boardDecision: null, workflowNotes: [], createdAt: now,
    },
    {
      id: 'APP-000006', caseNumber: 'PMS-2026-DEMO-F2', prisonerId: 'PR-000005', institutionId: 'INS-000001',
      status: 'Submitted', submittedAt: '2026-08-05', submittedBy: 'USR-000002', demoStage: 'Form 2',
      formData: {
        form1: demoForm1Submitted('F1-000005', 'Demo case — Form 1 complete; continue Form 2 (DDR & PPR).'),
        form2: {
          formId: 'F2-000004',
          sections: {
            ddr: { submitted: true, confirmed: true, status: 'submitted', officerName: 'John Dole', submittedAt: '2026-08-12T10:00:00.000Z' },
            ppr: { status: 'draft', officerName: 'Mary Kila' },
          },
        },
        form3: {}, form4: {}, form5: {},
      },
      boardDecision: null, workflowNotes: [], createdAt: now,
    },
    {
      id: 'APP-000007', caseNumber: 'PMS-2026-DEMO-F3', prisonerId: 'PR-000006', institutionId: 'INS-000001',
      status: 'Hearing In Progress', submittedAt: '2026-08-10', submittedBy: 'USR-000002', demoStage: 'Form 3',
      formData: {
        form1: demoForm1Submitted('F1-000006', 'Demo case — hearing in progress; complete Form 3 hearing record.'),
        form2: demoForm2Complete('F2-000005'),
        form3: {
          formId: 'F3-000004', status: 'draft', submitted: false,
          hearingProceedings: 'Detainee presented statement; board questions on reintegration plan.',
          boardMembersPresent: 'Helen Morris (DJAG Secretary), Thomas Bain (PNGCS Commissioner), Ruth Sine (Psychiatrist)',
          officerName: 'John Dole',
        },
        form4: {}, form5: {},
      },
      commanderReview: demoCommanderReview('PR-000006', 'PMS-2026-DEMO-F3'),
      preParoleReport: 'Commander verified — parole hearing session open.',
      boardDecision: null, workflowNotes: [], createdAt: now,
    },
    {
      id: 'APP-000008', caseNumber: 'PMS-2026-DEMO-F4', prisonerId: 'PR-000007', institutionId: 'INS-000001',
      status: 'Pending Approval', submittedAt: '2026-08-01', submittedBy: 'USR-000002', demoStage: 'Form 4',
      formData: {
        form1: demoForm1Submitted('F1-000007', 'Demo case — board granted parole; issue Form 4 order.'),
        form2: demoForm2Complete('F2-000006'),
        form3: demoForm3HearingComplete('F3-000005'),
        form4: {
          formId: 'F4-000001', status: 'Parole Granted', decision: 'Parole Granted',
          issued: true, issuedAt: '2026-08-26T09:00:00.000Z', issuedBy: 'Helen Morris',
          caseNumber: 'PMS-2026-DEMO-F4', prisonerName: 'Mark Grant',
          hearingDate: '2026-08-25', hearingLocation: 'Bomana Hearing Room A',
          conditions: 'Report to supervising parole officer within 48 hours.',
          recordedAt: '2026-08-26T09:00:00.000Z', recordedBy: 'Helen Morris',
        },
        form5: {},
      },
      preParoleReport: 'Demo case — Form 4 issued; awaiting DJAG Secretary and CS Clerk grant approval.',
      commanderReview: demoCommanderReview('PR-000007', 'PMS-2026-DEMO-F4'),
      guarantors: [{
        id: 'GUA-000001', applicationId: 'APP-000008', name: 'Michael Grant',
        relationship: 'Brother', contact: '+675 7123 8899', village: 'Hohola, NCD',
        notes: 'Community guarantor for the Form 4 demo case.',
        createdAt: '2026-08-26T10:00:00.000Z', updatedAt: '2026-08-26T10:00:00.000Z',
      }],
      boardAssessments: demoBoardAssessments('Approved'),
      boardDecision: {
        outcome: 'Parole Granted',
        deliberationNotes: 'Approve 3 · Refuse 0 · Defer 0',
        decidedBy: 'USR-000025', decidedByName: 'Helen Morris', decidedAt: '2026-08-26T09:00:00.000Z',
        votes: { Approved: 3, Refused: 0, Deferred: 0 },
        calculation: 'Approve 3 · Refuse 0 · Defer 0',
        conditions: 'Report to supervising parole officer within 48 hours.',
      },
      paroleScore: { percent: 100, meetsThreshold: true, locked: true, complete: true },
      workflowNotes: [], createdAt: now,
    },
    {
      id: 'APP-000009', caseNumber: 'PMS-2026-DEMO-F5', prisonerId: 'PR-000008', institutionId: 'INS-000001',
      status: 'Parole Refused', submittedAt: '2026-08-01', submittedBy: 'USR-000002', demoStage: 'Form 5',
      formData: {
        form1: demoForm1Submitted('F1-000008', 'Demo case — board refused parole; issue Form 5 notice.'),
        form2: demoForm2Complete('F2-000007'),
        form3: demoForm3HearingComplete('F3-000006'),
        form4: {},
        form5: {
          formId: 'F5-000001', status: 'draft', decision: 'Parole Refused',
          caseNumber: 'PMS-2026-DEMO-F5', prisonerName: 'Tina Refused',
          hearingDate: '2026-08-27', hearingLocation: 'Bomana Hearing Room B',
          denialReason: 'Demo case — insufficient rehabilitation progress at this hearing.',
          recordedAt: '2026-08-28T09:00:00.000Z', recordedBy: 'Helen Morris',
        },
      },
      preParoleReport: 'Demo case — ready for Form 5 (Parole Refused notice).',
      commanderReview: demoCommanderReview('PR-000008', 'PMS-2026-DEMO-F5'),
      boardAssessments: demoBoardAssessments('Refused'),
      boardDecision: {
        outcome: 'Parole Refused',
        deliberationNotes: 'Approve 0 · Refuse 3 · Defer 0',
        decidedBy: 'USR-000025', decidedByName: 'Helen Morris', decidedAt: '2026-08-28T09:00:00.000Z',
        votes: { Approved: 0, Refused: 3, Deferred: 0 },
        calculation: 'Approve 0 · Refuse 3 · Defer 0',
        denialReason: 'Demo case — insufficient rehabilitation progress at this hearing.',
      },
      paroleScore: { percent: 0, meetsThreshold: false, locked: true, complete: true },
      workflowNotes: [], createdAt: now,
    },
  ];

  const hearings = [
    {
      id: 'HRG-000002', applicationId: 'APP-000008', prisonerId: 'PR-000007', institutionId: 'INS-000001',
      scheduledDate: '2026-08-25', scheduledTime: '10:00', location: 'Bomana Hearing Room A',
      notes: 'Demo hearing — Form 4 grant path (Mark Grant)', status: 'Completed',
      boardMembers: ['USR-000025', 'USR-000026', 'USR-000027'],
    },
    {
      id: 'HRG-000003', applicationId: 'APP-000009', prisonerId: 'PR-000008', institutionId: 'INS-000001',
      scheduledDate: '2026-08-27', scheduledTime: '11:00', location: 'Bomana Hearing Room B',
      notes: 'Demo hearing — Form 5 refusal path (Tina Refused)', status: 'Completed',
      boardMembers: ['USR-000025', 'USR-000026', 'USR-000027'],
    },
    {
      id: 'HRG-000004', applicationId: 'APP-000007', prisonerId: 'PR-000006', institutionId: 'INS-000001',
      scheduledDate: '2026-09-16', scheduledTime: '09:30', location: 'Bomana Hearing Room C',
      notes: 'Demo hearing — Form 3 hearing record (Lea Kuri)', status: 'In Progress',
      boardMembers: ['USR-000025', 'USR-000026', 'USR-000027'],
    },
  ];

  return { prisoners, applications, hearings };
}

function buildSeedData() {
  const now = new Date().toISOString();
  const demoFormStages = buildDemoFormStageSeed(now);
  const institutions = buildDefaultInstitutions();
  if (institutions[0]) institutions[0].commanderId = 'USR-000028';

  const seed = {
    settings: {
      paroleEligibilityFraction: 1 / 2,
      paroleEligibilityLabel: 'One-half (1/2) of total sentence',
      systemName: 'Parole Management System',
    },
    institutions,
    users: [
      { id: 'USR-000001', officerId: null, employeeNumber: null, username: 'admin', email: 'admin@pms.gov.pg', firstName: 'System', lastName: 'Administrator', role: 'System Administrator', rank: 'Administrator', institutionId: null, province: '', position: 'Administrator', phone: '', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2018-01-01', lastLogin: '2026-07-30T09:00:00.000Z', profilePhoto: null },
      { id: 'USR-000002', officerId: 'OFF-000001', employeeNumber: 'EMP-000002', username: formatAgencyUsername('John', 'Dole', 'CS Parole Clerk'), email: formatAgencyUsername('John', 'Dole', 'CS Parole Clerk'), firstName: 'John', lastName: 'Dole', role: 'CS Parole Clerk', rank: 'Parole Clerk', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Clerk', phone: '+675 7123 4567', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2020-05-10', lastLogin: '2026-07-29T14:00:00.000Z', profilePhoto: null },
      { id: 'USR-000003', officerId: 'OFF-000002', employeeNumber: 'EMP-000003', username: formatAgencyUsername('Mary', 'Kila', 'DJAG Parole Clerk'), email: formatAgencyUsername('Mary', 'Kila', 'DJAG Parole Clerk'), firstName: 'Mary', lastName: 'Kila', role: 'DJAG Parole Clerk', rank: 'Parole Clerk', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Clerk', phone: '+675 7234 5678', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2021-03-22', lastLogin: '2026-07-28T11:00:00.000Z', profilePhoto: null },
      { id: 'USR-000024', officerId: 'OFF-000024', employeeNumber: 'EMP-000024', username: formatAgencyUsername('Samuel', 'Tau', 'CS Parole Officer'), email: formatAgencyUsername('Samuel', 'Tau', 'CS Parole Officer'), firstName: 'Samuel', lastName: 'Tau', role: 'CS Parole Officer', rank: 'Parole Officer', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Officer', phone: '+675 7123 4500', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2021-08-01', lastLogin: '2026-07-20T09:00:00.000Z', profilePhoto: null },
      boardUser({ id: 'USR-000025', officerId: 'OFF-000025', employeeNumber: 'EMP-000025', firstName: 'Helen', lastName: 'Morris', role: 'DJAG Secretary', rank: 'Secretary', institutionId: 'INS-000001', province: 'National Capital District', position: 'DJAG Secretary', phone: '+675 7234 5600', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'DJAG Secretary', status: 'Active', dateAppointed: '2022-01-01', lastLogin: null, profilePhoto: null }),
      boardUser({ id: 'USR-000026', officerId: 'OFF-000026', employeeNumber: 'EMP-000026', firstName: 'Ruth', lastName: 'Sine', role: 'Doctor', rank: 'Psychiatrist', institutionId: 'INS-000001', province: 'National Capital District', position: 'Psychiatrist — Parole Board', phone: '+675 7345 6700', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'Psychiatrist', status: 'Active', dateAppointed: '2022-01-01', lastLogin: null, profilePhoto: null }),
      boardUser({ id: 'USR-000027', officerId: 'OFF-000027', employeeNumber: 'EMP-000027', firstName: 'Thomas', lastName: 'Bain', role: 'CS Commissioner', rank: 'Commissioner', institutionId: 'INS-000001', province: 'National Capital District', position: 'PNGCS Commissioner', phone: '+675 7345 6800', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'PNGCS Commissioner', status: 'Active', dateAppointed: '2022-01-01', lastLogin: null, profilePhoto: null }),
      { id: 'USR-000028', officerId: 'OFF-000028', employeeNumber: 'EMP-000028', username: formatAgencyUsername('Peter', 'Koroma', 'Jail Commander'), email: formatAgencyUsername('Peter', 'Koroma', 'Jail Commander'), firstName: 'Peter', lastName: 'Koroma', role: 'Jail Commander', rank: 'Commander', institutionId: 'INS-000001', province: 'National Capital District', position: 'Jail Commander — Bomana', phone: '+675 7123 4600', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2019-04-01', lastLogin: null, profilePhoto: null },
    ],
    prisoners: [
      { id: 'PR-000001', prisonerNumber: 'PR-000001', institutionId: 'INS-000001', firstName: 'Paul', lastName: 'Kaupa', dateOfBirth: '1992-04-10', gender: 'Male', offense: 'Armed Robbery', sentenceStartDate: '2020-01-15', sentenceEndDate: '2030-01-15', status: 'Hearing Scheduled', documents: [] },
      { id: 'PR-000002', prisonerNumber: 'PR-000002', institutionId: 'INS-000001', firstName: 'Peter', lastName: 'Wama', dateOfBirth: '1988-09-18', gender: 'Male', offense: 'Unlawful Wounding', sentenceStartDate: '2019-06-01', sentenceEndDate: '2027-06-01', status: 'Assessment in Progress', documents: [] },
      { id: 'PR-000003', prisonerNumber: 'PR-000003', institutionId: 'INS-000001', firstName: 'Sarah', lastName: 'Tekate', dateOfBirth: '1995-12-01', gender: 'Female', offense: 'Grand Larceny', sentenceStartDate: '2022-03-10', sentenceEndDate: '2028-03-10', status: 'Assessment in Progress', documents: [] },
      ...demoFormStages.prisoners,
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
        id: 'APP-000002', caseNumber: 'PMS-2026-000002', prisonerId: 'PR-000002', institutionId: 'INS-000001',
        status: 'Pending Commander Review', submittedAt: '2026-08-01', submittedBy: 'USR-000002',
        formData: {
          form1: {
            formId: 'F1-000002', status: 'submitted', screeningDate: '2026-08-01', eligibilityOutcome: 'eligible',
            recommendationReason: 'Eligible under one-half rule — Peter Wama.',
            officerName: 'John Dole', submittedAt: '2026-08-01T09:00:00.000Z', submittedBy: 'USR-000002',
          },
          form2: {
            formId: 'F2-000002',
            sections: {
              ddr: { submitted: true, confirmed: true, status: 'submitted', officerName: 'John Dole', submittedAt: '2026-08-05T10:00:00.000Z' },
              ppr: { submitted: true, confirmed: true, status: 'submitted', officerName: 'Mary Kila', submittedAt: '2026-08-08T11:00:00.000Z' },
            },
          },
          form3: {
            formId: 'F3-000003', status: 'submitted', submitted: true,
            commanderRecommendation: 'Recommended', institutionalRecommendation: 'Recommended',
            officerName: 'Mary Kila', submittedAt: '2026-08-10T14:00:00.000Z',
          },
          form4: {}, form5: {},
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
        commanderReview: {
          verifiedAt: '2026-07-14T15:00:00.000Z', reviewedAt: '2026-07-14T15:00:00.000Z',
          decision: 'Verified', recommendation: 'Recommended', verifiedBy: 'USR-000028',
          commanderId: 'USR-000028', commanderName: 'Peter Koroma', finalized: true,
          prisonerId: 'PR-000003', caseNumber: 'PMS-2026-000004',
        },
        boardDecision: null, workflowNotes: [], createdAt: now,
      },
      ...demoFormStages.applications,
    ],
    hearings: [
      { id: 'HRG-000001', applicationId: 'APP-000001', prisonerId: 'PR-000001', institutionId: 'INS-000001', scheduledDate: '2026-09-18', scheduledTime: '14:00', location: 'PNG CS HQ Conference Room 3', notes: 'Board hearing — Paul Kaupa', status: 'Scheduled', boardMembers: ['USR-000025', 'USR-000026', 'USR-000027'] },
      ...demoFormStages.hearings,
    ],
    notifications: [
      { id: 'NOT-000001', type: 'eligibility', title: 'Parole Eligibility Alert', message: 'Paul Kaupa (PR-000001) has reached parole eligibility threshold.', recipientRole: 'CS Parole Clerk', recipientUserId: 'USR-000002', institutionId: 'INS-000001', prisonerId: 'PR-000001', eligibleDate: '2026-09-10', linkPanel: 'eligibility', read: false, resolved: false, createdAt: '2026-01-15T08:00:00.000Z' },
      { id: 'NOT-000002', type: 'application', title: 'New Parole Application', message: 'PNGCS submitted application for Paul Kaupa — pending DJAG review.', recipientRole: 'DJAG Parole Clerk', institutionId: 'INS-000001', prisonerId: 'PR-000001', applicationId: 'APP-000001', linkPanel: 'applications', read: false, resolved: false, createdAt: '2026-06-15T10:30:00.000Z' },
      { id: 'NOT-000004', type: 'form2', title: 'Form 2 Requires Action', message: 'DAR completed — PPR section required for Sarah Tekate (PMS-2026-000004)', recipientRole: 'DJAG Parole Clerk', institutionId: 'INS-000001', prisonerId: 'PR-000003', applicationId: 'APP-000004', linkPanel: 'applications', read: false, resolved: false, createdAt: '2026-07-10T10:05:00.000Z' },
      { id: 'NOT-000005', type: 'hearing', title: 'Schedule Hearing Required', message: 'Case PMS-2026-000004 (Sarah Tekate) requires a parole hearing within 14 days of Form 3 verification.', recipientRole: 'DJAG Secretary', recipientUserId: 'USR-000025', institutionId: 'INS-000001', prisonerId: 'PR-000003', applicationId: 'APP-000004', linkPanel: 'hearings', read: false, resolved: false, createdAt: '2026-07-15T08:00:00.000Z' },
      { id: 'NOT-000006', type: 'board_review', title: 'Submit Board Assessment', message: 'Parole hearing scheduled for Paul Kaupa (PMS-2026-000001) — submit your Approve, Deny, or Defer vote when ready.', recipientRole: 'DJAG Secretary', recipientUserId: 'USR-000025', institutionId: 'INS-000001', prisonerId: 'PR-000001', applicationId: 'APP-000001', linkPanel: 'decisions', read: false, resolved: false, createdAt: '2026-06-20T09:00:00.000Z' },
      { id: 'NOT-000007', type: 'verification', title: 'Institutional Verification Required', message: 'Peter Wama (PMS-2026-000002) — Forms 1–3 complete. Review and verify the case package.', recipientRole: 'Jail Commander', recipientUserId: 'USR-000028', institutionId: 'INS-000001', prisonerId: 'PR-000002', applicationId: 'APP-000002', linkPanel: 'verification', read: false, resolved: false, createdAt: '2026-08-10T15:00:00.000Z' },
    ],
    auditLogs: [
      { id: 'AUD-000001', userId: 'USR-000002', userName: 'John Dole', role: 'CS Parole Clerk', action: 'CREATE', entity: 'ParoleApplication', entityId: 'APP-000001', details: 'Submitted parole application for Paul Kaupa', timestamp: '2026-06-15T10:30:00.000Z' },
    ],
    reports: [],
    idCounters: {
      PR: 8, OFF: 22, USR: 23, APP: 9, INS: 1, F1: 8, F2: 7, F3: 6, F4: 1, F5: 1,
      HRG: 4, NOT: 6, AUD: 1, RPT: 0, DOC: 0, EMP: 23,
    },
  };

  return { seed, demoPasswords: { ...DEMO_PASSWORDS } };
}

module.exports = { buildSeedData, DEMO_PASSWORDS, formatAgencyUsername, BOARD_CONTRACT_YEARS };
