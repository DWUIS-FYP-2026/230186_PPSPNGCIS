(async () => {
  await PMSStorage.ensureLoaded();
  const actor = PMSAuth.requireDashboardRole('dashboard-commander.html');
  if (!actor) return;

  const inst = actor.institutionId ? PMSStorage.getInstitutionById(actor.institutionId) : null;

  const panelTitles = {
    overview: ['Overview', `Jail Commander — ${inst?.name || 'Institution'}`],
    verification: ['Case Verification', 'Prisoners awaiting your institutional verification'],
    release: ['Authorize Release', 'Release prisoners after board interviews and parole approval'],
    applications: ['Parole Applications', 'Institution parole cases (read-only overview)'],
    prisoners: ['Prisoner Records', 'Prisoners at your institution'],
    notifications: ['Notifications', 'Verification and workflow alerts'],
    profile: ['Profile', 'Your account information'],
  };

  function scopeApps(includeArchived = false) {
    let list = includeArchived
      ? PMSStorage.getAllParoleApplications({ includeArchived: true })
      : PMSStorage.getParoleApplications();
    if (actor.institutionId) list = list.filter((a) => a.institutionId === actor.institutionId);
    return list;
  }

  function scopePrisoners() {
    return PMSRBAC.filterPrisonersForUser(actor, PMSStorage.getPrisoners());
  }

  function needsVerification(app) {
    return PMSStorage.needsCommanderVerification(app);
  }

  function verificationReadiness(app) {
    const summary = PMSStorage.getFormCompletionSummary(app);
    const blockers = [];
    if (!summary.checks.form1) blockers.push('Form 1 incomplete');
    if (!summary.checks.form2) blockers.push('Form 2 incomplete');
    if (!summary.checks.form3) blockers.push('Form 3 incomplete');
    return { ready: blockers.length === 0, blockers };
  }

  function pendingVerificationApps() {
    return scopeApps()
      .filter(needsVerification)
      .sort((a, b) => {
        const aReady = verificationReadiness(a).ready ? 1 : 0;
        const bReady = verificationReadiness(b).ready ? 1 : 0;
        if (aReady !== bReady) return bReady - aReady;
        return new Date(b.submittedAt || b.createdAt || 0) - new Date(a.submittedAt || a.createdAt || 0);
      });
  }

  function verificationQueue() {
    return pendingVerificationApps();
  }

  function verificationSearchTerm() {
    return document.getElementById('verification-search')?.value.trim().toLowerCase() || '';
  }

  function verifiedSearchTerm() {
    return document.getElementById('verified-search')?.value.trim().toLowerCase() || '';
  }

  function verifiedApplicationsForActor() {
    return PMSStorage.getCommanderVerifiedApplications({
      institutionId: actor.institutionId || undefined,
    });
  }

  function filterVerificationRows(rows) {
    const q = verificationSearchTerm();
    if (!q) return rows;
    return rows.filter((a) => {
      const p = PMSStorage.getPrisonerById(a.prisonerId);
      const haystack = [
        p?.firstName, p?.lastName, p?.prisonerNumber, p?.id,
        a.caseNumber, a.id, a.status,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  function filterVerifiedRows(rows) {
    const q = verifiedSearchTerm();
    if (!q) return rows;
    return rows.filter((a) => {
      const p = PMSStorage.getPrisonerById(a.prisonerId);
      const record = PMSStorage.getCommanderVerificationRecord(a);
      const haystack = [
        p?.firstName, p?.lastName, p?.prisonerNumber, p?.id,
        a.caseNumber, a.id, record?.commanderName, record?.decision,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  function verifiedRowHtml(a) {
    const p = PMSStorage.getPrisonerById(a.prisonerId);
    const record = PMSStorage.getCommanderVerificationRecord(a);
    const prisonerCell = p
      ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="verification-prisoner-link"><strong>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</strong><span class="meta">${PMSUI.esc(p.offense || '—')}</span></a>`
      : PMSUI.esc(record?.prisonerName || '—');
    return `<tr class="verify-row--done">
      <td>${prisonerCell}</td>
      <td>${PMSUI.esc(p?.prisonerNumber || p?.id || record?.prisonerNumber || '—')}</td>
      <td>${PMSUI.esc(a.caseNumber || a.id)}</td>
      <td><span class="status-pill status-pill--success">${PMSUI.esc(record?.decision || 'Verified')}</span></td>
      <td>${PMSUI.fmtDate(record?.reviewedAt)}</td>
      <td>${PMSUI.esc(record?.commanderName || '—')}</td>
      <td>
        <button type="button" class="btn-icon" data-view-verify="${PMSUI.esc(a.id)}">View Record</button>
        ${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">Case File</a>` : ''}
      </td>
    </tr>`;
  }

  function renderVerifiedSummary(rows) {
    const host = document.getElementById('verified-summary');
    if (!host) return;
    if (!rows.length) {
      host.textContent = 'No verified prisoners recorded yet.';
      return;
    }
    host.innerHTML = `<strong>${rows.length}</strong> prisoner${rows.length === 1 ? '' : 's'} verified at this institution`;
  }

  function renderVerifiedRecord() {
    const rows = verifiedApplicationsForActor();
    renderVerifiedSummary(rows);
    const filtered = filterVerifiedRows(rows);
    const tbody = document.getElementById('verified-tbody');
    if (!tbody) return;
    tbody.innerHTML = filtered.length
      ? filtered.map((a) => verifiedRowHtml(a)).join('')
      : `<tr><td colspan="7" class="empty-state">${rows.length ? 'No verified prisoners match your search.' : 'Verified prisoners will appear here after you record institutional verification.'}</td></tr>`;
  }

  function formsReadinessLabel(app) {
    const readiness = verificationReadiness(app);
    if (readiness.ready) {
      return '<span class="verify-forms-pill verify-forms-pill--ready"><i class="fi fi-rr-check-circle" aria-hidden="true"></i> Ready</span>';
    }
    return `<span class="verify-forms-pill verify-forms-pill--pending" title="${PMSUI.esc(readiness.blockers.join('; '))}"><i class="fi fi-rr-hourglass-end" aria-hidden="true"></i> ${PMSUI.esc(readiness.blockers.join(' · '))}</span>`;
  }

  function verificationRowHtml(a, focusId) {
    const p = PMSStorage.getPrisonerById(a.prisonerId);
    const readiness = verificationReadiness(a);
    const verifyBtn = readiness.ready
      ? `<button type="button" class="btn-primary btn-sm" data-verify="${PMSUI.esc(a.id)}">Verify</button>`
      : `<button type="button" class="btn-secondary btn-sm" disabled title="${PMSUI.esc(readiness.blockers.join('; '))}">Awaiting Forms</button>`;
    const rowClass = [
      readiness.ready ? 'verify-row--ready' : 'verify-row--awaiting',
      a.id === focusId ? 'verify-row--focus row-highlight' : '',
    ].filter(Boolean).join(' ');
    const prisonerCell = p
      ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="verification-prisoner-link"><strong>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</strong><span class="meta">${PMSUI.esc(p.offense || '—')}</span></a>`
      : '—';
    return `<tr class="${rowClass}" data-verify-app-row="${PMSUI.esc(a.id)}"${readiness.ready ? ` data-verify-row="${PMSUI.esc(a.id)}" tabindex="0" role="button"` : ''}>
      <td>${prisonerCell}</td>
      <td>${p ? PMSUI.esc(p.prisonerNumber || p.id) : '—'}</td>
      <td>${PMSUI.esc(a.caseNumber || a.id)}</td>
      <td>${formsReadinessLabel(a)}</td>
      <td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td>
      <td>${PMSUI.fmtDate(a.submittedAt)}</td>
      <td>${verifyBtn} ${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">Case File</a>` : ''}</td>
    </tr>`;
  }

  function renderVerificationSummary(rows) {
    const host = document.getElementById('verification-summary');
    if (!host) return;
    const ready = rows.filter((a) => verificationReadiness(a).ready);
    const awaitingForms = rows.length - ready.length;
    if (!rows.length) {
      host.textContent = 'No prisoners awaiting verification.';
      return;
    }
    host.innerHTML = `<strong>${ready.length}</strong> ready to verify${awaitingForms ? ` · ${awaitingForms} awaiting forms` : ''} · ${rows.length} total`;
  }

  function formsSummary(app) {
    const s = PMSStorage.getFormCompletionSummary(app);
    return `${s.completed}/5 forms complete`;
  }

  function verificationBadge(app) {
    if (PMSStorage.isCommanderVerified(app)) {
      const record = PMSStorage.getCommanderVerificationRecord(app);
      return `<span class="status-pill status-pill--success" title="Verified ${PMSUI.fmtDate(record?.reviewedAt)}">Verified</span>`;
    }
    if (needsVerification(app)) {
      return '<span class="status-pill status-pill--warn">Pending</span>';
    }
    return '<span class="meta">Not ready</span>';
  }

  function releaseCandidates() {
    return scopeApps(true).filter((a) => a.status !== 'Released' && !['Refused', 'Parole Refused'].includes(a.status));
  }

  function releaseReadyQueue() {
    return releaseCandidates().filter((a) => PMSStorage.canAuthorizeRelease(a, actor));
  }

  function boardInterviewLabel(app) {
    const assessments = PMSStorage.getBoardAssessments(app.id);
    const complete = PMSStorage.requiredBoardAssessmentsComplete(app);
    if (complete) return '<span class="status-pill status-pill--success">Complete</span>';
    const done = assessments.length;
    return `<span class="status-pill status-pill--warn">${done}/${PMSStorage.BOARD_VOTING_ROLES.length} votes</span>`;
  }

  function releaseReadinessLabel(app) {
    if (PMSStorage.canAuthorizeRelease(app, actor)) {
      return '<span class="status-pill status-pill--success">Ready</span>';
    }
    const blockers = PMSStorage.getReleaseBlockers(app, actor);
    return `<span class="meta" title="${PMSUI.esc(blockers[0] || 'Not ready')}">${PMSUI.esc(blockers[0] || 'Not ready')}</span>`;
  }

  async function refresh(panel) {
    await PMSStorage.ensureLoaded();
    PMSUI.updateNotifBadge(actor);
    ({
      overview: renderOverview,
      verification: renderVerification,
      release: renderRelease,
      applications: renderApplications,
      prisoners: renderPrisoners,
      notifications: renderNotifications,
      profile: renderProfile,
    })[panel]?.();
  }

  function renderOverview() {
    const queue = verificationQueue();
    const apps = scopeApps();
    const verified = verifiedApplicationsForActor().length;
    const unread = PMSStorage.getUnreadCountForUser(actor);

    PMSUI.setStat('stat-pending', queue.length);
    PMSUI.setStat('stat-release-ready', releaseReadyQueue().length);
    PMSUI.setStat('stat-verified', verified);
    PMSUI.setStat('stat-prisoners', scopePrisoners().length);
    PMSUI.setStat('stat-notifications', unread);

    const note = document.getElementById('institution-note');
    if (note && inst) note.textContent = `Institutional verification for ${inst.name} (${inst.province}). The Jail Commander verifies Forms 1–3 before cases proceed to DJAG.`;

    const queueHost = document.getElementById('overview-verification-queue');
    if (queueHost) {
      queueHost.innerHTML = queue.length
        ? queue.slice(0, 5).map((a) => {
          const p = PMSStorage.getPrisonerById(a.prisonerId);
          return `<div class="overview-row overview-row--clickable" data-goto-panel="verification" data-goto-nav="verification" role="button" tabindex="0">
            <div class="overview-row__main"><strong>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : PMSUI.esc(a.caseNumber || a.id)}</strong><span class="meta">${formsSummary(a)} · awaiting your verification</span></div>
            <button type="button" class="btn-primary btn-sm" data-verify="${PMSUI.esc(a.id)}" onclick="event.stopPropagation()">Verify</button>
          </div>`;
        }).join('')
        : '<p class="empty-state">No cases awaiting institutional verification.</p>';
    }

    const verifiedHost = document.getElementById('overview-verified-record');
    if (verifiedHost) {
      const verifiedRows = verifiedApplicationsForActor();
      verifiedHost.innerHTML = verifiedRows.length
        ? verifiedRows.slice(0, 5).map((a) => {
          const p = PMSStorage.getPrisonerById(a.prisonerId);
          const record = PMSStorage.getCommanderVerificationRecord(a);
          return `<div class="overview-row overview-row--clickable" data-goto-panel="verification" data-goto-nav="verification" role="button" tabindex="0">
            <div class="overview-row__main"><strong>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : PMSUI.esc(record?.prisonerName || a.caseNumber || a.id)}</strong><span class="meta">Verified ${PMSUI.fmtDate(record?.reviewedAt)} · ${PMSUI.esc(a.caseNumber || a.id)}</span></div>
            <button type="button" class="btn-icon" data-view-verify="${PMSUI.esc(a.id)}" onclick="event.stopPropagation()">View</button>
          </div>`;
        }).join('')
        : '<p class="empty-state">No verified prisoners on record yet.</p>';
    }

    PMSUI.syncOverviewNotifHeader(unread);
    const notifs = PMSUI.recentNotifications(actor, 5);
    document.getElementById('overview-notifications').innerHTML = notifs.length
      ? notifs.map((n) => PMSUI.renderOverviewNotificationRow(n, actor)).join('')
      : '<p class="empty-state">No notifications.</p>';
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
      if (!row || e.target.closest('button,a')) return;
      go(row);
    });
    host.addEventListener('keydown', (e) => {
      const row = e.target.closest('[data-goto-panel]');
      if (!row || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      go(row);
    });
  }

  function setupStatCards() {
    const cols = ['ID', 'Name', 'Institution', 'Status', ''];
    PMSUI.bindStatCards([
      {
        statId: 'stat-pending',
        title: 'Awaiting Verification',
        columns: cols,
        getRows: () => verificationQueue().map((a) => PMSUI.appDrilldownRow(a)),
        onClick: () => PMSUI.switchPanel('verification', panelTitles, refresh, 'verification'),
      },
      {
        statId: 'stat-release-ready',
        title: 'Ready for Release',
        columns: cols,
        getRows: () => releaseReadyQueue().map((a) => PMSUI.appDrilldownRow(a)),
      },
      {
        statId: 'stat-verified',
        title: 'Verified Cases',
        columns: cols,
        getRows: () => verifiedApplicationsForActor().map((a) => PMSUI.appDrilldownRow(a)),
      },
      {
        statId: 'stat-prisoners',
        title: 'Prisoners',
        columns: ['ID', 'Name', 'Institution', 'Status', ''],
        getRows: () => scopePrisoners().map((p) => PMSUI.prisonerDrilldownRow(p, `<td><span class="status-pill status-pill--${PMSUI.statusClass(p.status)}">${PMSUI.esc(p.status)}</span></td>`)),
      },
    ], {
      notificationsStatId: 'stat-notifications',
      onNotificationsClick: () => PMSUI.switchPanel('notifications', panelTitles, refresh, 'notifications'),
    });
  }

  function renderVerificationFocus(appId) {
    const host = document.getElementById('verification-focus');
    if (!host) return;
    const app = appId ? PMSStorage.getApplicationById(appId) : null;
    if (!app || PMSStorage.isCommanderVerified(app) || !scopeApps().some((a) => a.id === app.id)) {
      host.classList.add('hidden');
      host.innerHTML = '';
      return;
    }
    const p = PMSStorage.getPrisonerById(app.prisonerId);
    const readiness = verificationReadiness(app);
    host.classList.remove('hidden');
    host.innerHTML = `
      <div class="verification-focus__header">
        <div>
          <h2>Verify case ${PMSUI.esc(app.caseNumber || app.id)}</h2>
          <p class="meta">${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : 'Prisoner'} · ${formsSummary(app)}${readiness.ready ? '' : ` · ${PMSUI.esc(readiness.blockers.join(' · '))}`}</p>
        </div>
        <div class="verification-focus__actions">
          ${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-secondary btn-sm">Case File</a>` : ''}
          <button type="button" class="btn-primary btn-sm" data-verify="${PMSUI.esc(app.id)}"${readiness.ready ? '' : ` disabled title="${PMSUI.esc(readiness.blockers.join('; '))}"`}>Open Verification</button>
        </div>
      </div>
      <p class="field-hint" style="margin:0">Review Forms 1–3, choose Verified / Return / Reject, then record your decision.</p>`;
  }

  function renderVerification() {
    const focusId = PMSUI.getDeepLinkParam('app');
    let rows = pendingVerificationApps();
    if (focusId && !rows.some((a) => a.id === focusId)) {
      const focusApp = PMSStorage.getApplicationById(focusId);
      if (focusApp && scopeApps().some((a) => a.id === focusId) && !PMSStorage.isCommanderVerified(focusApp)) {
        rows = [focusApp, ...rows];
      }
    }
    renderVerificationFocus(focusId);
    renderVerificationSummary(rows);
    const filtered = filterVerificationRows(rows);
    document.getElementById('verification-tbody').innerHTML = filtered.length
      ? filtered.map((a) => verificationRowHtml(a, focusId)).join('')
      : `<tr><td colspan="7" class="empty-state">${rows.length ? 'No prisoners match your search.' : 'No prisoners awaiting verification at your institution.'}</td></tr>`;
    renderVerifiedRecord();
  }

  function renderRelease() {
    const rows = releaseCandidates();
    document.getElementById('release-tbody').innerHTML = rows.length
      ? rows.map((a) => {
        const p = PMSStorage.getPrisonerById(a.prisonerId);
        const canRelease = PMSStorage.canAuthorizeRelease(a, actor);
        return `<tr><td>${PMSUI.esc(a.caseNumber || a.id)}</td><td>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : '—'}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${boardInterviewLabel(a)}</td><td>${releaseReadinessLabel(a)}</td><td>${canRelease ? `<button type="button" class="btn-primary btn-sm" data-release="${PMSUI.esc(a.id)}">Authorize Release</button>` : ''} ${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">Case File</a>` : ''}</td></tr>`;
      }).join('')
      : '<tr><td colspan="6" class="empty-state">No cases in release workflow.</td></tr>';
  }

  function renderApplications() {
    document.getElementById('applications-tbody').innerHTML = scopeApps().map((a) => {
      const p = PMSStorage.getPrisonerById(a.prisonerId);
      const verifyBtn = needsVerification(a)
        ? `<button type="button" class="btn-icon" data-verify="${PMSUI.esc(a.id)}">Verify</button>`
        : (PMSStorage.isCommanderVerified(a)
          ? `<button type="button" class="btn-icon" data-view-verify="${PMSUI.esc(a.id)}">View Record</button>`
          : '');
      return `<tr ${PMSUI.applicationRowAttributes(a, actor)}><td>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : '—'}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${verificationBadge(a)}</td><td>${formsSummary(a)}</td><td>${verifyBtn} ${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">View</a>` : ''} ${PMSUI.renderApplicationActionButtons(a, actor)}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="empty-state">No applications.</td></tr>';
  }

  function renderPrisoners() {
    const q = document.getElementById('prisoner-search').value.trim().toLowerCase();
    const list = scopePrisoners().filter((p) => !q || `${p.firstName} ${p.lastName} ${p.prisonerNumber}`.toLowerCase().includes(q));
    document.getElementById('prisoners-tbody').innerHTML = list.map((p) =>
      `<tr><td>${PMSUI.esc(p.prisonerNumber)}</td><td>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</td><td>${PMSUI.fmtDate(p.sentenceStartDate)}</td><td>${PMSUI.fmtDate(p.sentenceEndDate)}</td><td>${PMSUI.esc(p.status)}</td><td><a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">View</a></td></tr>`
    ).join('') || '<tr><td colspan="6" class="empty-state">No records.</td></tr>';
  }

  function renderNotifications() {
    PMSUI.renderNotificationPanel('notification-list', actor);
  }

  function renderProfile() {
    document.getElementById('profile-body').innerHTML = `
      <h2>${PMSUI.esc(actor.firstName)} ${PMSUI.esc(actor.lastName)}</h2>
      <p class="meta">${PMSUI.esc(actor.role)} · ${PMSUI.esc(actor.position || actor.rank || '')}</p>
      <dl class="profile-dl">
        <dt>Email</dt><dd>${PMSUI.esc(actor.email || actor.username)}</dd>
        <dt>Institution</dt><dd>${PMSUI.instName(actor.institutionId)}</dd>
        <dt>Phone</dt><dd>${PMSUI.esc(actor.phone || '—')}</dd>
      </dl>`;
  }

  function formStatusList(app) {
    const s = PMSStorage.getFormCompletionSummary(app);
    return PMSStorage.PAROLE_FORMS.map((f) => {
      const key = `form${f.number}`;
      const done = s.checks[key];
      return `<li class="${done ? 'form-done' : 'form-pending'}">${PMSUI.esc(f.name)}: ${done ? 'Complete' : 'Incomplete'}</li>`;
    }).join('');
  }

  function releaseRequirementsList(app) {
    return `<ul class="release-req-list">${PMSStorage.getReleaseRequirements(app).map((r) =>
      `<li class="release-req${r.met ? ' release-req--met' : ''}">${r.met ? '✓' : '○'} ${PMSUI.esc(r.label)}</li>`,
    ).join('')}</ul>`;
  }

  function openReleaseModal(appId) {
    const app = PMSStorage.getApplicationById(appId);
    if (!app) return;
    const blockers = PMSStorage.getReleaseBlockers(app, actor);
    if (blockers.length) {
      PMSUI.showError(blockers.join('\n'), 'Release cannot be authorized');
      return;
    }
    const p = PMSStorage.getPrisonerById(app.prisonerId);
    document.getElementById('release-app-id').value = appId;
    document.getElementById('release-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('release-notes').value = '';
    document.getElementById('release-content').innerHTML = `
      <p><strong>Case:</strong> ${PMSUI.esc(app.caseNumber || app.id)}</p>
      <p><strong>Prisoner:</strong> ${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)}</p>
      <p><strong>Status:</strong> ${PMSUI.esc(app.status)}</p>
      <h3 class="case-subheading">Release checklist</h3>
      ${releaseRequirementsList(app)}`;
    document.getElementById('release-modal').showModal();
  }

  let verifyOfficerAuth = null;
  let verifySubmitGate = null;
  let currentVerifyReadiness = { ready: false };

  function verifyDraftKey(appId) {
    return `pms_verify_draft_${appId}`;
  }

  function destroyVerifyOfficerAuth() {
    verifyOfficerAuth?.reset();
    verifyOfficerAuth = null;
    verifySubmitGate = null;
    const mount = document.getElementById('verify-officer-auth-mount');
    if (mount) {
      mount.innerHTML = '';
      mount.hidden = true;
    }
  }

  function syncVerifySubmitGate() {
    verifySubmitGate?.sync();
  }

  function mountVerifyOfficerAuth(appId) {
    destroyVerifyOfficerAuth();
    if (typeof PMSFormOfficerAuth === 'undefined') return;
    const mount = document.getElementById('verify-officer-auth-mount');
    if (!mount) return;
    mount.hidden = false;
    try {
      verifyOfficerAuth = PMSFormOfficerAuth.create({
        mount,
        heading: 'JAIL COMMANDER AUTHORIZATION',
        actor,
        applicationId: appId,
        formNumber: 'commander-verification',
        payloadSeed: 'institutional-case-verification',
        onVerified: () => syncVerifySubmitGate(),
      });
      verifySubmitGate = PMSFormOfficerAuth.gateSubmitButtons(verifyOfficerAuth, ['btn-verify-submit'], {
        pinTitle: 'Enter your 6-digit PIN and Verify & Sign before recording verification',
        canEnable: () => currentVerifyReadiness.ready && !!document.getElementById('verify-decision')?.value,
      });
      syncVerifySubmitGate();
    } catch (err) {
      console.error('Verify officer auth mount failed:', err);
    }
  }

  function formChecklistItems(app) {
    const s = PMSStorage.getFormCompletionSummary(app);
    const p = PMSStorage.getPrisonerById(app.prisonerId);
    const profile = p && typeof PMSRBAC !== 'undefined' ? PMSRBAC.prisonerProfileUrl(p.id) : '#';
    return PMSStorage.PAROLE_FORMS.filter((f) => f.number <= 3).map((f) => {
      const key = `form${f.number}`;
      const done = s.checks[key];
      return `<li class="verify-checklist__item${done ? ' verify-checklist__item--done' : ' verify-checklist__item--pending'}">
        <span class="verify-checklist__status" aria-hidden="true">${done ? '✓' : '○'}</span>
        <span class="verify-checklist__label">${PMSUI.esc(f.name)}</span>
        <span class="verify-checklist__state">${done ? 'Complete' : 'Incomplete'}</span>
      </li>`;
    }).join('') + (p ? `<li class="verify-checklist__item verify-checklist__item--link"><a href="${profile}" class="btn-icon">Open full case file</a></li>` : '');
  }

  function setVerifyDecision(decision) {
    document.getElementById('verify-decision').value = decision || '';
    document.querySelectorAll('#verify-decision-options .verify-option').forEach((btn) => {
      btn.classList.toggle('verify-option--active', btn.dataset.decision === decision);
    });
    const hint = document.getElementById('verify-decision-hint');
    const commentsHint = document.getElementById('verify-comments-hint');
    if (!decision) {
      hint.textContent = 'Select a decision to continue.';
      commentsHint.textContent = 'Required when returning a case for correction.';
      return;
    }
    if (decision === 'Verified') {
      hint.textContent = 'Case will advance to Pre-Parole Report Prepared — DJAG Secretary will schedule the hearing.';
      commentsHint.textContent = 'Optional — add institutional notes for the record.';
    } else if (decision === 'Returned for Correction') {
      hint.textContent = 'Case returns to PNGCS/DJAG clerks for correction.';
      commentsHint.textContent = 'Required — explain what must be corrected.';
    } else {
      hint.textContent = 'Application will be refused at institutional level.';
      commentsHint.textContent = 'Recommended — document reasons for rejection.';
    }
    syncVerifySubmitGate();
  }

  function loadVerifyDraft(appId) {
    const app = PMSStorage.getApplicationById(appId);
    if (app?.commanderVerificationDraft) return { ...app.commanderVerificationDraft };
    try {
      return JSON.parse(localStorage.getItem(verifyDraftKey(appId)) || 'null');
    } catch {
      return null;
    }
  }

  function saveVerifyDraft(appId) {
    const draft = {
      decision: document.getElementById('verify-decision').value,
      comments: document.getElementById('verify-comments').value.trim(),
      savedAt: new Date().toISOString(),
    };
    try {
      PMSStorage.saveCommanderVerificationDraft(appId, draft, actor);
    } catch (err) {
      PMSUI.showError(err.message || 'Could not save verification draft.');
      return draft;
    }
    localStorage.setItem(verifyDraftKey(appId), JSON.stringify(draft));
    return draft;
  }

  function clearVerifyDraft(appId) {
    localStorage.removeItem(verifyDraftKey(appId));
  }

  function setVerifyModalReadOnly(readOnly, record) {
    const modal = document.getElementById('verify-modal');
    const saveDraftBtn = document.getElementById('btn-verify-save-draft');
    const submitBtn = document.getElementById('btn-verify-submit');
    const options = document.getElementById('verify-decision-options');
    const comments = document.getElementById('verify-comments');
    let banner = document.getElementById('verify-record-banner');
    const authMount = document.getElementById('verify-officer-auth-mount');
    if (readOnly) {
      destroyVerifyOfficerAuth();
      if (authMount) authMount.hidden = true;
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'verify-record-banner';
        banner.className = 'verify-record-banner';
        modal?.querySelector('.verify-modal-body')?.prepend(banner);
      }
      banner.hidden = false;
      banner.innerHTML = `<strong>Verification on record</strong> — ${PMSUI.esc(record?.decision || 'Verified')} on ${PMSUI.fmtDate(record?.reviewedAt)} by ${PMSUI.esc(record?.commanderName || 'Jail Commander')}. This decision is saved permanently and cannot be resubmitted.`;
      saveDraftBtn?.style.setProperty('display', 'none');
      if (submitBtn) submitBtn.style.display = 'none';
      options?.querySelectorAll('.verify-option').forEach((btn) => { btn.disabled = true; });
      if (comments) comments.readOnly = true;
    } else {
      if (banner) banner.hidden = true;
      saveDraftBtn?.style.removeProperty('display');
      if (submitBtn) {
        submitBtn.style.removeProperty('display');
        submitBtn.textContent = 'Record Verification';
      }
      if (comments) {
        comments.readOnly = false;
        comments.disabled = false;
      }
      options?.querySelectorAll('.verify-option').forEach((btn) => { btn.disabled = false; });
    }
  }

  function openVerifyRecordModal(appId) {
    const app = PMSStorage.getApplicationById(appId);
    if (!app) {
      PMSUI.showError('Application not found.');
      return;
    }
    const record = PMSStorage.getCommanderVerificationRecord(app);
    if (!record) {
      PMSUI.showError('No verification record found for this case.');
      return;
    }
    openVerifyModal(appId, { readOnly: true, record });
  }

  function openVerifyModal(appId, options = {}) {
    const app = PMSStorage.getApplicationById(appId);
    if (!app) {
      PMSUI.showError('Application not found.');
      return;
    }
    if (options.readOnly) {
      // fall through to read-only view
    } else if (PMSStorage.isCommanderVerificationLocked(app)) {
      openVerifyRecordModal(appId);
      return;
    } else if (PMSStorage.isCommanderVerified(app)) {
      openVerifyRecordModal(appId);
      return;
    }
    const readiness = verificationReadiness(app);
    currentVerifyReadiness = readiness;
    if (!readiness.ready && !options.allowIncomplete) {
      PMSUI.showError(`This case is not ready for verification.\n\n${readiness.blockers.join('\n')}`, 'Verification not ready');
      return;
    }
    const p = PMSStorage.getPrisonerById(app.prisonerId);
    const prog = p ? PMSStorage.getPrisonerProgress(p) : null;
    const modal = document.getElementById('verify-modal');
    document.getElementById('verify-app-id').value = appId;
    document.getElementById('verify-modal-subtitle').textContent = `${formsSummary(app)} · ${PMSUI.esc(app.status)}`;
    document.getElementById('verify-summary').innerHTML = `
      <div class="verify-summary__grid">
        <div><span class="verify-summary__label">Case</span><strong>${PMSUI.esc(app.caseNumber || app.id)}</strong></div>
        <div><span class="verify-summary__label">Prisoner</span><strong>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : '—'}</strong></div>
        <div><span class="verify-summary__label">Institution</span><strong>${PMSUI.instName(app.institutionId)}</strong></div>
        <div><span class="verify-summary__label">Submitted</span><strong>${PMSUI.fmtDate(app.submittedAt)}</strong></div>
        ${p ? `<div class="verify-summary__wide"><span class="verify-summary__label">Offense / progress</span><strong>${PMSUI.esc(p.offense || '—')}${prog ? ` · ${prog.percent.toFixed(0)}% served` : ''}</strong></div>` : ''}
      </div>${readiness.ready ? '' : `<p class="field-hint" style="margin:0.75rem 0 0">Documentation incomplete: ${PMSUI.esc(readiness.blockers.join(' · '))}. You may review the package but cannot record verification yet.</p>`}`;
    document.getElementById('verify-checklist').innerHTML = formChecklistItems(app);

    const record = options.record || PMSStorage.getCommanderVerificationRecord(app);
    const draft = options.readOnly ? null : loadVerifyDraft(appId);
    setVerifyDecision(options.readOnly ? (record?.decision || 'Verified') : (draft?.decision || ''));
    document.getElementById('verify-comments').value = options.readOnly ? (record?.comments || '') : (draft?.comments || '');
    const submitBtn = document.getElementById('btn-verify-submit');
    if (options.readOnly) {
      setVerifyModalReadOnly(true, record);
    } else {
      setVerifyModalReadOnly(false);
      if (submitBtn) submitBtn.textContent = 'Record Verification';
      document.querySelectorAll('#verify-decision-options .verify-option').forEach((btn) => {
        btn.disabled = !readiness.ready;
      });
      document.getElementById('verify-comments').disabled = !readiness.ready;
      mountVerifyOfficerAuth(appId);
    }
    modal.showModal();
    if (readiness.ready) {
      modal.querySelector('.verify-option--approve')?.focus();
    }
  }

  function handleVerificationDeepLink(appId) {
    if (!appId) return;
    const app = PMSStorage.getApplicationById(appId);
    if (app && PMSStorage.isCommanderVerificationLocked(app)) {
      PMSUI.switchPanel('verification', panelTitles, refresh, 'verification');
      openVerifyRecordModal(appId);
      document.querySelector('.verification-record-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    renderVerificationFocus(appId);
    PMSUI.highlightDeepLinkRow(`[data-verify-app-row="${CSS.escape(appId)}"]`);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => openVerifyModal(appId, { allowIncomplete: true }));
    });
  }

  function clearVerificationDeepLink() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('app')) return;
    url.searchParams.delete('app');
    history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : ''));
  }

  function submitVerification() {
    const appId = document.getElementById('verify-app-id').value;
    const decision = document.getElementById('verify-decision').value;
    const comments = document.getElementById('verify-comments').value.trim();
    const submitBtn = document.getElementById('btn-verify-submit');
    if (!decision) {
      PMSUI.showError('Please select a verification decision.');
      document.querySelector('#verify-decision-options .verify-option')?.focus();
      return;
    }
    if (decision === 'Returned for Correction' && !comments) {
      PMSUI.showError('Please provide comments when returning a case for correction.');
      document.getElementById('verify-comments').focus();
      return;
    }
    if (typeof PMSFormOfficerAuth !== 'undefined' && !PMSFormOfficerAuth.requireVerified(verifyOfficerAuth, {
      message: 'Enter your 6-digit PIN and click Verify & Sign before recording verification.',
      showToast: PMSUI.showError,
    })) {
      return;
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Recording…';
    }
    try {
      PMSStorage.saveCommanderCaseReview(appId, { decision, comments }, actor);
      clearVerifyDraft(appId);
      document.getElementById('verify-modal').close();
      clearVerificationDeepLink();
      renderVerificationFocus(null);
      const remaining = verificationQueue().filter((a) => a.id !== appId);
      refresh('verification');
      refresh('overview');
      refresh('applications');
      refresh('notifications');
      renderVerifiedRecord();
      if (decision === 'Verified') {
        PMSUI.switchPanel('verification', panelTitles, refresh, 'verification');
        document.querySelector('.verification-record-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      const successMsg = decision === 'Verified'
        ? 'Case verified — forwarded to DJAG for hearing scheduling.'
        : `Case marked as ${decision}.`;
      PMSUI.showSuccess(successMsg);
      if (remaining.length) {
        setTimeout(async () => {
          const openNext = await PMSUI.confirmDialog(
            `Verification recorded. Open the next case (${remaining.length} remaining)?`,
            'Continue verification',
          );
          if (openNext) openVerifyModal(remaining[0].id);
        }, 400);
      }
    } catch (err) {
      const app = PMSStorage.getApplicationById(appId);
      if (app && PMSStorage.isCommanderVerificationLocked(app)) {
        document.getElementById('verify-modal')?.close();
        openVerifyRecordModal(appId);
        PMSUI.showError(err.message || 'This case is already verified. Showing the recorded decision.');
      } else {
        PMSUI.showError(err.message || 'Verification failed.');
      }
    } finally {
      if (submitBtn) submitBtn.textContent = 'Record Verification';
      syncVerifySubmitGate();
    }
  }

  function bindVerifyModal() {
    const modal = document.getElementById('verify-modal');
    if (!modal || modal.dataset.verifyBound) return;
    modal.dataset.verifyBound = 'true';

    document.getElementById('verify-decision-options')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-decision]');
      if (!btn) return;
      setVerifyDecision(btn.dataset.decision);
    });

    document.getElementById('btn-verify-save-draft')?.addEventListener('click', () => {
      const appId = document.getElementById('verify-app-id').value;
      if (!appId) return;
      const draft = saveVerifyDraft(appId);
      PMSUI.showSuccess(draft.decision ? 'Verification draft saved.' : 'Comments saved as draft.');
    });

    document.getElementById('verify-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      submitVerification();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.close();
    });

    modal.addEventListener('cancel', (e) => {
      e.preventDefault();
      modal.close();
    });

    modal.addEventListener('close', () => {
      setVerifyModalReadOnly(false);
      destroyVerifyOfficerAuth();
    });
  }

  PMSSidebar.init({
    user: actor,
    activePanel: 'overview',
    onNavigate: (panel, meta) => PMSUI.switchPanel(panel, panelTitles, refresh, meta?.navId),
  });
  PMSUI.setPanelNavigator((panel, navId) => PMSUI.switchPanel(panel, panelTitles, refresh, navId));
  PMSUI.initShell(actor);
  PMSUI.bindModalClose();
  bindVerifyModal();
  PMSUI.bindNotificationPanel('notification-list', actor, () => refresh('notifications'));

  document.getElementById('prisoner-search').addEventListener('input', () => renderPrisoners());
  document.getElementById('verification-search')?.addEventListener('input', () => renderVerification());
  document.getElementById('verified-search')?.addEventListener('input', () => renderVerifiedRecord());

  document.getElementById('release-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const appId = document.getElementById('release-app-id').value;
    const releaseDate = document.getElementById('release-date').value;
    const notes = document.getElementById('release-notes').value.trim();
    if (!releaseDate) {
      PMSUI.showError('Please set the release date.');
      return;
    }
    try {
      PMSStorage.authorizeRelease(appId, { releaseDate, notes }, actor);
      document.getElementById('release-modal').close();
      refresh('release');
      refresh('overview');
      refresh('applications');
      refresh('prisoners');
      PMSUI.showSuccess('Release authorized successfully.');
    } catch (err) {
      PMSUI.showError(err.message || 'Release authorization failed.');
    }
  });

  document.addEventListener('click', (e) => {
    const releaseBtn = e.target.closest('[data-release]');
    if (releaseBtn) {
      openReleaseModal(releaseBtn.dataset.release);
      return;
    }
    const viewVerifyBtn = e.target.closest('[data-view-verify]');
    if (viewVerifyBtn) {
      openVerifyRecordModal(viewVerifyBtn.dataset.viewVerify);
      return;
    }
    const verifyBtn = e.target.closest('[data-verify]');
    if (verifyBtn) {
      openVerifyModal(verifyBtn.dataset.verify);
      return;
    }
    const verifyRow = e.target.closest('[data-verify-row]');
    if (verifyRow && !e.target.closest('a,button')) {
      openVerifyModal(verifyRow.dataset.verifyRow);
    }
  });

  document.addEventListener('keydown', (e) => {
    const verifyRow = e.target.closest('[data-verify-row]');
    if (!verifyRow || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    openVerifyModal(verifyRow.dataset.verifyRow);
  });

  PMSUI.bindOverviewNotifications('overview-notifications', actor, () => refresh('overview'));
  bindOverviewRowNav('overview-verification-queue');
  bindOverviewRowNav('overview-verified-record');
  PMSUI.bindApplicationActionHandlers(() => refresh('applications'));

  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) {
    PMSUI.switchPanel('overview', panelTitles, refresh, 'overview');
  } else {
    const appId = PMSUI.getDeepLinkParam('app');
    const deepPanel = PMSUI.getDeepLinkParam('panel');
    if (appId && deepPanel === 'verification') {
      handleVerificationDeepLink(appId);
    }
  }
  setupStatCards();

  PMSUI.bindLiveDataRefresh(() => {
    const active = document.querySelector('.sidebar-nav .nav-item.active')?.dataset.panel || 'overview';
    refresh(active);
  });
})();
