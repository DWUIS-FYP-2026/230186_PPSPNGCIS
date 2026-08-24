(async () => {
  await PMSStorage.ensureLoaded();
  const actor = PMSAuth.requireRole(['Parole Board Member', 'Doctor', 'CS Commissioner', 'DJAG Secretary']);
  if (!actor) return;

  const isBoardMember = actor.role === 'Parole Board Member';
  const canAssess = PMSRBAC.canSubmitAssessment(actor);

  const panelTitles = {
    overview: ['Board Overview', canAssess && !isBoardMember ? `${actor.role} — assessment portal` : 'Parole Board — collective review and decision-making'],
    prisoners: ['Prisoner Records', 'View official case files (read-only)'],
    applications: ['Completed Applications', 'Review applications ready for board consideration'],
    hearings: ['Hearing Schedule', 'Upcoming and completed parole hearings'],
    decisions: [canAssess && !isBoardMember ? 'Submit Assessments' : 'Record Decisions', canAssess && !isBoardMember ? 'Provide your board assessment before final decision' : 'Approve, defer, or refuse parole applications'],
    history: ['Decision History', 'Historical parole decisions and hearing records'],
    reports: ['Board Reports', 'Meeting summaries and board statistics'],
    notifications: ['Notifications', 'Hearing, review, and decision alerts'],
    profile: ['Profile', 'Your account information'],
  };

  function boardApps() {
    return PMSStorage.getParoleApplications().filter((a) =>
      ['Hearing Scheduled', 'Pending Board Review', 'Approved', 'Deferred', 'Refused'].includes(a.status)
    );
  }

  function pendingDecisionApps() {
    const base = PMSStorage.getParoleApplications().filter((a) =>
      ['Hearing Scheduled', 'Pending Board Review'].includes(a.status)
    );
    if (!canAssess) return base;
    return base.filter((a) => {
      const mine = PMSStorage.getBoardAssessments(a.id).some((x) => x.assessorId === actor.id);
      return !mine;
    });
  }

  function refresh(panel) {
    PMSUI.updateNotifBadge(actor);
    renderBoardBanner();
    ({ overview: renderOverview, prisoners: renderPrisoners, applications: renderApps, hearings: renderHearings,
       decisions: renderDecisions, history: renderHistory, reports: renderReports, notifications: renderNotifications })[panel]?.();
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
    const apps = PMSStorage.getParoleApplications();
    document.getElementById('stat-pending').textContent = apps.filter((a) => a.status === 'Pending Board Review').length;
    document.getElementById('stat-hearings').textContent = PMSStorage.getHearings().filter((h) => ['Scheduled', 'Upcoming'].includes(h.status)).length;
    document.getElementById('stat-awaiting').textContent = pending.length;
    document.getElementById('stat-decided').textContent = apps.filter((a) => ['Approved', 'Deferred', 'Refused', 'Parole Granted', 'Parole Refused'].includes(a.status)).length;

    const contractStatus = actor.contractExpiryDate
      ? (actor.contractStatus || 'Active')
      : 'N/A';
    const contractDays = actor.contractExpiryDate
      ? Math.ceil((new Date(actor.contractExpiryDate) - new Date()) / 86400000)
      : null;

    const upcoming = PMSStorage.getHearings().filter((h) => ['Scheduled', 'Upcoming'].includes(h.status)).slice(0, 5);
    document.getElementById('overview-hearings').innerHTML = `
      <div class="overview-row overview-row--highlight"><strong>Contract Status</strong><span class="meta">${PMSUI.esc(contractStatus)}${contractDays != null ? ` · ${contractDays} day(s) remaining` : ''}</span></div>
      ${upcoming.length ? upcoming.map((h) => `<div class="overview-row"><strong>${PMSUI.fmtDate(h.scheduledDate)}</strong> ${PMSUI.prisonerName(h.prisonerId)}<span class="meta">${PMSUI.esc(h.location)}</span></div>`).join('') : '<p class="empty-state">No upcoming hearings.</p>'}`;

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
      const summary = PMSStorage.getFormCompletionSummary(a);
      const preParoleReady = summary.checks.form4 || !!a.formData?.form4?.investigationSummary || !!a.preParoleReport;
      return `<tr><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : '—'}</td><td>${PMSUI.instName(a.institutionId)}</td><td>${Math.floor(months / 12)}y ${months % 12}m</td><td>${preParoleReady ? 'Available' : '—'}</td><td>${summary.completed}/5</td><td><a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">Case File</a>${['Hearing Scheduled', 'Pending Board Review'].includes(a.status) ? ` <button type="button" class="btn-icon" data-open-form="5" data-app="${a.id}">Form 5</button> <button type="button" class="btn-icon" data-decide="${a.id}">Review Case</button>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-state">No applications.</td></tr>';
  }

  function renderHearings() {
    const highlightId = PMSUI.getDeepLinkParam('hearing');
    document.getElementById('hearings-tbody').innerHTML = PMSStorage.getHearings().map((h) => {
      const p = PMSStorage.getPrisonerById(h.prisonerId);
      const app = h.applicationId ? PMSStorage.getApplicationById(h.applicationId) : null;
      const rowClass = highlightId === h.id ? 'row-highlight' : '';
      return `<tr data-hearing-id="${PMSUI.esc(h.id)}" class="${rowClass}"><td>${PMSUI.fmtDate(h.scheduledDate)} ${h.scheduledTime || ''}</td><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : PMSUI.prisonerName(h.prisonerId)}</td><td>${h.applicationId ? PMSUI.esc(h.applicationId) : '—'}</td><td>${PMSUI.esc(h.location)}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(h.status)}">${PMSUI.esc(h.status)}</span></td><td><a href="${PMSRBAC.prisonerProfileUrl(h.prisonerId)}" class="btn-icon">Case File</a>${app && ['Hearing Scheduled', 'Pending Board Review'].includes(app.status) ? ` <button type="button" class="btn-icon" data-decide="${PMSUI.esc(app.id)}">Review Case</button>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-state">No hearings.</td></tr>';
    if (highlightId) PMSUI.highlightDeepLinkRow(`[data-hearing-id="${CSS.escape(highlightId)}"]`);
  }

  function renderNotifications() {
    PMSUI.renderNotificationPanel('notification-list', actor);
  }

  function renderDecisions() {
    if (canAssess) {
      document.getElementById('decisions-list').innerHTML = pendingDecisionApps().map((a) => {
        const p = PMSStorage.getPrisonerById(a.prisonerId);
        const score = PMSStorage.calculateParoleScore(a);
        const mine = PMSStorage.getBoardAssessments(a.id).find((x) => x.assessorId === actor.id);
        return `<div class="decision-card"><strong>${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)}</strong> — ${PMSUI.esc(a.caseNumber || a.id)}<br>
          <span class="meta">Parole score: ${score.percent}% · ${mine ? 'Assessment submitted' : 'Assessment pending'}</span>
          <button type="button" class="btn-primary btn-sm" data-assess="${a.id}">${mine ? 'Update Assessment' : 'Submit Assessment'}</button></div>`;
      }).join('') || '<p class="empty-state">No applications awaiting your assessment.</p>';
      return;
    }
    document.getElementById('decisions-list').innerHTML = pendingDecisionApps().map((a) => {
      const p = PMSStorage.getPrisonerById(a.prisonerId);
      const score = PMSStorage.calculateParoleScore(a);
      const assessments = PMSStorage.getBoardAssessments(a.id);
      return `<div class="decision-card"><strong>${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)}</strong> — ${PMSUI.esc(a.status)}<br>
        <span class="meta">${PMSUI.instName(a.institutionId)} · Score ${score.percent}% · Assessments ${assessments.length}/3</span>
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
    if (!app) {
      alert('Application not found.');
      return;
    }
    if (!['Hearing Scheduled', 'Pending Board Review'].includes(app.status)) {
      alert('This application is not ready for a board decision.');
      return;
    }
    const p = PMSStorage.getPrisonerById(app.prisonerId);
    const hearing = PMSStorage.getHearingsByApplication(appId).find((h) => h.status === 'Scheduled') || PMSStorage.getHearingsByApplication(appId)[0];
    document.getElementById('dec-app-id').value = appId;
    document.getElementById('dec-prisoner-info').innerHTML = p
      ? `<p><a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-link">Open full case file (read-only)</a></p>${prisonerProfileHtml(p)}`
      : '<p class="empty-state">Prisoner record unavailable.</p>';
    document.getElementById('dec-report').textContent = app.preParoleReport || app.formData?.form4?.investigationSummary || 'No pre-parole report on file.';
    document.getElementById('dec-docs').innerHTML = PMSStorage.PAROLE_FORMS.map((f) => {
      const done = PMSStorage.getFormCompletionSummary(app).checks[`form${f.number}`];
      return `<li>${PMSUI.esc(f.name)}: ${done ? 'Complete' : 'Incomplete'}</li>`;
    }).join('');
    document.getElementById('dec-hearing-info').innerHTML = hearing
      ? `<p><strong>Scheduled hearing:</strong> ${PMSUI.fmtDate(hearing.scheduledDate)} ${PMSUI.esc(hearing.scheduledTime || '')} · ${PMSUI.esc(hearing.location)}</p>`
      : '<p class="empty-state">No linked hearing record on file.</p>';
    const score = PMSStorage.calculateParoleScore(app);
    const assessments = PMSStorage.getBoardAssessments(appId);
    document.getElementById('dec-hearing-info').innerHTML += `<div class="score-panel"><p><strong>Parole score (system calculated):</strong> ${score.percent}% — ${score.result || (score.meetsThreshold ? 'ELIGIBLE FOR PAROLE' : 'NOT ELIGIBLE')}</p>
      <p><strong>Calculation:</strong> ${score.calculation || 'Pending all assessments'}</p>
      <p><strong>Individual assessments:</strong> ${score.assessments?.map((a) => `${a.role}: ${a.score}%`).join(' · ') || assessments.map((a) => `${a.role}: ${a.score}%`).join(', ') || 'None'}</p></div>`;
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
  PMSUI.bindNotificationPanel('notification-list', actor, () => refresh('notifications'));

  document.getElementById('decision-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isBoardMember) return;
    try {
      await PMSStorage.recordBoardDecision(document.getElementById('dec-app-id').value, {
        outcome: document.getElementById('dec-outcome').value,
        conditions: document.getElementById('dec-conditions').value.trim(),
        deliberationNotes: document.getElementById('dec-deliberation').value.trim(),
      }, actor);
      document.getElementById('decision-modal').close();
      refresh(document.querySelector('.nav-item.active')?.dataset.panel || 'decisions');
      alert('Board decision recorded successfully.');
    } catch (err) {
      alert(err.message || 'Could not record decision.');
    }
  });

  document.getElementById('btn-print-summary').addEventListener('click', () => window.print());
  document.getElementById('board-prisoner-search').addEventListener('input', () => renderPrisoners());

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-decide]') && isBoardMember) openDecisionModal(e.target.closest('[data-decide]').dataset.decide);
    if (e.target.closest('[data-assess]')) {
      const appId = e.target.closest('[data-assess]').dataset.assess;
      const score = prompt('Enter assessment score (0–100):', '85');
      if (score == null) return;
      const feedback = prompt('Assessment feedback:', '') || '';
      try {
        PMSStorage.saveBoardAssessment(appId, { score: Number(score), feedback, recommendation: Number(score) >= 80 ? 'Recommend' : 'Do not recommend' }, actor);
        refresh(document.querySelector('.nav-item.active')?.dataset.panel || 'decisions');
        alert('Assessment submitted.');
      } catch (err) { alert(err.message); }
    }
    if (e.target.closest('[data-open-form]')) {
      const btn = e.target.closest('[data-open-form]');
      PMSForms.openForm(parseInt(btn.dataset.openForm, 10), btn.dataset.app);
    }
  });

  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) {
    refresh('overview');
  } else {
    const appId = PMSUI.getDeepLinkParam('app');
    if (appId) setTimeout(() => openDecisionModal(appId), 0);
  }
})();
