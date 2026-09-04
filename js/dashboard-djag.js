(async () => {
  await PMSStorage.ensureLoaded();
  const actor = PMSAuth.requireDashboardRole('dashboard-djag.html');
  if (!actor) return;

  const panelTitles = {
    overview: ['Overview', 'DJAG Parole Clerk — application review and hearings'],
    prisoners: ['Prisoner Records', 'View prisoner records (read-only — maintained by PNGCS)'],
    eligibility: ['Eligibility Verification', 'View parole eligibility status nationwide'],
    applications: ['Parole Applications', 'Review PNGCS submissions and advance the legal workflow'],
    notifications: ['Notifications', 'Application and workflow alerts'],
    reports: ['Operational Reports', 'Pre-parole and hearing reports'],
    hearings: ['Hearing Calendar', 'Schedule and manage parole board hearings'],
    profile: ['Profile', 'Your account information'],
  };

  function djagApps() {
    return typeof PMSStorage.getApplicationsForDjagClerk === 'function'
      ? PMSStorage.getApplicationsForDjagClerk()
      : PMSStorage.getParoleApplications().filter((a) => a.status !== 'Draft' || PMSStorage.needsDjagForm2Ppr(a));
  }

  function form2ActionLabel(app) {
    if (PMSStorage.needsDjagForm2Ppr(app)) {
      return '<span class="eligible-tag">Form 2 — PPR pending</span>';
    }
    return formsSummary(app);
  }

  function scopePrisoners() {
    return PMSRBAC.filterPrisonersForUser(actor, PMSStorage.getPrisoners());
  }

  const FORM_WORKFLOW = [
    { n: 1, key: 'form1', label: 'Form 1 — Parole Eligibility Screening', prereqs: [] },
    { n: 2, key: 'form2', label: 'Form 2 — Assessment (PPR)', prereqs: ['form1'] },
    { n: 3, key: 'form3', label: 'Form 3 — Institutional Report', prereqs: ['form1', 'form2'] },
    { n: 4, key: 'form4', label: 'Form 4 — Pre-Parole Report', prereqs: ['form1', 'form2', 'form3'] },
    { n: 5, key: 'form5', label: 'Form 5 — Parole Refused', prereqs: ['form1', 'form2', 'form3'] },
  ];

  function prereqsMet(checks, prereqs) {
    return prereqs.every((k) => checks[k]);
  }

  function findApplicationForPrisoner(prisonerId) {
    if (!prisonerId) return null;
    return djagApps().find((a) => a.prisonerId === prisonerId && !['Approved', 'Refused', 'Released'].includes(a.status)) || null;
  }

  function getActiveFormNumber(app, checks) {
    if (PMSStorage.needsDjagForm2Ppr(app)) return 2;
    for (const f of FORM_WORKFLOW) {
      if (checks[f.key]) continue;
      if (!prereqsMet(checks, f.prereqs)) continue;
      if (PMSRBAC.canAccessForm(actor, f.n, 'edit')) return f.n;
    }
    return null;
  }

  function resolveWorkflowFormForPrisoner(prisonerId) {
    const app = findApplicationForPrisoner(prisonerId);
    if (!app) return { formN: null, appId: null, label: 'No application', openReview: false };

    if (PMSStorage.needsDjagForm2Ppr(app)) {
      return { formN: 2, appId: app.id, label: 'Form 2 — PPR section' };
    }

    const checks = PMSStorage.getFormCompletionSummary(app).checks;
    const activeFormNumber = getActiveFormNumber(app, checks);
    if (activeFormNumber) {
      const def = FORM_WORKFLOW.find((f) => f.n === activeFormNumber);
      return { formN: activeFormNumber, appId: app.id, label: def?.label || `Form ${activeFormNumber}` };
    }

    for (const f of FORM_WORKFLOW) {
      if (checks[f.key]) continue;
      if (!prereqsMet(checks, f.prereqs)) continue;
      if (PMSRBAC.canAccessForm(actor, f.n, 'edit')) {
        return { formN: f.n, appId: app.id, label: f.label };
      }
    }

    for (const f of FORM_WORKFLOW) {
      if (!prereqsMet(checks, f.prereqs)) continue;
      if (PMSRBAC.canAccessForm(actor, f.n, 'view')) {
        return { formN: f.n, appId: app.id, label: f.label };
      }
    }

    return { formN: null, appId: app.id, label: 'Review application', openReview: true };
  }

  function openPrisonerWorkflowForm(prisonerId) {
    const target = resolveWorkflowFormForPrisoner(prisonerId);
    if (target.openReview && target.appId) {
      openReview(target.appId);
      return;
    }
    if (!target.appId || !target.formN) return;
    PMSForms.openForm(target.formN, target.appId);
  }

  async function refresh(panel) {
    await PMSStorage.ensureLoaded();
    PMSUI.updateNotifBadge(actor);
    ({
      overview: renderOverview,
      prisoners: renderPrisoners,
      eligibility: renderEligibility,
      applications: renderApplications,
      reports: renderReports,
      hearings: renderHearings,
      notifications: renderNotifications,
    })[panel]?.();
  }

  function formsSummary(app) {
    const s = PMSStorage.getFormCompletionSummary(app);
    return `${s.completed}/5 forms complete`;
  }

  function renderOverview() {
    const apps = djagApps();
    const prisoners = scopePrisoners();

    document.getElementById('stat-eligible').textContent = apps.filter((a) => !['Approved', 'Refused', 'Released'].includes(a.status)).length;
    document.getElementById('stat-prisoners').textContent = apps.filter((a) => ['Submitted', 'Under DJAG Review'].includes(a.status)).length;
    document.getElementById('stat-drafts').textContent = apps.filter((a) => PMSStorage.needsDjagForm2Ppr(a)).length;
    document.getElementById('stat-notifications').textContent = PMSStorage.getUnreadCountForUser(actor);

    const notifs = PMSStorage.getNotificationsForUser(actor).slice(0, 5);
    document.getElementById('overview-notifications').innerHTML = `
      <div class="overview-row"><strong>Submitted from PNGCS</strong><span class="meta">${apps.filter((a) => a.status === 'Submitted').length} cases</span></div>
      <div class="overview-row"><strong>Under DJAG review</strong><span class="meta">${apps.filter((a) => a.status === 'Under DJAG Review').length}</span></div>
      <div class="overview-row"><strong>Hearings scheduled</strong><span class="meta">${PMSStorage.getHearings().filter((h) => ['Scheduled', 'Upcoming'].includes(h.status)).length}</span></div>
      ${notifs.length ? notifs.map((n) => `<div class="overview-row overview-row--${n.read ? 'read' : 'unread'}"><strong>${PMSUI.esc(n.title)}</strong><span class="meta">${PMSUI.esc(n.message.slice(0, 80))}${n.message.length > 80 ? '…' : ''}</span></div>`).join('') : ''}`;

    if (typeof PMSCalendar !== 'undefined') PMSCalendar.mount('dashboard-calendar', actor);
  }

  function renderPrisoners() {
    const q = document.getElementById('prisoner-search').value.trim().toLowerCase();
    const list = scopePrisoners().filter((p) => !q || `${p.firstName} ${p.lastName} ${p.prisonerNumber}`.toLowerCase().includes(q));
    document.getElementById('prisoners-tbody').innerHTML = list.map((p) => {
      const prog = PMSStorage.getPrisonerProgress(p);
      return `<tr class="${prog.eligible ? 'row-eligible' : ''}"><td>${PMSUI.esc(p.prisonerNumber)}</td><td>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</td><td>${PMSUI.instName(p.institutionId)}</td><td>${PMSUI.fmtDate(p.sentenceStartDate)}</td><td>${PMSUI.fmtDate(p.sentenceEndDate)}</td><td>${PMSUI.progressBar(p)}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(p.status)}">${PMSUI.esc(p.status)}</span></td><td><a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">View</a></td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty-state">No records.</td></tr>';
  }

  function renderEligibility() {
    document.getElementById('eligibility-rule').textContent = PMSStorage.getSettings().paroleEligibilityLabel;
    document.getElementById('eligibility-tbody').innerHTML = scopePrisoners().map((p) => {
      const prog = PMSStorage.getPrisonerProgress(p);
      const app = findApplicationForPrisoner(p.id);
      const workflow = resolveWorkflowFormForPrisoner(p.id);
      const canOpenWorkflow = !!app;
      const nameCell = canOpenWorkflow
        ? `<a href="#" class="eligibility-prisoner-link" data-open-prisoner-form="${PMSUI.esc(p.id)}" title="Open ${PMSUI.esc(workflow.label)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)} (${PMSUI.esc(p.prisonerNumber)})</a>`
        : `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)} (${PMSUI.esc(p.prisonerNumber)})`;
      const formStatus = app
        ? `<span class="meta">${PMSUI.esc(workflow.label)}</span>`
        : '<span class="meta">No application</span>';
      const actions = app
        ? (workflow.formN
          ? `<button type="button" class="btn-icon" data-open-prisoner-form="${PMSUI.esc(p.id)}">Continue Form ${workflow.formN}</button>`
          : `<button type="button" class="btn-icon" data-review="${PMSUI.esc(app.id)}">Review</button>`)
        : '—';
      return `<tr class="${prog.eligible ? 'row-eligible' : ''}"><td>${nameCell}</td><td>${PMSUI.fmtDate(p.sentenceStartDate)}</td><td>${Math.floor(prog.totalMonths / 12)}y ${prog.totalMonths % 12}m</td><td>${prog.percent.toFixed(0)}%</td><td>${PMSUI.fmtDate(prog.eligibilityDate)}${prog.eligible ? ' <span class="eligible-tag">ELIGIBLE</span>' : ''}</td><td>${PMSUI.esc(p.status)}</td><td>${formStatus}</td><td>${actions}</td></tr>`;
    }).join('');
  }

  function appRow(a) {
    const p = PMSStorage.getPrisonerById(a.prisonerId);
    const pprBtn = PMSStorage.needsDjagForm2Ppr(a)
      ? `<button type="button" class="btn-icon" data-open-form="2" data-app="${a.id}">Open Form 2</button> `
      : '';
    return `<tr><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : '—'}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${form2ActionLabel(a)}</td><td>${PMSUI.fmtDate(a.submittedAt)}</td><td>${pprBtn}<button type="button" class="btn-icon" data-review="${a.id}">Review</button> ${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">Case File</a>` : ''}</td></tr>`;
  }

  function renderApplications() {
    document.getElementById('applications-tbody').innerHTML = djagApps().map(appRow).join('') || '<tr><td colspan="5" class="empty-state">No applications.</td></tr>';
  }

  function renderReports() {
    if (typeof PMSReports !== 'undefined') PMSReports.mount('reports-body', 'reports-filter-bar', actor);
  }

  function renderHearings() {
    PMSStorage.checkHearingDeadlines(actor);
    const highlightId = PMSUI.getDeepLinkParam('hearing');
    document.getElementById('hearings-tbody').innerHTML = PMSStorage.getHearings().map((h) => {
      const p = PMSStorage.getPrisonerById(h.prisonerId);
      const appLink = h.applicationId
        ? `<button type="button" class="btn-icon" data-review="${PMSUI.esc(h.applicationId)}">${PMSUI.esc(h.applicationId)}</button>`
        : '—';
      const rowClass = highlightId === h.id ? 'row-highlight' : '';
      return `<tr data-hearing-id="${PMSUI.esc(h.id)}" class="${rowClass}"><td>${PMSUI.fmtDate(h.scheduledDate)} ${h.scheduledTime || ''}</td><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : PMSUI.prisonerName(h.prisonerId)}</td><td>${appLink}</td><td>${PMSUI.esc(h.location)}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(h.status)}">${PMSUI.esc(h.status)}</span></td><td><a href="${PMSRBAC.prisonerProfileUrl(h.prisonerId)}" class="btn-icon">Case File</a> <button type="button" class="btn-icon" data-complete-hearing="${PMSUI.esc(h.id)}">Complete</button></td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-state">No hearings scheduled.</td></tr>';
    if (highlightId) PMSUI.highlightDeepLinkRow(`[data-hearing-id="${CSS.escape(highlightId)}"]`);
  }

  function renderNotifications() {
    PMSUI.renderNotificationPanel('notification-list', actor);
  }

  function formStatusList(app) {
    const s = PMSStorage.getFormCompletionSummary(app);
    return PMSStorage.PAROLE_FORMS.map((f) => {
      const key = `form${f.number}`;
      const done = s.checks[key];
      const canView = PMSRBAC.canAccessForm(actor, f.number, 'view');
      const canEdit = PMSRBAC.canAccessForm(actor, f.number, 'edit');
      const openBtn = canView
        ? `<button type="button" class="btn-icon btn-sm" data-open-form="${f.number}" data-app="${app.id}">${canEdit && !done ? 'Open' : 'View'}</button>`
        : '';
      return `<li class="${done ? 'form-done' : 'form-pending'}">${PMSUI.esc(f.name)}: ${done ? 'Complete' : 'Incomplete'} ${openBtn}</li>`;
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

  function openHearingPortal() {
    const eligible = djagApps().filter((a) => ['Pre-Parole Report Prepared'].includes(a.status));
    if (eligible.length === 1) {
      window.location.href = `forms/hearing-portal.html?appId=${encodeURIComponent(eligible[0].id)}`;
      return;
    }
    window.location.href = 'forms/hearing-portal.html';
  }

  PMSSidebar.init({
    user: actor,
    activePanel: 'overview',
    onNavigate: (panel, meta) => PMSUI.switchPanel(panel, panelTitles, refresh, meta?.navId),
  });
  PMSUI.initShell(actor);
  PMSUI.bindModalClose();
  PMSUI.bindNotificationPanel('notification-list', actor, () => refresh('notifications'));

  document.getElementById('prisoner-search').addEventListener('input', () => renderPrisoners());
  document.getElementById('btn-schedule-hearing').addEventListener('click', openHearingPortal);
  document.getElementById('btn-schedule-hearing-overview')?.addEventListener('click', openHearingPortal);

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
    PMSForms.openForm(4, document.getElementById('review-app-id').value);
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
    const prisonerFormBtn = e.target.closest('[data-open-prisoner-form]');
    if (prisonerFormBtn) {
      e.preventDefault();
      openPrisonerWorkflowForm(prisonerFormBtn.dataset.openPrisonerForm);
      return;
    }
    if (e.target.closest('[data-review]')) openReview(e.target.closest('[data-review]').dataset.review);
    if (e.target.closest('[data-open-form]')) {
      const btn = e.target.closest('[data-open-form]');
      PMSForms.openForm(parseInt(btn.dataset.openForm, 10), btn.dataset.app);
    }
    if (e.target.closest('[data-read]')) return;
    if (e.target.closest('[data-complete-hearing]')) {
      const h = PMSStorage.getHearingById(e.target.closest('[data-complete-hearing]').dataset.completeHearing);
      if (h && confirm('Mark this hearing as completed?')) {
        PMSStorage.saveHearing({ ...h, status: 'Completed' }, actor);
        refresh('hearings');
      }
    }
  });

  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) refresh('overview');
})();
