/**
 * Default PMS dataset — mirrors js/storage.js seedData() and js/institutions-data.js.
 */
const PNGCS_INSTITUTIONS = [
  { name: 'Bomana Correctional Institution', province: 'National Capital District', address: 'Port Moresby' },
  { name: 'Buimo Correctional Service Facility', province: 'Morobe', address: 'Lae' },
  { name: 'Baisu Correctional Service Facility', province: 'Western Highlands', address: 'Mount Hagen' },
  { name: 'Kerevat Correctional Service Facility', province: 'East New Britain', address: 'Kerevat' },
  { name: 'Boram Jail', province: 'East Sepik', address: 'Wewak' },
  { name: 'Bihute Correctional Service Facility', province: 'Eastern Highlands', address: 'Goroka' },
  { name: 'Barawagi Correctional Service Facility', province: 'Chimbu', address: 'Kundiawa' },
  { name: 'Bundaira Correctional Service Facility', province: 'Eastern Highlands', address: 'Kainantu' },
  { name: 'Bui-Iebi Correctional Service Facility', province: 'Southern Highlands', address: 'Mendi' },
  { name: 'Kavieng Correctional Service Facility', province: 'New Ireland', address: 'Kavieng' },
  { name: 'Manus Correctional Service Facility', province: 'Manus', address: 'Lorengau' },
  { name: 'Lakiemata Correctional Service Facility', province: 'West New Britain', address: 'Kimbe' },
  { name: 'Daru Correctional Service Facility', province: 'Western', address: 'Daru' },
  { name: 'Giligili Correctional Service Facility', province: 'Milne Bay', address: 'Alotau' },
  { name: 'Beon Correctional Service Facility', province: 'Madang', address: 'Madang' },
  { name: 'Vanimo Correctional Service Facility', province: 'West Sepik', address: 'Vanimo' },
  { name: 'Biru Correctional Service Facility', province: 'Northern', address: 'Popondetta' },
  { name: 'Mukurumanda Correctional Service Facility', province: 'Enga', address: 'Wabag' },
  { name: 'Hawa Correctional Service Facility', province: 'Hela', address: 'Tari' },
];

const PNGCS_JAIL_COMMANDERS = [
  { instIndex: 1, institutionName: 'Bomana Correctional Institution', province: 'National Capital District', firstName: 'James', lastName: 'Wari', employeeNumber: 'EMP-10001', phone: '+675 7345 6789', username: 'commander@cs.gov.pg', dateAppointed: '2019-03-15' },
  { instIndex: 2, institutionName: 'Buimo Correctional Service Facility', province: 'Morobe', firstName: 'Michael', lastName: 'Turi', employeeNumber: 'EMP-10002', phone: '+675 472 1101', username: 'm.turi@cs.gov.pg', dateAppointed: '2020-06-01' },
  { instIndex: 3, institutionName: 'Baisu Correctional Service Facility', province: 'Western Highlands', firstName: 'Peter', lastName: 'Koma', employeeNumber: 'EMP-10003', phone: '+675 542 2202', username: 'p.koma@cs.gov.pg', dateAppointed: '2018-11-20' },
  { instIndex: 4, institutionName: 'Kerevat Correctional Service Facility', province: 'East New Britain', firstName: 'Robert', lastName: 'Namaliu', employeeNumber: 'EMP-10004', phone: '+675 982 3303', username: 'r.namaliu@cs.gov.pg', dateAppointed: '2021-02-10' },
  { instIndex: 5, institutionName: 'Boram Jail', province: 'East Sepik', firstName: 'David', lastName: 'Amini', employeeNumber: 'EMP-10005', phone: '+675 856 4404', username: 'd.amini@cs.gov.pg', dateAppointed: '2017-08-05' },
  { instIndex: 6, institutionName: 'Bihute Correctional Service Facility', province: 'Eastern Highlands', firstName: 'Simon', lastName: 'Gideon', employeeNumber: 'EMP-10006', phone: '+675 531 5505', username: 's.gideon@cs.gov.pg', dateAppointed: '2019-09-12' },
  { instIndex: 7, institutionName: 'Barawagi Correctional Service Facility', province: 'Chimbu', firstName: 'Thomas', lastName: 'Kuri', employeeNumber: 'EMP-10007', phone: '+675 545 6606', username: 't.kuri@cs.gov.pg', dateAppointed: '2020-01-22' },
  { instIndex: 8, institutionName: 'Bundaira Correctional Service Facility', province: 'Eastern Highlands', firstName: 'William', lastName: 'Aua', employeeNumber: 'EMP-10008', phone: '+675 532 7707', username: 'w.aua@cs.gov.pg', dateAppointed: '2018-04-18' },
  { instIndex: 9, institutionName: 'Bui-Iebi Correctional Service Facility', province: 'Southern Highlands', firstName: 'Joseph', lastName: 'Mond', employeeNumber: 'EMP-10009', phone: '+675 549 8808', username: 'j.mond@cs.gov.pg', dateAppointed: '2021-07-30' },
  { instIndex: 10, institutionName: 'Kavieng Correctional Service Facility', province: 'New Ireland', firstName: 'Andrew', lastName: 'Sakias', employeeNumber: 'EMP-10010', phone: '+675 984 9909', username: 'a.sakias@cs.gov.pg', dateAppointed: '2019-12-01' },
  { instIndex: 11, institutionName: 'Manus Correctional Service Facility', province: 'Manus', firstName: 'George', lastName: 'Manu', employeeNumber: 'EMP-10011', phone: '+675 970 1010', username: 'g.manu@cs.gov.pg', dateAppointed: '2020-03-08' },
  { instIndex: 12, institutionName: 'Lakiemata Correctional Service Facility', province: 'West New Britain', firstName: 'Henry', lastName: 'Pokas', employeeNumber: 'EMP-10012', phone: '+675 983 1111', username: 'h.pokas@cs.gov.pg', dateAppointed: '2018-10-14' },
  { instIndex: 13, institutionName: 'Daru Correctional Service Facility', province: 'Western', firstName: 'Daniel', lastName: 'Dibod', employeeNumber: 'EMP-10013', phone: '+675 645 1212', username: 'd.dibod@cs.gov.pg', dateAppointed: '2021-05-25' },
  { instIndex: 14, institutionName: 'Giligili Correctional Service Facility', province: 'Milne Bay', firstName: 'Paul', lastName: 'Vege', employeeNumber: 'EMP-10014', phone: '+675 641 1313', username: 'p.vege@cs.gov.pg', dateAppointed: '2019-06-19' },
  { instIndex: 15, institutionName: 'Beon Correctional Service Facility', province: 'Madang', firstName: 'Francis', lastName: 'Yambut', employeeNumber: 'EMP-10015', phone: '+675 422 1414', username: 'f.yambut@cs.gov.pg', dateAppointed: '2020-11-03' },
  { instIndex: 16, institutionName: 'Vanimo Correctional Service Facility', province: 'West Sepik', firstName: 'Steven', lastName: 'Aitape', employeeNumber: 'EMP-10016', phone: '+675 857 1515', username: 's.aitape@cs.gov.pg', dateAppointed: '2018-02-28' },
  { instIndex: 17, institutionName: 'Biru Correctional Service Facility', province: 'Northern', firstName: 'Mark', lastName: 'Ovia', employeeNumber: 'EMP-10017', phone: '+675 323 1616', username: 'm.ovia@cs.gov.pg', dateAppointed: '2021-09-07' },
  { instIndex: 18, institutionName: 'Mukurumanda Correctional Service Facility', province: 'Enga', firstName: 'Chris', lastName: 'Kipoi', employeeNumber: 'EMP-10018', phone: '+675 547 1717', username: 'c.kipoi@cs.gov.pg', dateAppointed: '2019-04-11' },
  { instIndex: 19, institutionName: 'Hawa Correctional Service Facility', province: 'Hela', firstName: 'Benjamin', lastName: 'Hagu', employeeNumber: 'EMP-10019', phone: '+675 548 1818', username: 'b.hagu@cs.gov.pg', dateAppointed: '2020-08-16' },
];

const DEMO_PASSWORDS = {
  admin: 'admin123',
  'john.dole@cs.gov.pg': 'Password123!',
  'mary.kila@djag.gov.pg': 'Password123!',
  'commander@cs.gov.pg': 'Password123!',
  'judge.kakaraya@justice.gov.pg': 'Password123!',
  'officer.tau@cs.gov.pg': 'Password123!',
  'secretary.morris@djag.gov.pg': 'Password123!',
  'dr.sine@health.gov.pg': 'Password123!',
  'commissioner.bain@cs.gov.pg': 'Password123!',
};

function buildDefaultInstitutions() {
  return PNGCS_INSTITUTIONS.map((row, i) => {
    const id = `INS-${String(i + 1).padStart(6, '0')}`;
    const commanderUsr = i === 0 ? 4 : 4 + i + 1;
    return {
      id,
      code: id,
      name: row.name,
      province: row.province,
      address: row.address,
      location: row.address,
      status: 'Active',
      commanderId: `USR-${String(commanderUsr).padStart(6, '0')}`,
      capacity: null,
      phone: '',
      email: '',
    };
  });
}

function buildDefaultCommanders(institutions) {
  return PNGCS_JAIL_COMMANDERS.map((c) => {
    const instId = `INS-${String(c.instIndex).padStart(6, '0')}`;
    const inst = institutions.find((i) => i.id === instId);
    const usrNum = c.instIndex === 1 ? 4 : 4 + c.instIndex;
    const id = `USR-${String(usrNum).padStart(6, '0')}`;
    const officerNum = c.instIndex === 1 ? 3 : 3 + c.instIndex;
    DEMO_PASSWORDS[c.username] = 'Password123!';
    const lastLoginDay = 10 + (c.instIndex % 18);
    return {
      id,
      officerId: `OFF-${String(officerNum).padStart(6, '0')}`,
      employeeNumber: `EMP-${String(usrNum).padStart(6, '0')}`,
      username: c.username,
      email: c.username,
      firstName: c.firstName,
      lastName: c.lastName,
      role: 'Jail Commander',
      rank: 'Jail Commander',
      position: 'Jail Commander',
      institutionId: instId,
      province: c.province || inst?.province || '',
      phone: c.phone,
      employmentStatus: 'Active',
      accountStatus: 'Active',
      status: 'Active',
      dateAppointed: c.dateAppointed,
      lastLogin: `2026-07-${String(lastLoginDay).padStart(2, '0')}T0${8 + (c.instIndex % 2)}:30:00.000Z`,
      profilePhoto: null,
      boardPosition: null,
    };
  });
}

function buildSeedData() {
  const now = new Date().toISOString();
  const institutions = buildDefaultInstitutions();
  const commanders = buildDefaultCommanders(institutions);

  const seed = {
    settings: {
      paroleEligibilityFraction: 1 / 3,
      paroleEligibilityLabel: 'One-third (1/3) of total sentence',
      systemName: 'Parole Management System',
    },
    institutions,
    users: [
      { id: 'USR-000001', officerId: null, employeeNumber: null, username: 'admin', email: 'admin@pms.gov.pg', firstName: 'System', lastName: 'Administrator', role: 'System Administrator', rank: 'Administrator', institutionId: null, province: '', position: 'Administrator', phone: '', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2018-01-01', lastLogin: '2026-07-30T09:00:00.000Z', profilePhoto: null },
      { id: 'USR-000002', officerId: 'OFF-000001', employeeNumber: 'EMP-000002', username: 'john.dole@cs.gov.pg', email: 'john.dole@cs.gov.pg', firstName: 'John', lastName: 'Dole', role: 'PNGCS Parole Clerk', rank: 'Parole Clerk', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Clerk', phone: '+675 7123 4567', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2020-05-10', lastLogin: '2026-07-29T14:00:00.000Z', profilePhoto: null },
      { id: 'USR-000003', officerId: 'OFF-000002', employeeNumber: 'EMP-000003', username: 'mary.kila@djag.gov.pg', email: 'mary.kila@djag.gov.pg', firstName: 'Mary', lastName: 'Kila', role: 'DJAG Parole Clerk', rank: 'Parole Clerk', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Clerk', phone: '+675 7234 5678', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2021-03-22', lastLogin: '2026-07-28T11:00:00.000Z', profilePhoto: null },
      commanders[0],
      { id: 'USR-000005', officerId: 'OFF-000004', employeeNumber: 'EMP-000005', username: 'judge.kakaraya@justice.gov.pg', email: 'judge.kakaraya@justice.gov.pg', firstName: 'Francis', lastName: 'Kakaraya', role: 'Parole Board Member', rank: 'Board Member', institutionId: 'INS-000001', province: 'National Capital District', position: 'Board Member', phone: '+675 7456 7890', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'Chairperson', contractStartDate: '2021-01-01', contractExpiryDate: '2026-12-31', contractStatus: 'Active', status: 'Active', dateAppointed: '2016-11-05', lastLogin: '2026-07-27T10:00:00.000Z', profilePhoto: null },
      { id: 'USR-000024', officerId: 'OFF-000024', employeeNumber: 'EMP-000024', username: 'officer.tau@cs.gov.pg', email: 'officer.tau@cs.gov.pg', firstName: 'Samuel', lastName: 'Tau', role: 'CS Parole Officer', rank: 'Parole Officer', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Officer', phone: '+675 7123 4500', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2021-08-01', lastLogin: '2026-07-20T09:00:00.000Z', profilePhoto: null },
      { id: 'USR-000025', officerId: 'OFF-000025', employeeNumber: 'EMP-000025', username: 'secretary.morris@djag.gov.pg', email: 'secretary.morris@djag.gov.pg', firstName: 'Helen', lastName: 'Morris', role: 'DJAG Secretary', rank: 'Secretary', institutionId: 'INS-000001', province: 'National Capital District', position: 'DJAG Secretary', phone: '+675 7234 5600', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'DJAG Secretary', contractStartDate: '2022-01-01', contractExpiryDate: '2027-01-01', contractStatus: 'Active', status: 'Active', dateAppointed: '2022-01-01', lastLogin: null, profilePhoto: null },
      { id: 'USR-000026', officerId: 'OFF-000026', employeeNumber: 'EMP-000026', username: 'dr.sine@health.gov.pg', email: 'dr.sine@health.gov.pg', firstName: 'Grace', lastName: 'Sine', role: 'Doctor', rank: 'Medical Officer', institutionId: 'INS-000001', province: 'National Capital District', position: 'Medical Member', phone: '+675 7345 6700', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'Medical Member', contractStartDate: '2022-01-01', contractExpiryDate: '2027-01-01', contractStatus: 'Active', status: 'Active', dateAppointed: '2022-01-01', lastLogin: null, profilePhoto: null },
      { id: 'USR-000027', officerId: 'OFF-000027', employeeNumber: 'EMP-000027', username: 'commissioner.bain@cs.gov.pg', email: 'commissioner.bain@cs.gov.pg', firstName: 'Robert', lastName: 'Bain', role: 'CS Commissioner', rank: 'Commissioner', institutionId: 'INS-000001', province: 'National Capital District', position: 'Commissioner PNGCS', phone: '+675 7456 7800', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'Commissioner PNGCS', contractStartDate: '2022-01-01', contractExpiryDate: '2027-01-01', contractStatus: 'Active', status: 'Active', dateAppointed: '2022-01-01', lastLogin: null, profilePhoto: null },
      ...commanders.slice(1),
    ],
    prisoners: [
      { id: 'PR-000001', prisonerNumber: 'PR-000001', institutionId: 'INS-000001', firstName: 'Paul', lastName: 'Kaupa', dateOfBirth: '1992-04-10', gender: 'Male', offense: 'Armed Robbery', sentenceStartDate: '2020-01-15', sentenceEndDate: '2030-01-15', status: 'Eligible for Parole', documents: [] },
      { id: 'PR-000002', prisonerNumber: 'PR-000002', institutionId: 'INS-000001', firstName: 'Peter', lastName: 'Wama', dateOfBirth: '1988-09-18', gender: 'Male', offense: 'Unlawful Wounding', sentenceStartDate: '2019-06-01', sentenceEndDate: '2027-06-01', status: 'In Custody', documents: [] },
      { id: 'PR-000003', prisonerNumber: 'PR-000003', institutionId: 'INS-000003', firstName: 'Sarah', lastName: 'Tekate', dateOfBirth: '1995-12-01', gender: 'Female', offense: 'Grand Larceny', sentenceStartDate: '2022-03-10', sentenceEndDate: '2028-03-10', status: 'In Custody', documents: [] },
    ],
    applications: [
      {
        id: 'APP-000001', prisonerId: 'PR-000001', institutionId: 'INS-000001', status: 'Submitted',
        submittedAt: '2026-06-15', submittedBy: 'USR-000002',
        formData: {
          form1: {
            formId: 'F1-000001',
            status: 'submitted',
            screeningDate: '2026-06-15',
            eligibilityOutcome: 'eligible',
            recommendationReason: 'Meets one-third sentence threshold and eligibility criteria.',
            officerName: 'John Dole',
            officerId: 'OFF-000001',
            submittedAt: '2026-06-15T10:30:00.000Z',
            submittedBy: 'USR-000002',
            statutoryExemptionApplicable: 'no',
            victimNotificationRequired: 'no',
            prisonerSignatureDate: '2026-06-14',
          },
          form2: { formId: 'F2-000001', nextOfKinName: 'Samuel Kaupa', nextOfKinContact: '+675 7123 4567', guarantorName: 'Samuel Kaupa' },
          form3: {}, form4: {}, form5: {},
        },
        boardDecision: null, workflowNotes: [], createdAt: now,
      },
      {
        id: 'APP-000002', prisonerId: 'PR-000002', institutionId: 'INS-000001', status: 'Draft',
        submittedAt: null, submittedBy: null,
        formData: { form1: {}, form2: {}, form3: {}, form4: {}, form5: {} },
        boardDecision: null, workflowNotes: [], createdAt: now,
      },
      {
        id: 'APP-000003', prisonerId: 'PR-000002', institutionId: 'INS-000001', status: 'Approved',
        submittedAt: '2025-11-01', submittedBy: 'USR-000002',
        formData: {
          form1: { formId: 'F1-000002', status: 'submitted', eligibilityOutcome: 'eligible', screeningDate: '2026-05-01', officerName: 'John Dole', recommendationReason: 'Eligible under PMS one-third rule.' },
          form2: { formId: 'F2-000002', nextOfKinName: 'Grace Wama' },
          form3: { formId: 'F3-000001', commanderRecommendation: 'Recommended' },
          form4: { formId: 'F4-000001', investigationSummary: 'Community support verified' },
          form5: { formId: 'F5-000001', boardDecision: 'Approved', conditions: 'Monthly reporting to PNGCS' },
        },
        boardDecision: { outcome: 'Approved', conditions: 'Monthly reporting to PNGCS', deliberationNotes: 'Unanimous approval', decidedBy: 'USR-000005', decidedAt: '2026-01-20' },
        workflowNotes: [], createdAt: '2025-10-01T00:00:00.000Z',
      },
    ],
    hearings: [
      { id: 'HRG-000001', applicationId: 'APP-000001', prisonerId: 'PR-000001', institutionId: 'INS-000001', scheduledDate: '2026-08-15', scheduledTime: '10:00', location: 'Bomana Hearing Room A', notes: 'Initial board hearing', status: 'Scheduled' },
    ],
    notifications: [
      { id: 'NOT-000001', type: 'parole_eligibility', title: 'Parole Eligibility Alert', message: 'Paul Kaupa (PR-000001) has reached parole eligibility threshold.', recipientRole: 'PNGCS Parole Clerk', recipientUserId: null, institutionId: 'INS-000001', prisonerId: 'PR-000001', eligibleDate: '2025-01-15', read: false, resolved: false, createdAt: '2026-01-15T08:00:00.000Z' },
      { id: 'NOT-000002', type: 'system', title: 'New Parole Application', message: 'PNGCS submitted application for Paul Kaupa — pending DJAG review.', recipientRole: 'DJAG Parole Clerk', recipientUserId: null, institutionId: 'INS-000001', prisonerId: 'PR-000001', read: false, resolved: false, createdAt: '2026-06-15T10:30:00.000Z' },
      { id: 'NOT-000003', type: 'parole_eligibility', title: 'Parole Eligibility Alert', message: 'Paul Kaupa (PR-000001) reached eligibility: One-third (1/3) of total sentence.', recipientRole: 'System Administrator', recipientUserId: null, institutionId: 'INS-000001', prisonerId: 'PR-000001', eligibleDate: '2025-01-15', read: false, resolved: false, createdAt: '2026-01-15T08:00:00.000Z' },
      { id: 'NOT-000004', type: 'parole_eligibility', title: 'Parole Eligibility Alert', message: 'Paul Kaupa (PR-000001) reached eligibility at Bomana Correctional Institution.', recipientRole: 'Jail Commander', recipientUserId: 'USR-000004', institutionId: 'INS-000001', prisonerId: 'PR-000001', eligibleDate: '2025-01-15', read: true, resolved: false, createdAt: '2026-01-15T08:00:00.000Z' },
    ],
    auditLogs: [
      { id: 'AUD-000001', userId: 'USR-000002', userName: 'John Dole', role: 'PNGCS Parole Clerk', action: 'CREATE', entity: 'ParoleApplication', entityId: 'APP-000001', details: 'Submitted parole application for Paul Kaupa', timestamp: '2026-06-15T10:30:00.000Z' },
      { id: 'AUD-000002', userId: 'USR-000001', userName: 'System Administrator', role: 'System Administrator', action: 'LOGIN', entity: 'Session', entityId: 'USR-000001', details: 'Administrator signed in', timestamp: '2026-07-30T09:00:00.000Z' },
      { id: 'AUD-000003', userId: 'USR-000004', userName: 'James Wari', role: 'Jail Commander', action: 'APPROVE', entity: 'InstitutionReport', entityId: 'INS-000001', details: 'Approved institutional report for Bomana', timestamp: '2026-06-20T14:00:00.000Z' },
      { id: 'AUD-000004', userId: 'USR-000005', userName: 'Francis Kakaraya', role: 'Parole Board Member', action: 'DECISION', entity: 'ParoleApplication', entityId: 'APP-000003', details: 'Board Approved — Peter Wama', timestamp: '2026-01-20T11:00:00.000Z' },
    ],
    reports: [
      { id: 'RPT-000001', institutionId: 'INS-000001', type: 'institutional', title: 'Institutional Report — Bomana', status: 'Approved', createdBy: 'USR-000004', createdAt: '2026-06-20T14:00:00.000Z' },
    ],
    idCounters: {
      PR: 3, OFF: 22, USR: 23, APP: 3, INS: 19, F1: 2, F2: 2, F3: 1, F4: 1, F5: 1,
      HRG: 1, NOT: 4, AUD: 4, RPT: 1, DOC: 0, EMP: 23,
    },
  };

  return { seed, demoPasswords: { ...DEMO_PASSWORDS } };
}

module.exports = { buildSeedData, DEMO_PASSWORDS };
