(async () => {
  await PMSStorage.ensureLoaded();
  const actor = PMSAuth.requireRole(['DJAG Parole Clerk']);
  if (!actor) return;

  const panelTitles = {
    overview: ['Overview', 'DJAG Parole Clerk — application review and hearings'],
    prisoners: ['Prisoner Search', 'View prisoner records (read-only — maintained by PNGCS)'],
    applications: ['Review Applications', 'Review PNGCS submissions and documentation'],
    forms: ['Forms', 'Access and complete parole application forms'],
    'pre-parole': ['Pre-Parole Reports', 'Prepare and manage Form 4 reports'],
    reports: ['Reports', 'Operational and hearing reports'],
    hearings: ['Hearing Management', 'Schedule and manage parole hearings'],
    notifications: ['Notifications', 'Application and workflow alerts'],
    profile: ['Profile', 'Your account information'],
  };

  function djagApps() {
    return PMSStorage.getParoleApplications().filter((a) => a.status !== 'Draft');
  }

  async function refresh(panel) {
    await PMSStorage.ensureLoaded();
    PMSUI.updateNotifBadge(actor);
    ({ overview: renderOverview, prisoners: renderPrisoners, applications: renderApps, reports: renderReports,
       hearings: renderHearings, notifications: renderNotifications })[panel]?.();
  }

  function renderPrisoners() {
    const q = document.getElementById('djag-prisoner-search').value.trim().toLowerCase();
    const list = PMSRBAC.filterPrisonersForUser(actor, PMSStorage.getPrisoners())
      .filter((p) => !q || `${p.firstName} ${p.lastName} ${p.prisonerNumber}`.toLowerCase().includes(q));
    document.getElementById('djag-prisoners-tbody').innerHTML = list.map((p) =>
      `<tr><td>${PMSUI.esc(p.prisonerNumber)}</td><td>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</td><td>${PMSUI.instName(p.institutionId)}</td><td>${PMSUI.esc(p.offense)}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(p.status)}">${PMSUI.esc(p.status)}</span></td><td><a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">View Case File</a></td></tr>`
    ).join('') || '<tr><td colspan="6" class="empty-state">No matching prisoners.</td></tr>';
  }

  function formsSummary(app) {
    const s = PMSStorage.getFormCompletionSummary(app);
    return `${s.completed}/5 complete`;
  }

  function renderOverview() {
    const apps = djagApps();
    document.getElementById('stat-submitted').textContent = apps.filter((a) => a.status === 'Submitted').length;
    document.getElementById('stat-review').textContent = apps.filter((a) => a.status === 'Under DJAG Review').length;
    document.getElementById('stat-reports').textContent = apps.filter((a) => a.status === 'Pre-Parole Report Prepared').length;
    document.getElementById('stat-hearings').textContent = apps.filter((a) => a.status === 'Hearing Scheduled').length;
    PMSUI.renderBarChart('chart-pipeline', [
      { label: 'Submitted', value: apps.filter((a) => a.status === 'Submitted').length },
      { label: 'Under Review', value: apps.filter((a) => a.status === 'Under DJAG Review').length },
      { label: 'Report Ready', value: apps.filter((a) => a.status === 'Pre-Parole Report Prepared').length },
      { label: 'Hearing', value: apps.filter((a) => a.status === 'Hearing Scheduled').length },
      { label: 'Board Review', value: apps.filter((a) => a.status === 'Pending Board Review').length },
    ], 'var(--color-navy)');
  }

  function appRow(a) {
    const p = PMSStorage.getPrisonerById(a.prisonerId);
    return `<tr><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : '—'}</td><td>${PMSUI.instName(a.institutionId)}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${formsSummary(a)}</td><td>${PMSUI.fmtDate(a.submittedAt)}</td><td><a href="${p ? PMSRBAC.prisonerProfileUrl(p.id) : '#'}" class="btn-icon">Case File</a> <button type="button" class="btn-icon" data-review="${a.id}">Review</button></td></tr>`;
  }

  function renderApps() {
    document.getElementById('apps-tbody').innerHTML = djagApps().map(appRow).join('') || '<tr><td colspan="6" class="empty-state">No applications.</td></tr>';
  }

  function renderReports() {
    const apps = djagApps().filter((a) => ['Under DJAG Review', 'Pre-Parole Report Prepared', 'Hearing Scheduled', 'Pending Board Review'].includes(a.status));
    document.getElementById('reports-tbody').innerHTML = apps.map((a) => {
      const s = PMSStorage.getFormCompletionSummary(a);
      const p = PMSStorage.getPrisonerById(a.prisonerId);
      return `<tr><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : '—'}</td><td>${s.checks.form4 ? 'Form 4 complete' : 'Pending'}</td><td>${formsSummary(a)}</td><td><button type="button" class="btn-icon" data-open-form="4" data-app="${a.id}">Form 4</button> <button type="button" class="btn-icon" data-review="${a.id}">Review</button></td></tr>`;
    }).join('') || '<tr><td colspan="4" class="empty-state">No reports in progress.</td></tr>';
    if (typeof PMSReports !== 'undefined') PMSReports.mount('reports-body', 'reports-filter-bar', actor);
  }

  function renderHearings() {
    document.getElementById('hearings-tbody').innerHTML = PMSStorage.getHearings().map((h) => {
      const p = PMSStorage.getPrisonerById(h.prisonerId);
      return `<tr><td>${PMSUI.fmtDate(h.scheduledDate)} ${h.scheduledTime || ''}</td><td>${PMSUI.prisonerName(h.prisonerId)}</td><td>${PMSUI.esc(h.location)}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(h.status)}">${PMSUI.esc(h.status)}</span></td><td><a href="${PMSRBAC.prisonerProfileUrl(h.prisonerId)}" class="btn-icon">Case File</a> <button type="button" class="btn-icon" data-complete-hearing="${h.id}">Complete</button></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="empty-state">No hearings scheduled.</td></tr>';
  }

  function renderNotifications() {
    PMSUI.renderNotificationPanel('notification-list', actor);
  }

  function formStatusList(app) {
    const s = PMSStorage.getFormCompletionSummary(app);
    return PMSStorage.PAROLE_FORMS.map((f) => {
      const key = `form${f.number}`;
      const done = s.checks[key];
      return `<li class="${done ? 'form-done' : 'form-pending'}">${PMSUI.esc(f.name)}: ${done ? 'Complete' : 'Incomplete'} ${f.number <= 4 ? `<button type="button" class="btn-icon btn-sm" data-open-form="${f.number}" data-app="${app.id}">Open</button>` : ''}</li>`;
    }).join('');
  }

  function openReview(appId) {
    const app = PMSStorage.getApplicationById(appId);
    const p = PMSStorage.getPrisonerById(app.prisonerId);
    document.getElementById('review-app-id').value = appId;
    document.getElementById('review-content').innerHTML = `
      <p><strong>Prisoner:</strong> ${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)} · <strong>Status:</strong> ${PMSUI.esc(app.status)}</p>
      <p><strong>Forms:</strong> ${formsSummary(app)}</p>
      <ul class="doc-list">${formStatusList(app)}</ul>
      <div class="form-group"><label>Return Notes (if returning for correction)</label><textarea id="return-notes" rows="3" placeholder="Specify corrections required by PNGCS…"></textarea></div>`;

    document.getElementById('btn-verify-docs').disabled = !['Submitted', 'Returned for Correction'].includes(app.status);
    document.getElementById('btn-return').disabled = !['Submitted', 'Under DJAG Review'].includes(app.status);
    document.getElementById('btn-prepare-report').disabled = !['Under DJAG Review', 'Submitted'].includes(app.status);
    document.getElementById('btn-send-board').disabled = !['Pre-Parole Report Prepared', 'Hearing Scheduled'].includes(app.status);
    document.getElementById('review-modal').showModal();
  }

  PMSSidebar.init({
    user: actor,
    activePanel: 'overview',
    onNavigate: (panel, meta) => PMSUI.switchPanel(panel, panelTitles, refresh, meta?.navId),
  });
  PMSUI.initShell(actor);
  PMSUI.bindModalClose();
  PMSUI.bindNotificationPanel('notification-list', actor, () => refresh('notifications'));

  document.getElementById('djag-prisoner-search').addEventListener('input', () => renderPrisoners());
  document.getElementById('btn-schedule-hearing').addEventListener('click', () => {
    const sel = document.getElementById('h-app');
    sel.innerHTML = djagApps().filter((a) => ['Pre-Parole Report Prepared', 'Under DJAG Review'].includes(a.status))
      .map((a) => { const p = PMSStorage.getPrisonerById(a.prisonerId); return `<option value="${a.id}">${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)}</option>`; }).join('');
    document.getElementById('hearing-modal').showModal();
  });

  document.getElementById('hearing-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const app = PMSStorage.getApplicationById(document.getElementById('h-app').value);
    await PMSStorage.saveHearing({
      applicationId: app.id, prisonerId: app.prisonerId, institutionId: app.institutionId,
      scheduledDate: document.getElementById('h-date').value,
      scheduledTime: document.getElementById('h-time').value,
      location: document.getElementById('h-location').value.trim(),
      notes: document.getElementById('h-notes').value.trim(),
    }, actor);
    document.getElementById('hearing-modal').close();
    refresh('hearings');
  });

  document.getElementById('btn-verify-docs').addEventListener('click', async () => {
    const appId = document.getElementById('review-app-id').value;
    try {
      await PMSStorage.transitionApplication(appId, 'Under DJAG Review', actor, 'DJAG commenced document verification');
      openReview(appId);
      refresh('applications');
    } catch (e) { alert(e.message); }
  });

  document.getElementById('btn-return').addEventListener('click', async () => {
    const appId = document.getElementById('review-app-id').value;
    const notes = document.getElementById('return-notes')?.value.trim() || 'Returned for correction';
    try {
      await PMSStorage.transitionApplication(appId, 'Returned for Correction', actor, notes);
      document.getElementById('review-modal').close();
      refresh('applications');
      alert('Application returned to PNGCS for correction.');
    } catch (e) { alert(e.message); }
  });

  document.getElementById('btn-prepare-report').addEventListener('click', () => {
    const appId = document.getElementById('review-app-id').value;
    PMSForms.openForm(4, appId);
  });

  document.getElementById('btn-send-board').addEventListener('click', async () => {
    const appId = document.getElementById('review-app-id').value;
    try {
      await PMSStorage.transitionApplication(appId, 'Pending Board Review', actor, 'Application forwarded to Parole Board');
      document.getElementById('review-modal').close();
      refresh('applications');
    } catch (e) { alert(e.message); }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-review]')) openReview(e.target.closest('[data-review]').dataset.review);
    if (e.target.closest('[data-open-form]')) {
      const btn = e.target.closest('[data-open-form]');
      PMSForms.openForm(parseInt(btn.dataset.openForm, 10), btn.dataset.app);
    }
    if (e.target.closest('[data-read]')) return;
    if (e.target.closest('[data-complete-hearing]')) {
      const h = PMSStorage.getHearingById(e.target.closest('[data-complete-hearing]').dataset.completeHearing);
      PMSStorage.saveHearing({ ...h, status: 'Completed' }, actor);
      if (h.applicationId) {
        try { PMSStorage.transitionApplication(h.applicationId, 'Pending Board Review', actor, 'Hearing completed — pending board decision'); } catch (_) { /* ok */ }
      }
      refresh('hearings');
    }
  });

  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) refresh('overview');
})();
