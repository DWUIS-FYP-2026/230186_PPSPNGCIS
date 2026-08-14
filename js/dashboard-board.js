(async () => {
  await PMSStorage.ensureLoaded();
  const actor = PMSAuth.requireRole(['Parole Board Member']);
  if (!actor) return;

  const panelTitles = {
    overview: ['Board Overview', 'Parole Board — collective review and decision-making'],
    prisoners: ['Prisoner Records', 'View official case files (read-only)'],
    applications: ['Completed Applications', 'Review applications ready for board consideration'],
    hearings: ['Hearing Schedule', 'Upcoming and completed parole hearings'],
    decisions: ['Record Decisions', 'Approve, defer, or refuse parole applications'],
    history: ['Decision History', 'Historical parole decisions and hearing records'],
    reports: ['Board Reports', 'Meeting summaries and board statistics'],
    profile: ['Profile', 'Your account information'],
  };

  function boardApps() {
    return PMSStorage.getParoleApplications().filter((a) =>
      ['Hearing Scheduled', 'Pending Board Review', 'Approved', 'Deferred', 'Refused'].includes(a.status)
    );
  }

  function pendingDecisionApps() {
    return PMSStorage.getParoleApplications().filter((a) =>
      ['Hearing Scheduled', 'Pending Board Review'].includes(a.status)
    );
  }

  function refresh(panel) {
    renderBoardBanner();
    ({ overview: renderOverview, prisoners: renderPrisoners, applications: renderApps, hearings: renderHearings,
       decisions: renderDecisions, history: renderHistory, reports: renderReports })[panel]?.();
  }

  function renderPrisoners() {
    const q = document.getElementById('board-prisoner-search').value.trim().toLowerCase();
    const list = PMSRBAC.filterPrisonersForUser(actor, PMSStorage.getPrisoners())
      .filter((p) => !q || `${p.firstName} ${p.lastName} ${p.prisonerNumber}`.toLowerCase().includes(q));
    document.getElementById('board-prisoners-tbody').innerHTML = list.map((p) => {
      const prog = PMSStorage.getPrisonerProgress(p);
      return `<tr><td>${PMSUI.esc(p.prisonerNumber)}</td><td>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</td><td>${PMSUI.instName(p.institutionId)}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(p.status)}">${PMSUI.esc(p.status)}</span></td><td>${PMSUI.fmtDate(prog.eligibilityDate)}</td><td><a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">View Case File</a></td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-state">No matching prisoners.</td></tr>';
  }

  function renderBoardBanner() {
    const members = PMSStorage.getUsers().filter((u) => u.role === 'Parole Board Member' && u.status === 'Active');
    document.getElementById('board-banner').innerHTML = `
      <strong>Parole Board Members:</strong>
      ${members.map((m) => `<span class="officer-chip">${PMSUI.esc(m.boardPosition || m.position)} — ${PMSUI.esc(m.firstName)} ${PMSUI.esc(m.lastName)}</span>`).join('')}`;
    const posEl = document.getElementById('board-position');
    if (posEl && actor.boardPosition) posEl.textContent = actor.boardPosition;
  }

  function renderOverview() {
    const pending = pendingDecisionApps();
    document.getElementById('stat-pending').textContent = PMSStorage.getParoleApplications().filter((a) => a.status === 'Pending Board Review').length;
    document.getElementById('stat-hearings').textContent = PMSStorage.getHearings().filter((h) => h.status === 'Scheduled').length;
    document.getElementById('stat-awaiting').textContent = pending.length;
    document.getElementById('stat-decided').textContent = PMSStorage.getParoleApplications().filter((a) => ['Approved', 'Deferred', 'Refused'].includes(a.status)).length;

    const upcoming = PMSStorage.getHearings().filter((h) => h.status === 'Scheduled').slice(0, 5);
    document.getElementById('overview-hearings').innerHTML = upcoming.length
      ? upcoming.map((h) => `<div class="overview-row"><strong>${PMSUI.fmtDate(h.scheduledDate)}</strong> ${PMSUI.prisonerName(h.prisonerId)}<span class="meta">${PMSUI.esc(h.location)}</span></div>`).join('')
      : '<p class="empty-state">No upcoming hearings.</p>';

    const apps = PMSStorage.getParoleApplications();
    PMSUI.renderBarChart('chart-decisions', [
      { label: 'Approved', value: apps.filter((a) => a.status === 'Approved').length },
      { label: 'Deferred', value: apps.filter((a) => a.status === 'Deferred').length },
      { label: 'Refused', value: apps.filter((a) => a.status === 'Refused').length },
    ], 'var(--color-navy)');
  }

  function prisonerProfileHtml(p) {
    const prog = PMSStorage.getPrisonerProgress(p);
    const months = PMSStorage.getSentenceDurationMonths(p);
    return `<p><strong>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</strong> (${PMSUI.esc(p.prisonerNumber)})</p>
      <p>Institution: ${PMSUI.instName(p.institutionId)} · Offense: ${PMSUI.esc(p.offense)}</p>
      <p>SSD: ${PMSUI.fmtDate(p.sentenceStartDate)} · SED: ${PMSUI.fmtDate(p.sentenceEndDate)} · Duration: ${Math.floor(months / 12)}y ${months % 12}m</p>
      <p>Progress: ${prog.percent.toFixed(0)}% served · Eligibility: ${PMSUI.fmtDate(prog.eligibilityDate)}</p>`;
  }

  function renderApps() {
    document.getElementById('apps-tbody').innerHTML = boardApps().map((a) => {
      const p = PMSStorage.getPrisonerById(a.prisonerId);
      const months = p ? PMSStorage.getSentenceDurationMonths(p) : 0;
      return `<tr><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : '—'}</td><td>${PMSUI.instName(a.institutionId)}</td><td>${Math.floor(months / 12)}y ${months % 12}m</td><td>${PMSStorage.getFormCompletionSummary(a).checks.form4 ? 'Available' : '—'}</td><td>${PMSStorage.getFormCompletionSummary(a).completed}/5</td><td><a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">Case File</a>${['Hearing Scheduled', 'Pending Board Review'].includes(a.status) ? ` <button type="button" class="btn-icon" data-open-form="5" data-app="${a.id}">Form 5</button> <button type="button" class="btn-icon" data-decide="${a.id}">Decide</button>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-state">No applications.</td></tr>';
  }

  function renderHearings() {
    document.getElementById('hearings-tbody').innerHTML = PMSStorage.getHearings().map((h) =>
      `<tr><td>${PMSUI.fmtDate(h.scheduledDate)} ${h.scheduledTime || ''}</td><td>${PMSUI.prisonerName(h.prisonerId)}</td><td>${PMSUI.esc(h.location)}</td><td>${PMSUI.esc(h.status)}</td><td><a href="${PMSRBAC.prisonerProfileUrl(h.prisonerId)}" class="btn-icon">Case File</a></td></tr>`
    ).join('') || '<tr><td colspan="5" class="empty-state">No hearings.</td></tr>';
  }

  function renderDecisions() {
    document.getElementById('decisions-list').innerHTML = pendingDecisionApps().map((a) => {
      const p = PMSStorage.getPrisonerById(a.prisonerId);
      return `<div class="decision-card"><strong>${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)}</strong> — ${PMSUI.esc(a.status)}<br><span class="meta">${PMSUI.instName(a.institutionId)}</span>
        <button type="button" class="btn-primary btn-sm" data-decide="${a.id}">Record Decision</button></div>`;
    }).join('') || '<p class="empty-state">No applications awaiting decision.</p>';
  }

  function renderHistory() {
    document.getElementById('history-tbody').innerHTML = PMSStorage.getParoleApplications()
      .filter((a) => a.boardDecision)
      .map((a) => {
        const p = PMSStorage.getPrisonerById(a.prisonerId);
        const dec = a.boardDecision;
        const decider = PMSStorage.getUserById(dec.decidedBy);
        return `<tr><td>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : '—'}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${PMSUI.esc(dec.conditions || '—')}</td><td>${decider ? `${PMSUI.esc(decider.firstName)} (${PMSUI.esc(dec.boardPosition || '')})` : '—'}</td><td>${PMSUI.fmtDate(dec.decidedAt)}</td></tr>`;
      }).join('') || '<tr><td colspan="5" class="empty-state">No decisions recorded.</td></tr>';
  }

  function renderReports() {
    const apps = PMSStorage.getParoleApplications();
    document.getElementById('meeting-summary').innerHTML = `
      <p><strong>Parole Board Meeting Summary</strong> — ${PMSUI.fmtDate(new Date().toISOString())}</p>
      <ul><li>Total applications reviewed: ${boardApps().length}</li>
      <li>Approved: ${apps.filter((a) => a.status === 'Approved').length}</li>
      <li>Deferred: ${apps.filter((a) => a.status === 'Deferred').length}</li>
      <li>Refused: ${apps.filter((a) => a.status === 'Refused').length}</li>
      <li>Pending decision: ${pendingDecisionApps().length}</li></ul>`;
    if (typeof PMSReports !== 'undefined') PMSReports.mount('reports-body', 'reports-filter-bar', actor);
  }

  function openDecisionModal(appId) {
    const app = PMSStorage.getApplicationById(appId);
    const p = PMSStorage.getPrisonerById(app.prisonerId);
    document.getElementById('dec-app-id').value = appId;
    document.getElementById('dec-prisoner-info').innerHTML = p
      ? `<p><a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-link">Open full case file (read-only)</a></p>${prisonerProfileHtml(p)}`
      : '<p class="empty-state">Prisoner record unavailable.</p>';
    document.getElementById('dec-report').textContent = app.preParoleReport || 'No pre-parole report on file.';
    document.getElementById('dec-docs').innerHTML = PMSStorage.PAROLE_FORMS.map((f) => {
      const done = PMSStorage.getFormCompletionSummary(app).checks[`form${f.number}`];
      return `<li>${PMSUI.esc(f.name)}: ${done ? 'Complete' : 'Incomplete'}</li>`;
    }).join('');
    document.getElementById('dec-outcome').value = 'Approved';
    document.getElementById('dec-conditions').value = '';
    document.getElementById('dec-deliberation').value = '';
    document.getElementById('decision-modal').showModal();
  }

  PMSSidebar.init({
    user: actor,
    roleLabel: actor.boardPosition || 'Parole Board Member',
    activePanel: 'overview',
    onNavigate: (panel, meta) => PMSUI.switchPanel(panel, panelTitles, refresh, meta?.navId),
  });
  PMSUI.initShell(actor, actor.boardPosition || 'Parole Board Member');
  PMSUI.bindModalClose();

  document.getElementById('decision-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await PMSStorage.recordBoardDecision(document.getElementById('dec-app-id').value, {
      outcome: document.getElementById('dec-outcome').value,
      conditions: document.getElementById('dec-conditions').value.trim(),
      deliberationNotes: document.getElementById('dec-deliberation').value.trim(),
    }, actor);
    document.getElementById('decision-modal').close();
    refresh(document.querySelector('.nav-item.active').dataset.panel);
  });

  document.getElementById('btn-print-summary').addEventListener('click', () => window.print());
  document.getElementById('board-prisoner-search').addEventListener('input', () => renderPrisoners());

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-decide]')) openDecisionModal(e.target.closest('[data-decide]').dataset.decide);
    if (e.target.closest('[data-open-form]')) {
      const btn = e.target.closest('[data-open-form]');
      PMSForms.openForm(parseInt(btn.dataset.openForm, 10), btn.dataset.app);
    }
  });

  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) refresh('overview');
})();
