const { loadAll } = require('./db-sync');

function normalizeRole(role) {
  const map = {
    Admin: 'System Administrator',
    'CS Parole Clerk': 'CS Parole Clerk',
    'Board Member': 'DJAG Secretary',
    Secretariat: 'DJAG Parole Clerk',
  };
  return map[role] || role;
}

function prisonerName(data, prisonerId) {
  const p = (data.prisoners || []).find((x) => x.id === prisonerId);
  return p ? `${p.firstName} ${p.lastName}` : 'Detainee';
}

function buildEventsForUser(user, data) {
  if (!user || !data) return [];

  const events = [];
  const seen = new Set();
  const role = normalizeRole(user.role);

  function add(evt) {
    if (!evt?.date || seen.has(evt.id)) return;
    seen.add(evt.id);
    events.push(evt);
  }

  const boardRoles = ['Doctor', 'CS Commissioner', 'DJAG Secretary'];
  const globalRoles = ['System Administrator', 'DJAG Parole Clerk', 'DJAG Secretary'];
  const canSeeAll = globalRoles.includes(role);

  let hearings = (data.hearings || []).filter((h) => !['Cancelled', 'Completed'].includes(h.status));
  if (['CS Parole Clerk', 'CS Parole Officer'].includes(role) && user.institutionId) {
    hearings = hearings.filter((h) => h.institutionId === user.institutionId);
  }
  if (boardRoles.includes(role) && !canSeeAll) {
    hearings = hearings.filter((h) => !h.boardMembers?.length || h.boardMembers.includes(user.id));
  }

  hearings.forEach((h) => {
    add({
      id: `hearing:${h.id}`,
      date: String(h.scheduledDate || '').slice(0, 10),
      time: h.scheduledTime || null,
      title: `Hearing — ${prisonerName(data, h.prisonerId)}`,
      subtitle: h.location || h.notes || h.status,
      type: 'hearing',
      severity: 'medium',
      linkHref: h.applicationId ? `forms/board-decisions.html?appId=${encodeURIComponent(h.applicationId)}` : null,
    });
  });

  (data.notifications || []).forEach((n) => {
    const nRole = normalizeRole(n.recipientRole);
    if (nRole !== role) return;
    if (n.recipientUserId && n.recipientUserId !== user.id) return;
    if (user.institutionId && ['CS Parole Clerk', 'CS Parole Officer'].includes(role)
      && n.institutionId && n.institutionId !== user.institutionId) return;
    const date = String(n.eligibleDate || n.createdAt || '').slice(0, 10);
    if (!date) return;
    add({
      id: `notif:${n.id}`,
      date,
      title: n.title,
      subtitle: (n.message || '').slice(0, 120),
      type: n.type === 'hearing' ? 'hearing' : 'notification',
      severity: 'low',
    });
  });

  if (user.contractExpiryDate) {
    add({
      id: `contract:${user.id}`,
      date: String(user.contractExpiryDate).slice(0, 10),
      title: 'Board contract expiry',
      subtitle: user.contractStatus || 'Review contract status',
      type: 'contract',
      severity: user.contractStatus === 'Expired' ? 'high' : 'medium',
      linkHref: '?panel=profile',
    });
  }

  return events
    .filter((e) => e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || '')));
}

async function loadCalendarPayload(userId) {
  const data = await loadAll();
  const user = (data.users || []).find((u) => u.id === userId) || null;
  return { user, data };
}

module.exports = { buildEventsForUser, loadCalendarPayload, normalizeRole };
