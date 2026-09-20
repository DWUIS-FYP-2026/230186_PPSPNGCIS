/**
 * Smoke test: schedule hearing via bootstrap PUT, re-login, verify hearing survives.
 */
const BASE = process.env.PMS_API || 'http://localhost:3000';
const SECRETARY = { identifier: 'h.morris@djag.gov.pg', password: 'Password123!' };
const TEST_APP = 'APP-000004';

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(SECRETARY),
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

async function logout(token) {
  await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

function findActiveHearing(data, appId) {
  const active = (data.hearings || []).filter(
    (h) => h.applicationId === appId && !['Cancelled', 'Completed'].includes(h.status),
  );
  if (!active.length) return null;
  return active.sort(
    (a, b) => new Date(b.updatedAt || b.createdAt || b.scheduledDate || 0)
      - new Date(a.updatedAt || a.createdAt || a.scheduledDate || 0),
  )[0];
}

async function main() {
  const token1 = await login();
  const store = await bootstrap(token1);
  const app = (store.applications || []).find((a) => a.id === TEST_APP);
  if (!app) throw new Error(`Test app ${TEST_APP} not found`);

  const testDate = '2026-10-15';
  const testVenue = 'Persistence Test Room';
  const existing = findActiveHearing(store, TEST_APP);
  const hearingId = existing?.id || `HRG-TEST-${Date.now()}`;
  const hearing = {
    id: hearingId,
    applicationId: TEST_APP,
    prisonerId: app.prisonerId,
    institutionId: app.institutionId,
    scheduledDate: testDate,
    scheduledTime: '10:30',
    location: testVenue,
    notes: 'Automated persistence test',
    status: 'Scheduled',
    boardMembers: [],
    updatedAt: new Date().toISOString(),
    createdAt: existing?.createdAt || new Date().toISOString(),
  };

  store.hearings = store.hearings || [];
  const idx = store.hearings.findIndex((h) => h.id === hearingId);
  if (idx >= 0) store.hearings[idx] = hearing;
  else store.hearings.push(hearing);

  const appIdx = store.applications.findIndex((a) => a.id === TEST_APP);
  if (appIdx >= 0) {
    store.applications[appIdx].status = 'Hearing Scheduled';
    store.applications[appIdx].hearingSchedulingAt = new Date().toISOString();
  }

  await putBootstrap(token1, store);
  await logout(token1);

  const token2 = await login();
  const reloaded = await bootstrap(token2);
  const loaded = findActiveHearing(reloaded, TEST_APP);

  if (!loaded?.scheduledDate) {
    console.error('FAIL: no active hearing after re-login');
    process.exit(1);
  }
  const dateOk = String(loaded.scheduledDate).slice(0, 10) === testDate;
  const venueOk = loaded.location === testVenue;
  if (!dateOk || !venueOk) {
    console.error('FAIL: hearing mismatch', { loaded, expected: { testDate, testVenue } });
    process.exit(1);
  }
  console.log('PASS: hearing persisted after logout/login', {
    appId: TEST_APP,
    scheduledDate: loaded.scheduledDate,
    location: loaded.location,
  });
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
