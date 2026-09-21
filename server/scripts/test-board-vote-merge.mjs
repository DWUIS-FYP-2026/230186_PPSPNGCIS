/**
 * Unit tests for board vote merge logic (mirrors js/storage.js merge helpers).
 * Simulates outbound save: local submitted vote + empty/stale DB snapshot.
 */

function boardAssessmentMergeKey(entry) {
  const appId = entry?.applicationId || '';
  const hearingId = entry?.hearingId != null && entry?.hearingId !== '' ? entry.hearingId : 'legacy';
  const assessor = entry?.assessorId || entry?.assessorName || '';
  const role = entry?.role || '';
  return `${appId}|${hearingId}|${assessor}|${role}`;
}

function dbHasSubmittedBoardVoteForKey(fromDb, key) {
  return (fromDb || []).some(
    (b) => boardAssessmentMergeKey(b) === key && b.submissionStatus === 'Submitted' && b.vote,
  );
}

function boardAssessmentEntryRank(entry) {
  if (entry?.submissionStatus === 'Submitted' && entry?.vote) return 3;
  if (entry?.submissionStatus === 'Submitted') return 2;
  if (entry?.submissionStatus === 'Draft') return 1;
  return 0;
}

function normalizeBoardAssessmentRecord(entry) {
  return entry ? { ...entry } : entry;
}

function mergeAssessmentLists(localList, remoteList) {
  const map = new Map();
  [...(localList || []), ...(remoteList || [])].forEach((raw) => {
    const entry = normalizeBoardAssessmentRecord(raw);
    if (!entry?.role) return;
    const key = boardAssessmentMergeKey(entry);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, entry);
      return;
    }
    const entryRank = boardAssessmentEntryRank(entry);
    const prevRank = boardAssessmentEntryRank(prev);
    if (entryRank > prevRank) {
      map.set(key, { ...prev, ...entry });
    } else if (entryRank === prevRank) {
      const entryTs = new Date(entry.updatedAt || entry.submittedAt || 0).getTime();
      const prevTs = new Date(prev.updatedAt || prev.submittedAt || 0).getTime();
      if (entryTs >= prevTs) map.set(key, { ...prev, ...entry });
    }
  });
  return [...map.values()];
}

function mergeBoardAssessmentsFromDatabase(localList, dbList) {
  const fromDb = (dbList || []).map(normalizeBoardAssessmentRecord);
  const localSubmitted = (localList || []).filter((entry) => {
    if (!entry?.role || entry.submissionStatus !== 'Submitted' || !entry.vote) return false;
    const key = boardAssessmentMergeKey(entry);
    return !dbHasSubmittedBoardVoteForKey(fromDb, key);
  }).map(normalizeBoardAssessmentRecord);
  const localDrafts = (localList || []).filter((entry) => {
    if (!entry?.role || entry.submissionStatus !== 'Draft') return false;
    const key = boardAssessmentMergeKey(entry);
    return !dbHasSubmittedBoardVoteForKey(fromDb, key);
  });
  return mergeAssessmentLists(mergeAssessmentLists(fromDb, localSubmitted), localDrafts);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const APP = 'APP-000001';
const H1 = 'HEAR-001';
const H2 = 'HEAR-002';

const secretaryVote = {
  applicationId: APP,
  hearingId: H1,
  role: 'DJAG Secretary',
  assessorId: 'USR-A',
  submissionStatus: 'Submitted',
  vote: 'Approved',
  updatedAt: '2026-09-21T10:00:00.000Z',
};

const commissionerVote = {
  applicationId: APP,
  hearingId: H1,
  role: 'CS Commissioner',
  assessorId: 'USR-B',
  submissionStatus: 'Submitted',
  vote: 'Refused',
  updatedAt: '2026-09-21T10:01:00.000Z',
};

const secretaryOtherHearing = {
  ...secretaryVote,
  hearingId: H2,
  vote: 'Deferred',
  updatedAt: '2026-09-21T11:00:00.000Z',
};

// Outbound: new local vote, empty DB
let merged = mergeBoardAssessmentsFromDatabase([secretaryVote], []);
assert(merged.length === 1 && merged[0].vote === 'Approved', 'local submitted must survive empty DB');

// DB already has vote — do not duplicate
merged = mergeBoardAssessmentsFromDatabase([secretaryVote], [secretaryVote]);
assert(merged.length === 1, 'single vote when DB matches');

// Two members, one local new, one only in DB
merged = mergeBoardAssessmentsFromDatabase([secretaryVote], [commissionerVote]);
assert(merged.length === 2, 'both members preserved');
assert(merged.some((v) => v.assessorId === 'USR-A'), 'new local member kept');
assert(merged.some((v) => v.assessorId === 'USR-B'), 'DB member kept');

// Same member, different hearings — both kept
merged = mergeBoardAssessmentsFromDatabase([secretaryVote, secretaryOtherHearing], [secretaryVote]);
assert(merged.length === 2, 'votes on different hearings must not collapse');
assert(merged.some((v) => v.hearingId === H2 && v.vote === 'Deferred'), 'second hearing vote kept');

// Draft kept when DB has no submitted for slot
const draft = {
  applicationId: APP,
  hearingId: H1,
  role: 'Doctor',
  assessorId: 'USR-C',
  submissionStatus: 'Draft',
  feedback: 'thinking',
};
merged = mergeBoardAssessmentsFromDatabase([draft], []);
assert(merged.length === 1 && merged[0].submissionStatus === 'Draft', 'draft preserved');

console.log('PASS: board vote merge unit tests');
