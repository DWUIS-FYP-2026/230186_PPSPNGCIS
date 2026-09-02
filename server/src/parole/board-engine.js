/**
 * Parole Board decision engine — quorum, voting, community safety priority.
 */
const { VOTE, BOARD_COMPOSITION, PARAMOUNT_FACTOR } = require('./constants');

const VOTE_COLUMNS = Object.freeze({
  chairman: 'chairman_vote',
  doctor: 'doctor_vote',
  commissioner: 'commissioner_vote',
});

const SEAT_ROLE_MAP = Object.freeze({
  chairman: 'DJAG Secretary',
  doctor: 'Doctor',
  commissioner: 'CS Commissioner',
});

function mapSeatForRole(role) {
  const normalized = role === 'Secretariat' ? 'DJAG Secretary' : role;
  return Object.entries(SEAT_ROLE_MAP).find(([, r]) => r === normalized)?.[0] || null;
}

function getVotes(decision) {
  return {
    chairman: decision.chairman_vote || decision.chairmanVote || null,
    doctor: decision.doctor_vote || decision.doctorVote || null,
    commissioner: decision.commissioner_vote || decision.commissionerVote || null,
  };
}

function hasQuorum(decision) {
  const votes = getVotes(decision);
  return BOARD_COMPOSITION.every(({ seat }) => votes[seat] === VOTE.GRANT || votes[seat] === VOTE.DENY);
}

function assertQuorum(decision) {
  if (!hasQuorum(decision)) {
    throw new Error('Board decision cannot be finalized: all 3 members must record Grant or Deny votes (quorum required).');
  }
}

function tallyVotes(decision) {
  const votes = getVotes(decision);
  const values = Object.values(votes);
  const grantCount = values.filter((v) => v === VOTE.GRANT).length;
  const denyCount = values.filter((v) => v === VOTE.DENY).length;
  return { grantCount, denyCount, votes };
}

/**
 * Community Safety and Protection is paramount — deny if any member votes Deny
 * when community safety score is below threshold, otherwise majority rules.
 */
function computeFinalDecision(decision, context = {}) {
  assertQuorum(decision);
  const { grantCount, denyCount } = tallyVotes(decision);

  const safetyScore = context.communitySafetyScore ?? decision.community_safety_score ?? 100;
  const safetyThreshold = context.safetyThreshold ?? 60;

  if (safetyScore < safetyThreshold) {
    return {
      finalDecision: VOTE.DENY,
      reason: `${PARAMOUNT_FACTOR}: community safety score (${safetyScore}) below required threshold (${safetyThreshold}).`,
      communitySafetyPrimary: true,
    };
  }

  const anyDenyForSafety = Object.values(getVotes(decision)).some((v) => v === VOTE.DENY)
    && context.strictCommunitySafety === true;

  if (anyDenyForSafety) {
    return {
      finalDecision: VOTE.DENY,
      reason: `${PARAMOUNT_FACTOR}: at least one board member raised community safety concerns.`,
      communitySafetyPrimary: true,
    };
  }

  if (grantCount > denyCount) {
    return {
      finalDecision: VOTE.GRANT,
      reason: `Majority Grant (${grantCount}/3). ${PARAMOUNT_FACTOR} assessed as acceptable.`,
      communitySafetyPrimary: true,
    };
  }

  if (denyCount > grantCount) {
    return {
      finalDecision: VOTE.DENY,
      reason: `Majority Deny (${denyCount}/3).`,
      communitySafetyPrimary: true,
    };
  }

  return {
    finalDecision: VOTE.DENY,
    reason: 'Split decision — default Deny under Community Safety and Protection policy.',
    communitySafetyPrimary: true,
  };
}

function assertValidVote(vote) {
  if (vote !== VOTE.GRANT && vote !== VOTE.DENY) {
    throw new Error('Vote must be Grant or Deny.');
  }
}

function recordVotePatch(seat, vote) {
  assertValidVote(vote);
  const column = VOTE_COLUMNS[seat];
  if (!column) throw new Error(`Unknown board seat: ${seat}.`);
  return { [column]: vote };
}

function calculateCommunitySafetyScore(preParoleReport = {}, detaineeReport = {}) {
  let score = 70;
  const safetyText = (preParoleReport.community_safety_assessment || preParoleReport.communitySafetyAssessment || '').toLowerCase();
  if (safetyText.includes('high risk') || safetyText.includes('unsafe')) score -= 30;
  if (safetyText.includes('strong community support')) score += 10;
  if (detaineeReport.risk_level === 'Low' || detaineeReport.riskLevel === 'Low') score += 15;
  if (detaineeReport.risk_level === 'High' || detaineeReport.riskLevel === 'High') score -= 40;
  return Math.max(0, Math.min(100, score));
}

module.exports = {
  VOTE_COLUMNS,
  SEAT_ROLE_MAP,
  mapSeatForRole,
  getVotes,
  hasQuorum,
  assertQuorum,
  tallyVotes,
  computeFinalDecision,
  recordVotePatch,
  calculateCommunitySafetyScore,
};
