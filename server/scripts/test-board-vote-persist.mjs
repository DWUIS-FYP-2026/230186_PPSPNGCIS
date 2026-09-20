/**
 * Smoke test: board vote in application form_data survives logout/login bootstrap reload.
 */
const BASE = process.env.PMS_API || 'http://localhost:3000';
const MEMBER = { identifier: 'h.morris@djag.gov.pg', password: 'Password123!' };
const TEST_APP = 'APP-000001';

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(MEMBER),
  });
  const body = await res.json();
  if (!res.ok || !body.token) throw new Error(body.error || 'Login failed');
  return body.token;
}

async function bootstrap(token) {
  const res = await fetch(`${BASE}/api/bootstrap`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok || !body.data) throw new Error(body.error || 'Bootstrap GET failed');
  return body.data;
}

async function putBootstrap(token, data) {
  const res = await fetch(`${BASE}/api/bootstrap`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });
  const body = await res.json();
  if (!res.ok || body.success === false) throw new Error(body.error || 'Bootstrap PUT failed');
}

function packSidecar(app) {
  app.formData = app.formData || {};
  app.formData.__pmsBoardAssessments = app.boardAssessments || [];
  app.formData.__pmsAppState = { ...(app.formData.__pmsAppState || {}), boardAssessments: app.boardAssessments || [] };
}

function findVote(data, appId, assessorId) {
  const app = (data.applications || []).find((a) => a.id === appId);
  const list = app?.boardAssessments
    || app?.formData?.__pmsBoardAssessments
    || app?.formData?.__pmsAppState?.boardAssessments
    || [];
  return list.find((a) => a.assessorId === assessorId && a.submissionStatus === 'Submitted');
}

async function main() {
  const token1 = await login();
  const store = await bootstrap(token1);
  const appIdx = (store.applications || []).findIndex((a) => a.id === TEST_APP);
  if (appIdx < 0) throw new Error(`Test app ${TEST_APP} not found`);

  const app = store.applications[appIdx];
  const hearing = (store.hearings || []).find((h) => h.applicationId === TEST_APP && h.scheduledDate);
  const vote = {
    id: 'ASM-VOTE-TEST',
    applicationId: TEST_APP,
    hearingId: hearing?.id || null,
    role: 'DJAG Secretary',
    assessorId: 'USR-000025',
    assessorName: 'Helen Morris',
    vote: 'Approved',
    feedback: 'Persistence test vote',
    submissionStatus: 'Submitted',
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  app.boardAssessments = [...(app.boardAssessments || []).filter((a) => a.assessorId !== vote.assessorId), vote];
  packSidecar(app);
  store.applications[appIdx] = app;

  await putBootstrap(token1, store);

  const token2 = await login();
  const reloaded = await bootstrap(token2);
  const loaded = findVote(reloaded, TEST_APP, vote.assessorId);

  if (!loaded || loaded.vote !== 'Approved') {
    console.error('FAIL: vote missing after re-login', loaded);
    process.exit(1);
  }
  if (loaded.feedback !== vote.feedback) {
    console.error('FAIL: vote comments mismatch', loaded);
    process.exit(1);
  }
  console.log('PASS: board vote persisted', {
    appId: TEST_APP,
    vote: loaded.vote,
    hearingId: loaded.hearingId,
    submittedAt: loaded.submittedAt,
  });
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
