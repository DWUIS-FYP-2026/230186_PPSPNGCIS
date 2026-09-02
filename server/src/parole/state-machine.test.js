const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PAROLE_STATUSES, RISK_LEVELS } = require('./constants');
const { validateTransition, assertRiskAllowsBoardHearing } = require('./state-machine');

describe('Parole Act 1991 — state machine guards', () => {
  it('allows PENDING_ELIGIBILITY → ELIGIBLE for system', () => {
    assert.doesNotThrow(() => {
      validateTransition(PAROLE_STATUSES.PENDING_ELIGIBILITY, PAROLE_STATUSES.ELIGIBLE, {}, 'system');
    });
  });

  it('blocks REPORT_PREPARATION → AWAITING_BOARD_HEARING when risk is not Low', () => {
    assert.throws(() => {
      validateTransition(PAROLE_STATUSES.REPORT_PREPARATION, PAROLE_STATUSES.AWAITING_BOARD_HEARING, {
        detaineeReportSubmitted: true,
        preParoleReportSubmitted: true,
        riskLevel: RISK_LEVELS.HIGH,
      }, 'system');
    }, /Only low-risk prisoners can be recommended for parole/);
  });

  it('allows REPORT_PREPARATION → AWAITING_BOARD_HEARING when risk is Low and reports complete', () => {
    assert.doesNotThrow(() => {
      validateTransition(PAROLE_STATUSES.REPORT_PREPARATION, PAROLE_STATUSES.AWAITING_BOARD_HEARING, {
        detaineeReportSubmitted: true,
        preParoleReportSubmitted: true,
        riskLevel: RISK_LEVELS.LOW,
      }, 'system');
    });
  });

  it('requires prisoner consent Yes for REPORT_PREPARATION', () => {
    assert.throws(() => {
      validateTransition(PAROLE_STATUSES.AWAITING_PRISONER_CONSENT, PAROLE_STATUSES.REPORT_PREPARATION, {
        prisonerConsent: false,
      }, 'PNGCS Parole Clerk');
    }, /Prisoner consent must be recorded as Yes/);
  });

  it('hard stop risk check throws expected message', () => {
    assert.throws(() => {
      assertRiskAllowsBoardHearing({ riskLevel: RISK_LEVELS.MEDIUM });
    }, /Only low-risk prisoners can be recommended for parole/);
  });
});
