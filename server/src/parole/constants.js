/**
 * Parole Act 1991 — constants, enums, and board composition.
 * Paramount consideration: Community Safety and Protection.
 */

const PAROLE_STATUSES = Object.freeze({
  PENDING_ELIGIBILITY: 'PENDING_ELIGIBILITY',
  ELIGIBLE: 'ELIGIBLE',
  AWAITING_PRISONER_CONSENT: 'AWAITING_PRISONER_CONSENT',
  DECLINED: 'DECLINED',
  REPORT_PREPARATION: 'REPORT_PREPARATION',
  AWAITING_BOARD_HEARING: 'AWAITING_BOARD_HEARING',
  BOARD_DELIBERATION: 'BOARD_DELIBERATION',
  PAROLE_GRANTED: 'PAROLE_GRANTED',
  PAROLE_DENIED: 'PAROLE_DENIED',
});

const SENTENCE_TYPES = Object.freeze({ STANDARD: 'Standard', LIFE: 'Life' });

const RISK_LEVELS = Object.freeze({ LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' });

const VOTE = Object.freeze({ GRANT: 'Grant', DENY: 'Deny' });

const BOARD_ROLES = Object.freeze({
  CHAIRMAN: 'DJAG Secretary',
  MEDICAL: 'Doctor',
  CORRECTIONAL: 'CS Commissioner',
});

const BOARD_COMPOSITION = Object.freeze([
  { seat: 'chairman', role: BOARD_ROLES.CHAIRMAN, label: 'DJAG Secretary' },
  { seat: 'doctor', role: BOARD_ROLES.MEDICAL, label: 'Psychiatrist' },
  { seat: 'commissioner', role: BOARD_ROLES.CORRECTIONAL, label: 'PNGCS Commissioner' },
]);

const ROLES = Object.freeze({
  CS_PAROLE_CLERK: 'CS Parole Clerk',
  CS_OFFICER: 'CS Parole Officer',
  PROBATION_OFFICER: 'DJAG Parole Clerk',
  CHAIRMAN: 'DJAG Secretary',
  DOCTOR: 'Doctor',
  CS_COMMISSIONER: 'CS Commissioner',
  ADMIN: 'System Administrator',
});

const WORKFLOW_VERSION = 'act1991';

const LIFE_ELIGIBILITY_YEARS = 10;
const ELIGIBILITY_FRACTION = 0.5;
const NOTIFICATION_MONTHS_BEFORE = 6;
const PARAMOUNT_FACTOR = 'Community Safety and Protection';

module.exports = {
  PAROLE_STATUSES,
  SENTENCE_TYPES,
  RISK_LEVELS,
  VOTE,
  BOARD_ROLES,
  BOARD_COMPOSITION,
  ROLES,
  WORKFLOW_VERSION,
  LIFE_ELIGIBILITY_YEARS,
  ELIGIBILITY_FRACTION,
  NOTIFICATION_MONTHS_BEFORE,
  PARAMOUNT_FACTOR,
};
