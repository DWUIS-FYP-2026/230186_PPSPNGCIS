(async () => {
  await PMSStorage.ensureLoaded();
  const actor = PMSAuth.requireDashboardRole('dashboard-board.html');
  if (!actor) return;

  const isPanelMember = ['Doctor', 'CS Commissioner', 'DJAG Secretary'].includes(actor.role);
  const isSecretary = actor.role === 'DJAG Secretary';
  const canAssess = PMSRBAC.canSubmitAssessment(actor);
  const canScheduleHearings = typeof PMSRBAC !== 'undefined'
    ? PMSRBAC.canScheduleHearing(actor)
    : ['DJAG Secretary', 'System Administrator'].includes(actor.role);

  function schedulingQueue() {
    return PMSStorage.getParoleApplications().filter((a) => a.status === 'Pre-Parole Report Prepared');
  }

  function hearingPortalHref(appId) {
    return `forms/hearing-portal.html?appId=${encodeURIComponent(appId)}`;
  }

  function schedulingDrilldownRow(app) {
    const p = PMSStorage.getPrisonerById(app.prisonerId);
    if (!p) return '';
    const deadline = PMSStorage.getHearingDeadlineInfo(app);
    const deadlineCell = deadline?.overdue
      ? '<span class="status-pill status-pill--danger">Overdue</span>'
      : (deadline?.daysRemaining != null
        ? `<span class="meta">${deadline.daysRemaining} day(s)</span>`
        : '—');
    return `<tr>
      <td>${PMSUI.esc(p.prisonerNumber || p.id)}</td>
      <td>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</td>
      <td>${PMSUI.instName(p.institutionId)}</td>
      <td>${deadlineCell}</td>
      <td><a href="${hearingPortalHref(app.id)}" class="btn-primary btn-sm">Schedule</a></td>
    </tr>`;
  }

  const panelTitles = {
    overview: [isSecretary ? 'Secretary Overview' : 'Board Overview', isSecretary
      ? 'Schedule hearings and monitor board workflow'
      : (canAssess && !isPanelMember ? `${actor.role} — assessment portal` : 'Parole Board — collective review and decision-making')],
    prisoners: ['Prisoner Records', 'View official case files (read-only)'],
    applications: [isSecretary ? 'Schedule Hearings' : 'Completed Applications', isSecretary
      ? 'Cases awaiting parole hearing date (Form 3 verified)'
      : 'Review applications ready for board consideration'],
    hearings: [canScheduleHearings ? 'Hearing Management' : 'Hearing Schedule', canScheduleHearings ? 'Schedule and review parole hearings' : 'Upcoming and completed parole hearings'],
    decisions: [isSecretary ? 'My Board Assessment' : (canAssess && !isPanelMember ? 'Submit Assessments' : 'Record Decisions'), isSecretary
      ? 'Submit your Approve, Deny, or Defer vote when the hearing is scheduled'
      : (canAssess && !isPanelMember ? 'Provide your board assessment before final decision' : 'Approve, defer, or refuse parole applications')],
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
       decisions: renderDecisions, history: renderHistory, reports: renderReports, notifications: renderNotifications,
       profile: () => {} })[panel]?.();
  }

  function bindOverviewRowNav(containerId) {
    const host = document.getElementById(containerId);
    if (!host || host.dataset.overviewNavBound) return;
    host.dataset.overviewNavBound = 'true';
    const go = (row) => {
      if (!row?.dataset.gotoPanel) return;
      PMSUI.switchPanel(row.dataset.gotoPanel, panelTitles, refresh, row.dataset.gotoNav || row.dataset.gotoPanel);
    };
    host.addEventListener('click', (e) => {
      const row = e.target.closest('[data-goto-panel]');
      if (!row || e.target.closest('a')) return;
      go(row);
    });
    host.addEventListener('keydown', (e) => {
      const row = e.target.closest('[data-goto-panel]');
      if (!row || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      go(row);
    });
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
    const banner = document.getElementById('board-banner');
    if (!banner) return;
    if (isSecretary) {
      const queue = schedulingQueue();
      banner.innerHTML = `<strong>DJAG Secretary — Hearing Scheduling</strong>
        <span class="meta">${queue.length ? `${PMSUI.formatStat(queue.length)} case(s) awaiting hearing date` : 'No cases awaiting schedule'} · Panel assessments open after hearing is set</span>`;
      const posEl = document.getElementById('board-position');
      if (posEl && actor.boardPosition) posEl.textContent = actor.boardPosition;
      return;
    }
    const boardRoles = ['Doctor', 'CS Commissioner', 'DJAG Secretary'];
    const members = PMSStorage.getUsers().filter((u) => boardRoles.includes(u.role) && u.status === 'Active');
    banner.innerHTML = `
      <strong>Parole Board — three members:</strong>
      ${members.map((m) => `<span class="officer-chip">${PMSUI.esc(m.boardPosition || m.position || m.role)} — ${PMSUI.esc(m.firstName)} ${PMSUI.esc(m.lastName)}</span>`).join('')}`;
    const posEl = document.getElementById('board-position');
    if (posEl && actor.boardPosition) posEl.textContent = actor.boardPosition;
  }

  function renderOverview() {
    const pending = pendingDecisionApps();
    const apps = PMSStorage.getParoleApplications();
    const pendingReview = apps.filter((a) => a.status === 'Pending Board Review').length;
    const hearings = PMSStorage.countUpcomingHearings();
    const queue = schedulingQueue();
    const awaiting = canScheduleHearings ? queue.length : pending.length;
    const decided = apps.filter((a) => ['Approved', 'Deferred', 'Refused', 'Parole Granted', 'Parole Refused'].includes(a.status)).length;

    PMSUI.setStat('stat-pending', canScheduleHearings ? queue.filter((a) => {
      const d = PMSStorage.getHearingDeadlineInfo(a);
      return d && !d.overdue && d.daysRemaining <= 7;
    }).length : pendingReview);
    PMSUI.setStat('stat-hearings', hearings);
    PMSUI.setStat('stat-awaiting', awaiting);
    PMSUI.setStat('stat-decided', decided);

    const awaitingLabel = document.querySelector('#stat-awaiting')?.closest('.stat-card')?.querySelector('.stat-label');
    if (awaitingLabel) {
      awaitingLabel.textContent = canScheduleHearings ? 'Awaiting Hearing' : 'Awaiting Decision';
    }
    const pendingLabel = document.querySelector('#stat-pending')?.closest('.stat-card')?.querySelector('.stat-label');
    if (pendingLabel && canScheduleHearings) {
      pendingLabel.textContent = 'Due Within 7 Days';
    }

    const upcoming = PMSStorage.getHearings().filter((h) => ['Scheduled', 'Upcoming'].includes(h.status)).slice(0, 5);
    const contractBlock = actor.contractExpiryDate ? (() => {
      const contractStatus = actor.contractStatus || 'Active';
      const contractDays = Math.ceil((new Date(actor.contractExpiryDate) - new Date()) / 86400000);
      return `<div class="overview-row overview-row--highlight"><strong>Contract Status</strong><span class="meta">${PMSUI.esc(contractStatus)} · ${contractDays} day(s) remaining</span></div>`;
    })() : '';

    const scheduleBlock = canScheduleHearings ? (queue.length
      ? queue.slice(0, 4).map((a) => {
        const p = PMSStorage.getPrisonerById(a.prisonerId);
        const deadline = PMSStorage.getHearingDeadlineInfo(a);
        const note = deadline?.overdue ? ' · OVERDUE' : (deadline?.daysRemaining != null ? ` · ${deadline.daysRemaining}d left` : '');
        return `<div class="overview-row overview-row--clickable" data-goto-panel="applications" data-goto-nav="applications" role="button" tabindex="0">
          <div class="overview-row__main"><strong>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : PMSUI.esc(a.caseNumber || a.id)}</strong><span class="meta">Awaiting hearing schedule${note}</span></div>
          <a href="${hearingPortalHref(a.id)}" class="btn-primary btn-sm" onclick="event.stopPropagation()">Schedule</a>
        </div>`;
      }).join('')
      : '<p class="empty-state">No cases awaiting hearing schedule.</p>') : '';

    document.getElementById('overview-hearings').innerHTML = canScheduleHearings
      ? `${scheduleBlock}${upcoming.length ? `<h3 class="overview-subheading">Upcoming hearings</h3>${upcoming.map((h) => `<div class="overview-row"><strong>${PMSUI.fmtDate(h.scheduledDate)}</strong> ${PMSUI.prisonerName(h.prisonerId)}<span class="meta">${PMSUI.esc(h.location)}</span></div>`).join('')}` : ''}`
      : `${contractBlock}${upcoming.length ? upcoming.map((h) => `<div class="overview-row"><strong>${PMSUI.fmtDate(h.scheduledDate)}</strong> ${PMSUI.prisonerName(h.prisonerId)}<span class="meta">${PMSUI.esc(h.location)}</span></div>`).join('') : '<p class="empty-state">No upcoming hearings.</p>'}`;

    const notifCard = document.getElementById('overview-notifications-card');
    const notifHost = document.getElementById('overview-notifications');
    if (notifCard && notifHost) {
      const unread = PMSUI.recentNotifications(actor, 6);
      const showCard = canScheduleHearings || unread.length > 0;
      notifCard.hidden = !showCard;
      if (showCard) {
        notifHost.innerHTML = canScheduleHearings
          ? `<div class="overview-row"><strong>Cases awaiting schedule</strong><span class="meta">${PMSUI.formatStat(queue.length)}</span></div>
            ${queue.slice(0, 3).map((a) => {
              const p = PMSStorage.getPrisonerById(a.prisonerId);
              return `<div class="overview-row overview-row--clickable" data-goto-panel="applications" role="button" tabindex="0"><strong>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : PMSUI.esc(a.id)}</strong><a href="${hearingPortalHref(a.id)}" class="btn-icon" onclick="event.stopPropagation()">Schedule</a></div>`;
            }).join('')}
            ${unread.map((n) => PMSUI.renderOverviewNotificationRow(n, actor)).join('')}`
          : (unread.map((n) => PMSUI.renderOverviewNotificationRow(n, actor)).join('') || '<p class="empty-state">No alerts.</p>');
      }
    }

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
    if (canScheduleHearings) {
      const queue = schedulingQueue();
      document.getElementById('apps-tbody').innerHTML = queue.map((a) => {
        const p = PMSStorage.getPrisonerById(a.prisonerId);
        const summary = PMSStorage.getFormCompletionSummary(a);
        const deadline = PMSStorage.getHearingDeadlineInfo(a);
        const deadlineText = deadline?.overdue
          ? '<span class="status-pill status-pill--danger">Overdue</span>'
          : (deadline?.daysRemaining != null ? `${deadline.daysRemaining} day(s)` : '—');
        return `<tr>
          <td>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : '—'}</td>
          <td>${PMSUI.instName(a.institutionId)}</td>
          <td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td>
          <td>${deadlineText}</td>
          <td>${summary.completed}/5</td>
          <td><a href="${hearingPortalHref(a.id)}" class="btn-primary btn-sm">Schedule Hearing</a></td>
        </tr>`;
      }).join('') || '<tr><td colspan="6" class="empty-state">All verified cases have hearings scheduled.</td></tr>';
      return;
    }

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
      return `<tr data-hearing-id="${PMSUI.esc(h.id)}" class="${rowClass}"><td>${PMSUI.fmtDate(h.scheduledDate)} ${h.scheduledTime || ''}${deadlineNote}</td><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : PMSUI.prisonerName(h.prisonerId)}</td><td>${appLink}</td><td>${PMSUI.esc(h.location)}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(h.status)}">${PMSUI.esc(h.status)}</span></td><td><a href="${p ? PMSRBAC.prisonerProfileUrl(p.id) : '#'}" class="btn-icon">Case File</a>${app && ['Hearing Scheduled', 'Pending Board Review'].includes(app.status) && isSecretary ? ` <button type="button" class="btn-icon" data-decide="${PMSUI.esc(app.id)}">Review Case</button>` : ''}${app && canScheduleHearings ? ` <a href="forms/hearing-portal.html?appId=${encodeURIComponent(app.id)}" class="btn-icon">Edit</a>` : ''}</td></tr>`;
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
      <p class="toolbar-note">Each of the three board members (DJAG Secretary, CS Commissioner, Doctor) casts an independent Approve, Deny, or Defer vote when ready.</p>
        ${pending.length ? `<h3 class="decisions-subheading">Awaiting your assessment</h3>${pending.map((a) => {
          const p = PMSStorage.getPrisonerById(a.prisonerId);
          const progress = PMSStorage.getBoardAssessmentProgress(a);
          const score = PMSStorage.calculateParoleScore(a);
          return `<div class="decision-card"><strong>${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)}</strong> — ${PMSUI.esc(a.caseNumber || a.id)}<br>
            <span class="meta">Panel progress: ${progress.submitted}/${progress.total} · Current score: ${score.percent}%${score.pendingRoles.length ? ` · Awaiting ${score.pendingRoles.join(', ')}` : ''}</span>
            <button type="button" class="btn-primary btn-sm" data-assess="${PMSUI.esc(a.id)}">Record My Vote</button>
            <a href="forms/hearing-portal.html?appId=${encodeURIComponent(a.id)}" class="btn-outline btn-sm">Hearing Portal</a></div>`;
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
            <button type="button" class="btn-outline btn-sm" data-assess="${PMSUI.esc(a.id)}">Update Vote</button>
            <a href="forms/hearing-portal.html?appId=${encodeURIComponent(a.id)}" class="btn-icon btn-sm">Portal</a> ${formLink}</div>`;
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
    const scheduleCols = ['ID', 'Name', 'Institution', 'Deadline', ''];
    PMSUI.bindStatCards([
      {
        statId: 'stat-awaiting',
        title: canScheduleHearings ? 'Awaiting Hearing' : 'Awaiting Decision',
        columns: canScheduleHearings ? scheduleCols : cols,
        getRows: () => (canScheduleHearings
          ? schedulingQueue().map((a) => schedulingDrilldownRow(a))
          : pendingDecisionApps().map((a) => PMSUI.appDrilldownRow(a))),
        onClick: canScheduleHearings ? () => PMSUI.switchPanel('applications', panelTitles, refresh, 'applications') : undefined,
      },
      {
        statId: 'stat-pending',
        title: canScheduleHearings ? 'Due Within 7 Days' : 'Pending Review',
        columns: canScheduleHearings ? scheduleCols : cols,
        getRows: () => (canScheduleHearings
          ? schedulingQueue().filter((a) => {
            const d = PMSStorage.getHearingDeadlineInfo(a);
            return d && !d.overdue && d.daysRemaining <= 7;
          }).map((a) => schedulingDrilldownRow(a))
          : PMSStorage.getParoleApplications()
            .filter((a) => a.status === 'Pending Board Review')
            .map((a) => PMSUI.appDrilldownRow(a))),
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

  function openAssessmentModal(appId) {
    const app = PMSStorage.getApplicationById(appId);
    if (!app) {
      PMSUI.showError('Application not found.');
      return;
    }
    if (!['Hearing Scheduled', 'Pending Board Review'].includes(app.status)) {
      PMSUI.showError('Board votes can only be recorded after a hearing has been scheduled.');
      return;
    }
    const p = PMSStorage.getPrisonerById(app.prisonerId);
    const mine = PMSStorage.getBoardAssessmentForActor(app, actor);
    const progress = PMSStorage.getBoardAssessmentProgress(app);
    document.getElementById('assess-app-id').value = appId;
    document.getElementById('assess-prisoner-info').innerHTML = p
      ? `<p><strong>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</strong> · ${PMSUI.esc(app.caseNumber || app.id)}</p>
         <p class="meta">${PMSUI.instName(app.institutionId)} · Panel: ${progress.submitted}/${progress.total}</p>`
      : '<p class="empty-state">Prisoner record unavailable.</p>';
    document.getElementById('assess-vote').value = mine?.vote || '';
    document.getElementById('assess-score').value = mine?.score ?? '';
    document.getElementById('assess-feedback').value = mine?.feedback || '';
    const note = document.getElementById('assess-status-note');
    if (mine?.submissionStatus === 'Submitted') {
      note.textContent = `Your vote (${mine.vote}) was submitted on ${PMSUI.fmtDate(mine.submittedAt)}. Update below and save or re-submit.`;
    } else if (mine?.submissionStatus === 'Draft') {
      note.textContent = `Draft saved on ${PMSUI.fmtDate(mine.updatedAt)}. Submit when your decision is final.`;
    } else {
      note.textContent = 'Save your decision at any time, then submit when ready. Other panel members vote independently.';
    }
    document.getElementById('btn-assess-submit').textContent = mine?.submissionStatus === 'Submitted' ? 'Update My Vote' : 'Submit My Vote';
    document.getElementById('assessment-modal').showModal();
  }

  function buildAssessmentPayloadFromModal(submissionStatus) {
    const vote = document.getElementById('assess-vote').value;
    const scoreVal = document.getElementById('assess-score').value;
    const feedback = document.getElementById('assess-feedback').value.trim();
    const payload = { submissionStatus, feedback, recommendation: vote || '' };
    if (vote) payload.vote = vote;
    if (scoreVal !== '' && !Number.isNaN(Number(scoreVal))) payload.score = Number(scoreVal);
    return payload;
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
    if (!progress.complete && isSecretary) {
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
  PMSUI.bindOverviewNotifications('overview-notifications', actor, () => refresh('overview'));

  const scheduleToolbar = document.getElementById('hearings-toolbar');
  if (scheduleToolbar) scheduleToolbar.hidden = !canScheduleHearings;
  const appsToolbar = document.getElementById('applications-toolbar');
  if (appsToolbar) appsToolbar.hidden = !canScheduleHearings;

  document.getElementById('btn-schedule-hearing')?.addEventListener('click', () => {
    const eligible = schedulingQueue();
    if (eligible.length === 1) {
      window.location.href = hearingPortalHref(eligible[0].id);
      return;
    }
    if (eligible.length > 1) {
      PMSUI.switchPanel('applications', panelTitles, refresh, 'applications');
      return;
    }
    window.location.href = 'forms/hearing-portal.html';
  });

  document.getElementById('btn-schedule-from-queue')?.addEventListener('click', () => {
    const eligible = schedulingQueue();
    if (eligible.length === 1) {
      window.location.href = hearingPortalHref(eligible[0].id);
      return;
    }
    window.location.href = 'forms/hearing-portal.html';
  });

  bindOverviewRowNav('overview-hearings');
  bindOverviewRowNav('overview-notifications');

  document.getElementById('decision-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isSecretary) return;
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

  document.getElementById('btn-assess-save')?.addEventListener('click', () => {
    const appId = document.getElementById('assess-app-id').value;
    const vote = document.getElementById('assess-vote').value;
    const feedback = document.getElementById('assess-feedback').value.trim();
    const scoreVal = document.getElementById('assess-score').value;
    if (!vote && !feedback && scoreVal === '') {
      PMSUI.showError('Select a vote or enter comments before saving.');
      return;
    }
    try {
      PMSStorage.saveBoardAssessment(appId, buildAssessmentPayloadFromModal('Draft'), actor);
      document.getElementById('assessment-modal').close();
      refresh('decisions');
      PMSUI.showSuccess('Your decision has been saved.');
    } catch (err) {
      PMSUI.showError(err.message || 'Could not save decision.');
    }
  });

  document.getElementById('assessment-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const appId = document.getElementById('assess-app-id').value;
    const vote = document.getElementById('assess-vote').value;
    const feedback = document.getElementById('assess-feedback').value.trim();
    if (!vote) {
      PMSUI.showError('Please select Approve, Deny, or Defer before submitting.');
      return;
    }
    if (vote === 'Refused' && !feedback) {
      PMSUI.showError('Please provide reasons when denying parole.');
      return;
    }
    try {
      PMSStorage.saveBoardAssessment(appId, buildAssessmentPayloadFromModal('Submitted'), actor);
      document.getElementById('assessment-modal').close();
      refresh('decisions');
      refresh('overview');
      PMSUI.showSuccess('Your vote has been submitted.');
    } catch (err) {
      PMSUI.showError(err.message || 'Could not submit vote.');
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-assess]') && canAssess) openAssessmentModal(e.target.closest('[data-assess]').dataset.assess);
    if (e.target.closest('[data-decide]') && isSecretary) openDecisionModal(e.target.closest('[data-decide]').dataset.decide);
    if (e.target.closest('[data-open-form]')) {
      const btn = e.target.closest('[data-open-form]');
      PMSForms.openForm(parseInt(btn.dataset.openForm, 10), btn.dataset.app);
    }
  });

  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) {
    PMSUI.switchPanel('overview', panelTitles, refresh, 'overview');
  } else {
    const appId = PMSUI.getDeepLinkParam('app');
    const deepPanel = PMSUI.getDeepLinkParam('panel');
    const portalPanels = new Set(['applications', 'hearings']);
    if (appId && canScheduleHearings && (!deepPanel || portalPanels.has(deepPanel))) {
      window.location.href = hearingPortalHref(appId);
    } else if (appId && isSecretary) {
      setTimeout(() => openDecisionModal(appId), 0);
    }
  }
  setupStatCards();
})();
