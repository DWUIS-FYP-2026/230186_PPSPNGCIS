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

  function schedulePortalHref(appId) {
    return `forms/hearing-schedule.html${appId ? `?appId=${encodeURIComponent(appId)}` : ''}`;
  }

  function decisionsPortalHref(appId) {
    return `forms/board-decisions.html${appId ? `?appId=${encodeURIComponent(appId)}` : ''}`;
  }

  function hearingPortalHref(appId) {
    return schedulePortalHref(appId);
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
      ? 'Hearing scheduling and Parole Board duties — use the sidebar sections to switch workflows'
      : (canAssess && !isPanelMember ? `${actor.role} — assessment portal` : 'Parole Board — collective review and decision-making')],
    prisoners: ['Prisoner Records', 'View official case files (read-only)'],
    applications: [isSecretary ? 'Schedule Hearings' : 'Completed Applications', isSecretary
      ? 'Cases awaiting parole hearing date (Form 3 verified)'
      : 'Review applications ready for board consideration'],
    hearings: [canScheduleHearings ? 'Hearing Management' : 'Hearing Schedule', canScheduleHearings ? 'Schedule and review parole hearings' : 'Upcoming and completed parole hearings'],
    decisions: ['Board Vote', PMSBoardVote.getRoleConfig(actor).portalSubtitle],
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
      ['Hearing Scheduled', 'Hearing In Progress', 'Pending Board Review', 'Approved', 'Deferred', 'Refused'].includes(a.status)
    );
  }

  function pendingDecisionApps() {
    const base = PMSStorage.getParoleApplications().filter((a) =>
      ['Hearing Scheduled', 'Hearing In Progress', 'Pending Board Review'].includes(a.status)
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
      if (posEl) posEl.textContent = PMSBoardVote.formatBoardPosition(actor);
      return;
    }
    const boardRoles = ['Doctor', 'CS Commissioner', 'DJAG Secretary'];
    const members = PMSStorage.getUsers().filter((u) => boardRoles.includes(u.role) && u.status === 'Active');
    banner.innerHTML = `
      <strong>Parole Board — DJAG Secretary, PNGCS Commissioner, Psychiatrist:</strong>
      ${members.map((m) => `<span class="officer-chip">${PMSUI.esc(PMSBoardVote.formatBoardPosition(m))} — ${PMSUI.esc(m.firstName)} ${PMSUI.esc(m.lastName)}</span>`).join('')}`;
    const posEl = document.getElementById('board-position');
    if (posEl) posEl.textContent = PMSBoardVote.formatBoardPosition(actor);
  }

  function renderOverview() {
    const pending = pendingDecisionApps();
    const apps = PMSStorage.getParoleApplications();
    const pendingReview = apps.filter((a) => a.status === 'Pending Board Review').length;
    const hearings = PMSStorage.countUpcomingHearings();
    const queue = schedulingQueue();
    const awaiting = canScheduleHearings ? queue.length : pending.length;
    const grantedParole = PMSStorage.countGrantedParole();

    PMSUI.setStat('stat-pending', canScheduleHearings ? queue.filter((a) => {
      const d = PMSStorage.getHearingDeadlineInfo(a);
      return d && !d.overdue && d.daysRemaining <= 7;
    }).length : pendingReview);
    PMSUI.setStat('stat-hearings', hearings);
    PMSUI.setStat('stat-awaiting', awaiting);
    PMSUI.setStat('stat-granted', grantedParole);

    const awaitingLabel = document.querySelector('#stat-awaiting')?.closest('.stat-card')?.querySelector('.stat-label');
    if (awaitingLabel) {
      awaitingLabel.textContent = canScheduleHearings ? 'Awaiting Hearing' : 'Awaiting Decision';
    }
    const pendingLabel = document.querySelector('#stat-pending')?.closest('.stat-card')?.querySelector('.stat-label');
    if (pendingLabel && canScheduleHearings) {
      pendingLabel.textContent = 'Due Within 7 Days';
    }

    const upcoming = PMSStorage.getScheduledHearings().slice(0, 5);
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
      { label: 'Parole Granted (Form 4)', value: grantedParole },
      { label: 'Pending Review', value: pendingReview },
      { label: 'Deferred', value: apps.filter((a) => a.status === 'Deferred').length },
      { label: 'Refused', value: apps.filter((a) => ['Refused', 'Parole Refused'].includes(a.status)).length },
    ], 'var(--color-navy)');
    const grantedOverview = document.getElementById('overview-granted-count');
    if (grantedOverview) {
      grantedOverview.innerHTML = grantedParole
        ? `<div class="overview-row overview-row--clickable" data-goto-panel="history" data-goto-nav="history" role="button" tabindex="0">
            <div class="overview-row__main"><strong>${PMSUI.formatStat(grantedParole)}</strong><span class="meta">parole granted (Form 4 issued) · view archive</span></div>
          </div>`
        : '<p class="empty-state">No parole granted records yet.</p>';
    }

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
        : (['Hearing Scheduled', 'Hearing In Progress', 'Pending Board Review'].includes(a.status)
          ? ` <button type="button" class="btn-icon" data-decide="${a.id}">Review Case</button>`
          : '');
      const profileLink = p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">Case File</a>` : '';
      return `<tr><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : '—'}</td><td>${PMSUI.instName(a.institutionId)}</td><td>${Math.floor(months / 12)}y ${months % 12}m</td><td>${preParoleReady ? 'Available' : '—'}</td><td>${summary.completed}/5</td><td>${profileLink}${formBtn}${PMSUI.renderApplicationActionButtons(a, actor)}</td></tr>`;
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
        ? `<a href="${decisionsPortalHref(h.applicationId)}" class="btn-icon">${PMSUI.esc(h.applicationId)}</a>`
        : (h.applicationId ? PMSUI.esc(h.applicationId) : '—');
      const deadlineNote = deadline?.overdue ? ' · OVERDUE' : '';
      return `<tr data-hearing-id="${PMSUI.esc(h.id)}" class="${rowClass}"><td>${PMSUI.fmtDate(h.scheduledDate)} ${h.scheduledTime || ''}${deadlineNote}</td><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : PMSUI.prisonerName(h.prisonerId)}</td><td>${appLink}</td><td>${PMSUI.esc(h.location)}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(h.status)}">${PMSUI.esc(h.status)}</span></td><td><a href="${p ? PMSRBAC.prisonerProfileUrl(p.id) : '#'}" class="btn-icon">Case File</a>${app && ['Hearing Scheduled', 'Hearing In Progress', 'Pending Board Review'].includes(app.status) && isSecretary ? ` <a href="${decisionsPortalHref(app.id)}" class="btn-icon">Board Decision</a>` : ''}${app && canScheduleHearings ? ` <a href="${schedulePortalHref(app.id)}" class="btn-icon">Edit Schedule</a>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-state">No hearings.</td></tr>';
    if (highlightId) PMSUI.highlightDeepLinkRow(`[data-hearing-id="${CSS.escape(highlightId)}"]`);
  }

  function renderNotifications() {
    PMSUI.renderNotificationPanel('notification-list', actor);
  }

  function renderDecisions() {
    if (canAssess && PMSBoardVote.isAssessor(actor)) {
      document.getElementById('decisions-list').innerHTML = `
        <p class="toolbar-note">Open the Board Vote portal to verify Form 2 claims, record observations, and submit your vote for each case on the docket.</p>
        ${PMSBoardVote.renderDecisionsList(
          actor,
          PMSStorage.getParoleApplications(),
          { hrefFn: decisionsPortalHref, primaryLabel: 'Open Board Vote' },
        )}`;
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
        <a href="${decisionsPortalHref(a.id)}" class="btn-primary btn-sm">Board Vote Portal</a></div>`;
    }).join('') || '<p class="empty-state">No applications awaiting decision.</p>';
  }

  function renderHistory() {
    const archiveRows = PMSStorage.getParoleGrantedArchive();
    document.getElementById('granted-archive-tbody').innerHTML = archiveRows.length
      ? archiveRows.map((row) => `<tr>
          <td><strong>${PMSUI.esc(row.prisonerName || '—')}</strong><span class="meta">${PMSUI.esc(row.prisonerNumber || '')}</span></td>
          <td>${PMSUI.esc(row.caseNumber || row.applicationId)}</td>
          <td>${PMSUI.esc(row.paroleOrderNo || '—')}</td>
          <td>${PMSUI.esc(row.issuedBy || '—')}</td>
          <td>${PMSUI.fmtDate(row.grantedAt)}</td>
          <td>${PMSUI.fmtDate(row.archivedAt)}</td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="empty-state">No parole granted records archived yet. Cases appear here when Form 4 is issued.</td></tr>';

    document.getElementById('history-tbody').innerHTML = PMSStorage.getAllParoleApplications({ includeArchived: true })
      .filter((a) => a.boardDecision)
      .map((a) => {
        const p = PMSStorage.getPrisonerById(a.prisonerId);
        const dec = a.boardDecision;
        const decider = PMSStorage.getUserById(dec.decidedBy);
        const deciderLabel = decider ? PMSBoardVote.formatBoardPosition({ ...decider, boardPosition: dec.boardPosition || decider.boardPosition }) : '';
        return `<tr><td>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : '—'}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${PMSUI.esc(dec.conditions || '—')}</td><td>${decider ? `${PMSUI.esc(decider.firstName)} (${PMSUI.esc(deciderLabel)})` : '—'}</td><td>${PMSUI.fmtDate(dec.decidedAt)}</td></tr>`;
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
        getRows: () => PMSStorage.getScheduledHearings()
          .map((h) => {
            const p = PMSStorage.getPrisonerById(h.prisonerId);
            if (!p) return '';
            return `<tr><td>${PMSUI.fmtDate(h.scheduledDate)}</td><td>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</td><td>${PMSUI.instName(p.institutionId)}</td><td>${PMSUI.esc(h.location || '—')}</td><td><a href="${decisionsPortalHref(h.applicationId || '')}" class="btn-icon">Open</a></td></tr>`;
          }).filter(Boolean),
      },
      {
        statId: 'stat-granted',
        title: 'Parole Granted (Form 4)',
        columns: ['Case', 'Name', 'Institution', 'Granted', ''],
        getRows: () => PMSStorage.getGrantedParoleCases().map((a) => {
          const p = PMSStorage.getPrisonerById(a.prisonerId);
          const form4 = a.formData?.form4 || {};
          return `<tr>
            <td>${PMSUI.esc(a.caseNumber || a.id)}</td>
            <td>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : '—'}</td>
            <td>${PMSUI.instName(a.institutionId)}</td>
            <td>${PMSUI.fmtDate(form4.issuedAt)}</td>
            <td>${form4.issued ? `<a href="forms/form4.html?appId=${encodeURIComponent(a.id)}" class="btn-icon">Form 4</a>` : ''}</td>
          </tr>`;
        }),
      },
    ]);
  }

  function openDecisionModal(appId) {
    const app = PMSStorage.getApplicationById(appId);
    if (!app) {
      PMSUI.showError('Application not found.');
      return;
    }
    if (!['Hearing Scheduled', 'Hearing In Progress', 'Pending Board Review'].includes(app.status)) {
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
    const form2Files = PMSStorage.getForm2AttachmentFiles(app);
    document.getElementById('dec-docs').innerHTML = [
      ...PMSStorage.PAROLE_FORMS.map((f) => {
        const done = PMSStorage.getFormCompletionSummary(app).checks[`form${f.number}`];
        return `<li>${PMSUI.esc(f.name)}: ${done ? 'Complete' : 'Incomplete'}</li>`;
      }),
      ...(form2Files.length
        ? [`<li class="dec-docs__heading"><strong>Form 2 supporting documents</strong></li>`, ...form2Files.map((f) => PMSUI.renderForm2AttachmentRow(f, appId))]
        : []),
    ].join('');
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
    roleLabel: PMSBoardVote.formatBoardPosition(actor),
    activePanel: 'overview',
    onNavigate: (panel, meta) => PMSUI.switchPanel(panel, panelTitles, refresh, meta?.navId),
  });
  PMSUI.setPanelNavigator((panel, navId) => PMSUI.switchPanel(panel, panelTitles, refresh, navId));
  PMSUI.initShell(actor, PMSBoardVote.formatBoardPosition(actor));
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
      window.location.href = schedulePortalHref(eligible[0].id);
      return;
    }
    if (eligible.length > 1) {
      PMSUI.switchPanel('applications', panelTitles, refresh, 'applications');
      return;
    }
    window.location.href = schedulePortalHref();
  });

  document.getElementById('btn-schedule-from-queue')?.addEventListener('click', () => {
    const eligible = schedulingQueue();
    if (eligible.length === 1) {
      window.location.href = schedulePortalHref(eligible[0].id);
      return;
    }
    window.location.href = schedulePortalHref();
  });

  bindOverviewRowNav('overview-hearings');
  bindOverviewRowNav('overview-granted-count');
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

  document.addEventListener('click', (e) => {
    const f2Btn = e.target.closest('[data-f2-download]');
    if (f2Btn) {
      try {
        PMSStorage.downloadForm2Attachment(f2Btn.dataset.f2App, f2Btn.dataset.f2Download);
      } catch (err) {
        PMSUI.showError(err.message || 'Could not download file.');
      }
      return;
    }
    const assessBtn = e.target.closest('[data-assess]');
    if (assessBtn && canAssess) {
      window.location.href = decisionsPortalHref(assessBtn.dataset.assess);
      return;
    }
    if (e.target.closest('[data-decide]') && isSecretary) openDecisionModal(e.target.closest('[data-decide]').dataset.decide);
    if (e.target.closest('[data-open-form]')) {
      const btn = e.target.closest('[data-open-form]');
      PMSForms.openForm(parseInt(btn.dataset.openForm, 10), btn.dataset.app);
    }
  });

  PMSUI.bindApplicationActionHandlers(() => refresh('applications'));

  PMSUI.bindLiveDataRefresh(() => {
    const active = document.querySelector('.sidebar-nav .nav-item.active')?.dataset.panel || 'overview';
    refresh(active);
  });
  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) {
    PMSUI.switchPanel('overview', panelTitles, refresh, 'overview');
  } else {
    const appId = PMSUI.getDeepLinkParam('app');
    const deepPanel = PMSUI.getDeepLinkParam('panel');
    const portalPanels = new Set(['applications', 'hearings']);
    if (appId && canScheduleHearings && (!deepPanel || portalPanels.has(deepPanel))) {
      window.location.href = schedulePortalHref(appId);
    } else if (appId && canAssess && PMSBoardVote.isAssessor(actor)) {
      window.location.href = decisionsPortalHref(appId);
    }
  }
  setupStatCards();
})();
