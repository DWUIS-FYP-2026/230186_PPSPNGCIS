/**
 * Default PMS dataset — Port Moresby (Bomana) scope; mirrors js/storage.js seedData().
 */
const PNGCS_INSTITUTIONS = [
  { name: 'Bomana Correctional Institution', province: 'National Capital District', address: 'Port Moresby' },
];

const DEMO_PASSWORDS = {
  admin: 'admin123',
  'john.dole@cs.gov.pg': 'Password123!',
  'mary.kila@djag.gov.pg': 'Password123!',
  'judge.kakaraya@justice.gov.pg': 'Password123!',
  'officer.tau@cs.gov.pg': 'Password123!',
  'secretary.morris@djag.gov.pg': 'Password123!',
  'dr.sine@health.gov.pg': 'Password123!',
  'commissioner.bain@cs.gov.pg': 'Password123!',
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

function buildSeedData() {
  const now = new Date().toISOString();
  const institutions = buildDefaultInstitutions();

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
      { id: 'USR-000005', officerId: 'OFF-000004', employeeNumber: 'EMP-000005', username: 'judge.kakaraya@justice.gov.pg', email: 'judge.kakaraya@justice.gov.pg', firstName: 'Francis', lastName: 'Kakaraya', role: 'Parole Board Member', rank: 'Board Member', institutionId: 'INS-000001', province: 'National Capital District', position: 'Board Member', phone: '+675 7456 7890', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'Chairperson', contractStartDate: '2021-01-01', contractExpiryDate: '2026-12-31', contractStatus: 'Active', status: 'Active', dateAppointed: '2016-11-05', lastLogin: '2026-07-27T10:00:00.000Z', profilePhoto: null },
      { id: 'USR-000024', officerId: 'OFF-000024', employeeNumber: 'EMP-000024', username: 'officer.tau@cs.gov.pg', email: 'officer.tau@cs.gov.pg', firstName: 'Samuel', lastName: 'Tau', role: 'CS Parole Officer', rank: 'Parole Officer', institutionId: 'INS-000001', province: 'National Capital District', position: 'Parole Officer', phone: '+675 7123 4500', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: null, status: 'Active', dateAppointed: '2021-08-01', lastLogin: '2026-07-20T09:00:00.000Z', profilePhoto: null },
      { id: 'USR-000025', officerId: 'OFF-000025', employeeNumber: 'EMP-000025', username: 'secretary.morris@djag.gov.pg', email: 'secretary.morris@djag.gov.pg', firstName: 'Helen', lastName: 'Morris', role: 'DJAG Secretary', rank: 'Secretary', institutionId: 'INS-000001', province: 'National Capital District', position: 'DJAG Secretary', phone: '+675 7234 5600', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'DJAG Secretary', contractStartDate: '2022-01-01', contractExpiryDate: '2027-01-01', contractStatus: 'Active', status: 'Active', dateAppointed: '2022-01-01', lastLogin: null, profilePhoto: null },
      { id: 'USR-000026', officerId: 'OFF-000026', employeeNumber: 'EMP-000026', username: 'dr.sine@health.gov.pg', email: 'dr.sine@health.gov.pg', firstName: 'Grace', lastName: 'Sine', role: 'Doctor', rank: 'Medical Officer', institutionId: 'INS-000001', province: 'National Capital District', position: 'Medical Member', phone: '+675 7345 6700', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'Medical Member', contractStartDate: '2022-01-01', contractExpiryDate: '2027-01-01', contractStatus: 'Active', status: 'Active', dateAppointed: '2022-01-01', lastLogin: null, profilePhoto: null },
      { id: 'USR-000027', officerId: 'OFF-000027', employeeNumber: 'EMP-000027', username: 'commissioner.bain@cs.gov.pg', email: 'commissioner.bain@cs.gov.pg', firstName: 'Robert', lastName: 'Bain', role: 'CS Commissioner', rank: 'Commissioner', institutionId: 'INS-000001', province: 'National Capital District', position: 'Commissioner PNGCS', phone: '+675 7456 7800', employmentStatus: 'Active', accountStatus: 'Active', boardPosition: 'Commissioner PNGCS', contractStartDate: '2022-01-01', contractExpiryDate: '2027-01-01', contractStatus: 'Active', status: 'Active', dateAppointed: '2022-01-01', lastLogin: null, profilePhoto: null },
    ],
    prisoners: [
      { id: 'PR-000001', prisonerNumber: 'PR-000001', institutionId: 'INS-000001', firstName: 'Paul', lastName: 'Kaupa', dateOfBirth: '1992-04-10', gender: 'Male', offense: 'Armed Robbery', sentenceStartDate: '2020-01-15', sentenceEndDate: '2030-01-15', status: 'Eligible for Parole', documents: [] },
      { id: 'PR-000002', prisonerNumber: 'PR-000002', institutionId: 'INS-000001', firstName: 'Peter', lastName: 'Wama', dateOfBirth: '1988-09-18', gender: 'Male', offense: 'Unlawful Wounding', sentenceStartDate: '2019-06-01', sentenceEndDate: '2027-06-01', status: 'In Custody', documents: [] },
      { id: 'PR-000003', prisonerNumber: 'PR-000003', institutionId: 'INS-000001', firstName: 'Sarah', lastName: 'Tekate', dateOfBirth: '1995-12-01', gender: 'Female', offense: 'Grand Larceny', sentenceStartDate: '2022-03-10', sentenceEndDate: '2028-03-10', status: 'In Custody', documents: [] },
    ],
    applications: [],
    hearings: [],
    notifications: [],
    auditLogs: [],
    reports: [],
    idCounters: {
      PR: 3, OFF: 22, USR: 23, APP: 0, INS: 1, F1: 0, F2: 0, F3: 0, F4: 0, F5: 0,
      HRG: 0, NOT: 0, AUD: 0, RPT: 0, DOC: 0, EMP: 23,
    },
  };

  return { seed, demoPasswords: { ...DEMO_PASSWORDS } };
}

module.exports = { buildSeedData, DEMO_PASSWORDS };
