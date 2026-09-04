(async () => {
  await PMSStorage.ensureLoaded();
  const actor = PMSAuth.requireDashboardRole('dashboard-commander.html');
  if (!actor) return;

  const inst = actor.institutionId ? PMSStorage.getInstitutionById(actor.institutionId) : null;

  const panelTitles = {
    overview: ['Overview', `Jail Commander — ${inst?.name || 'Institution'}`],
    verification: ['Case Verification', 'Review and verify parole application packages'],
    release: ['Authorize Release', 'Release prisoners after board interviews and parole approval'],
    applications: ['Parole Applications', 'Institution parole cases (read-only overview)'],
    prisoners: ['Prisoner Records', 'Prisoners at your institution'],
    notifications: ['Notifications', 'Verification and workflow alerts'],
    profile: ['Profile', 'Your account information'],
  };

  function scopeApps() {
    let list = PMSStorage.getParoleApplications();
    if (actor.institutionId) list = list.filter((a) => a.institutionId === actor.institutionId);
    return list;
  }

  function scopePrisoners() {
    return PMSRBAC.filterPrisonersForUser(actor, PMSStorage.getPrisoners());
  }

  function needsVerification(app) {
    if (PMSStorage.isCommanderVerified(app)) return false;
    return PMSStorage.isVerificationReady(app);
  }

  function verificationReadiness(app) {
    const summary = PMSStorage.getFormCompletionSummary(app);
    const blockers = [];
    if (!summary.checks.form1) blockers.push('Form 1 incomplete');
    if (!summary.checks.form2) blockers.push('Form 2 incomplete');
    if (!summary.checks.form3) blockers.push('Form 3 incomplete');
    return { ready: blockers.length === 0, blockers };
  }

  function verificationQueue() {
    return scopeApps().filter(needsVerification);
  }

  function formsSummary(app) {
    const s = PMSStorage.getFormCompletionSummary(app);
    return `${s.completed}/5 forms complete`;
  }

  function verificationBadge(app) {
    if (PMSStorage.isCommanderVerified(app)) {
      return '<span class="status-pill status-pill--success">Verified</span>';
    }
    if (needsVerification(app)) {
      return '<span class="status-pill status-pill--warn">Pending</span>';
    }
    return '<span class="meta">Not ready</span>';
  }

  function releaseCandidates() {
    return scopeApps().filter((a) => a.status !== 'Released' && !['Refused', 'Parole Refused'].includes(a.status));
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
    const verified = apps.filter((a) => PMSStorage.isActiveParoleApplication(a) && PMSStorage.isCommanderVerified(a)).length;
    const unread = PMSStorage.getUnreadCountForUser(actor);

    PMSUI.setStat('stat-pending', queue.length);
    PMSUI.setStat('stat-release-ready', releaseReadyQueue().length);
    PMSUI.setStat('stat-verified', verified);
    PMSUI.setStat('stat-prisoners', scopePrisoners().length);
    PMSUI.setStat('stat-notifications', unread);

    const note = document.getElementById('institution-note');
    if (note && inst) note.textContent = `Institutional verification for ${inst.name} (${inst.province}).`;

    PMSUI.syncOverviewNotifHeader(unread);
    const notifs = PMSUI.recentNotifications(actor, 5);
    document.getElementById('overview-notifications').innerHTML = notifs.length
      ? notifs.map((n) => PMSUI.renderOverviewNotificationRow(n)).join('')
      : '<p class="empty-state">No notifications.</p>';
  }

  function renderVerification() {
    const rows = verificationQueue();
    document.getElementById('verification-tbody').innerHTML = rows.length
      ? rows.map((a) => {
        const p = PMSStorage.getPrisonerById(a.prisonerId);
        const readiness = verificationReadiness(a);
        const verifyBtn = readiness.ready
          ? `<button type="button" class="btn-primary btn-sm" data-verify="${PMSUI.esc(a.id)}">Verify</button>`
          : `<button type="button" class="btn-secondary btn-sm" disabled title="${PMSUI.esc(readiness.blockers.join('; '))}">Awaiting Forms</button>`;
        return `<tr><td>${PMSUI.esc(a.caseNumber || a.id)}</td><td>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : '—'}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${formsSummary(a)}${readiness.ready ? '' : `<br><span class="meta">${PMSUI.esc(readiness.blockers.join(' · '))}</span>`}</td><td>${PMSUI.fmtDate(a.submittedAt)}</td><td>${verifyBtn} ${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">Case File</a>` : ''}</td></tr>`;
      }).join('')
      : '<tr><td colspan="6" class="empty-state">No cases awaiting verification.</td></tr>';
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
        : '';
      return `<tr><td>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : '—'}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${verificationBadge(a)}</td><td>${formsSummary(a)}</td><td>${verifyBtn} ${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">View</a>` : ''}</td></tr>`;
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
      alert(blockers.join('\n'));
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

  function openVerifyModal(appId) {
    const app = PMSStorage.getApplicationById(appId);
    if (!app) return;
    const readiness = verificationReadiness(app);
    if (!readiness.ready) {
      alert(`This case is not ready for verification.\n\n${readiness.blockers.join('\n')}`);
      return;
    }
    const p = PMSStorage.getPrisonerById(app.prisonerId);
    document.getElementById('verify-app-id').value = appId;
    document.getElementById('verify-decision').value = '';
    document.getElementById('verify-comments').value = '';
    document.getElementById('verify-content').innerHTML = `
      <p><strong>Case:</strong> ${PMSUI.esc(app.caseNumber || app.id)}</p>
      <p><strong>Prisoner:</strong> ${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)} · <strong>Status:</strong> ${PMSUI.esc(app.status)}</p>
      <p><strong>Forms:</strong> ${formsSummary(app)}</p>
      <ul class="doc-list">${formStatusList(app)}</ul>`;
    document.getElementById('verify-modal').showModal();
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

  document.getElementById('release-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const appId = document.getElementById('release-app-id').value;
    const releaseDate = document.getElementById('release-date').value;
    const notes = document.getElementById('release-notes').value.trim();
    if (!releaseDate) {
      alert('Please set the release date.');
      return;
    }
    try {
      PMSStorage.authorizeRelease(appId, { releaseDate, notes }, actor);
      document.getElementById('release-modal').close();
      refresh('release');
      refresh('overview');
      refresh('applications');
      refresh('prisoners');
      alert('Release authorized successfully.');
    } catch (err) {
      alert(err.message || 'Release authorization failed.');
    }
  });

  document.getElementById('verify-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const appId = document.getElementById('verify-app-id').value;
    const decision = document.getElementById('verify-decision').value;
    const comments = document.getElementById('verify-comments').value.trim();
    if (!decision) {
      alert('Please select a verification decision.');
      return;
    }
    if (decision === 'Returned for Correction' && !comments) {
      alert('Please provide comments when returning a case for correction.');
      return;
    }
    try {
      PMSStorage.saveCommanderCaseReview(appId, { decision, comments }, actor);
      document.getElementById('verify-modal').close();
      refresh('verification');
      refresh('overview');
      refresh('applications');
      alert(decision === 'Verified' ? 'Case verified successfully.' : `Case marked as ${decision}.`);
    } catch (err) {
      alert(err.message || 'Verification failed.');
    }
  });

  document.addEventListener('click', (e) => {
    const releaseBtn = e.target.closest('[data-release]');
    if (releaseBtn) {
      openReleaseModal(releaseBtn.dataset.release);
      return;
    }
    const btn = e.target.closest('[data-verify]');
    if (btn) openVerifyModal(btn.dataset.verify);
  });

  const deepPanel = PMSUI.getDeepLinkParam('panel') || 'overview';
  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) {
    PMSUI.switchPanel(deepPanel in panelTitles ? deepPanel : 'overview', panelTitles, refresh);
  }
})();
