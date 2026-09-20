(async () => {
  await PMSStorage.ensureLoaded();
  const actor = PMSAuth.requireDashboardRole('dashboard-doctor.html');
  if (!actor) return;

  const panelTitles = {
    overview: ['Overview', 'Psychiatrist — parole board case review and voting'],
    prisoners: ['Prisoner Records', 'Read-only records for medical review'],
    applications: ['Parole Cases', 'Cases in hearing or board review'],
    hearings: ['Hearing Calendar', 'Scheduled parole board hearings'],
    decisions: ['Board Vote', PMSBoardVote.getRoleConfig(actor).portalSubtitle],
    notifications: ['Notifications', 'Hearing and board workflow alerts'],
    profile: ['Profile', 'Your account information'],
  };

  function boardCases() {
    return PMSStorage.getParoleApplications().filter((a) =>
      ['Hearing Scheduled', 'Hearing In Progress', 'Pending Board Review', 'Pre-Parole Report Prepared', 'Deferred'].includes(a.status)
    );
  }

  function boardVoteHref(appId) {
    return `forms/board-decisions.html${appId ? `?appId=${encodeURIComponent(appId)}` : ''}`;
  }

  function pendingVoteCases() {
    return boardCases().filter((a) => !PMSStorage.hasSubmittedBoardAssessment(a, actor));
  }

  async function refresh(panel) {
    await PMSStorage.ensureLoaded();
    PMSUI.updateNotifBadge(actor);
    ({
      overview: renderOverview,
      prisoners: renderPrisoners,
      applications: renderApplications,
      hearings: renderHearings,
      decisions: renderDecisions,
      notifications: renderNotifications,
    })[panel]?.();
  }

  function renderOverview() {
    const cases = boardCases();
    const unread = PMSStorage.getUnreadCountForUser(actor);
    PMSUI.setStat('stat-votes', pendingVoteCases().length);
    PMSUI.setStat('stat-cases', cases.length);
    PMSUI.setStat('stat-hearings', PMSStorage.countUpcomingHearings());
    PMSUI.setStat('stat-notifications', unread);
    PMSUI.syncOverviewNotifHeader(unread);
    const notifs = PMSUI.recentNotifications(actor, 5);
    document.getElementById('overview-notifications').innerHTML = `
      <div class="overview-row" data-goto-panel="decisions" data-goto-nav="decisions" role="button" tabindex="0"><strong>Cases awaiting my vote</strong><span class="meta">${PMSUI.formatStat(pendingVoteCases().length)}</span></div>
      ${notifs.length ? notifs.map((n) => PMSUI.renderOverviewNotificationRow(n, actor)).join('') : ''}`;
    if (typeof PMSCalendar !== 'undefined') PMSCalendar.mount('dashboard-calendar', actor);
  }

  function setupStatCards() {
    const cols = ['ID', 'Name', 'Institution', 'Status', ''];
    PMSUI.bindStatCards([
      {
        statId: 'stat-votes',
        title: 'Awaiting My Vote',
        columns: cols,
        getRows: () => pendingVoteCases().map((a) => PMSUI.appDrilldownRow(a)),
      },
      {
        statId: 'stat-cases',
        title: 'Active Cases',
        columns: cols,
        getRows: () => boardCases().map((a) => PMSUI.appDrilldownRow(a)),
      },
      {
        statId: 'stat-hearings',
        title: 'Scheduled Hearings',
        columns: ['Date', 'Name', 'Institution', 'Location', ''],
        getRows: () => PMSStorage.getHearings()
          .filter((h) => !['Cancelled'].includes(h.status))
          .map((h) => {
            const p = PMSStorage.getPrisonerById(h.prisonerId);
            if (!p) return '';
            return `<tr><td>${PMSUI.fmtDate(h.scheduledDate)}</td><td>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</td><td>${PMSUI.instName(p.institutionId)}</td><td>${PMSUI.esc(h.location || '—')}</td><td><a href="${boardVoteHref(h.applicationId || '')}" class="btn-primary btn-sm">Board Vote</a></td></tr>`;
          }).filter(Boolean),
      },
    ], {
      notificationsStatId: 'stat-notifications',
      onNotificationsClick: () => PMSUI.switchPanel('notifications', panelTitles, refresh, 'notifications'),
    });
  }

  function renderPrisoners() {
    const q = document.getElementById('prisoner-search').value.trim().toLowerCase();
    const list = PMSRBAC.filterPrisonersForUser(actor, PMSStorage.getPrisoners())
      .filter((p) => !q || `${p.firstName} ${p.lastName} ${p.prisonerNumber}`.toLowerCase().includes(q));
    document.getElementById('prisoners-tbody').innerHTML = list.map((p) =>
      `<tr><td>${PMSUI.esc(p.prisonerNumber)}</td><td>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</td><td>${PMSUI.instName(p.institutionId)}</td><td>${PMSUI.fmtDate(p.sentenceStartDate)}</td><td>${PMSUI.fmtDate(p.sentenceEndDate)}</td><td>${PMSUI.esc(p.status)}</td><td><a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">View</a></td></tr>`
    ).join('') || '<tr><td colspan="7" class="empty-state">No records.</td></tr>';
  }

  function renderApplications() {
    document.getElementById('applications-tbody').innerHTML = boardCases().map((a) => {
      const p = PMSStorage.getPrisonerById(a.prisonerId);
      const progress = PMSStorage.getBoardAssessmentProgress(a);
      const mine = PMSStorage.getBoardAssessmentForActor(a, actor);
      const voteLabel = mine?.submissionStatus === 'Submitted'
        ? PMSBoardVote.formatVoteLabel(mine.vote)
        : (mine?.vote ? `${PMSBoardVote.formatVoteLabel(mine.vote)} (draft)` : 'Not submitted');
      return `<tr ${PMSUI.applicationRowAttributes(a, actor)}><td>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : '—'}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${progress.submitted}/${progress.total}</td><td>${PMSUI.esc(voteLabel)}</td><td><a href="${boardVoteHref(a.id)}" class="btn-primary btn-sm">Board Vote</a> ${PMSUI.renderApplicationActionButtons(a, actor)}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="empty-state">No active board cases.</td></tr>';
  }

  function renderHearings() {
    document.getElementById('hearings-tbody').innerHTML = PMSStorage.getHearings()
      .filter((h) => !['Cancelled'].includes(h.status))
      .map((h) => {
        const p = PMSStorage.getPrisonerById(h.prisonerId);
        return `<tr><td>${PMSUI.fmtDate(h.scheduledDate)} ${PMSUI.esc(h.scheduledTime || '')}</td><td>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : '—'}</td><td>${PMSUI.esc(h.applicationId || '—')}</td><td>${PMSUI.esc(h.location || '—')}</td><td>${PMSUI.esc(h.status)}</td><td>${h.applicationId ? `<a href="${boardVoteHref(h.applicationId)}" class="btn-icon">Board Vote</a>` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="6" class="empty-state">No hearings scheduled.</td></tr>';
  }

  function renderDecisions() {
    document.getElementById('decisions-list').innerHTML = `
      <p class="toolbar-note">Open the Board Vote portal to review Chairman and Commissioner Form 2 assessments (read-only), complete the interview evaluation (1–5), sign with your PIN, and submit your vote.</p>
      ${PMSBoardVote.renderDecisionsList(
        actor,
        boardCases(),
        { hrefFn: boardVoteHref, primaryLabel: 'Open Board Vote' },
      )}`;
  }

  function renderNotifications() {
    PMSUI.renderNotificationPanel('notification-list', actor);
  }

  PMSSidebar.init({
    user: actor,
    roleLabel: PMSBoardVote.formatBoardPosition(actor),
    activePanel: 'overview',
    onNavigate: (panel, meta) => PMSUI.switchPanel(panel, panelTitles, refresh, meta?.navId),
  });
  PMSUI.setPanelNavigator((panel, navId) => PMSUI.switchPanel(panel, panelTitles, refresh, navId));
  PMSUI.initShell(actor, PMSBoardVote.formatBoardPosition(actor));
  PMSUI.bindNotificationPanel('notification-list', actor, () => refresh('notifications'));

  document.getElementById('prisoner-search')?.addEventListener('input', () => renderPrisoners());

  document.getElementById('overview-notifications')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-goto-panel]');
    if (!row || e.target.closest('a')) return;
    PMSUI.switchPanel(row.dataset.gotoPanel, panelTitles, refresh, row.dataset.gotoNav || row.dataset.gotoPanel);
  });
  document.getElementById('overview-notifications')?.addEventListener('keydown', (e) => {
    const row = e.target.closest('[data-goto-panel]');
    if (!row || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    PMSUI.switchPanel(row.dataset.gotoPanel, panelTitles, refresh, row.dataset.gotoNav || row.dataset.gotoPanel);
  });

  PMSUI.bindOverviewNotifications('overview-notifications', actor, () => refresh('overview'));
  PMSUI.bindApplicationActionHandlers(() => refresh('applications'));

  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) {
    refresh('overview');
  } else {
    const appId = PMSUI.getDeepLinkParam('app');
    if (appId) window.location.href = boardVoteHref(appId);
  }
  PMSUI.bindLiveDataRefresh(() => {
    const active = document.querySelector('.sidebar-nav .nav-item.active')?.dataset.panel || 'overview';
    refresh(active);
  });
  setupStatCards();
})();
