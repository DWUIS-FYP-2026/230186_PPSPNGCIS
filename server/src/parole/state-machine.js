/**
 * Parole Act 1991 — strict state machine with transition guards.
 */
const { PAROLE_STATUSES, RISK_LEVELS, ROLES } = require('./constants');

const TRANSITIONS = Object.freeze({
  [PAROLE_STATUSES.PENDING_ELIGIBILITY]: [PAROLE_STATUSES.ELIGIBLE],
  [PAROLE_STATUSES.ELIGIBLE]: [PAROLE_STATUSES.AWAITING_PRISONER_CONSENT],
  [PAROLE_STATUSES.AWAITING_PRISONER_CONSENT]: [
    PAROLE_STATUSES.REPORT_PREPARATION,
    PAROLE_STATUSES.DECLINED,
  ],
  [PAROLE_STATUSES.REPORT_PREPARATION]: [PAROLE_STATUSES.AWAITING_BOARD_HEARING],
  [PAROLE_STATUSES.AWAITING_BOARD_HEARING]: [PAROLE_STATUSES.BOARD_DELIBERATION],
  [PAROLE_STATUSES.BOARD_DELIBERATION]: [
    PAROLE_STATUSES.PAROLE_GRANTED,
    PAROLE_STATUSES.PAROLE_DENIED,
  ],
});

const TRANSITION_ROLES = Object.freeze({
  [`${PAROLE_STATUSES.PENDING_ELIGIBILITY}->${PAROLE_STATUSES.ELIGIBLE}`]: ['system'],
  [`${PAROLE_STATUSES.ELIGIBLE}->${PAROLE_STATUSES.AWAITING_PRISONER_CONSENT}`]: [
    ROLES.CS_PAROLE_CLERK, ROLES.ADMIN,
  ],
  [`${PAROLE_STATUSES.AWAITING_PRISONER_CONSENT}->${PAROLE_STATUSES.REPORT_PREPARATION}`]: [
    ROLES.CS_PAROLE_CLERK, ROLES.ADMIN,
  ],
  [`${PAROLE_STATUSES.AWAITING_PRISONER_CONSENT}->${PAROLE_STATUSES.DECLINED}`]: [
    ROLES.CS_PAROLE_CLERK, ROLES.ADMIN,
  ],
  [`${PAROLE_STATUSES.REPORT_PREPARATION}->${PAROLE_STATUSES.AWAITING_BOARD_HEARING}`]: [
    'system', ROLES.CS_PAROLE_CLERK, ROLES.ADMIN,
  ],
  [`${PAROLE_STATUSES.AWAITING_BOARD_HEARING}->${PAROLE_STATUSES.BOARD_DELIBERATION}`]: [
    ROLES.CHAIRMAN, ROLES.ADMIN,
  ],
  [`${PAROLE_STATUSES.BOARD_DELIBERATION}->${PAROLE_STATUSES.PAROLE_GRANTED}`]: [
    ROLES.CHAIRMAN, ROLES.ADMIN,
  ],
  [`${PAROLE_STATUSES.BOARD_DELIBERATION}->${PAROLE_STATUSES.PAROLE_DENIED}`]: [
    ROLES.CHAIRMAN, ROLES.ADMIN,
  ],
});

function normalizeActorRole(role) {
  if (!role) return 'system';
  const map = {
    Admin: ROLES.ADMIN,
    'CS Parole Clerk': ROLES.CS_PAROLE_CLERK,
    Secretariat: ROLES.PROBATION_OFFICER,
  };
  return map[role] || role;
}

function canTransition(fromStatus, toStatus) {
  const allowed = TRANSITIONS[fromStatus];
  return !!allowed && allowed.includes(toStatus);
}

function assertTransitionAllowed(fromStatus, toStatus, actorRole = 'system') {
  if (!canTransition(fromStatus, toStatus)) {
    throw new Error(`Invalid transition: ${fromStatus} → ${toStatus}.`);
  }
  const key = `${fromStatus}->${toStatus}`;
  const roles = TRANSITION_ROLES[key] || [];
  const normalized = normalizeActorRole(actorRole);
  if (!roles.includes(normalized) && !roles.includes('system')) {
    throw new Error(`Role "${actorRole}" may not perform transition ${fromStatus} → ${toStatus}.`);
  }
  if (roles.includes('system') && normalized === 'system') return;
  if (roles.includes(normalized) || normalized === ROLES.ADMIN) return;
  throw new Error(`Role "${actorRole}" may not perform transition ${fromStatus} → ${toStatus}.`);
}

/**
 * Hard Stop 1: Only Low risk may leave REPORT_PREPARATION.
 */
function assertRiskAllowsBoardHearing(context) {
  const risk = context.riskLevel || context.riskClassification;
  if (risk !== RISK_LEVELS.LOW) {
    throw new Error('Only low-risk prisoners can be recommended for parole.');
  }
}

function assertReportsComplete(context) {
  if (!context.detaineeReportSubmitted) {
    throw new Error('Detainee Assessment Report must be submitted before proceeding.');
  }
  if (!context.preParoleReportSubmitted) {
    throw new Error('Pre-Parole Report must be submitted before proceeding.');
  }
}

function assertConsentRecorded(context, toStatus) {
  if (toStatus === PAROLE_STATUSES.REPORT_PREPARATION && context.prisonerConsent !== true) {
    throw new Error('Prisoner consent must be recorded as Yes before report preparation.');
  }
  if (toStatus === PAROLE_STATUSES.DECLINED && context.prisonerConsent !== false) {
    throw new Error('Prisoner consent must be recorded as No to decline.');
  }
}

function validateTransition(fromStatus, toStatus, context = {}, actorRole = 'system') {
  assertTransitionAllowed(fromStatus, toStatus, actorRole);

  if (fromStatus === PAROLE_STATUSES.AWAITING_PRISONER_CONSENT) {
    assertConsentRecorded(context, toStatus);
  }

  if (fromStatus === PAROLE_STATUSES.REPORT_PREPARATION && toStatus === PAROLE_STATUSES.AWAITING_BOARD_HEARING) {
    assertReportsComplete(context);
    assertRiskAllowsBoardHearing(context);
  }
}

module.exports = {
  TRANSITIONS,
  TRANSITION_ROLES,
  canTransition,
  assertTransitionAllowed,
  assertRiskAllowsBoardHearing,
  assertReportsComplete,
  validateTransition,
  normalizeActorRole,
};
