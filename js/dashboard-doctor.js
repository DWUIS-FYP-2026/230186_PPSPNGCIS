(async () => {
  await PMSStorage.ensureLoaded();
  const actor = PMSAuth.requireDashboardRole('dashboard-doctor.html');
  if (!actor) return;

  const panelTitles = {
    overview: ['Overview', 'Medical Board Assessor — case review and evaluations'],
    prisoners: ['Prisoner Records', 'Read-only records for medical review'],
    applications: ['Parole Cases', 'Cases in hearing or board review'],
    hearings: ['Hearing Calendar', 'Scheduled parole board hearings'],
    evaluations: ['Medical Evaluations', 'Upload evaluation documents for board cases'],
    decisions: ['Board Votes', 'Cast Approve, Deny, or Defer votes independently'],
    notifications: ['Notifications', 'Hearing and board workflow alerts'],
    profile: ['Profile', 'Your account information'],
  };

  function boardCases() {
    return PMSStorage.getParoleApplications().filter((a) =>
      ['Hearing Scheduled', 'Pending Board Review', 'Pre-Parole Report Prepared', 'Deferred'].includes(a.status)
    );
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
      evaluations: renderEvaluations,
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
      <div class="overview-row"><strong>Cases awaiting my vote</strong><span class="meta">${PMSUI.formatStat(pendingVoteCases().length)}</span></div>
      <div class="overview-row"><strong>Medical evaluations uploaded</strong><span class="meta">${PMSUI.formatStat(cases.reduce((n, a) => n + PMSStorage.getMedicalEvaluations(a.id).length, 0))}</span></div>
      ${notifs.length ? notifs.map((n) => PMSUI.renderOverviewNotificationRow(n)).join('') : ''}`;
    if (typeof PMSCalendar !== 'undefined') PMSCalendar.mount('dashboard-calendar', actor);
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
      const docs = PMSStorage.getMedicalEvaluations(a.id).length;
      const mine = PMSStorage.getBoardAssessmentForActor(a, actor);
      return `<tr><td>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : '—'}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${progress.submitted}/${progress.total}${mine?.vote ? ` · You: ${mine.vote}` : ''}</td><td>${docs} file(s)</td><td><a href="forms/hearing-portal.html?appId=${encodeURIComponent(a.id)}" class="btn-icon">Open Case</a></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="empty-state">No active board cases.</td></tr>';
  }

  function renderHearings() {
    document.getElementById('hearings-tbody').innerHTML = PMSStorage.getHearings()
      .filter((h) => !['Cancelled'].includes(h.status))
      .map((h) => {
        const p = PMSStorage.getPrisonerById(h.prisonerId);
        return `<tr><td>${PMSUI.fmtDate(h.scheduledDate)} ${PMSUI.esc(h.scheduledTime || '')}</td><td>${p ? `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : '—'}</td><td>${PMSUI.esc(h.applicationId || '—')}</td><td>${PMSUI.esc(h.location || '—')}</td><td>${PMSUI.esc(h.status)}</td><td>${h.applicationId ? `<a href="forms/hearing-portal.html?appId=${encodeURIComponent(h.applicationId)}" class="btn-icon">Portal</a>` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="6" class="empty-state">No hearings scheduled.</td></tr>';
  }

  function renderEvaluations() {
    const cases = boardCases();
    document.getElementById('evaluations-list').innerHTML = cases.length
      ? cases.map((a) => {
        const p = PMSStorage.getPrisonerById(a.prisonerId);
        const docs = PMSStorage.getMedicalEvaluations(a.id);
        return `<div class="decision-card evaluation-card" data-app="${PMSUI.esc(a.id)}">
          <div><strong>${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)}</strong> — ${PMSUI.esc(a.caseNumber || a.id)}</div>
          <div class="meta">${docs.length} evaluation document(s) on file</div>
          <ul class="doc-list">${docs.map((d) => `<li>${PMSUI.esc(d.fileName)} · ${PMSUI.fmtDate(d.uploadedAt)}</li>`).join('') || '<li class="meta">No documents uploaded yet</li>'}</ul>
          <label class="field-label">Upload evaluation document</label>
          <input type="file" class="eval-file" data-app="${PMSUI.esc(a.id)}" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png">
          <input type="text" class="eval-notes search-input" data-app="${PMSUI.esc(a.id)}" placeholder="Clinical notes (optional)">
          <button type="button" class="btn-primary btn-sm" data-upload-eval="${PMSUI.esc(a.id)}">Upload Evaluation</button>
        </div>`;
      }).join('')
      : '<p class="empty-state">No cases currently require medical evaluations.</p>';
  }

  function renderDecisions() {
    const pending = pendingVoteCases();
    const voted = boardCases().filter((a) => PMSStorage.hasSubmittedBoardAssessment(a, actor));
    document.getElementById('decisions-list').innerHTML = `
      <p class="toolbar-note">Each board member votes independently — Approve, Deny, or Defer.</p>
      ${pending.length ? `<h3 class="decisions-subheading">Awaiting your vote</h3>${pending.map((a) => {
        const p = PMSStorage.getPrisonerById(a.prisonerId);
        const progress = PMSStorage.getBoardAssessmentProgress(a);
        return `<div class="decision-card"><strong>${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)}</strong> — ${PMSUI.esc(a.caseNumber || a.id)}<br><span class="meta">Panel: ${progress.submitted}/${progress.total} votes</span><a href="forms/hearing-portal.html?appId=${encodeURIComponent(a.id)}" class="btn-primary btn-sm">Cast Vote</a></div>`;
      }).join('')}` : ''}
      ${voted.length ? `<h3 class="decisions-subheading">Your votes submitted</h3>${voted.map((a) => {
        const p = PMSStorage.getPrisonerById(a.prisonerId);
        const mine = PMSStorage.getBoardAssessmentForActor(a, actor);
        return `<div class="decision-card decision-card--done"><strong>${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)}</strong> — ${PMSUI.esc(a.caseNumber || a.id)}<br><span class="meta">Your vote: ${PMSUI.esc(mine?.vote)}</span><a href="forms/hearing-portal.html?appId=${encodeURIComponent(a.id)}" class="btn-outline btn-sm">Review / Update</a></div>`;
      }).join('')}` : ''}
      ${!pending.length && !voted.length ? '<p class="empty-state">No cases awaiting your vote.</p>' : ''}`;
  }

  function renderNotifications() {
    PMSUI.renderNotificationPanel('notification-list', actor);
  }

  PMSSidebar.init({
    user: actor,
    roleLabel: actor.boardPosition || 'Medical Board Assessor',
    activePanel: 'overview',
    onNavigate: (panel, meta) => PMSUI.switchPanel(panel, panelTitles, refresh, meta?.navId),
  });
  PMSUI.initShell(actor, actor.boardPosition || 'Medical Board Assessor');
  PMSUI.bindNotificationPanel('notification-list', actor, () => refresh('notifications'));

  document.getElementById('prisoner-search')?.addEventListener('input', () => renderPrisoners());

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-upload-eval]');
    if (!btn) return;
    const appId = btn.dataset.uploadEval;
    const card = btn.closest('.evaluation-card');
    const fileInput = card?.querySelector('.eval-file');
    const notesInput = card?.querySelector('.eval-notes');
    const file = fileInput?.files?.[0];
    if (!file) {
      alert('Please choose an evaluation document to upload.');
      return;
    }
    try {
      PMSStorage.saveMedicalEvaluation(appId, {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        notes: notesInput?.value.trim() || '',
      }, actor);
      alert('Medical evaluation document recorded.');
      refresh(document.querySelector('.nav-item.active')?.dataset.panel || 'evaluations');
    } catch (err) {
      alert(err.message || 'Upload failed.');
    }
  });

  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) {
    refresh('overview');
  }
})();
