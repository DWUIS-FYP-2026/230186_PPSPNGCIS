/**
 * Unit tests: hearing merge before outbound PUT (mirrors js/storage.js mergeLocalHearingWithRemoteSnapshot).
 */

function hearingRecencyScore(h) {
  return new Date(h?.updatedAt || h?.createdAt || h?.scheduledDate || 0).getTime();
}

function mergeLocalHearingWithRemoteSnapshot(local, remRaw) {
  if (!local || !remRaw) return { hearing: local, changed: false };
  const rem = { ...remRaw };
  if (local.status === 'Cancelled' || rem.status === 'Cancelled') return { hearing: local, changed: false };
  const localScore = hearingRecencyScore(local);
  const remoteScore = hearingRecencyScore(rem);
  if (remoteScore > localScore) {
    let changed = false;
    const keys = ['scheduledDate', 'scheduledTime', 'location', 'notes', 'status', 'startedAt', 'startedBy', 'startedByName'];
    keys.forEach((key) => {
      if (rem[key] == null || rem[key] === '') return;
      if (local[key] !== rem[key]) {
        local[key] = rem[key];
        changed = true;
      }
    });
    return { hearing: local, changed };
  }
  return { hearing: local, changed: false };
}

function mergeStoreHearingsBeforePut(localHearings, remoteHearings) {
  const remoteMap = new Map((remoteHearings || []).map((h) => [h.id, h]));
  const data = (localHearings || []).map((h) => ({ ...h }));
  data.forEach((local) => {
    const rem = remoteMap.get(local.id);
    if (!rem) return;
    mergeLocalHearingWithRemoteSnapshot(local, rem);
  });
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// A. NEW HEARING — local only, not in DB
const appA = 'APP-A';
const localOnly = [{
  id: 'HRG-NEW',
  applicationId: appA,
  scheduledDate: '2026-10-15',
  location: 'Room A',
  updatedAt: '2026-09-21T12:00:00.000Z',
}];
let putPayload = mergeStoreHearingsBeforePut(localOnly, []);
assert(putPayload.length === 1 && putPayload[0].scheduledDate === '2026-10-15', 'A: new local hearing survives merge for PUT');

// B. UPDATED HEARING — local newer than stale remote
const localUpdated = [{
  id: 'HRG-1',
  applicationId: appA,
  scheduledDate: '2026-10-15',
  location: 'New Room',
  updatedAt: '2026-09-21T12:00:00.000Z',
}];
const remoteStale = [{
  id: 'HRG-1',
  applicationId: appA,
  scheduledDate: '2026-09-01',
  location: 'Old Room',
  updatedAt: '2026-09-20T12:00:00.000Z',
}];
putPayload = mergeStoreHearingsBeforePut(localUpdated, remoteStale);
assert(putPayload[0].scheduledDate === '2026-10-15' && putPayload[0].location === 'New Room', 'B: newer local schedule preserved');

// C. REMOTE IS NEWER
const localOld = [{
  id: 'HRG-1',
  applicationId: appA,
  scheduledDate: '2026-09-01',
  updatedAt: '2026-09-01T12:00:00.000Z',
}];
const remoteNewer = [{
  id: 'HRG-1',
  applicationId: appA,
  scheduledDate: '2026-11-01',
  location: 'DB Room',
  updatedAt: '2026-09-22T12:00:00.000Z',
}];
putPayload = mergeStoreHearingsBeforePut(localOld, remoteNewer);
assert(putPayload[0].scheduledDate === '2026-11-01' && putPayload[0].location === 'DB Room', 'C: newer remote preserved');

// D. MULTIPLE APPLICATIONS
const multiLocal = [
  { id: 'HRG-A', applicationId: 'APP-1', scheduledDate: '2026-10-10', updatedAt: '2026-09-21T12:00:00.000Z' },
  { id: 'HRG-B', applicationId: 'APP-2', scheduledDate: '2026-10-20', updatedAt: '2026-09-21T12:00:00.000Z' },
];
const multiRemote = [
  { id: 'HRG-A', applicationId: 'APP-1', scheduledDate: '2026-08-01', updatedAt: '2026-09-01T12:00:00.000Z' },
];
putPayload = mergeStoreHearingsBeforePut(multiLocal, multiRemote);
assert(putPayload.find((h) => h.id === 'HRG-A').scheduledDate === '2026-10-10', 'D: APP-1 local kept');
assert(putPayload.find((h) => h.id === 'HRG-B').scheduledDate === '2026-10-20', 'D: APP-2 untouched');

// F. RESCHEDULE (same as B — new date after old DB row)
const rescheduled = [{
  id: 'HRG-1',
  applicationId: appA,
  scheduledDate: '2026-12-05',
  scheduledTime: '14:00',
  updatedAt: '2026-09-21T13:00:00.000Z',
}];
putPayload = mergeStoreHearingsBeforePut(rescheduled, remoteStale);
assert(putPayload[0].scheduledDate === '2026-12-05' && putPayload[0].scheduledTime === '14:00', 'F: reschedule survives stale remote');

console.log('PASS: hearing merge unit tests (A–D, F)');
