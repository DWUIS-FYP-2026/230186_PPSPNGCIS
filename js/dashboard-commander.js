(async () => {
  await PMSStorage.ensureLoaded();
  const actor = PMSAuth.requireRole(['Jail Commander']);
  if (!actor) return;

  if (!actor.institutionId) {
    document.body.innerHTML = '<div class="access-denied"><h1>Access Denied</h1><p>No correctional institution assigned. Contact System Administrator.</p><a href="index.html">Return to login</a></div>';
    return;
  }

  const inst = PMSStorage.getInstitutionById(actor.institutionId);
  const panelTitles = {
    overview: ['Institutional Overview', `${inst?.name || 'Institution'} — Jail Commander Dashboard`],
    prisoners: ['Prisoners', 'Institutional prisoner records'],
    applications: ['Parole Applications', 'Applications originating from this institution'],
    officers: ['Officers', 'Officers assigned to this institution'],
    notifications: ['Notifications', 'Eligibility and institutional alerts'],
    reports: ['Institution Reports', 'Statistics and report approval'],
    profile: ['Profile', 'Your account information'],
  };

  function instPrisoners() { return PMSStorage.getPrisoners().filter((p) => p.institutionId === actor.institutionId); }
  function instApps() { return PMSStorage.getParoleApplications().filter((a) => a.institutionId === actor.institutionId); }

  async function refresh(panel) {
    await PMSStorage.syncParoleNotifications(actor);
    PMSUI.updateNotifBadge(actor);
    ({ overview: renderOverview, prisoners: renderPrisoners, applications: renderApps,
       officers: renderOfficers, notifications: renderNotifications, reports: renderReports })[panel]?.();
  }

  function renderOverview() {
    document.getElementById('inst-banner').innerHTML = `<strong>${PMSUI.esc(inst.name)}</strong> · ${PMSUI.esc(inst.location)} · Code: ${PMSUI.esc(inst.code)}`;
    const prisoners = instPrisoners();
    document.getElementById('stat-prisoners').textContent = prisoners.length;
    document.getElementById('stat-approaching').textContent = prisoners.filter((p) => {
      const prog = PMSStorage.getPrisonerProgress(p);
      return prog.percent >= 25 && !prog.eligible;
    }).length;
    document.getElementById('stat-apps').textContent = instApps().filter((a) => !['Approved', 'Refused'].includes(a.status)).length;
    document.getElementById('stat-notifications').textContent = PMSStorage.getUnreadCountForUser(actor);

    const eligible = prisoners.filter((p) => PMSStorage.getPrisonerProgress(p).eligible);
    document.getElementById('overview-eligible').innerHTML = eligible.length
      ? eligible.map((p) => { const prog = PMSStorage.getPrisonerProgress(p); return `<div class="overview-row overview-row--highlight"><strong>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</strong><span class="meta">Eligible ${PMSUI.fmtDate(prog.eligibilityDate)} · ${prog.percent.toFixed(0)}% served</span></div>`; }).join('')
      : '<p class="empty-state">No eligible prisoners currently.</p>';

    const apps = instApps();
    PMSUI.renderBarChart('chart-apps', PMSStorage.APPLICATION_STATUSES.filter((s) => s !== 'Draft').map((s) => ({
      label: s, value: apps.filter((a) => a.status === s).length,
    })).filter((d) => d.value > 0));
  }

  function renderPrisoners() {
    const q = document.getElementById('pr-search').value.toLowerCase();
    document.getElementById('prisoners-tbody').innerHTML = instPrisoners()
      .filter((p) => !q || `${p.firstName} ${p.lastName} ${p.prisonerNumber}`.toLowerCase().includes(q))
      .map((p) => {
        const prog = PMSStorage.getPrisonerProgress(p);
        return `<tr class="${prog.eligible ? 'row-eligible' : ''}"><td>${PMSUI.esc(p.prisonerNumber)}</td><td>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</td><td>${PMSUI.fmtDate(p.sentenceStartDate)}</td><td>${PMSUI.progressBar(p)}</td><td>${PMSUI.fmtDate(prog.eligibilityDate)}</td><td>${PMSUI.esc(p.status)}</td><td><a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">View Case File</a></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="empty-state">No prisoners.</td></tr>';
  }

  function renderApps() {
    document.getElementById('apps-tbody').innerHTML = instApps().map((a) => {
      const p = PMSStorage.getPrisonerById(a.prisonerId);
      const s = PMSStorage.getFormCompletionSummary(a);
      const f3 = s.checks.form3 ? '✓ Form 3 complete' : `<button type="button" class="btn-icon" data-open-form="3" data-app="${a.id}">Complete Form 3</button>`;
      return `<tr><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : '—'}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${PMSUI.fmtDate(a.submittedAt)}</td><td>${f3}</td><td>${s.completed}/5 forms</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="empty-state">No applications.</td></tr>';
  }

  function renderOfficers() {
    document.getElementById('officers-tbody').innerHTML = PMSStorage.getOfficersByInstitution(actor.institutionId)
      .map((o) => `<tr><td>${PMSUI.esc(o.firstName)} ${PMSUI.esc(o.lastName)}</td><td>${PMSUI.esc(o.role)}</td><td>${PMSUI.esc(o.position || '—')}</td><td>${PMSUI.esc(o.email)}</td></tr>`)
      .join('') || '<tr><td colspan="4" class="empty-state">No officers assigned.</td></tr>';
  }

  function renderNotifications() {
    PMSUI.renderNotificationPanel('notification-list', actor);
  }

  function renderReports() {
    if (typeof PMSReports !== 'undefined') {
      PMSReports.mount('reports-body', 'reports-filter-bar', actor);
    }
  }

  PMSSidebar.init({
    user: actor,
    activePanel: 'overview',
    onNavigate: (panel, meta) => PMSUI.switchPanel(panel, panelTitles, refresh, meta?.navId),
  });
  PMSUI.initShell(actor);
  PMSUI.bindNotificationPanel('notification-list', actor, () => refresh('notifications'));

  document.getElementById('pr-search').addEventListener('input', renderPrisoners);
  document.getElementById('btn-approve-report').addEventListener('click', () => {
    PMSStorage.createReport({
      institutionId: actor.institutionId,
      type: 'institutional',
      title: `Institutional Report — ${inst.name}`,
      status: 'Approved',
    }, actor);
    alert('Institutional report approved and recorded in audit log.');
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-form]')) {
      const btn = e.target.closest('[data-open-form]');
      PMSForms.openForm(parseInt(btn.dataset.openForm, 10), btn.dataset.app);
    }
    if (e.target.closest('[data-read]')) return;
  });

  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) refresh('overview');
})();
