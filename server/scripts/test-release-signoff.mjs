/**
 * Unit tests: dual release sign-off merge and completion gate.
 */

function pickNewerReleaseSignOff(localEntry, remoteEntry) {
  if (!remoteEntry?.signedAt) return localEntry || remoteEntry || null;
  if (!localEntry?.signedAt) return remoteEntry;
  return new Date(localEntry.signedAt).getTime() >= new Date(remoteEntry.signedAt).getTime()
    ? localEntry
    : remoteEntry;
}

function mergeReleaseInfoRecords(localInfo, remoteInfo) {
  if (!remoteInfo) return localInfo || null;
  if (!localInfo) return remoteInfo;
  const merged = { ...remoteInfo, ...localInfo };
  const locSign = localInfo.signOffs || {};
  const remSign = remoteInfo.signOffs || {};
  merged.signOffs = {
    jailCommander: pickNewerReleaseSignOff(locSign.jailCommander, remSign.jailCommander),
    csParoleClerk: pickNewerReleaseSignOff(locSign.csParoleClerk, remSign.csParoleClerk),
  };
  return merged;
}

function hasSign(info, key) {
  const r = info?.signOffs?.[key];
  return !!(r?.verified && r?.signedAt && r?.userId);
}

function bothComplete(info) {
  return hasSign(info, 'jailCommander') && hasSign(info, 'csParoleClerk');
}

const commanderOnly = {
  signOffs: {
    jailCommander: { userId: 'U1', verified: true, signedAt: '2026-09-21T10:00:00.000Z', role: 'Jail Commander' },
  },
};
if (bothComplete(commanderOnly)) throw new Error('single sign-off must not complete release');

const merged = mergeReleaseInfoRecords(
  commanderOnly,
  { signOffs: {} },
);
if (!hasSign(merged, 'jailCommander')) throw new Error('local commander sign must survive merge');

const dual = mergeReleaseInfoRecords(
  {
    signOffs: {
      jailCommander: { userId: 'U1', verified: true, signedAt: '2026-09-21T10:00:00.000Z' },
    },
  },
  {
    signOffs: {
      csParoleClerk: { userId: 'U2', verified: true, signedAt: '2026-09-21T11:00:00.000Z' },
    },
  },
);
if (!bothComplete(dual)) throw new Error('dual sign-offs must merge from local+remote');

console.log('PASS: release sign-off unit tests');
