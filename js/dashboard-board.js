(async () => {
  await PMSStorage.ensureLoaded();
  const actor = PMSAuth.requireDashboardRole('dashboard-board.html');
  if (!actor) return;

  const isBoardMember = actor.role === 'Parole Board Member';
  const canAssess = PMSRBAC.canSubmitAssessment(actor);
  const canScheduleHearings = typeof PMSRBAC !== 'undefined'
    ? PMSRBAC.canScheduleHearing(actor)
    : ['DJAG Secretary', 'System Administrator'].includes(actor.role);

  const panelTitles = {
    overview: ['Board Overview', canAssess && !isBoardMember ? `${actor.role} — assessment portal` : 'Parole Board — collective review and decision-making'],
    prisoners: ['Prisoner Records', 'View official case files (read-only)'],
    applications: ['Completed Applications', 'Review applications ready for board consideration'],
    hearings: [canScheduleHearings ? 'Hearing Management' : 'Hearing Schedule', canScheduleHearings ? 'Schedule and review parole hearings' : 'Upcoming and completed parole hearings'],
    decisions: [canAssess && !isBoardMember ? 'Submit Assessments' : 'Record Decisions', canAssess && !isBoardMember ? 'Provide your board assessment before final decision' : 'Approve, defer, or refuse parole applications'],
    history: ['Decision History', 'Historical parole decisions and hearing records'],
    reports: ['Board Reports', 'Meeting summaries and board statistics'],
    notifications: ['Notifications', 'Hearing, review, and decision alerts'],
    profile: ['Profile', 'Your account information'],
  };

  function getActiveHearing(appId) {
    return PMSStorage.getHearingsByApplication(appId).find((h) => !['Cancelled', 'Completed'].includes(h.status)) || null;
  }

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
    const pendingReview = apps.filter((a) => a.status === 'Pending Board Review').length;
    const hearings = PMSStorage.countUpcomingHearings();
    const awaiting = canScheduleHearings
      ? apps.filter((a) => a.status === 'Pre-Parole Report Prepared').length
      : pending.length;
    const decided = apps.filter((a) => ['Approved', 'Deferred', 'Refused', 'Parole Granted', 'Parole Refused'].includes(a.status)).length;

    PMSUI.setStat('stat-pending', pendingReview);
    PMSUI.setStat('stat-hearings', hearings);
    PMSUI.setStat('stat-awaiting', awaiting);
    PMSUI.setStat('stat-decided', decided);

    const awaitingLabel = document.querySelector('#stat-awaiting')?.closest('.stat-card')?.querySelector('.stat-label');
    if (awaitingLabel) {
      awaitingLabel.textContent = canScheduleHearings ? 'Awaiting Hearing' : 'Awaiting Decision';
    }

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

    PMSUI.renderBarChart('chart-decisions', [
      { label: 'Approved', value: apps.filter((a) => a.status === 'Approved').length },
      { label: 'Parole Granted', value: apps.filter((a) => a.status === 'Parole Granted').length },
      { label: 'Deferred', value: apps.filter((a) => a.status === 'Deferred').length },
      { label: 'Refused', value: apps.filter((a) => ['Refused', 'Parole Refused'].includes(a.status)).length },
    ], 'var(--color-navy)');
    if (typeof PMSCalendar !== 'undefined') PMSCalendar.mount('dashboard-calendar', actor);
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
      const outcome = PMSStorage.getBoardDecisionOutcome(a);
      const formBtn = PMSStorage.isBoardDecisionFinalized(a)
        ? ` <button type="button" class="btn-icon" data-open-form="${outcome === 'Parole Granted' ? 4 : 5}" data-app="${a.id}">Form ${outcome === 'Parole Granted' ? 4 : 5}</button>`
        : (['Hearing Scheduled', 'Pending Board Review'].includes(a.status)
          ? ` <button type="button" class="btn-icon" data-decide="${a.id}">Review Case</button>`
          : '');
      const profileLink = p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">Case File</a>` : '';
      return `<tr><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : '—'}</td><td>${PMSUI.instName(a.institutionId)}</td><td>${Math.floor(months / 12)}y ${months % 12}m</td><td>${preParoleReady ? 'Available' : '—'}</td><td>${summary.completed}/5</td><td>${profileLink}${formBtn}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-state">No applications.</td></tr>';
  }

  function renderHearings() {
    const highlightId = PMSUI.getDeepLinkParam('hearing');
    document.getElementById('hearings-tbody').innerHTML = PMSStorage.getHearings().map((h) => {
      const p = PMSStorage.getPrisonerById(h.prisonerId);
      const app = h.applicationId ? PMSStorage.getApplicationById(h.applicationId) : null;
      const deadline = app ? PMSStorage.getHearingDeadlineInfo(app) : null;
      const rowClass = highlightId === h.id ? 'row-highlight' : '';
      const appLink = h.applicationId && canScheduleHearings
        ? `<a href="forms/hearing-portal.html?appId=${encodeURIComponent(h.applicationId)}" class="btn-icon">${PMSUI.esc(h.applicationId)}</a>`
        : (h.applicationId ? PMSUI.esc(h.applicationId) : '—');
      const deadlineNote = deadline?.overdue ? ' · OVERDUE' : '';
      return `<tr data-hearing-id="${PMSUI.esc(h.id)}" class="${rowClass}"><td>${PMSUI.fmtDate(h.scheduledDate)} ${h.scheduledTime || ''}${deadlineNote}</td><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : PMSUI.prisonerName(h.prisonerId)}</td><td>${appLink}</td><td>${PMSUI.esc(h.location)}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(h.status)}">${PMSUI.esc(h.status)}</span></td><td><a href="${p ? PMSRBAC.prisonerProfileUrl(p.id) : '#'}" class="btn-icon">Case File</a>${app && ['Hearing Scheduled', 'Pending Board Review'].includes(app.status) && isBoardMember ? ` <button type="button" class="btn-icon" data-decide="${PMSUI.esc(app.id)}">Review Case</button>` : ''}${app && canScheduleHearings ? ` <a href="forms/hearing-portal.html?appId=${encodeURIComponent(app.id)}" class="btn-icon">Edit</a>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-state">No hearings.</td></tr>';
    if (highlightId) PMSUI.highlightDeepLinkRow(`[data-hearing-id="${CSS.escape(highlightId)}"]`);
  }

  function renderNotifications() {
    PMSUI.renderNotificationPanel('notification-list', actor);
  }

  function renderDecisions() {
    if (canAssess) {
      const pending = pendingDecisionApps();
      const submitted = PMSStorage.getParoleApplications().filter((a) =>
        ['Hearing Scheduled', 'Pending Board Review'].includes(a.status)
        && PMSStorage.hasSubmittedBoardAssessment(a, actor)
      );
      document.getElementById('decisions-list').innerHTML = `
      <p class="toolbar-note">Each board member casts an independent Approve, Deny, or Defer vote when ready.</p>
        ${pending.length ? `<h3 class="decisions-subheading">Awaiting your assessment</h3>${pending.map((a) => {
          const p = PMSStorage.getPrisonerById(a.prisonerId);
          const progress = PMSStorage.getBoardAssessmentProgress(a);
          const score = PMSStorage.calculateParoleScore(a);
          return `<div class="decision-card"><strong>${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)}</strong> — ${PMSUI.esc(a.caseNumber || a.id)}<br>
            <span class="meta">Panel progress: ${progress.submitted}/${progress.total} · Current score: ${score.percent}%${score.pendingRoles.length ? ` · Awaiting ${score.pendingRoles.join(', ')}` : ''}</span>
            <a href="forms/hearing-portal.html?appId=${encodeURIComponent(a.id)}" class="btn-primary btn-sm">Submit My Assessment</a></div>`;
        }).join('')}` : ''}
        ${submitted.length ? `<h3 class="decisions-subheading">Your assessments submitted</h3>${submitted.map((a) => {
          const p = PMSStorage.getPrisonerById(a.prisonerId);
          const mine = PMSStorage.getBoardAssessmentForActor(a, actor);
          const progress = PMSStorage.getBoardAssessmentProgress(a);
          const outcome = PMSStorage.getBoardDecisionOutcome(a);
          const formLink = PMSStorage.isBoardDecisionFinalized(a)
            ? `<a href="forms/form${outcome === 'Parole Granted' ? 4 : 5}.html?appId=${encodeURIComponent(a.id)}" class="btn-primary btn-sm">Open Form ${outcome === 'Parole Granted' ? 4 : 5}</a>`
            : (progress.complete ? '<span class="meta"> · Outcome finalizing…</span>' : '');
          return `<div class="decision-card decision-card--done"><strong>${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)}</strong> — ${PMSUI.esc(a.caseNumber || a.id)}<br>
            <span class="meta">Your vote: ${mine?.vote || '—'} · Panel: ${progress.submitted}/${progress.total}${progress.complete && outcome ? ` · ${outcome}` : ''}</span>
            <a href="forms/hearing-portal.html?appId=${encodeURIComponent(a.id)}" class="btn-outline btn-sm">Review / Update</a> ${formLink}</div>`;
        }).join('')}` : ''}
        ${!pending.length && !submitted.length ? '<p class="empty-state">No applications awaiting your assessment.</p>' : ''}`;
      return;
    }
    document.getElementById('decisions-list').innerHTML = pendingDecisionApps().map((a) => {
      const p = PMSStorage.getPrisonerById(a.prisonerId);
      const score = PMSStorage.calculateParoleScore(a);
      const progress = PMSStorage.getBoardAssessmentProgress(a);
      const assessments = PMSStorage.getBoardAssessments(a.id).filter((x) => x.submissionStatus === 'Submitted');
      const ready = progress.complete;
      return `<div class="decision-card"><strong>${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)}</strong> — ${PMSUI.esc(a.status)}<br>
        <span class="meta">${PMSUI.instName(a.institutionId)} · Score ${score.percent}% · Assessments ${progress.submitted}/${progress.total}${ready ? '' : ` · Awaiting ${progress.pendingRoles.join(', ')}`}</span>
        <button type="button" class="btn-primary btn-sm" data-decide="${a.id}" ${ready ? '' : 'disabled title="Awaiting all panel assessments"'}>${ready ? 'Record Final Decision' : 'Awaiting Panel Assessments'}</button>
        <a href="forms/hearing-portal.html?appId=${encodeURIComponent(a.id)}" class="btn-outline btn-sm">View Panel Progress</a></div>`;
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
      <ul><li>Total applications reviewed: ${PMSUI.formatStat(boardApps().length)}</li>
      <li>Approved: ${PMSUI.formatStat(apps.filter((a) => a.status === 'Approved').length)}</li>
      <li>Parole granted: ${PMSUI.formatStat(apps.filter((a) => a.status === 'Parole Granted').length)}</li>
      <li>Deferred: ${PMSUI.formatStat(apps.filter((a) => a.status === 'Deferred').length)}</li>
      <li>Refused: ${PMSUI.formatStat(apps.filter((a) => ['Refused', 'Parole Refused'].includes(a.status)).length)}</li>
      <li>Pending decision: ${PMSUI.formatStat(pendingDecisionApps().length)}</li></ul>`;
    if (typeof PMSReports !== 'undefined') PMSReports.mount('reports-body', 'reports-filter-bar', actor);
  }

  function setupStatCards() {
    const cols = ['ID', 'Name', 'Institution', 'Status', ''];
    PMSUI.bindStatCards([
      {
        statId: 'stat-awaiting',
        title: canScheduleHearings ? 'Awaiting Hearing' : 'Awaiting Decision',
        columns: cols,
        getRows: () => (canScheduleHearings
          ? PMSStorage.getParoleApplications().filter((a) => a.status === 'Pre-Parole Report Prepared')
          : pendingDecisionApps()).map((a) => PMSUI.appDrilldownRow(a)),
      },
      {
        statId: 'stat-pending',
        title: 'Pending Review',
        columns: cols,
        getRows: () => PMSStorage.getParoleApplications()
          .filter((a) => a.status === 'Pending Board Review')
          .map((a) => PMSUI.appDrilldownRow(a)),
      },
      {
        statId: 'stat-hearings',
        title: 'Scheduled Hearings',
        columns: ['Date', 'Name', 'Institution', 'Location', ''],
        getRows: () => PMSStorage.getHearings()
          .filter((h) => ['Scheduled', 'Upcoming'].includes(h.status))
          .map((h) => {
            const p = PMSStorage.getPrisonerById(h.prisonerId);
            if (!p) return '';
            return `<tr><td>${PMSUI.fmtDate(h.scheduledDate)}</td><td>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</td><td>${PMSUI.instName(p.institutionId)}</td><td>${PMSUI.esc(h.location || '—')}</td><td><a href="forms/hearing-portal.html?appId=${encodeURIComponent(h.applicationId || '')}" class="btn-icon">Open</a></td></tr>`;
          }).filter(Boolean),
      },
      {
        statId: 'stat-decided',
        title: 'Decisions Recorded',
        columns: cols,
        getRows: () => PMSStorage.getParoleApplications()
          .filter((a) => ['Approved', 'Deferred', 'Refused', 'Parole Granted', 'Parole Refused'].includes(a.status))
          .map((a) => PMSUI.appDrilldownRow(a)),
      },
    ]);
  }

  function openDecisionModal(appId) {
    const app = PMSStorage.getApplicationById(appId);
    if (!app) {
      PMSUI.showError('Application not found.');
      return;
    }
    if (!['Hearing Scheduled', 'Pending Board Review'].includes(app.status)) {
      PMSUI.showError('This application is not ready for a board decision.');
      return;
    }
    const p = PMSStorage.getPrisonerById(app.prisonerId);
    const hearing = getActiveHearing(appId);
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
    const progress = PMSStorage.getBoardAssessmentProgress(app);
    const assessments = PMSStorage.getBoardAssessments(appId).filter((a) => a.submissionStatus === 'Submitted');
    document.getElementById('dec-hearing-info').innerHTML += `<div class="score-panel"><p><strong>Parole score (system calculated):</strong> ${score.percent}% — ${score.result || (score.meetsThreshold ? 'ELIGIBLE FOR PAROLE' : 'NOT ELIGIBLE')}</p>
      <p><strong>Calculation:</strong> ${score.calculation || 'Pending panel assessments'}</p>
      <p><strong>Panel progress:</strong> ${progress.submitted}/${progress.total}${progress.pendingRoles.length ? ` · Awaiting ${progress.pendingRoles.join(', ')}` : ' · All assessments in'}</p>
      <p><strong>Individual assessments:</strong> ${assessments.map((a) => `${a.role}: ${a.score}% (${PMSUI.esc(a.assessorName)})`).join(' · ') || 'None yet — members submit independently'}</p></div>`;
    if (!progress.complete && isBoardMember) {
      PMSUI.showError(`Panel assessments are still in progress (${progress.submitted}/${progress.total}). Final decision will be available when all board members have voted.`);
      return;
    }
    document.getElementById('dec-outcome').value = 'Approved';
    document.getElementById('dec-conditions').value = '';
    document.getElementById('dec-deliberation').value = '';
    document.getElementById('decision-modal').showModal();
  }

  PMSSidebar.init({
    user: actor,
    roleLabel: actor.boardPosition || actor.role,
    activePanel: 'overview',
    onNavigate: (panel, meta) => PMSUI.switchPanel(panel, panelTitles, refresh, meta?.navId),
  });
  PMSUI.initShell(actor, actor.boardPosition || actor.role);
  PMSUI.bindModalClose();
  PMSUI.bindNotificationPanel('notification-list', actor, () => refresh('notifications'));

  const scheduleToolbar = document.getElementById('hearings-toolbar');
  if (scheduleToolbar) scheduleToolbar.hidden = !canScheduleHearings;
  document.getElementById('btn-schedule-hearing')?.addEventListener('click', () => {
    const eligible = PMSStorage.getParoleApplications().filter((a) => a.status === 'Pre-Parole Report Prepared');
    if (eligible.length === 1) {
      window.location.href = `forms/hearing-portal.html?appId=${encodeURIComponent(eligible[0].id)}`;
      return;
    }
    window.location.href = 'forms/hearing-portal.html';
  });

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
      PMSUI.showSuccess('Board decision recorded successfully.');
    } catch (err) {
      PMSUI.showError(err.message || 'Could not record decision.');
    }
  });

  document.getElementById('btn-print-summary').addEventListener('click', () => window.print());
  document.getElementById('board-prisoner-search').addEventListener('input', () => renderPrisoners());

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-decide]') && isBoardMember) openDecisionModal(e.target.closest('[data-decide]').dataset.decide);
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
  setupStatCards();
})();
