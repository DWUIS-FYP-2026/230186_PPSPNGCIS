/**
 * Parole Act 1991 — RBAC for report editing and transitions.
 */
const { ROLES } = require('./constants');
const { normalizeRole } = require('../auth-service');

const REPORT_EDIT = Object.freeze({
  detainee: new Set([ROLES.CS_OFFICER, ROLES.ADMIN]),
  preParole: new Set([ROLES.PROBATION_OFFICER, ROLES.ADMIN]),
});

const ACTION_ROLES = Object.freeze({
  viewEligibleList: new Set([ROLES.CS_PAROLE_CLERK, ROLES.ADMIN]),
  submitConsent: new Set([ROLES.CS_PAROLE_CLERK, ROLES.ADMIN]),
  submitDetaineeReport: new Set([ROLES.CS_OFFICER, ROLES.ADMIN]),
  submitPreParoleReport: new Set([ROLES.PROBATION_OFFICER, ROLES.ADMIN]),
  scheduleHearing: new Set([ROLES.CHAIRMAN, ROLES.ADMIN]),
  recordVote: new Set([ROLES.CHAIRMAN, ROLES.DOCTOR, ROLES.CS_COMMISSIONER, ROLES.ADMIN]),
  finalizeDecision: new Set([ROLES.CHAIRMAN, ROLES.ADMIN]),
  runEligibilityJob: new Set([ROLES.ADMIN]),
});

function checkRole(user, allowedSet) {
  const role = normalizeRole(user?.role);
  return allowedSet.has(role);
}

function assertRole(user, allowedSet, actionLabel) {
  if (!checkRole(user, allowedSet)) {
    throw new Error(`You do not have permission to ${actionLabel}.`);
  }
}

function canEditDetaineeReport(user) {
  return checkRole(user, REPORT_EDIT.detainee);
}

function canEditPreParoleReport(user) {
  return checkRole(user, REPORT_EDIT.preParole);
}

function assertCanEditDetaineeReport(user) {
  if (!canEditDetaineeReport(user)) {
    throw new Error('Only CS Officers may create or edit Detainee Assessment Reports.');
  }
}

function assertCanEditPreParoleReport(user) {
  if (!canEditPreParoleReport(user)) {
    throw new Error('Only Probation & Parole Officers (DJAG) may create or edit Pre-Parole Reports.');
  }
}

module.exports = {
  REPORT_EDIT,
  ACTION_ROLES,
  checkRole,
  assertRole,
  canEditDetaineeReport,
  canEditPreParoleReport,
  assertCanEditDetaineeReport,
  assertCanEditPreParoleReport,
};
