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
        getRows: () => scopeApps()
          .filter((a) => PMSStorage.isActiveParoleApplication(a) && PMSStorage.isCommanderVerified(a))
          .map((a) => PMSUI.appDrilldownRow(a)),
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

  function renderVerification() {
    const rows = verificationQueue();
    document.getElementById('verification-tbody').innerHTML = rows.length
      ? rows.map((a) => {
        const p = PMSStorage.getPrisonerById(a.prisonerId);
        const readiness = verificationReadiness(a);
        const verifyBtn = readiness.ready
          ? `<button type="button" class="btn-primary btn-sm" data-verify="${PMSUI.esc(a.id)}">Verify</button>`
          : `<button type="button" class="btn-secondary btn-sm" disabled title="${PMSUI.esc(readiness.blockers.join('; '))}">Awaiting Forms</button>`;
        return `<tr class="${readiness.ready ? 'verify-row--ready' : ''}"${readiness.ready ? ` data-verify-row="${PMSUI.esc(a.id)}" tabindex="0" role="button"` : ''}><td>${PMSUI.esc(a.caseNumber || a.id)}</td><td>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : '—'}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${formsSummary(a)}${readiness.ready ? '' : `<br><span class="meta">${PMSUI.esc(readiness.blockers.join(' · '))}</span>`}</td><td>${PMSUI.fmtDate(a.submittedAt)}</td><td>${verifyBtn} ${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">Case File</a>` : ''}</td></tr>`;
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

  function verifyDraftKey(appId) {
    return `pms_verify_draft_${appId}`;
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
  }

  function loadVerifyDraft(appId) {
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
    localStorage.setItem(verifyDraftKey(appId), JSON.stringify(draft));
    return draft;
  }

  function clearVerifyDraft(appId) {
    localStorage.removeItem(verifyDraftKey(appId));
  }

  function openVerifyModal(appId) {
    const app = PMSStorage.getApplicationById(appId);
    if (!app) {
      PMSUI.showError('Application not found.');
      return;
    }
    const readiness = verificationReadiness(app);
    if (!readiness.ready) {
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
      </div>`;
    document.getElementById('verify-checklist').innerHTML = formChecklistItems(app);

    const draft = loadVerifyDraft(appId);
    setVerifyDecision(draft?.decision || '');
    document.getElementById('verify-comments').value = draft?.comments || '';
    const submitBtn = document.getElementById('btn-verify-submit');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Record Verification';
    }
    modal.showModal();
    modal.querySelector('.verify-option--approve')?.focus();
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
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Recording…';
    }
    try {
      PMSStorage.saveCommanderCaseReview(appId, { decision, comments }, actor);
      clearVerifyDraft(appId);
      document.getElementById('verify-modal').close();
      const remaining = verificationQueue().filter((a) => a.id !== appId);
      refresh('verification');
      refresh('overview');
      refresh('applications');
      refresh('notifications');
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
      PMSUI.showError(err.message || 'Verification failed.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Record Verification';
      }
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
  }

  PMSSidebar.init({
    user: actor,
    activePanel: 'overview',
    onNavigate: (panel, meta) => PMSUI.switchPanel(panel, panelTitles, refresh, meta?.navId),
  });
  PMSUI.initShell(actor);
  PMSUI.bindModalClose();
  bindVerifyModal();
  PMSUI.bindNotificationPanel('notification-list', actor, () => refresh('notifications'));

  document.getElementById('prisoner-search').addEventListener('input', () => renderPrisoners());

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

  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) {
    PMSUI.switchPanel('overview', panelTitles, refresh, 'overview');
  } else {
    const appId = PMSUI.getDeepLinkParam('app');
    const deepPanel = PMSUI.getDeepLinkParam('panel');
    if (appId && deepPanel === 'verification') {
      setTimeout(() => openVerifyModal(appId), 0);
    }
  }
  setupStatCards();
})();
