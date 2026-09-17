/**
 * Parole Hearing Portal — schedule (DJAG Secretary) and board decisions (panel).
 */
const PMSHearingPortal = (() => {
  const PORTAL_ROLES = [
    'DJAG Secretary', 'DJAG Parole Clerk',
    'Doctor', 'CS Commissioner',
  ];
  const SCHEDULE_PAGE_ROLES = ['DJAG Secretary'];
  const DECISIONS_PAGE_ROLES = ['Doctor', 'CS Commissioner', 'DJAG Secretary'];
  const SCHEDULE_ROLES = ['DJAG Secretary'];
  const DECIDE_ROLES = [];
  /** Board Chairman — the only seat that records the overall outcome and issues Form 4/5. */
  const CHAIR_ROLES = ['DJAG Secretary'];
  const ASSESS_ROLES = ['Doctor', 'CS Commissioner', 'DJAG Secretary'];
  const PANEL_ROLES = ['Doctor', 'CS Commissioner', 'DJAG Secretary'];
  const SCHEDULABLE_STATUSES = ['Pre-Parole Report Prepared', 'Hearing Scheduled'];
  const DECISION_STATUSES = ['Hearing Scheduled', 'Hearing In Progress', 'Pending Board Review', 'Parole Granted', 'Parole Refused', 'Pending Approval', 'Refused', 'Approved', 'Deferred'];
  const CLOSED_STATUSES = ['Refused', 'Approved', 'Released', 'Parole Granted', 'Parole Refused'];

  const FORM2_CLAIMS = [
    { id: 'ppr-family', section: 'ppr', label: 'Family & personal history', field: 'pprFamilyHistory' },
    { id: 'ppr-psych', section: 'ppr', label: 'Psychological standing', field: 'pprPsychologicalStanding' },
    { id: 'ppr-community', section: 'ppr', label: 'Community leader interview', field: 'pprCommunityInterview' },
    { id: 'ppr-pastor', section: 'ppr', label: 'Pastor / religious leader interview', field: 'pprPastorInterview' },
    { id: 'ppr-employment', section: 'ppr', label: 'Employment & reintegration plan', field: 'pprEmploymentPlan' },
    { id: 'ppr-residence', section: 'ppr', label: 'Verified residence', field: 'verifiedResidence' },
    { id: 'ddr-conduct', section: 'ddr', label: 'Conduct & disciplinary record', field: 'disciplinaryHistory' },
    { id: 'ddr-training', section: 'ddr', label: 'Training & vocational progress', field: 'trainingProgress' },
    { id: 'ddr-mental', section: 'ddr', label: 'Mental health status', field: 'mentalHealth' },
    { id: 'ddr-risk', section: 'ddr', label: 'Risk & adjustment rating', field: 'adjustmentRating' },
  ];

  const BEHAVIORAL_INDICATORS = [
    { id: 'eyeContactEngagement', label: 'Eye contact / engagement' },
    { id: 'emotionalRegulation', label: 'Emotional regulation' },
    { id: 'consistencyOfAccount', label: 'Consistency of account' },
    { id: 'genuineRemorse', label: 'Signs of genuine remorse' },
    { id: 'distressEvasiveness', label: 'Signs of distress / evasiveness' },
  ];

  const PSYCH_SCALE_LABELS = ['', 'Very low', 'Low', 'Moderate', 'High', 'Very high'];
  const DEMEANOR_OPTIONS = ['Calm', 'Cooperative', 'Guarded', 'Anxious', 'Defensive', 'Agitated'];

  let portalMode = 'legacy';
  let actor = null;
  let canSchedule = false;
  let canDecide = false;
  let canAssess = false;
  let canGrantOutcome = false;
  let canUseMedicalScore = false;
  let queue = [];
  let currentIndex = 0;
  let currentAppId = '';
  let pendingPsychFile = null;
  let interviewOfficerAuth = null;
  let interviewSubmitGate = null;
  let psychOfficerAuth = null;
  let psychSubmitGate = null;
  let voteOfficerAuth = null;
  let voteSubmitGate = null;
  let sessionSyncTimer = null;
  let sessionSyncBound = false;

  const $ = (id) => document.getElementById(id);

  function getPortalMode() {
    if (document.body.classList.contains('portal--schedule')) return 'schedule';
    if (document.body.classList.contains('portal--decisions')) return 'decisions';
    return 'legacy';
  }

  function inFormsDir() {
    return /\/forms(\/|$)/.test(window.location.pathname);
  }

  function schedulePortalHref(appId) {
    const base = inFormsDir() ? 'hearing-schedule.html' : 'forms/hearing-schedule.html';
    return appId ? `${base}?appId=${encodeURIComponent(appId)}` : base;
  }

  function decisionsPortalHref(appId) {
    const base = inFormsDir() ? 'board-decisions.html' : 'forms/board-decisions.html';
    return appId ? `${base}?appId=${encodeURIComponent(appId)}` : base;
  }

  function legacyPortalHref(appId) {
    const base = inFormsDir() ? 'hearing-portal.html' : 'forms/hearing-portal.html';
    return appId ? `${base}?appId=${encodeURIComponent(appId)}` : base;
  }

  function resolvePortalHref(app, user) {
    const role = user?.role;
    const appId = app?.id;
    if (app && getActiveHearing(appId)?.scheduledDate && DECISION_STATUSES.includes(app.status)) {
      return decisionsPortalHref(appId);
    }
    if (app && ['Pre-Parole Report Prepared'].includes(app.status) && SCHEDULE_ROLES.includes(role) && isScheduleCandidate(app)) {
      return schedulePortalHref(appId);
    }
    if (SCHEDULE_ROLES.includes(role) && app && isScheduleCandidate(app)) return schedulePortalHref(appId);
    if (['Doctor', 'CS Commissioner', 'DJAG Secretary'].includes(role) && app && getActiveHearing(appId)) {
      return decisionsPortalHref(appId);
    }
    if (['Doctor', 'CS Commissioner'].includes(role)) return decisionsPortalHref(appId);
    if (role === 'DJAG Secretary') return isScheduleCandidate(app) ? schedulePortalHref(appId) : decisionsPortalHref(appId);
    return legacyPortalHref(appId);
  }

  function redirectLegacyPortal(user) {
    const appId = new URLSearchParams(window.location.search).get('appId') || '';
    const app = appId ? PMSStorage.getApplicationById(appId) : null;
    if (['Doctor', 'CS Commissioner'].includes(user.role)) {
      window.location.replace(decisionsPortalHref(appId || undefined));
      return true;
    }
    if (SCHEDULE_ROLES.includes(user.role)) {
      const needsDecisions = app && getActiveHearing(app.id) && DECISION_STATUSES.includes(app.status) && !isScheduleCandidate(app);
      window.location.replace(needsDecisions ? decisionsPortalHref(appId) : schedulePortalHref(appId || undefined));
      return true;
    }
    return false;
  }

  function isDecisionCandidate(app) {
    if (!app || app.status === 'Draft' || !getActiveHearing(app.id)) return false;
    return DECISION_STATUSES.includes(app.status);
  }

  function applyPortalChrome() {
    if (portalMode === 'schedule') {
      document.title = 'Schedule Parole Hearings | PNG Parole System';
    } else if (portalMode === 'decisions' && typeof PMSBoardVote !== 'undefined') {
      PMSBoardVote.applyPortalChrome(actor, {
        pageTitle: $('portal-page-title'),
        pageSub: $('portal-page-sub'),
        formBadge: $('portal-form-badge'),
        roleBadge: $('portal-role-badge'),
      });
    }
    applyMedicalFieldVisibility();
  }

  function applyMedicalFieldVisibility() {
    if (typeof PMSBoardVote !== 'undefined') {
      PMSBoardVote.applyMedicalScoreVisibility(actor, {
        medicalScoreRow: $('medical-score-row'),
        scoreInput: $('assessment-score'),
      });
      return;
    }
    const row = $('medical-score-row');
    if (!row) return;
    row.hidden = !canUseMedicalScore;
    if (!canUseMedicalScore && $('assessment-score')) $('assessment-score').value = '';
  }

  function showScheduleSuccess({ prisonerName, scheduledDate, scheduledTime, location, updated = false }) {
    const modal = $('schedule-success-modal');
    const msgEl = $('schedule-success-message');
    if (!modal || !msgEl) {
      showToast(updated ? 'Hearing updated successfully.' : 'Hearing scheduled successfully.');
      return;
    }
    const dateLabel = scheduledDate ? PMSUI.fmtDate(scheduledDate) : 'TBD';
    const timeLabel = scheduledTime ? ` at ${scheduledTime}` : '';
    msgEl.textContent = `${updated ? 'Hearing updated' : 'Hearing scheduled'} for ${prisonerName} on ${dateLabel}${timeLabel} · ${location || 'venue confirmed'}. Stakeholders will be notified.`;
    modal.hidden = false;
  }

  function hideScheduleSuccess() {
    const modal = $('schedule-success-modal');
    if (modal) modal.hidden = true;
  }

  function showToast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3500);
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  }

  function initials(first, last) {
    return `${(first || '?').charAt(0)}${(last || '').charAt(0)}`.toUpperCase();
  }

  function draftKey(appId) {
    return `png_hearing_draft_${appId}`;
  }

  function getActiveHearing(appId) {
    return PMSStorage.getHearingsByApplication(appId)
      .find((h) => !['Cancelled', 'Completed'].includes(h.status)) || null;
  }

  function isScheduleCandidate(app) {
    if (!app || app.status === 'Draft' || CLOSED_STATUSES.includes(app.status)) return false;
    if (['Parole Granted', 'Parole Refused', 'Pending Approval', 'Pending Board Review', 'Hearing In Progress', 'Approved', 'Released'].includes(app.status)) {
      return false;
    }
    const hearing = getActiveHearing(app.id);
    if (hearing?.scheduledDate) return false;
    if (app.status === 'Pre-Parole Report Prepared') return true;
    if (typeof PMSWorkflow !== 'undefined' && PMSWorkflow.canAdvanceApplication(app, 'Hearing Scheduled').allowed) {
      return true;
    }
    return PMSStorage.isCommanderVerified(app)
      && PMSStorage.isForm2Complete(app.formData?.form2)
      && !hearing;
  }

  function eligibleForSchedule() {
    return PMSStorage.getParoleApplications().filter(isScheduleCandidate);
  }

  function queueStatus(item, index) {
    if (index === currentIndex) return { cls: 'status-current', label: 'Current' };
    if (portalMode === 'schedule' && item.hearing?.scheduledDate) {
      return { cls: 'status-upcoming', label: `Scheduled ${PMSUI.fmtDate(item.hearing.scheduledDate)}` };
    }
    if (portalMode === 'decisions' && actor && item.app) {
      const mine = PMSStorage.getBoardAssessmentForActor(item.app, actor);
      if (mine?.submissionStatus === 'Submitted') return { cls: 'status-done', label: 'Voted' };
      if (mine?.submissionStatus === 'Draft') return { cls: 'status-pending', label: 'Draft' };
    }
    if (item.app?.boardDecision || ['Refused', 'Approved', 'Parole Granted', 'Parole Refused'].includes(item.app?.status)) {
      return { cls: 'status-done', label: 'Done' };
    }
    if (!item.hearing) return { cls: 'status-pending', label: 'Pending' };
    if (item.hearing.status === 'Completed') return { cls: 'status-done', label: 'Done' };
    return { cls: 'status-upcoming', label: 'Upcoming' };
  }

  function buildQueue() {
    if (portalMode === 'schedule') {
      return eligibleForSchedule().map((app) => ({
        appId: app.id,
        app,
        prisoner: PMSStorage.getPrisonerById(app.prisonerId),
        hearing: getActiveHearing(app.id),
      }));
    }

    const seen = new Set();
    const items = [];

    if (portalMode === 'decisions') {
      PMSStorage.getHearings()
        .filter((h) => !['Cancelled'].includes(h.status))
        .sort((a, b) => new Date(a.scheduledDate || 0) - new Date(b.scheduledDate || 0))
        .forEach((h) => {
          if (!h.applicationId || seen.has(h.applicationId)) return;
          const app = PMSStorage.getApplicationById(h.applicationId);
          if (!app || !isDecisionCandidate(app)) return;
          seen.add(h.applicationId);
          items.push({
            appId: h.applicationId,
            app,
            prisoner: PMSStorage.getPrisonerById(h.prisonerId),
            hearing: h,
          });
        });
      if (currentAppId && !seen.has(currentAppId)) {
        const app = PMSStorage.getApplicationById(currentAppId);
        if (app && isDecisionCandidate(app)) {
          items.unshift({
            appId: app.id,
            app,
            prisoner: PMSStorage.getPrisonerById(app.prisonerId),
            hearing: getActiveHearing(app.id),
          });
        }
      }
      return items;
    }

    PMSStorage.getHearings()
      .filter((h) => !['Cancelled'].includes(h.status))
      .sort((a, b) => new Date(a.scheduledDate || 0) - new Date(b.scheduledDate || 0))
      .forEach((h) => {
        if (!h.applicationId || seen.has(h.applicationId)) return;
        const app = PMSStorage.getApplicationById(h.applicationId);
        if (!app) return;
        seen.add(h.applicationId);
        items.push({
          appId: h.applicationId,
          app,
          prisoner: PMSStorage.getPrisonerById(h.prisonerId),
          hearing: h,
        });
      });

    eligibleForSchedule().forEach((app) => {
      if (seen.has(app.id)) return;
      seen.add(app.id);
      items.push({
        appId: app.id,
        app,
        prisoner: PMSStorage.getPrisonerById(app.prisonerId),
        hearing: getActiveHearing(app.id),
      });
    });

    if (currentAppId && !seen.has(currentAppId)) {
      const app = PMSStorage.getApplicationById(currentAppId);
      if (app) {
        items.unshift({
          appId: app.id,
          app,
          prisoner: PMSStorage.getPrisonerById(app.prisonerId),
          hearing: getActiveHearing(app.id),
        });
      }
    }

    return items;
  }

  function renderQueue() {
    queue = buildQueue();
    $('queue-count').textContent = queue.length;
    $('session-docket').textContent = `${queue.length} case${queue.length === 1 ? '' : 's'}`;

    if (!queue.length) {
      const emptyMsg = portalMode === 'schedule'
        ? 'No cases awaiting hearing schedule. Complete Forms 1–2 and commander verification first.'
        : (portalMode === 'decisions'
          ? 'No cases ready for board decision. Hearings must be scheduled first.'
          : 'No cases in the hearing docket. After commander verification, schedule a hearing here.');
      $('queue-list').innerHTML = `<div class="log-item empty">${emptyMsg}</div>`;
      $('queue-remaining').textContent = '0 remaining';
      return;
    }

    if (currentAppId) {
      const idx = queue.findIndex((q) => q.appId === currentAppId);
      if (idx >= 0) currentIndex = idx;
    }
    currentIndex = Math.min(Math.max(currentIndex, 0), queue.length - 1);

    $('queue-list').innerHTML = queue.map((item, i) => {
      const p = item.prisoner;
      const name = p ? `${p.firstName} ${p.lastName}` : item.appId;
      const id = p?.prisonerNumber || item.app?.caseNumber || item.appId;
      const st = queueStatus(item, i);
      return `<div class="queue-item${i === currentIndex ? ' active' : ''}" data-index="${i}" data-app-id="${esc(item.appId)}" role="button" tabindex="0">
        <div>
          <div class="name">${esc(name)}</div>
          <div class="id">#${esc(id)} · ${esc(item.app?.status || '—')}</div>
        </div>
        <span class="status ${st.cls}">${st.label}</span>
      </div>`;
    }).join('');

    const remaining = queue.filter((_, i) => i >= currentIndex && queueStatus(queue[i], i).label !== 'Done').length;
    $('queue-remaining').textContent = `${remaining} remaining`;

    document.querySelectorAll('.queue-item').forEach((el) => {
      const open = () => selectCase(parseInt(el.dataset.index, 10));
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  }

  function renderDossier(app) {
    const summary = PMSStorage.getFormCompletionSummary(app);
    const docs = [
      { label: 'Form 1', ok: summary.checks.form1 },
      { label: 'Form 2 DDR/PPR', ok: summary.checks.form2 },
      { label: 'Form 3 — Hearing Record', ok: summary.checks.form3 },
      { label: 'Commander Verified', ok: PMSStorage.isCommanderVerified(app) },
      { label: 'Form 4', ok: summary.checks.form4 },
      { label: 'Form 5', ok: summary.checks.form5 },
    ];
    const complete = docs.filter((d) => d.ok).length;
    const statusEl = $('dossier-status');
    statusEl.textContent = complete === docs.length
      ? `Complete · ${complete} documents`
      : `${complete} of ${docs.length} documents`;
    statusEl.className = complete === docs.length ? 'dossier-status' : 'dossier-status incomplete';
    $('doc-list').innerHTML = docs.map((d) =>
      `<span class="doc-item${d.ok ? '' : ' missing'}">${esc(d.label)}</span>`
    ).join('');

    const attachmentsHost = $('form2-attachments');
    const attachmentList = $('form2-attachment-list');
    const form2Files = PMSStorage.getForm2AttachmentFiles(app);
    const canDownload = PMSStorage.canDownloadForm2Attachments(actor);
    if (attachmentsHost && attachmentList) {
      if (form2Files.length && canDownload) {
        attachmentsHost.hidden = false;
        attachmentList.innerHTML = form2Files.map((f) => PMSUI.renderForm2AttachmentRow(f, app.id)).join('');
      } else {
        attachmentsHost.hidden = true;
        attachmentList.innerHTML = '';
      }
    }
  }

  function renderVotes(app) {
    const progress = PMSStorage.getBoardAssessmentProgress(app);
    const assessments = PMSStorage.getBoardAssessments(app.id).filter((a) => a.submissionStatus === 'Submitted');
    let approve = 0;
    let deny = 0;
    let defer = 0;

    assessments.forEach((a) => {
      if (a.vote === 'Approved') approve += 1;
      else if (a.vote === 'Refused') deny += 1;
      else if (a.vote === 'Deferred') defer += 1;
    });

    $('vote-approve').textContent = approve;
    $('vote-deny').textContent = deny;
    $('vote-abstain').textContent = defer || progress.pendingRoles.length;
    $('vote-meta').textContent = progress.complete
      ? 'All panel assessments recorded'
      : `${progress.submitted} of ${progress.total} assessments recorded`;

    const progressEl = $('assessment-progress');
    if (progressEl) {
      progressEl.hidden = false;
      progressEl.innerHTML = PMSStorage.BOARD_ASSESSOR_ROLES.map((role) => {
        const a = assessments.find((x) => x.role === role);
        const cls = a ? 'assessment-progress__item assessment-progress__item--done' : 'assessment-progress__item';
        const roleLabel = typeof PMSBoardVote !== 'undefined' ? PMSBoardVote.getBoardMemberLabel(role) : role;
        const label = a ? `${roleLabel}: ${a.vote}${a.score != null ? ` · ${a.score}%` : ''} · ${PMSUI.fmtDate(a.submittedAt)}` : `${roleLabel}: pending`;
        return `<span class="${cls}">${esc(label)}</span>`;
      }).join('');
    }
  }

  function renderPanel(app) {
    const assessments = PMSStorage.getBoardAssessments(app.id).filter((a) => a.submissionStatus === 'Submitted');
    const byRole = Object.fromEntries(assessments.map((a) => [a.role, a]));

    $('panel-members').innerHTML = PMSStorage.BOARD_ASSESSOR_ROLES.map((role) => {
      const a = byRole[role];
      const user = a?.assessorId
        ? PMSStorage.getUserById(a.assessorId)
        : PMSStorage.getUsers().find((u) => u.role === role && u.status === 'Active');
      const name = a?.assessorName || (user ? `${user.firstName} ${user.lastName}` : role);
      const position = typeof PMSBoardVote !== 'undefined'
        ? PMSBoardVote.formatBoardPosition(a || user || { role })
        : (a?.boardPosition || user?.boardPosition || role);
      let voteHtml = '<span class="pending">Awaiting submission</span>';
      if (a) {
        voteHtml = a.vote === 'Approved'
          ? `<span class="approved">${a.vote}${a.score != null ? ` · ${a.score}%` : ''}</span>`
          : a.vote === 'Deferred'
            ? `<span class="pending">${a.vote}</span>`
            : `<span class="denied">${a.vote}${a.score != null ? ` · ${a.score}%` : ''}</span>`;
      }

      return `<div class="panel-member${a ? ' panel-member--done' : ''}">
        <div class="avatar">${esc(initials(name.split(' ')[0], name.split(' ')[1] || ''))}</div>
        <div class="info">
          <div class="name">${esc(name)}</div>
          <div class="role">${esc(position)}</div>
        </div>
        <div class="vote-indicator">${voteHtml}</div>
      </div>`;
    }).join('');
  }

  function renderAudit(app) {
    if (portalMode === 'schedule' || portalMode === 'decisions') return;
    const trail = $('audit-trail');
    if (!trail) return;
    const events = PMSStorage.getCaseTimeline(app.id).slice(-8).reverse();
    trail.innerHTML = events.length
      ? events.map((e) => {
        const t = e.at ? new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
        return `<div class="log-item"><span>${esc(e.stage)}</span><span class="time">${esc(t)}</span></div>`;
      }).join('')
      : '<div class="log-item empty">No audit events yet.</div>';
  }

  function renderDeadline(app, hearing) {
    const alert = $('deadline-alert');
    if (!alert) return;
    const info = PMSStorage.getHearingDeadlineInfo(app);
    if (!info) {
      alert.hidden = true;
      return;
    }

    alert.hidden = false;
    alert.className = 'deadline-alert';
    if (hearing?.scheduledDate) {
      alert.classList.add('scheduled');
      alert.textContent = `Hearing scheduled ${PMSUI.fmtDate(hearing.scheduledDate)}${hearing.scheduledTime ? ` at ${hearing.scheduledTime}` : ''} · Deadline ${PMSUI.fmtDate(info.deadlineAt)}`;
    } else if (info.overdue) {
      alert.classList.add('overdue');
      alert.textContent = `Hearing deadline exceeded (${Math.abs(info.daysRemaining)} days overdue). Schedule immediately or record an authorized exception.`;
    } else {
      alert.textContent = `${info.daysRemaining} day(s) remaining to schedule within the 14-day requirement (deadline: ${PMSUI.fmtDate(info.deadlineAt)}).`;
    }
  }

  function renderScheduleReadOnly(app, hearing) {
    const area = $('schedule-readonly');
    if (!area) return;
    if (portalMode === 'schedule') {
      area.hidden = true;
      return;
    }
    area.hidden = canSchedule;
    if (canSchedule) return;

    const pending = isScheduleCandidate(app) && !hearing;
    area.innerHTML = `
      <label class="section-title">Hearing Schedule</label>
      <p class="schedule-readonly-note">Only the <strong>DJAG Secretary</strong> may set the parole hearing date. You can review the dossier and record assessments here.</p>
      ${hearing ? `
        <dl class="schedule-readonly-details">
          <div><dt>Date</dt><dd>${esc(PMSUI.fmtDate(hearing.scheduledDate))}${hearing.scheduledTime ? ` · ${esc(hearing.scheduledTime)}` : ''}</dd></div>
          <div><dt>Venue</dt><dd>${esc(hearing.location || '—')}</dd></div>
          <div><dt>Status</dt><dd>${esc(hearing.status || 'Scheduled')}</dd></div>
        </dl>` : pending
        ? '<p class="schedule-readonly-pending">Awaiting DJAG Secretary to schedule this hearing (within 14 days of commander verification).</p>'
        : '<p class="schedule-readonly-pending">No hearing date set for this case.</p>'}`;
  }

  function renderScheduleForm(app, hearing) {
    renderScheduleReadOnly(app, hearing);
    const area = $('schedule-area');
    if (!area) return;
    if (portalMode === 'decisions') return;
    area.hidden = !canSchedule;
    if (!canSchedule) return;

    const showForm = !hearing || SCHEDULABLE_STATUSES.includes(app.status) || app.status === 'Hearing Scheduled';
    area.style.display = showForm ? 'block' : 'none';

    const draft = JSON.parse(localStorage.getItem(draftKey(app.id)) || 'null');
    const split = typeof PMSStorage.splitHearingScheduleNotes === 'function'
      ? PMSStorage.splitHearingScheduleNotes(hearing)
      : { notes: hearing?.notes || hearing?.meetingNotes || '', exceptionReason: hearing?.exceptionReason || '', deadlineException: !!hearing?.deadlineException };
    $('hearing-date').value = hearing?.scheduledDate || draft?.scheduledDate || '';
    $('hearing-time').value = hearing?.scheduledTime || draft?.scheduledTime || (hearing ? '' : '09:00');
    $('hearing-venue').value = hearing?.location || draft?.location || '';
    $('hearing-notes').value = hearing ? split.notes : (draft?.notes || '');
    $('deadline-exception').checked = hearing ? split.deadlineException : !!(draft?.deadlineException);
    $('exception-reason').hidden = !$('deadline-exception').checked;
    $('exception-reason').value = hearing ? split.exceptionReason : (draft?.exceptionReason || '');

    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    $('hearing-date').min = minDate.toISOString().slice(0, 10);

    $('btn-schedule').textContent = hearing ? 'Update & Notify' : 'Schedule & Notify';
    $('btn-cancel').hidden = !hearing;
    $('btn-save-draft').hidden = false;
  }

  function updateOpenFormButton(app) {
    const btn = $('btn-open-form');
    if (!btn) return;
    const outcome = PMSStorage.getBoardDecisionOutcome(app);
    const progress = PMSStorage.getBoardAssessmentProgress(app);
    const show = progress.complete && PMSStorage.isBoardDecisionFinalized(app);
    btn.hidden = !show;
    if (!show) return;
    if (outcome === 'Parole Granted') {
      btn.textContent = 'Open Form 4 — Discharge of Parole Order';
    } else if (outcome === 'Parole Refused') {
      btn.textContent = 'Open Form 5 — Applications After Refusal';
    }
  }

  function getOutcomeFormNumber(outcome) {
    if (outcome === 'Parole Granted') return 4;
    if (outcome === 'Parole Refused') return 5;
    return null;
  }

  function outcomeFormLabel(formN) {
    return formN === 4
      ? 'Open Form 4 — Discharge of Parole Order'
      : 'Open Form 5 — Applications After Refusal';
  }

  function openOutcomeForm(formN) {
    if (!formN || !currentAppId) return;
    if (typeof PMSForms !== 'undefined') {
      PMSForms.openForm(formN, currentAppId);
    } else if (typeof PMSFormWorkflow !== 'undefined') {
      PMSFormWorkflow.openForm(formN, currentAppId);
    }
  }

  function seatLabel(role) {
    return typeof PMSBoardVote !== 'undefined' ? PMSBoardVote.getBoardMemberLabel(role) : role;
  }

  function seatLabels(roles) {
    return (roles || []).map(seatLabel).join(', ');
  }

  /** Per-seat vote breakdown shown directly above the overall board outcome. */
  function renderPanelTally(app, show) {
    const block = $('panel-tally');
    if (!block) return;
    block.hidden = !show;
    if (!show) return;

    const all = PMSStorage.getBoardAssessments(app.id);
    const byRole = {};
    const draftByRole = {};
    all.forEach((a) => {
      if (a.submissionStatus === 'Submitted') byRole[a.role] = a;
      else if (a.submissionStatus === 'Draft') draftByRole[a.role] = a;
    });

    $('panel-tally-list').innerHTML = PMSStorage.BOARD_ASSESSOR_ROLES.map((role) => {
      const a = byRole[role];
      const draft = draftByRole[role];
      const user = (a || draft)?.assessorId
        ? PMSStorage.getUserById((a || draft).assessorId)
        : PMSStorage.getUsers().find((u) => u.role === role && u.status === 'Active');
      const name = a?.assessorName || draft?.assessorName || (user ? `${user.firstName} ${user.lastName}` : '—');
      const seat = typeof PMSBoardVote !== 'undefined' ? PMSBoardVote.getBoardMemberLabel(role) : role;
      const isMe = ((a || draft)?.assessorId || user?.id) === actor?.id;
      const voteLabel = (v) => (typeof PMSBoardVote !== 'undefined' ? PMSBoardVote.formatVoteLabel(v) : v);
      let variant = 'pending';
      let status = 'Not voted yet';
      if (a) {
        variant = typeof PMSBoardVote !== 'undefined' ? PMSBoardVote.voteVariant(a.vote) : 'defer';
        status = `${voteLabel(a.vote)}${a.score != null ? ` · ${a.score}%` : ''}`;
      } else if (draft?.vote) {
        status = `Draft — ${voteLabel(draft.vote)}`;
      }
      return `<div class="panel-tally__row panel-tally__row--${variant}">
        <span class="panel-tally__seat">${esc(seat)}${isMe ? ' (you)' : ''}</span>
        <span class="panel-tally__name">${esc(name)}</span>
        <span class="panel-tally__vote">${esc(status)}</span>
      </div>`;
    }).join('');

    const progress = PMSStorage.getBoardAssessmentProgress(app);
    const tally = PMSStorage.calculateBoardVotes(app);
    const counts = `Approve ${tally.votes.Approved} · Deny ${tally.votes.Refused} · Defer ${tally.votes.Deferred}`;
    $('panel-tally-summary').textContent = progress.complete
      ? `All ${progress.total} votes submitted — ${counts}.`
      : `${progress.submitted} of ${progress.total} votes submitted — ${counts}. Awaiting: ${seatLabels(progress.pendingRoles)}.`;
  }

  /**
   * Overall board outcome shown under every member's vote panel. All members see
   * the panel result; only the Board Chairman (DJAG Secretary) can issue Form 4/5.
   * The enabled button follows the panel majority.
   */
  function renderFinalOutcome(app) {
    const block = $('final-outcome');
    if (!block) return;
    const approveBtn = $('btn-final-approve');
    const rejectBtn = $('btn-final-reject');
    const openBtn = $('btn-final-open-form');
    const note = $('final-outcome-note');
    const title = $('final-outcome-title');
    const actions = block.querySelector('.final-outcome__actions');

    const show = portalMode === 'decisions' && canAssess && DECISION_STATUSES.includes(app?.status);
    block.hidden = !show;
    renderPanelTally(app, show);
    if (!show) return;

    const setBtn = (btn, enabled, reason) => {
      btn.disabled = !enabled;
      btn.title = reason;
      btn.classList.toggle('final-outcome__btn--active', enabled);
    };

    const progress = PMSStorage.getBoardAssessmentProgress(app);
    const outcome = PMSStorage.getBoardDecisionOutcome(app);
    const formN = getOutcomeFormNumber(outcome);
    const tally = PMSStorage.calculateBoardVotes(app);
    const recorded = app.boardDecision?.outcome;
    const decidedBy = app.boardDecision?.decidedByName || '—';
    const decidedAt = app.boardDecision?.decidedAt ? ` on ${PMSUI.fmtDate(app.boardDecision.decidedAt)}` : '';

    if (title) {
      title.textContent = canGrantOutcome
        ? 'Overall Board Decision — Chairman'
        : 'Overall Board Decision';
    }

    // Members other than the Chairman vote only; no grant/refuse action for them.
    if (!canGrantOutcome) {
      if (actions) actions.hidden = true;
      openBtn.hidden = true;
      if (recorded) {
        note.textContent = `Recorded: ${recorded} — issued by ${decidedBy}${decidedAt}.`;
      } else if (!progress.complete) {
        note.textContent = `Awaiting votes from: ${seatLabels(progress.pendingRoles)}. The DJAG Secretary (Board Chairman) issues Form 4 or Form 5 once all votes are in.`;
      } else if (!formN) {
        note.textContent = `All votes are in (${tally.calculation}) — the panel outcome is Deferred, so no outcome form applies yet.`;
      } else {
        note.textContent = `All votes are in (${tally.calculation}). Panel majority: ${outcome}. Only the DJAG Secretary (Board Chairman) can issue Form ${formN}.`;
      }
      return;
    }

    if (actions) actions.hidden = false;

    if (recorded) {
      note.textContent = `Recorded: ${recorded} — confirmed by ${decidedBy}${decidedAt}.${formN ? ` Complete Form ${formN}.` : ''}`;
      setBtn(approveBtn, false, 'Overall decision already recorded');
      setBtn(rejectBtn, false, 'Overall decision already recorded');
      openBtn.hidden = !formN;
      if (formN) openBtn.textContent = outcomeFormLabel(formN);
      return;
    }

    openBtn.hidden = true;

    if (!progress.complete) {
      note.textContent = `Unlocks once all ${progress.total} board votes are submitted. Awaiting: ${seatLabels(progress.pendingRoles)}.`;
      setBtn(approveBtn, false, 'Awaiting all board votes');
      setBtn(rejectBtn, false, 'Awaiting all board votes');
      return;
    }

    if (!formN) {
      note.textContent = `All votes are in (${tally.calculation}) but the panel outcome is Deferred, so neither Form 4 nor Form 5 applies yet.`;
      setBtn(approveBtn, false, 'Panel outcome is Deferred');
      setBtn(rejectBtn, false, 'Panel outcome is Deferred');
      return;
    }

    const majorityIsGrant = outcome === 'Parole Granted';
    note.textContent = `All votes are in (${tally.calculation}). Panel majority: ${outcome}. Confirm below to issue Form ${formN}.`;
    setBtn(approveBtn, majorityIsGrant, majorityIsGrant
      ? 'Record grant and open Form 4'
      : 'Panel majority refused parole');
    setBtn(rejectBtn, !majorityIsGrant, majorityIsGrant
      ? 'Panel majority granted parole'
      : 'Record refusal and open Form 5');
  }

  async function finalizeBoardOutcome(outcome) {
    if (!currentAppId) return;
    if (!canGrantOutcome) {
      showToast('Only the DJAG Secretary (Board Chairman) may issue Form 4 or Form 5.');
      return;
    }
    const app = PMSStorage.getApplicationById(currentAppId);
    if (!app) return;
    const panelOutcome = PMSStorage.getBoardDecisionOutcome(app);
    if (panelOutcome !== outcome) {
      showToast(panelOutcome
        ? `Panel majority is ${panelOutcome} — you cannot record ${outcome}.`
        : 'All board votes must be submitted before the overall decision.');
      return;
    }
    const formN = getOutcomeFormNumber(outcome);
    try {
      await PMSStorage.recordBoardDecision(currentAppId, { outcome }, actor);
      showToast(`Overall decision recorded: ${outcome}. Opening Form ${formN}.`);
      renderQueue();
      selectCase(currentIndex);
      openOutcomeForm(formN);
    } catch (err) {
      showToast(err.message || 'Could not record the overall decision.');
    }
  }

  function getForm2Sections(app) {
    return {
      ppr: app?.formData?.form2?.sections?.ppr || {},
      ddr: app?.formData?.form2?.sections?.ddr || {},
    };
  }

  function getClaimReportedText(app, claim) {
    const sections = getForm2Sections(app);
    const data = sections[claim.section] || {};
    const val = data[claim.field];
    if (val == null || val === '') return '— No report on file —';
    return String(val).length > 280 ? `${String(val).slice(0, 280)}…` : String(val);
  }

  function readClaimVerificationFromDom() {
    return FORM2_CLAIMS.map((claim) => {
      const card = document.querySelector(`.claim-card[data-claim-id="${claim.id}"]`);
      const status = card?.querySelector('.claim-toggle.is-selected')?.dataset.status || '';
      const notes = card?.querySelector('.claim-card__notes')?.value.trim() || '';
      return {
        id: claim.id,
        label: claim.label,
        section: claim.section,
        field: claim.field,
        status,
        notes,
      };
    });
  }

  function isPsychiatristActor() {
    return typeof PMSBoardVote !== 'undefined' && PMSBoardVote.isPsychiatrist(actor);
  }

  function getDoctorAssessment(app) {
    if (!app) return null;
    if (isPsychiatristActor()) {
      return PMSStorage.getBoardAssessmentForActor(app, actor)
        || PMSStorage.getBoardAssessmentEntryForRole(app, 'Doctor');
    }
    return PMSStorage.getBoardAssessmentEntryForRole(app, 'Doctor');
  }

  function getPsychObservationRecord(app) {
    return getDoctorAssessment(app)?.psychiatricObservation || {};
  }

  function readPsychiatricObservation() {
    if (!isPsychiatristActor()) return null;
    const panel = $('psych-panel-body');
    const indicators = {};
    BEHAVIORAL_INDICATORS.forEach((ind) => {
      const selected = panel?.querySelector(`.interview-scale__btn[data-indicator="${ind.id}"].is-selected`)
        || panel?.querySelector(`.psych-dot[data-indicator="${ind.id}"].is-selected`);
      indicators[ind.id] = selected ? Number(selected.dataset.value) : null;
    });
    return {
      indicators,
      demeanor: panel?.querySelector('.demeanor-chip.is-selected')?.dataset.demeanor || '',
      clinicalNotes: $('psych-clinical-notes')?.value.trim() || '',
    };
  }

  function buildInterviewNotes() {
    const claims = readClaimVerificationFromDom().filter((c) => c.status);
    const parts = [];
    if (isPsychiatristActor()) {
      const psych = readPsychiatricObservation();
      if (psych?.clinicalNotes) parts.push(`Clinical: ${psych.clinicalNotes}`);
      if (psych?.demeanor) parts.push(`Demeanor: ${psych.demeanor}`);
      const rated = Object.entries(psych?.indicators || {}).filter(([, v]) => v);
      if (rated.length) {
        parts.push(`Behavioral indicators: ${rated.map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }
    }
    if (claims.length) {
      parts.push(`Verification: ${claims.map((c) => `${c.label}=${c.status}`).join('; ')}`);
    }
    return parts.join('\n');
  }

  function buildSessionExtras() {
    const notes = buildInterviewNotes();
    return {
      claimVerification: readClaimVerificationFromDom(),
      psychiatricObservation: isPsychiatristActor() ? readPsychiatricObservation() : null,
      interviewNotes: notes || undefined,
      observations: notes || undefined,
    };
  }

  function isClaimVerificationPersisted(app) {
    if (!isPsychiatristActor()) return true;
    const saved = PMSStorage.getBoardAssessmentForActor(app, actor);
    if (!saved?.digitalSignature?.verified) return false;
    const claims = saved.claimVerification || [];
    return claims.filter((c) => c.status).length >= FORM2_CLAIMS.length;
  }

  function updateClaimVerificationStatus(app = null) {
    const statusEl = $('claim-verification-status');
    if (!statusEl) return;
    const claims = readClaimVerificationFromDom();
    const verified = claims.filter((c) => c.status).length;
    let label = verified ? `${verified} of ${claims.length} verified` : 'Not started';
    const resolvedApp = app || (currentAppId ? PMSStorage.getApplicationById(currentAppId) : null);
    if (resolvedApp && isClaimVerificationPersisted(resolvedApp)) label += ' · saved';
    statusEl.textContent = label;
    syncInterviewSubmitGate();
  }

  function destroyInterviewOfficerAuth() {
    interviewOfficerAuth?.reset();
    interviewOfficerAuth = null;
    interviewSubmitGate = null;
    const mount = $('claim-verification-auth-mount');
    if (mount) mount.innerHTML = '';
  }

  function destroyPsychOfficerAuth() {
    psychOfficerAuth?.reset();
    psychOfficerAuth = null;
    psychSubmitGate = null;
    const mount = $('psych-observation-auth-mount');
    if (mount) mount.innerHTML = '';
  }

  function destroyVoteOfficerAuth() {
    voteOfficerAuth?.reset();
    voteOfficerAuth = null;
    voteSubmitGate = null;
    const mount = $('vote-officer-auth-mount');
    if (mount) mount.innerHTML = '';
  }

  function destroyAllInterviewAuth() {
    destroyInterviewOfficerAuth();
    destroyPsychOfficerAuth();
    destroyVoteOfficerAuth();
  }

  function syncInterviewSubmitGate() {
    interviewSubmitGate?.sync();
    psychSubmitGate?.sync();
    voteSubmitGate?.sync();
    renderSubmitBlocker();
  }

  /** Spell out on screen why Submit My Vote is disabled — a tooltip alone is easy to miss. */
  function renderSubmitBlocker() {
    const el = $('assessor-submit-blocker');
    const btn = $('btn-record-decision');
    if (!el || !btn) return;
    const reason = btn.disabled ? btn.title.replace(/\s*\.$/, '') : '';
    el.hidden = !reason;
    el.textContent = reason ? `Before you can submit: ${reason}.` : '';
  }

  function refreshInterviewSaveState(app) {
    if (!app) return;
    app = PMSStorage.getApplicationById(app.id) || app;
    updateClaimVerificationStatus(app);
    updatePsychObservationStatus();
    renderDecisionArea(app);
    mountInterviewOfficerAuth(app);
    mountPsychOfficerAuth(app);
    mountVoteOfficerAuth(app);
    syncInterviewSubmitGate();
  }

  function mountInterviewOfficerAuth(app) {
    destroyInterviewOfficerAuth();
    if (portalMode !== 'decisions' || !canAssess || typeof PMSFormOfficerAuth === 'undefined') return;
    const mount = $('claim-verification-auth-mount');
    if (!mount) return;
    const saved = PMSStorage.getBoardAssessmentForActor(app, actor);
    const roleLabel = typeof PMSBoardVote !== 'undefined'
      ? PMSBoardVote.getBoardMemberLabel(actor.role)
      : (actor.role || 'Board Member');
    const readOnly = saved?.submissionStatus === 'Submitted' && isClaimVerificationPersisted(app);
    try {
      interviewOfficerAuth = PMSFormOfficerAuth.create({
        mount,
        heading: `${String(roleLabel).toUpperCase()} AUTHORIZATION`,
        actor,
        applicationId: app.id,
        formNumber: 'board-claim-verification',
        payloadSeed: 'form2-claim-verification',
        savedRecord: saved?.digitalSignature || null,
        readOnly,
        onVerified: () => syncInterviewSubmitGate(),
      });
      interviewSubmitGate = PMSFormOfficerAuth.gateSubmitButtons(interviewOfficerAuth, [
        'btn-save-claim-verification',
      ], {
        pinTitle: 'Enter your 6-digit PIN and Verify & Sign before saving verification',
      });
      syncInterviewSubmitGate();
    } catch (err) {
      console.error('Board interview officer auth failed:', err);
    }
  }

  function mountVoteOfficerAuth(app) {
    destroyVoteOfficerAuth();
    const host = $('assessor-vote-auth');
    if (portalMode !== 'decisions' || !canAssess || typeof PMSFormOfficerAuth === 'undefined') {
      if (host) host.hidden = true;
      return;
    }
    if (host) host.hidden = false;
    const mount = $('vote-officer-auth-mount');
    if (!mount) return;
    const saved = PMSStorage.getBoardAssessmentForActor(app, actor);
    const roleLabel = typeof PMSBoardVote !== 'undefined'
      ? PMSBoardVote.getBoardMemberLabel(actor.role)
      : (actor.role || 'Board Member');
    const readOnly = saved?.submissionStatus === 'Submitted';
    try {
      voteOfficerAuth = PMSFormOfficerAuth.create({
        mount,
        heading: `${String(roleLabel).toUpperCase()} — VOTE AUTHORIZATION`,
        actor,
        applicationId: app.id,
        formNumber: 'board-vote',
        payloadSeed: 'board-member-vote',
        savedRecord: saved?.digitalSignature || null,
        readOnly,
        onVerified: () => syncInterviewSubmitGate(),
      });
      voteSubmitGate = PMSFormOfficerAuth.gateSubmitButtons(voteOfficerAuth, [
        'btn-save-assessment',
        'btn-record-decision',
      ], {
        pinTitle: 'Enter your 6-digit PIN and Verify & Sign before saving your vote',
        canEnable: (btn) => canEnableInterviewVoteButtons(btn),
        getDisabledReason: (btn) => getInterviewVoteDisabledReason(btn),
      });
      syncInterviewSubmitGate();
    } catch (err) {
      console.error('Board vote officer auth failed:', err);
    }
  }

  function mountPsychOfficerAuth(app) {
    const actions = $('psych-observation-actions');
    const signatureBlock = $('psych-signature-block');
    const signatureNote = $('psych-signature-note');
    const saveBtn = $('btn-save-psych-observation');
    const mount = $('psych-observation-auth-mount');
    const readonlyView = !isPsychiatristActor();

    if (portalMode !== 'decisions' || !canAssess || !mount) {
      if (actions) actions.hidden = true;
      return;
    }

    destroyPsychOfficerAuth();
    if (actions) actions.hidden = false;

    const doctorAssessment = getDoctorAssessment(app);
    const savedSignature = doctorAssessment?.psychDigitalSignature || null;
    const signed = !!(savedSignature?.verified && doctorAssessment?.psychiatricObservationSavedAt);

    if (readonlyView) {
      if (signatureBlock) signatureBlock.hidden = false;
      if (signatureNote) {
        signatureNote.textContent = signed
          ? 'Psychiatrist\'s digitally signed interview evaluation for this case.'
          : 'Interview evaluation has not been signed by the psychiatrist yet.';
      }
      if (saveBtn) saveBtn.hidden = true;
      if (!signed || typeof PMSFormOfficerAuth === 'undefined') {
        mount.innerHTML = signed
          ? '<p class="psych-signature-block__empty">Signed evaluation record unavailable.</p>'
          : '<p class="psych-signature-block__empty">Awaiting psychiatrist signature.</p>';
        return;
      }
      try {
        psychOfficerAuth = PMSFormOfficerAuth.create({
          mount,
          heading: 'PSYCHIATRIST DIGITAL SIGNATURE',
          actor: { firstName: doctorAssessment?.assessorName?.split(' ')[0] || 'Psychiatrist', lastName: doctorAssessment?.assessorName?.split(' ').slice(1).join(' ') || '', role: 'Doctor', id: doctorAssessment?.assessorId, officerId: savedSignature?.officerId },
          applicationId: app.id,
          formNumber: 'board-interview-evaluation',
          payloadSeed: 'psychiatric-interview-evaluation',
          savedRecord: savedSignature,
          readOnly: true,
        });
      } catch (err) {
        console.error('Psychiatrist signature display failed:', err);
        mount.innerHTML = '<p class="psych-signature-block__empty">Could not load signed evaluation record.</p>';
      }
      return;
    }

    if (typeof PMSFormOfficerAuth === 'undefined') {
      mount.innerHTML = '<p class="auth-load-error">Signing module failed to load. Please refresh the page.</p>';
      if (saveBtn) saveBtn.disabled = true;
      return;
    }

    if (signatureBlock) signatureBlock.hidden = false;
    if (signatureNote) {
      signatureNote.hidden = false;
      signatureNote.textContent = 'Enter your 6-digit PIN and click Verify & Sign to digitally sign this interview evaluation before saving.';
    }
    if (saveBtn) saveBtn.hidden = false;

    const saved = PMSStorage.getBoardAssessmentForActor(app, actor);
    const readOnly = signed;
    try {
      psychOfficerAuth = PMSFormOfficerAuth.create({
        mount,
        heading: 'PSYCHIATRIST AUTHORIZATION',
        actor,
        applicationId: app.id,
        formNumber: 'board-interview-evaluation',
        payloadSeed: 'psychiatric-interview-evaluation',
        savedRecord: saved?.psychDigitalSignature || savedSignature || null,
        readOnly,
        onVerified: () => syncInterviewSubmitGate(),
      });
      psychSubmitGate = PMSFormOfficerAuth.gateSubmitButtons(psychOfficerAuth, ['btn-save-psych-observation'], {
        pinTitle: 'Enter your 6-digit PIN and Verify & Sign before saving evaluation',
        canEnable: () => isPsychObservationFormComplete(),
      });
      syncInterviewSubmitGate();
    } catch (err) {
      console.error('Psychiatrist officer auth failed:', err);
      mount.innerHTML = '<p class="auth-load-error">Could not load verification block. Please refresh the page.</p>';
      if (saveBtn) saveBtn.disabled = true;
    }
  }

  function isPsychObservationPersisted(app) {
    const doctorAssessment = getDoctorAssessment(app);
    if (!doctorAssessment?.psychiatricObservationSavedAt) return false;
    if (!doctorAssessment.psychDigitalSignature?.verified) return false;
    const psych = doctorAssessment.psychiatricObservation || {};
    const rated = Object.values(psych.indicators || {}).filter((v) => v).length;
    return rated >= BEHAVIORAL_INDICATORS.length && !!(psych.clinicalNotes || psych.demeanor);
  }

  function requireInterviewPin(message) {
    if (typeof PMSFormOfficerAuth === 'undefined') return true;
    return PMSFormOfficerAuth.requireVerified(interviewOfficerAuth, {
      message: message || 'Enter your 6-digit PIN and click Verify & Sign before saving.',
      showToast: showToast,
    });
  }

  function requirePsychPin(message) {
    if (typeof PMSFormOfficerAuth === 'undefined') return true;
    return PMSFormOfficerAuth.requireVerified(psychOfficerAuth, {
      message: message || 'Enter your 6-digit PIN and click Verify & Sign before saving evaluation.',
      showToast: showToast,
    });
  }

  function requireVotePin(message) {
    if (typeof PMSFormOfficerAuth === 'undefined') return true;
    return PMSFormOfficerAuth.requireVerified(voteOfficerAuth, {
      message: message || 'Enter your 6-digit PIN and click Verify & Sign before submitting your vote.',
      showToast: showToast,
    });
  }

  function isPsychObservationFormComplete() {
    if (!isPsychiatristActor()) return false;
    const psych = readPsychiatricObservation();
    const rated = Object.values(psych.indicators || {}).filter((v) => v).length;
    return rated >= BEHAVIORAL_INDICATORS.length && !!psych.demeanor && !!psych.clinicalNotes;
  }

  function isVotingOpen(app) {
    if (!app) return false;
    if (['Parole Granted', 'Parole Refused', 'Pending Approval', 'Approved', 'Released', 'Refused'].includes(app.status)) {
      return !!app.boardDecision?.outcome;
    }
    if (['Hearing In Progress', 'Pending Board Review', 'Hearing Scheduled'].includes(app.status)) return true;
    if (typeof PMSStorage.isHearingSessionOpen === 'function' && PMSStorage.isHearingSessionOpen(app)) return true;
    return !!getActiveHearing(app.id)?.scheduledDate;
  }

  function votingClosedReason(app) {
    const session = typeof PMSStorage.getHearingSession === 'function'
      ? PMSStorage.getHearingSession(app)
      : null;
    if (session?.scheduledDate) {
      const when = `${PMSUI.fmtDate(session.scheduledDate)}${session.scheduledTime ? ` · ${session.scheduledTime}` : ''}`;
      return `The DJAG Secretary must start this prisoner's hearing session before votes can be recorded (scheduled ${when})`;
    }
    return app?.status === 'Hearing Scheduled'
      ? 'The DJAG Secretary must start this prisoner\'s hearing session before votes can be recorded'
      : 'Board voting is not open for this case';
  }

  function canEnableSaveVoteDraft(btn) {
    if (portalMode !== 'decisions' || !canAssess) return false;
    const app = currentAppId ? PMSStorage.getApplicationById(currentAppId) : null;
    if (!app) return false;
    return isVotingOpen(app);
  }

  function getSubmitVoteValidation() {
    if (typeof PMSBoardVote === 'undefined') {
      const vote = $('assessment-vote')?.value || '';
      return vote
        ? { valid: true }
        : { valid: false, message: 'Please select Approve, Deny, or Defer.' };
    }
    return PMSBoardVote.validateSubmit(PMSBoardVote.readFormValues(), actor);
  }

  function canEnableSubmitVote(btn) {
    if (portalMode !== 'decisions' || !canAssess) return false;
    const app = currentAppId ? PMSStorage.getApplicationById(currentAppId) : null;
    if (!app) return false;
    if (!isVotingOpen(app)) return false;
    if (isPsychiatristActor() && !isClaimVerificationPersisted(app)) return false;
    if (isPsychiatristActor() && !isPsychObservationPersisted(app)) return false;
    return getSubmitVoteValidation().valid;
  }

  function getInterviewVoteDisabledReason(btn) {
    if (portalMode !== 'decisions' || !canAssess) return 'Not available for your role';
    const app = currentAppId ? PMSStorage.getApplicationById(currentAppId) : null;
    if (!app) return 'Select a case first';

    if (btn?.id === 'btn-save-assessment') {
      if (!isVotingOpen(app)) return votingClosedReason(app);
      return 'Enter your 6-digit PIN and Verify & Sign before saving your vote';
    }

    if (btn?.id === 'btn-record-decision') {
      if (!isVotingOpen(app)) return votingClosedReason(app);
      if (!isClaimVerificationPersisted(app)) {
        return 'Mark all 10 Form 2 claims, sign with your PIN, then click Save Verification';
      }
      if (isPsychiatristActor() && !isPsychObservationPersisted(app)) {
        return 'Complete the interview evaluation (all 1–5 ratings, demeanour, clinical notes), sign, then click Save Interview Evaluation';
      }
      const submitCheck = getSubmitVoteValidation();
      if (!submitCheck.valid) return submitCheck.message || 'Complete your vote below';
      return 'Enter your 6-digit PIN and Verify & Sign before submitting your vote';
    }

    return 'Complete required steps before continuing';
  }

  function canEnableInterviewVoteButtons(btn) {
    if (btn?.id === 'btn-save-assessment') return canEnableSaveVoteDraft(btn);
    if (btn?.id === 'btn-record-decision') return canEnableSubmitVote(btn);
    return canEnableSubmitVote(btn);
  }

  function saveClaimVerification() {
    if (!currentAppId || !canAssess) return false;
    const app = PMSStorage.getApplicationById(currentAppId);
    if (!app) return false;
    const claims = readClaimVerificationFromDom();
    const verified = claims.filter((c) => c.status).length;
    if (verified === 0) {
      showToast('Mark at least one claim as Consistent, Partial, or Inconsistent.');
      return false;
    }
    if (verified < FORM2_CLAIMS.length) {
      showToast(`Complete all ${FORM2_CLAIMS.length} claim verifications before saving.`);
      return false;
    }
    if (!requireInterviewPin('Enter your 6-digit PIN and click Verify & Sign before saving verification.')) {
      return false;
    }
    try {
      attachPendingPsychFile();
      const payload = buildAssessmentPayload('Draft');
      payload.claimVerification = readClaimVerificationFromDom();
      payload.claimVerificationSavedAt = new Date().toISOString();
      payload.digitalSignature = interviewOfficerAuth?.getRecord() || payload.digitalSignature;
      if (!payload.digitalSignature?.verified) {
        showToast('Verify & Sign with your PIN before saving verification.');
        return false;
      }
      PMSStorage.saveBoardAssessment(currentAppId, payload, actor);
      showToast('Form 2 verification saved and digitally signed.');
      refreshInterviewSaveState(app);
      return true;
    } catch (err) {
      showToast(err.message || 'Could not save verification.');
      return false;
    }
  }

  function savePsychObservation() {
    if (!currentAppId || !isPsychiatristActor()) return false;
    const app = PMSStorage.getApplicationById(currentAppId);
    if (!app) return false;
    const psych = readPsychiatricObservation();
    const rated = Object.values(psych.indicators || {}).filter((v) => v).length;
    if (rated < BEHAVIORAL_INDICATORS.length) {
      showToast(`Rate all ${BEHAVIORAL_INDICATORS.length} interview indicators (1–5) before saving.`);
      return false;
    }
    if (!psych.demeanor) {
      showToast('Select overall demeanor before saving.');
      $('demeanor-chips')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    if (!psych.clinicalNotes) {
      showToast('Enter clinical notes before saving.');
      $('psych-clinical-notes')?.focus();
      return false;
    }
    if (!requirePsychPin()) return false;
    const signature = psychOfficerAuth?.getRecord();
    if (!signature?.verified) {
      showToast('Verify & Sign with your PIN before saving the interview evaluation.');
      return false;
    }
    try {
      attachPendingPsychFile();
      const payload = buildAssessmentPayload('Draft');
      payload.psychiatricObservation = psych;
      payload.psychiatricObservationSavedAt = new Date().toISOString();
      payload.psychDigitalSignature = signature;
      PMSStorage.saveBoardAssessment(currentAppId, payload, actor);
      showToast('Interview evaluation saved and digitally signed.');
      refreshInterviewSaveState(PMSStorage.getApplicationById(currentAppId));
      return true;
    } catch (err) {
      showToast(err.message || 'Could not save interview evaluation.');
      return false;
    }
  }

  function updatePsychObservationStatus(savedPsych) {
    const statusEl = $('psych-observation-status');
    if (!statusEl) return;
    const psych = savedPsych
      || (isPsychiatristActor() ? readPsychiatricObservation() : null)
      || {};
    const rated = Object.values(psych.indicators || {}).filter((v) => v).length;
    const app = currentAppId ? PMSStorage.getApplicationById(currentAppId) : null;
    const persisted = app && isPsychObservationPersisted(app);
    if (persisted) {
      statusEl.textContent = `${BEHAVIORAL_INDICATORS.length}/${BEHAVIORAL_INDICATORS.length} rated · signed & saved`;
      syncInterviewSubmitGate();
      return;
    }
    if (psych.demeanor || psych.clinicalNotes) {
      statusEl.textContent = rated
        ? `${rated}/${BEHAVIORAL_INDICATORS.length} rated · ${psych.demeanor || 'notes entered'}`
        : (psych.demeanor || 'Notes entered');
    } else {
      statusEl.textContent = rated ? `${rated} of ${BEHAVIORAL_INDICATORS.length} rated` : 'Not rated';
    }
    syncInterviewSubmitGate();
  }

  function renderClaimVerification(app) {
    const listEl = $('claims-list');
    if (!listEl) return;
    const saved = PMSStorage.getBoardAssessmentForActor(app, actor)?.claimVerification || [];
    const savedById = Object.fromEntries(saved.map((c) => [c.id, c]));
    listEl.innerHTML = FORM2_CLAIMS.map((claim) => {
      const savedClaim = savedById[claim.id];
      const status = savedClaim?.status || '';
      const notes = savedClaim?.notes || '';
      const sectionLabel = claim.section === 'ppr' ? 'PPR' : 'DAR';
      return `<article class="claim-card" data-claim-id="${esc(claim.id)}">
        <div class="claim-card__header">
          <span class="claim-card__label">${esc(claim.label)}</span>
          <span class="claim-card__source">${esc(sectionLabel)}</span>
        </div>
        <div class="claim-card__reported">${esc(getClaimReportedText(app, claim))}</div>
        <div class="claim-card__toggles" role="group" aria-label="Verification for ${esc(claim.label)}">
          ${['Consistent', 'Partial', 'Inconsistent'].map((s) =>
            `<button type="button" class="claim-toggle${status === s ? ' is-selected' : ''}" data-status="${s}">${s}</button>`,
          ).join('')}
        </div>
        <textarea class="claim-card__notes" placeholder="Verification notes (optional)…" rows="2">${esc(notes)}</textarea>
      </article>`;
    }).join('');
    updateClaimVerificationStatus(app);
  }

  function renderInterviewScale(ind, val, readonly) {
    if (readonly) {
      if (!val) {
        return '<p class="interview-scale-readout interview-scale-readout--empty">Not rated</p>';
      }
      return `<div class="interview-scale interview-scale--readonly" aria-label="Rated ${val} — ${PSYCH_SCALE_LABELS[val]}">
        <span class="interview-scale__selected">${val}</span>
        <span class="interview-scale__selected-label">${esc(PSYCH_SCALE_LABELS[val])}</span>
      </div>`;
    }
    return `<div class="interview-scale" role="group" aria-label="${esc(ind.label)}">
      ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="interview-scale__btn${val === n ? ' is-selected' : ''}" data-indicator="${esc(ind.id)}" data-value="${n}" aria-label="${n} — ${PSYCH_SCALE_LABELS[n]}">
        <span class="interview-scale__num">${n}</span>
        <span class="interview-scale__label">${esc(PSYCH_SCALE_LABELS[n])}</span>
      </button>`).join('')}
    </div>`;
  }

  function renderPsychObservation(app) {
    const sectionEl = $('psych-observation-section');
    const panelBody = $('psych-panel-body');
    if (!sectionEl || !panelBody) return;

    sectionEl.hidden = portalMode !== 'decisions' || !canAssess;
    if (!canAssess) return;

    const readonly = !isPsychiatristActor();
    panelBody.classList.toggle('readonly', readonly);
    const noteEl = $('psych-panel-note');
    const editNote = $('psych-panel-edit-note');
    if (noteEl) noteEl.hidden = !readonly;
    if (editNote) editNote.hidden = readonly;

    const saved = readonly
      ? getPsychObservationRecord(app)
      : (PMSStorage.getBoardAssessmentForActor(app, actor)?.psychiatricObservation || {});
    const indicators = saved.indicators || {};

    $('psych-indicators').innerHTML = BEHAVIORAL_INDICATORS.map((ind) => {
      const val = indicators[ind.id] || 0;
      const readout = val ? PSYCH_SCALE_LABELS[val] : 'Not rated';
      return `<article class="interview-eval-card" data-indicator-row="${esc(ind.id)}">
        <div class="interview-eval-card__header">
          <span class="interview-eval-card__label">${esc(ind.label)}</span>
          <span class="interview-eval-card__readout">${esc(readout)}</span>
        </div>
        <p class="interview-eval-card__hint">Rate observed level during the live interview (1 = very low, 5 = very high)</p>
        ${renderInterviewScale(ind, val, readonly)}
      </article>`;
    }).join('');

    if (readonly) {
      $('demeanor-chips').innerHTML = saved.demeanor
        ? `<span class="demeanor-chip demeanor-chip--readonly is-selected">${esc(saved.demeanor)}</span>`
        : '<span class="demeanor-chip--empty">Not recorded</span>';
    } else {
      $('demeanor-chips').innerHTML = DEMEANOR_OPTIONS.map((d) =>
        `<button type="button" class="demeanor-chip${saved.demeanor === d ? ' is-selected' : ''}" data-demeanor="${esc(d)}">${esc(d)}</button>`,
      ).join('');
    }

    const notesEl = $('psych-clinical-notes');
    const notesReadonly = $('psych-clinical-notes-readonly');
    if (readonly) {
      if (notesEl) notesEl.hidden = true;
      if (notesReadonly) {
        notesReadonly.hidden = false;
        const text = saved.clinicalNotes || '';
        notesReadonly.textContent = text || 'No clinical notes recorded yet.';
        notesReadonly.classList.toggle('is-empty', !text);
      }
    } else {
      if (notesEl) {
        notesEl.hidden = false;
        notesEl.value = saved.clinicalNotes || '';
      }
      if (notesReadonly) notesReadonly.hidden = true;
    }

    const evalList = $('psych-eval-list');
    const evaluations = PMSStorage.getMedicalEvaluations(app.id);
    if (evalList) {
      evalList.innerHTML = evaluations.length
        ? evaluations.map((ev) => `<li><span class="psych-eval-file">${esc(ev.fileName)}</span> · ${esc(PMSUI.fmtDate(ev.uploadedAt))}</li>`).join('')
        : (readonly ? '<li class="psych-eval-list__empty">No evaluation documents attached.</li>' : '');
    }

    pendingPsychFile = null;
    const chip = $('psych-file-chip');
    if (chip) chip.hidden = true;
    const fileInput = $('psych-file-input');
    if (fileInput) fileInput.value = '';
    const attachControl = $('psych-attachment-control');
    if (attachControl) attachControl.hidden = readonly;

    updatePsychObservationStatus(saved);
    mountPsychOfficerAuth(app);
    if (isPsychiatristActor()) {
      sectionEl.open = true;
    }
  }

  function renderInterviewSections(app) {
    if (portalMode !== 'decisions') return;
    const host = $('board-interview-sections');
    if (!host) return;
    pendingPsychFile = null;
    renderClaimVerification(app);
    renderPsychObservation(app);
    mountInterviewOfficerAuth(app);
    mountPsychOfficerAuth(app);
    const claimActions = $('claim-verification-actions');
    if (claimActions) claimActions.hidden = !canAssess;
  }

  function hasInterviewDraftData() {
    const hasClaims = readClaimVerificationFromDom().some((c) => c.status || c.notes);
    if (hasClaims) return true;
    if (!isPsychiatristActor()) return false;
    const psych = readPsychiatricObservation();
    return !!psych.demeanor
      || !!psych.clinicalNotes
      || Object.values(psych.indicators).some((v) => v)
      || !!pendingPsychFile;
  }

  function attachPendingPsychFile() {
    if (!pendingPsychFile || !currentAppId || !isPsychiatristActor()) return;
    PMSStorage.saveMedicalEvaluation(currentAppId, {
      fileName: pendingPsychFile.name,
      fileType: pendingPsychFile.type,
      fileSize: pendingPsychFile.size,
      notes: $('psych-clinical-notes')?.value.trim() || '',
    }, actor);
    pendingPsychFile = null;
    $('psych-file-chip').hidden = true;
    $('psych-file-input').value = '';
  }

  async function mirrorAssessmentToApi(payload) {
    if (typeof PMSStorage !== 'undefined' && !PMSStorage.isAct1991ParoleSyncEnabled()) return;
    if (typeof PMSApi === 'undefined' || !PMSApi.getToken() || !currentAppId) return;
    try {
      await PMSApi.recordBoardVote(currentAppId, {
        vote: payload.vote,
        observations: payload.observations || payload.interviewNotes || payload.feedback || '',
      });
    } catch (_) { /* local save succeeded */ }
  }

  function bindInterviewEvents() {
    const host = $('board-interview-sections');
    if (!host || host.dataset.bound) return;
    host.dataset.bound = 'true';

    host.addEventListener('click', (e) => {
      const toggle = e.target.closest('.claim-toggle');
      if (toggle) {
        const card = toggle.closest('.claim-card');
        card.querySelectorAll('.claim-toggle').forEach((b) => b.classList.remove('is-selected'));
        toggle.classList.add('is-selected');
        updateClaimVerificationStatus();
        return;
      }
      if (e.target.closest('#psych-panel-body.readonly')) return;

      const scaleBtn = e.target.closest('.interview-scale__btn');
      if (scaleBtn) {
        const card = scaleBtn.closest('.interview-eval-card');
        card?.querySelectorAll('.interview-scale__btn').forEach((b) => b.classList.remove('is-selected'));
        scaleBtn.classList.add('is-selected');
        const readout = card?.querySelector('.interview-eval-card__readout');
        if (readout) readout.textContent = PSYCH_SCALE_LABELS[Number(scaleBtn.dataset.value)] || 'Not rated';
        updatePsychObservationStatus();
        return;
      }
      const chip = e.target.closest('.demeanor-chip');
      if (chip) {
        const panel = chip.closest('#psych-panel-body');
        panel?.querySelectorAll('.demeanor-chip').forEach((c) => c.classList.remove('is-selected'));
        chip.classList.add('is-selected');
        updatePsychObservationStatus();
      }
    });

    $('btn-attach-eval')?.addEventListener('click', () => $('psych-file-input')?.click());
    $('psych-file-input')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      pendingPsychFile = file;
      $('psych-file-name').textContent = file.name;
      $('psych-file-chip').hidden = false;
    });
    $('btn-remove-psych-file')?.addEventListener('click', () => {
      pendingPsychFile = null;
      $('psych-file-input').value = '';
      $('psych-file-chip').hidden = true;
    });
    $('psych-clinical-notes')?.addEventListener('input', () => updatePsychObservationStatus());

    $('vote-choice-grid')?.addEventListener('click', () => syncInterviewSubmitGate());
    $('assessment-score')?.addEventListener('input', () => syncInterviewSubmitGate());
    $('assessment-denial-reason')?.addEventListener('input', () => syncInterviewSubmitGate());
    $('assessment-conditions')?.addEventListener('input', () => syncInterviewSubmitGate());
  }

  function renderDecisionArea(app) {
    const area = $('decision-area');
    const progress = PMSStorage.getBoardAssessmentProgress(app);
    const outcome = PMSStorage.getBoardDecisionOutcome(app);
    const finalized = PMSStorage.isBoardDecisionFinalized(app);
    const inReview = ['Hearing Scheduled', 'Hearing In Progress', 'Pending Board Review', 'Parole Granted', 'Parole Refused', 'Pending Approval', 'Refused'].includes(app.status);
    const mine = PMSStorage.getBoardAssessmentForActor(app, actor);
    const noteEl = $('decision-area-note');
    const assessorForm = $('assessor-form');
    const chairForm = $('chair-decision-form');
    const select = $('hearing-decision');
    const recordBtn = $('btn-record-final-decision');
    const assessSubmitBtn = $('btn-record-decision');
    const assessSaveBtn = $('btn-save-assessment');
    const uniformBoardVote = portalMode === 'decisions';

    area.hidden = !inReview && !finalized;
    if (!inReview && !finalized) return;

    if (uniformBoardVote && chairForm && !canGrantOutcome) {
      chairForm.hidden = true;
    }

    if (finalized && progress.complete) {
      assessorForm.hidden = true;
      if (chairForm) chairForm.hidden = true;
      if (recordBtn) recordBtn.hidden = true;
      if (assessSaveBtn) assessSaveBtn.hidden = true;
      if (assessSubmitBtn) assessSubmitBtn.hidden = true;
      noteEl.hidden = false;
      noteEl.textContent = `Board decision finalized: ${outcome}. ${outcome === 'Parole Granted' ? 'Complete Form 4 — Discharge of Parole Order.' : 'Complete Form 5 — Applications After Refusal.'}`;
      updateOpenFormButton(app);
      return;
    }

    if (recordBtn) recordBtn.hidden = true;

    const votingOpen = isVotingOpen(app);

    if (canAssess) {
      assessorForm.hidden = false;
      if (chairForm) chairForm.hidden = !(canGrantOutcome && progress.complete && !finalized);
      if (assessSaveBtn) assessSaveBtn.hidden = !votingOpen;
      if (assessSubmitBtn) assessSubmitBtn.hidden = !votingOpen;
      if (recordBtn) recordBtn.hidden = true;
      updateOpenFormButton(app);
      applyMedicalFieldVisibility();
      if (typeof PMSBoardVote !== 'undefined') {
        PMSBoardVote.applyFormChrome(actor, {
          formTitle: $('assessor-form-title'),
          formNote: $('assessor-form-note'),
          feedbackLabel: $('assessment-feedback-label'),
          feedback: $('assessment-feedback'),
          medicalScoreRow: $('medical-score-row'),
          scoreInput: $('assessment-score'),
        });
      }
      noteEl.hidden = false;
      if (!votingOpen) {
        noteEl.textContent = votingClosedReason(app);
      } else if (portalMode === 'decisions' && isPsychiatristActor()) {
        const claimsOk = isClaimVerificationPersisted(app);
        const psychOk = isPsychObservationPersisted(app);
        const voteOk = mine?.submissionStatus === 'Submitted';
        const voteDraft = mine?.vote || mine?.score != null || mine?.feedback;
        noteEl.textContent = `Your workflow: Form 2 verification ${claimsOk ? '✓ saved' : '→ complete & save above'} · Interview evaluation ${psychOk ? '✓ signed & saved' : '→ save before final submit'} · Board vote ${voteOk ? '✓ submitted' : (voteDraft ? 'draft saved — submit when ready' : (claimsOk ? '→ select vote, score, and PIN below' : '→ after verification'))}`;
      } else {
        noteEl.textContent = typeof PMSBoardVote !== 'undefined'
          ? PMSBoardVote.progressNote(progress)
          : (progress.complete
            ? 'All board votes are in. The outcome will be finalized automatically.'
            : `Panel progress: ${progress.submitted}/${progress.total}. Save your decision at any time, then submit when ready — other members vote separately.`);
      }

      const statusEl = $('assessor-form-status');
      const statusMsg = typeof PMSBoardVote !== 'undefined' ? PMSBoardVote.statusMessage(mine) : '';
      if (statusMsg) {
        statusEl.hidden = false;
        statusEl.innerHTML = statusMsg;
      } else {
        statusEl.hidden = true;
      }
      if (typeof PMSBoardVote !== 'undefined') {
        PMSBoardVote.bindVoteChoiceButtons();
        PMSBoardVote.bindVoteFieldVisibility();
        PMSBoardVote.populateForm({
          vote: mine?.vote || '',
          score: mine?.score ?? '',
          feedback: mine?.feedback || '',
          denialReason: mine?.denialReason || '',
          conditions: mine?.conditions || '',
        }, actor);
      } else {
        $('assessment-vote').value = mine?.vote || '';
        $('assessment-score').value = mine?.score ?? '';
        $('assessment-feedback').value = mine?.feedback || '';
      }

      if (assessSubmitBtn) {
        assessSubmitBtn.textContent = mine?.submissionStatus === 'Submitted' ? 'Update My Vote' : 'Submit My Vote';
      }
      mountVoteOfficerAuth(app);
      syncInterviewSubmitGate();
      return;
    }

    if ($('assessor-vote-auth')) $('assessor-vote-auth').hidden = true;

    if (uniformBoardVote) return;

    if (assessSaveBtn) assessSaveBtn.hidden = true;
    if (assessSubmitBtn) assessSubmitBtn.hidden = true;
    assessorForm.hidden = true;
    if (chairForm) chairForm.hidden = false;
    select.innerHTML = `
      <option value="">Select decision…</option>
      <option value="Approved">Approve Parole</option>
      <option value="Refused">Deny Parole</option>
      <option value="Deferred">Defer / Continue</option>`;
    updateOpenFormButton(app);

    if (!progress.complete) {
      noteEl.hidden = false;
      noteEl.textContent = `Final decision locked until all panel assessments are submitted. Awaiting: ${progress.pendingRoles.join(', ')}.`;
    } else {
      noteEl.hidden = true;
    }

    const finalRecorded = !!app.boardDecision;
    recordBtn.textContent = 'Record Final Decision';
    recordBtn.disabled = !canDecide || finalRecorded || !progress.complete;
    recordBtn.hidden = false;
    select.disabled = !canDecide || finalRecorded || !progress.complete;
    bindChairFieldVisibility();
    applyChairFieldVisibility(select.value);
    $('hearing-denial-reason').disabled = !canDecide || finalRecorded || !progress.complete;
    $('hearing-conditions').disabled = !canDecide || finalRecorded || !progress.complete;
  }

  function formatSessionWhen(session) {
    if (!session) return '';
    if (session.startedAt) {
      const started = PMSUI.fmtDateTime
        ? PMSUI.fmtDateTime(session.startedAt)
        : new Date(session.startedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
      return session.startedByName ? `${started} by ${session.startedByName}` : started;
    }
    if (session.scheduledDate) {
      return `${PMSUI.fmtDate(session.scheduledDate)}${session.scheduledTime ? ` · ${session.scheduledTime}` : ''}`;
    }
    return '';
  }

  function renderSessionBanner(app) {
    const el = $('hearing-session-banner');
    if (!el) return;
    if (portalMode !== 'decisions' || !app) {
      el.hidden = true;
      return;
    }
    const session = typeof PMSStorage.getHearingSession === 'function'
      ? PMSStorage.getHearingSession(app)
      : { open: isVotingOpen(app), scheduledDate: null };
    el.hidden = false;
    const votingOpen = isVotingOpen(app);
    el.classList.toggle('hearing-session-banner--pending', !votingOpen);
    if (votingOpen) {
      const when = formatSessionWhen(session);
      el.textContent = when
        ? `Board voting is open for this prisoner${when ? ` — ${when}` : ''}. Submit Approve, Deny, or Defer below.`
        : 'Board voting is open for this prisoner. Submit Approve, Deny, or Defer below.';
    } else {
      const when = formatSessionWhen(session);
      el.textContent = when
        ? `A hearing date is needed before votes can be recorded (scheduled ${when}).`
        : 'A hearing date must be set before board votes can be recorded.';
    }
  }

  function applyLiveSessionChrome(app) {
    if (!app) return;
    renderSessionBanner(app);
    syncStartHearingButton(app);
    const votingOpen = isVotingOpen(app);
    const saveBtn = $('btn-save-assessment');
    const submitBtn = $('btn-record-decision');
    if (saveBtn) saveBtn.hidden = !votingOpen;
    if (submitBtn) submitBtn.hidden = !votingOpen;
    const noteEl = $('decision-area-note');
    if (noteEl) {
      if (!votingOpen) {
        noteEl.hidden = false;
        noteEl.textContent = `${votingClosedReason(app)}.`;
      } else if (/must start this prisoner's hearing session|must start the hearing session|Board voting is not open/i.test(noteEl.textContent || '')) {
        noteEl.textContent = 'Hearing session is live. Complete the required steps below and submit your vote.';
      }
    }
    syncInterviewSubmitGate();
  }

  async function syncSharedHearingSession() {
    if (portalMode !== 'decisions' || typeof PMSStorage.pullRemoteHearingSessions !== 'function') return;
    try {
      const changed = await PMSStorage.pullRemoteHearingSessions();
      if (!currentAppId) return;
      const app = PMSStorage.getApplicationById(currentAppId);
      if (!app) return;
      if (changed) {
        renderQueue();
        if ($('vote-tracker')) renderVotes(app);
        renderFinalOutcome(app);
      }
      applyLiveSessionChrome(app);
      updateHearingProgressBadge(app);
    } catch (_) { /* keep the current view if sync is briefly unavailable */ }
  }

  function updateHearingProgressBadge(app) {
    const badge = $('eligibility-badge');
    if (!badge || !app) return;
    if (isVotingOpen(app) && !['Parole Granted', 'Parole Refused', 'Refused'].includes(app.status)
      && !PMSStorage.getBoardDecisionOutcome(app)) {
      badge.className = 'eligibility-badge in-progress';
      badge.textContent = 'Hearing in progress';
    }
  }

  function startSessionSync() {
    if (sessionSyncBound || portalMode !== 'decisions') return;
    sessionSyncBound = true;
    const tick = () => { syncSharedHearingSession(); };
    sessionSyncTimer = window.setInterval(tick, 4000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tick();
    });
    window.addEventListener('storage', (e) => {
      if (e.key === 'pms_mock_data_v5' || e.key === 'pms_mock_data_v4') tick();
    });
    if (typeof PMSUI?.bindLiveDataRefresh === 'function') {
      PMSUI.bindLiveDataRefresh(() => { tick(); }, { refreshOnFocus: false });
    }
  }

  function selectCase(index) {
    if (index < 0 || index >= queue.length) return;
    destroyAllInterviewAuth();
    currentIndex = index;
    const item = queue[index];
    currentAppId = item.appId;
    renderQueue();
    const live = queue[currentIndex] || item;
    const app = PMSStorage.getApplicationById(currentAppId) || live.app;
    const prisoner = PMSStorage.getPrisonerById(app?.prisonerId) || live.prisoner;
    const hearing = getActiveHearing(currentAppId) || live.hearing;
    const institution = prisoner ? PMSStorage.getInstitutionById(prisoner.institutionId) : null;

    const name = prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : 'Unknown';
    const pid = prisoner?.prisonerNumber || app.caseNumber || app.id;
    $('offender-name').textContent = name;
    $('offender-id').textContent = pid;
    $('offender-offense').textContent = prisoner?.offense || '—';
    $('offender-facility').textContent = institution?.name || '—';

    const score = PMSStorage.calculateParoleScore(app);
    const outcome = PMSStorage.getBoardDecisionOutcome(app);
    const badge = $('eligibility-badge');
    if (outcome === 'Parole Refused' || app.status === 'Refused' || app.status === 'Parole Refused') {
      badge.className = 'eligibility-badge denied';
      badge.textContent = 'Refused';
    } else if (outcome === 'Parole Granted' || app.status === 'Parole Granted') {
      badge.className = 'eligibility-badge eligible';
      badge.textContent = `Granted · ${score.calculation || 'Board approved'}`;
    } else if (score.complete && score.meetsThreshold) {
      badge.className = 'eligibility-badge eligible';
      badge.textContent = `Eligible · Score ${score.percent}%`;
    } else if (isVotingOpen(app)) {
      badge.className = 'eligibility-badge in-progress';
      badge.textContent = 'Hearing in progress';
    } else if (PMSStorage.isCommanderVerified(app)
      && PMSStorage.isForm3Complete(app.formData?.form3)) {
      badge.className = 'eligibility-badge eligible';
      badge.textContent = app.status === 'Hearing Scheduled' || app.status === 'Pending Board Review'
        ? 'Verified · Ready for hearing'
        : 'Verified · Awaiting hearing schedule';
    } else if (PMSStorage.isVerificationReady(app) && !PMSStorage.isCommanderVerified(app)) {
      badge.className = 'eligibility-badge pending';
      badge.textContent = 'Awaiting commander verification';
    } else {
      badge.className = 'eligibility-badge pending';
      badge.textContent = 'Pending verification';
    }

    $('session-current').innerHTML = `${esc(name)} <span class="session-current-id">#${esc(pid)}</span>`;
    const sessionDateEl = $('session-date');
    if (sessionDateEl) {
      sessionDateEl.textContent = hearing?.scheduledDate
        ? PMSUI.fmtDate(hearing.scheduledDate)
        : PMSUI.fmtDate(new Date().toISOString());
    }

    renderDossier(app);
    renderInterviewSections(app);
    if ($('vote-tracker')) renderVotes(app);
    if ($('panel-members')) renderPanel(app);
    renderAudit(app);
    renderDeadline(app, hearing);
    renderScheduleForm(app, hearing);
    if ($('decision-area')) renderDecisionArea(app);
    renderFinalOutcome(app);
    const dossierStatus = $('dossier-status');
    if (dossierStatus) {
      dossierStatus.textContent = hearing?.scheduledDate
        ? `Hearing ${PMSUI.fmtDate(hearing.scheduledDate)}${hearing.scheduledTime ? ` · ${hearing.scheduledTime}` : ''}`
        : (isVotingOpen(app)
          ? 'Hearing session active'
          : (app.status === 'Hearing Scheduled' ? 'Hearing scheduled' : 'Pending schedule'));
    }

    syncStartHearingButton(app);
    renderSessionBanner(app);

    const url = new URL(location.href);
    url.searchParams.set('appId', app.id);
    history.replaceState(null, '', url);
  }

  function getScheduleBlockers(app, forUpdate) {
    if (app?.id && typeof PMSStorage.syncCommanderVerificationState === 'function') {
      app = PMSStorage.syncCommanderVerificationState(app.id) || app;
    }
    const blockers = typeof PMSWorkflow !== 'undefined'
      ? [...PMSWorkflow.canAdvanceApplication(app, 'Hearing Scheduled').blockers]
      : [];
    if (!forUpdate && !SCHEDULABLE_STATUSES.includes(app.status)
      && typeof PMSWorkflow !== 'undefined'
      && !PMSWorkflow.canTransition(actor, app.status, 'Hearing Scheduled')
      && !(PMSStorage.isCommanderVerified(app) && PMSStorage.isForm2Complete(app.formData?.form2))) {
      blockers.push(`Case must be ready for hearing scheduling (current status: ${app.status}).`);
    }
    return blockers;
  }

  async function scheduleHearing() {
    if (!canSchedule || !currentAppId) return;
    let app = PMSStorage.getApplicationById(currentAppId);
    if (!app) return;

    const hearing = getActiveHearing(app.id);
    const forUpdate = !!hearing;
    const deadlineException = $('deadline-exception').checked;
    const blockers = deadlineException ? [] : getScheduleBlockers(app, forUpdate);
    if (blockers.length && !forUpdate) {
      showToast(blockers[0]);
      return;
    }

    const scheduledDate = $('hearing-date').value;
    const scheduledTime = $('hearing-time').value;
    const location = $('hearing-venue').value.trim();
    const notes = $('hearing-notes').value.trim();
    const exceptionReason = $('exception-reason').value.trim();

    if (!scheduledDate || !location) {
      showToast('Hearing date and venue are required.');
      return;
    }

    if (typeof PMSValidation !== 'undefined' && !deadlineException) {
      const v = PMSValidation.validateHearingDate(scheduledDate, app);
      if (!v.valid) {
        showToast(v.errors[0]);
        return;
      }
    }

    if (deadlineException && !exceptionReason) {
      showToast('Provide justification for the deadline exception.');
      return;
    }

    try {
      const payload = {
        applicationId: app.id,
        prisonerId: app.prisonerId,
        institutionId: app.institutionId,
        scheduledDate,
        scheduledTime,
        location,
        notes: deadlineException ? `${notes}\n[Deadline exception: ${exceptionReason}]`.trim() : notes,
        boardMembers: PMSStorage.getUsers()
          .filter((u) => PANEL_ROLES.includes(u.role) && u.status === 'Active')
          .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` })),
        deadlineException,
        exceptionReason: deadlineException ? exceptionReason : '',
      };
      if (hearing) payload.id = hearing.id;

      await PMSStorage.saveHearing(payload, actor);
      localStorage.removeItem(draftKey(app.id));
      app = PMSStorage.getApplicationById(app.id) || app;
      const prisoner = PMSStorage.getPrisonerById(app.prisonerId);
      const pName = prisoner ? `${prisoner.firstName} ${prisoner.lastName}` : app.caseNumber || app.id;
      if (portalMode === 'schedule') {
        showScheduleSuccess({
          prisonerName: pName,
          scheduledDate,
          scheduledTime,
          location,
          updated: !!hearing,
        });
      } else {
        showToast(hearing ? 'Hearing updated and stakeholders notified.' : 'Hearing scheduled and stakeholders notified.');
      }
      renderQueue();
      selectCase(currentIndex);
    } catch (err) {
      showToast(err.message || 'Could not schedule hearing.');
    }
  }

  function buildAssessmentPayload(submissionStatus) {
    let payload;
    if (typeof PMSBoardVote !== 'undefined') {
      const extras = portalMode === 'decisions' ? buildSessionExtras() : {};
      payload = PMSBoardVote.buildPayload(PMSBoardVote.readFormValues(), actor, submissionStatus, extras);
    } else {
      const vote = $('assessment-vote').value;
      const scoreVal = canUseMedicalScore ? $('assessment-score')?.value : '';
      const feedback = $('assessment-feedback').value.trim();
      payload = { submissionStatus, feedback, recommendation: vote || '' };
      if (vote) payload.vote = vote;
      if (canUseMedicalScore && scoreVal !== '' && !Number.isNaN(Number(scoreVal))) payload.score = Number(scoreVal);
    }
    if (voteOfficerAuth?.isVerified()) {
      payload.digitalSignature = voteOfficerAuth.getRecord();
    } else if (interviewOfficerAuth?.isVerified()) {
      payload.digitalSignature = interviewOfficerAuth.getRecord();
    }
    return payload;
  }

  function saveAssessmentDraft() {
    if (!currentAppId || !canAssess) return;
    const app = PMSStorage.getApplicationById(currentAppId);
    if (portalMode === 'decisions' && app && !isVotingOpen(app)) {
      showToast(votingClosedReason(app));
      return;
    }
    const values = typeof PMSBoardVote !== 'undefined'
      ? PMSBoardVote.readFormValues()
      : { vote: $('assessment-vote').value, feedback: $('assessment-feedback').value.trim(), score: $('assessment-score').value };
    const draftCheck = typeof PMSBoardVote !== 'undefined'
      ? PMSBoardVote.validateDraft(values)
      : { valid: !!(values.vote || values.feedback || values.score !== '') };
    const existingDraft = PMSStorage.getBoardAssessmentForActor(app, actor)?.submissionStatus === 'Draft';
    if (!draftCheck.valid && !hasInterviewDraftData() && !existingDraft) {
      showToast(draftCheck.message || 'Select a vote or enter comments before saving.');
      return;
    }
    if (!requireVotePin('Enter your 6-digit PIN and click Verify & Sign before saving your decision.')) {
      return;
    }
    try {
      attachPendingPsychFile();
      PMSStorage.saveBoardAssessment(currentAppId, buildAssessmentPayload('Draft'), actor);
      showToast('Your decision has been saved. Submit when you are ready.');
      refreshInterviewSaveState(PMSStorage.getApplicationById(currentAppId));
    } catch (err) {
      showToast(err.message);
    }
  }

  function applyChairFieldVisibility(vote) {
    const showDenial = vote === 'Refused';
    const showConditions = vote === 'Approved';
    const denialRow = $('chair-denial-row');
    const conditionsRow = $('chair-conditions-row');
    if (denialRow) denialRow.hidden = !showDenial;
    if (conditionsRow) conditionsRow.hidden = !showConditions;
    if (!showDenial && $('hearing-denial-reason')) $('hearing-denial-reason').value = '';
    if (!showConditions && $('hearing-conditions')) $('hearing-conditions').value = '';
  }

  function bindChairFieldVisibility() {
    const select = $('hearing-decision');
    if (!select || select.dataset.chairVisibilityBound) return;
    select.dataset.chairVisibilityBound = 'true';
    select.addEventListener('change', () => applyChairFieldVisibility(select.value));
    applyChairFieldVisibility(select.value);
  }

  async function recordDecision(event) {
    if (!currentAppId) return;
    const app = PMSStorage.getApplicationById(currentAppId);
    if (!app) return;

    const clickedId = event?.currentTarget?.id || '';
    const submitAssessorVote = clickedId === 'btn-record-decision'
      || (canAssess && clickedId !== 'btn-record-final-decision');

    const decision = $('hearing-decision').value;
    const denialReason = $('hearing-denial-reason').value.trim();
    const conditions = $('hearing-conditions').value.trim();

    if (submitAssessorVote && canAssess) {
      if (portalMode === 'decisions' && !isPsychiatristActor()) {
        /* Secretary and Commissioner vote without the psychiatrist claim workflow. */
      } else if (portalMode === 'decisions' && !isClaimVerificationPersisted(app)) {
        showToast('Save Form 2 verification (all claims + PIN) before submitting your vote.');
        $('claim-verification-section')?.setAttribute('open', '');
        $('claim-verification-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (portalMode === 'decisions' && isPsychiatristActor() && !isPsychObservationPersisted(app)) {
        showToast('Save interview evaluation (all 1–5 ratings + PIN) before submitting your vote.');
        $('psych-observation-section')?.setAttribute('open', '');
        $('psych-observation-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const values = typeof PMSBoardVote !== 'undefined'
        ? PMSBoardVote.readFormValues()
        : { vote: $('assessment-vote').value, score: $('assessment-score').value, feedback: $('assessment-feedback').value.trim() };
      const submitCheck = typeof PMSBoardVote !== 'undefined'
        ? PMSBoardVote.validateSubmit(values, actor)
        : { valid: !!values.vote, message: 'Please select Approve, Deny, or Defer.', focus: 'vote' };
      if (!submitCheck.valid) {
        showToast(submitCheck.message);
        if (submitCheck.focus === 'vote' && typeof PMSBoardVote !== 'undefined') {
          PMSBoardVote.focusVoteChoice();
        } else {
          const focusMap = {
            score: 'assessment-score',
            feedback: 'assessment-feedback',
            denialReason: 'assessment-denial-reason',
            conditions: 'assessment-conditions',
            vote: 'assessment-vote',
          };
          $(focusMap[submitCheck.focus] || 'assessment-vote')?.focus();
        }
        return;
      }
      if (!requireVotePin('Enter your 6-digit PIN and click Verify & Sign before submitting your vote.')) {
        return;
      }
      const payload = buildAssessmentPayload('Submitted');
      try {
        attachPendingPsychFile();
        PMSStorage.saveBoardAssessment(currentAppId, payload, actor);
        await mirrorAssessmentToApi(payload);
        showToast('Your vote has been recorded. Other members may vote when ready.');
        const updated = PMSStorage.getApplicationById(currentAppId);
        refreshInterviewSaveState(updated);
        if ($('vote-tracker')) renderVotes(updated);
        renderFinalOutcome(updated);
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    if (!canDecide) {
      showToast('Your role cannot record the final board decision.');
      return;
    }

    if (!decision) {
      showToast('Please select a decision.');
      return;
    }
    if (decision === 'Refused' && !denialReason) {
      showToast('Reasons for denial are mandatory.');
      $('hearing-denial-reason').focus();
      return;
    }
    if (decision === 'Approved' && !conditions) {
      showToast('Please enter parole conditions when approving parole.');
      $('hearing-conditions').focus();
      return;
    }

    try {
      if (decision === 'Deferred') {
        await PMSStorage.transitionApplication(currentAppId, 'Deferred', actor, denialReason || 'Hearing deferred');
      } else {
        await PMSStorage.recordBoardDecision(currentAppId, {
          outcome: decision,
          conditions,
          deliberationNotes: decision === 'Refused' ? denialReason : denialReason || conditions,
        }, actor);
      }
      showToast(`Decision recorded: ${decision}.`);
      renderQueue();
      selectCase(currentIndex);
    } catch (err) {
      showToast(err.message || 'Could not record decision.');
    }
  }

  function canStartHearing(app) {
    if (!app || app.status !== 'Hearing Scheduled') return false;
    const role = typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(actor?.role) : actor?.role;
    if (role === 'DJAG Secretary') return true;
    return typeof PMSRBAC !== 'undefined' ? PMSRBAC.canScheduleHearing(actor) : SCHEDULE_ROLES.includes(actor?.role);
  }

  function syncStartHearingButton(app) {
    const btn = $('btn-start-hearing');
    if (!btn) return;
    const show = canStartHearing(app);
    btn.hidden = !show;
    btn.disabled = !show || !currentAppId;
  }

  async function startHearingSession() {
    if (!currentAppId || !canStartHearing(PMSStorage.getApplicationById(currentAppId))) return;
    try {
      await PMSStorage.startHearing(currentAppId, actor);
      showToast('Hearing session started. All board members can submit votes for this prisoner now.');
      renderQueue();
      selectCase(currentIndex);
      syncSharedHearingSession();
    } catch (err) {
      showToast(err.message || 'Could not start hearing session.');
    }
  }

  function bindEvents() {
    $('btn-start-hearing')?.addEventListener('click', startHearingSession);
    $('btn-prev')?.addEventListener('click', () => {
      if (currentIndex > 0) selectCase(currentIndex - 1);
    });

    $('btn-next')?.addEventListener('click', () => {
      if (currentIndex < queue.length - 1) selectCase(currentIndex + 1);
    });

    $('btn-print')?.addEventListener('click', () => window.print());
    $('btn-schedule')?.addEventListener('click', scheduleHearing);
    $('btn-schedule-success-close')?.addEventListener('click', hideScheduleSuccess);
    $('btn-schedule-success-dashboard')?.addEventListener('click', (e) => {
      e.preventDefault();
      hideScheduleSuccess();
      window.location.href = typeof PMSPageChrome !== 'undefined'
        ? PMSPageChrome.getDashboardHref('../')
        : `../${PMSAuth.getDashboardForRole(actor.role)}`;
    });
    if (typeof PMSBoardVote !== 'undefined') {
      PMSBoardVote.bindVoteFieldVisibility();
    }
    bindChairFieldVisibility();

    $('btn-save-draft')?.addEventListener('click', () => {
      if (!currentAppId) return;
      localStorage.setItem(draftKey(currentAppId), JSON.stringify({
        scheduledDate: $('hearing-date').value,
        scheduledTime: $('hearing-time').value,
        location: $('hearing-venue').value.trim(),
        notes: $('hearing-notes').value.trim(),
        deadlineException: $('deadline-exception').checked,
        exceptionReason: $('exception-reason').value.trim(),
      }));
      showToast('Draft saved.');
    });

    $('btn-cancel')?.addEventListener('click', async () => {
      const hearing = getActiveHearing(currentAppId);
      if (!hearing || !confirm('Cancel this scheduled hearing?')) return;
      try {
        await PMSStorage.saveHearing({ ...hearing, status: 'Cancelled' }, actor);
        showToast('Hearing cancelled.');
        renderQueue();
        selectCase(currentIndex);
      } catch (err) {
        showToast(err.message);
      }
    });

    $('deadline-exception')?.addEventListener('change', (e) => {
      $('exception-reason').hidden = !e.target.checked;
    });

    $('btn-record-decision')?.addEventListener('click', recordDecision);
    $('btn-save-assessment')?.addEventListener('click', saveAssessmentDraft);
    $('btn-save-claim-verification')?.addEventListener('click', saveClaimVerification);
    $('btn-save-psych-observation')?.addEventListener('click', savePsychObservation);
    $('btn-record-final-decision')?.addEventListener('click', recordDecision);
    $('btn-final-approve')?.addEventListener('click', () => finalizeBoardOutcome('Parole Granted'));
    $('btn-final-reject')?.addEventListener('click', () => finalizeBoardOutcome('Parole Refused'));
    $('btn-final-open-form')?.addEventListener('click', () => {
      if (!currentAppId) return;
      const app = PMSStorage.getApplicationById(currentAppId);
      const formN = getOutcomeFormNumber(app ? PMSStorage.getBoardDecisionOutcome(app) : null);
      if (!formN) {
        showToast('Board decision is not finalized yet.');
        return;
      }
      openOutcomeForm(formN);
    });

    $('btn-open-form')?.addEventListener('click', () => {
      if (!currentAppId) return;
      const app = PMSStorage.getApplicationById(currentAppId);
      const outcome = app ? PMSStorage.getBoardDecisionOutcome(app) : null;
      const formN = outcome === 'Parole Granted' ? 4 : outcome === 'Parole Refused' ? 5 : null;
      if (!formN) {
        showToast('Board decision is not finalized yet.');
        return;
      }
      if (typeof PMSForms !== 'undefined') {
        PMSForms.openForm(formN, currentAppId);
      } else if (typeof PMSFormWorkflow !== 'undefined') {
        PMSFormWorkflow.openForm(formN, currentAppId);
      }
    });

    $('btn-reset-decision')?.addEventListener('click', () => {
      if (canAssess && !canDecide) {
        $('assessment-score').value = '';
        $('assessment-feedback').value = '';
        return;
      }
      $('hearing-decision').value = '';
      $('hearing-denial-reason').value = '';
      $('hearing-conditions').value = '';
    });

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-f2-download]');
      if (!btn) return;
      const appId = btn.dataset.f2App || currentAppId;
      const fileId = btn.dataset.f2Download;
      if (!appId || !fileId) return;
      try {
        PMSStorage.downloadForm2Attachment(appId, fileId);
      } catch (err) {
        showToast(err.message || 'Could not download file.');
      }
    });
  }

  async function init() {
    await PMSStorage.ensureLoaded();

    portalMode = getPortalMode();
    actor = PMSAuth.requireRole(PORTAL_ROLES);
    if (!actor) return;

    if (portalMode === 'legacy' && redirectLegacyPortal(actor)) return;

    if (portalMode === 'schedule' && !SCHEDULE_PAGE_ROLES.includes(actor.role)) {
      showToast('Only the DJAG Secretary may access hearing scheduling.');
      setTimeout(() => { window.location.href = PMSAuth.getDashboardForRole(actor.role); }, 1200);
      return;
    }
    if (portalMode === 'decisions' && !DECISIONS_PAGE_ROLES.includes(actor.role)) {
      showToast('You do not have access to the board decisions portal.');
      setTimeout(() => { window.location.href = PMSAuth.getDashboardForRole(actor.role); }, 1200);
      return;
    }

    canSchedule = typeof PMSRBAC !== 'undefined'
      ? PMSRBAC.canScheduleHearing(actor)
      : SCHEDULE_ROLES.includes(actor.role);
    canDecide = DECIDE_ROLES.includes(actor.role);
    canAssess = typeof PMSRBAC !== 'undefined'
      ? PMSRBAC.canSubmitAssessment(actor)
      : ASSESS_ROLES.includes(actor.role);
    canGrantOutcome = typeof PMSRBAC?.canRecordBoardDecision === 'function'
      ? PMSRBAC.canRecordBoardDecision(actor)
      : CHAIR_ROLES.includes(actor.role);
    canUseMedicalScore = typeof PMSBoardVote !== 'undefined'
      ? PMSBoardVote.showMedicalScore(actor)
      : actor.role === 'Doctor';

    if (portalMode === 'schedule') {
      canAssess = false;
      canDecide = false;
    } else if (portalMode === 'decisions') {
      canSchedule = false;
      canDecide = false;
    }

    currentAppId = new URLSearchParams(location.search).get('appId') || '';
    applyPortalChrome();

    const userLabel = $('user-label');
    if (userLabel) {
      userLabel.textContent = typeof PMSBoardVote !== 'undefined'
        ? `${PMSBoardVote.formatBoardPosition(actor)}: ${actor.firstName} ${actor.lastName}`
        : `${actor.role}: ${actor.firstName} ${actor.lastName}`;
    }
    const userAvatar = $('user-avatar');
    if (userAvatar) userAvatar.textContent = (actor.firstName || '?').charAt(0).toUpperCase();

    const today = new Date();
    const sessionBadge = $('session-badge');
    if (sessionBadge) {
      sessionBadge.textContent = portalMode === 'schedule'
        ? `Scheduling · ${today.toISOString().slice(0, 10)}`
        : `Session ${today.toISOString().slice(0, 10)} · Active`;
    }

    bindInterviewEvents();
    bindEvents();
    startSessionSync();
    renderQueue();
    if (queue.length) {
      const idx = currentAppId ? queue.findIndex((q) => q.appId === currentAppId) : 0;
      selectCase(idx >= 0 ? idx : 0);
    }
    syncSharedHearingSession();
  }

  return { init, schedulePortalHref, decisionsPortalHref, resolvePortalHref, getPortalMode };
})();
