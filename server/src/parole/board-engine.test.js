const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hasQuorum,
  assertQuorum,
  computeFinalDecision,
  tallyVotes,
} = require('./board-engine');

describe('Parole Act 1991 — board decision engine', () => {
  it('requires all 3 votes for quorum', () => {
    assert.equal(hasQuorum({ chairman_vote: 'Grant', doctor_vote: 'Grant' }), false);
    assert.equal(hasQuorum({
      chairman_vote: 'Grant',
      doctor_vote: 'Deny',
      commissioner_vote: 'Grant',
    }), true);
  });

  it('blocks finalize without quorum', () => {
    assert.throws(() => assertQuorum({ chairman_vote: 'Grant' }), /all 3 members must record/);
  });

  it('majority Grant when community safety score is acceptable', () => {
    const outcome = computeFinalDecision({
      chairman_vote: 'Grant',
      doctor_vote: 'Grant',
      commissioner_vote: 'Deny',
    }, { communitySafetyScore: 75 });
    assert.equal(outcome.finalDecision, 'Grant');
    assert.match(outcome.reason, /Community Safety/);
  });

  it('denies when community safety score is below threshold', () => {
    const outcome = computeFinalDecision({
      chairman_vote: 'Grant',
      doctor_vote: 'Grant',
      commissioner_vote: 'Grant',
    }, { communitySafetyScore: 40, safetyThreshold: 60 });
    assert.equal(outcome.finalDecision, 'Deny');
  });

  it('tally counts votes correctly', () => {
    const { grantCount, denyCount } = tallyVotes({
      chairman_vote: 'Grant',
      doctor_vote: 'Deny',
      commissioner_vote: 'Grant',
    });
    assert.equal(grantCount, 2);
    assert.equal(denyCount, 1);
  });
});
