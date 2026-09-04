/**
 * Parole Hearing Portal — Board View (queue, dossier, scheduling, decisions).
 */
const PMSHearingPortal = (() => {
  const PORTAL_ROLES = [
    'DJAG Secretary', 'DJAG Parole Clerk', 'System Administrator',
    'Parole Board Member', 'Doctor', 'CS Commissioner',
  ];
  const SCHEDULE_ROLES = ['DJAG Secretary', 'System Administrator'];
  const DECIDE_ROLES = ['Parole Board Member', 'System Administrator'];
  const ASSESS_ROLES = ['Doctor', 'CS Commissioner', 'DJAG Secretary', 'Parole Board Member'];
  const PANEL_ROLES = ['Parole Board Member', 'Doctor', 'CS Commissioner', 'DJAG Secretary'];
  const SCHEDULABLE_STATUSES = ['Pre-Parole Report Prepared', 'Hearing Scheduled'];
  const CLOSED_STATUSES = ['Refused', 'Approved', 'Released', 'Parole Granted', 'Parole Refused'];

  let actor = null;
  let canSchedule = false;
  let canDecide = false;
  let canAssess = false;
  let queue = [];
  let currentIndex = 0;
  let currentAppId = '';
  let THRESHOLD = 80;

  const $ = (id) => document.getElementById(id);

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
    if (SCHEDULABLE_STATUSES.includes(app.status)) return true;
    if (typeof PMSWorkflow !== 'undefined' && PMSWorkflow.canAdvanceApplication(app, 'Hearing Scheduled').allowed) {
      return true;
    }
    return PMSStorage.isCommanderVerified(app)
      && PMSStorage.isForm3Complete(app.formData?.form3)
      && PMSStorage.isForm2Complete(app.formData?.form2)
      && !getActiveHearing(app.id);
  }

  function eligibleForSchedule() {
    return PMSStorage.getParoleApplications().filter(isScheduleCandidate);
  }

  function queueStatus(item, index) {
    if (index === currentIndex) return { cls: 'status-current', label: 'Current' };
    if (item.app?.boardDecision || ['Refused', 'Approved', 'Parole Granted', 'Parole Refused'].includes(item.app?.status)) {
      return { cls: 'status-done', label: 'Done' };
    }
    if (!item.hearing) return { cls: 'status-pending', label: 'Pending' };
    if (item.hearing.status === 'Completed') return { cls: 'status-done', label: 'Done' };
    return { cls: 'status-upcoming', label: 'Upcoming' };
  }

  function buildQueue() {
    const seen = new Set();
    const items = [];

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
      $('queue-list').innerHTML = '<div class="log-item empty">No cases in the hearing docket. Complete Form 3 verification, then schedule a hearing here.</div>';
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
      { label: 'Form 3 Institutional', ok: summary.checks.form3 },
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
        const label = a ? `${role}: ${a.vote}${a.score != null ? ` · ${a.score}%` : ''} · ${PMSUI.fmtDate(a.submittedAt)}` : `${role}: pending`;
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
      const position = a?.boardPosition || user?.boardPosition || role;
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
    const events = PMSStorage.getCaseTimeline(app.id).slice(-8).reverse();
    $('audit-trail').innerHTML = events.length
      ? events.map((e) => {
        const t = e.at ? new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
        return `<div class="log-item"><span>${esc(e.stage)}</span><span class="time">${esc(t)}</span></div>`;
      }).join('')
      : '<div class="log-item empty">No audit events yet.</div>';
  }

  function renderDeadline(app, hearing) {
    const alert = $('deadline-alert');
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
        ? '<p class="schedule-readonly-pending">Awaiting DJAG Secretary to schedule this hearing (within 14 days of Form 3 verification).</p>'
        : '<p class="schedule-readonly-pending">No hearing date set for this case.</p>'}`;
  }

  function renderScheduleForm(app, hearing) {
    renderScheduleReadOnly(app, hearing);
    const area = $('schedule-area');
    area.hidden = !canSchedule;
    if (!canSchedule) return;

    const showForm = !hearing || SCHEDULABLE_STATUSES.includes(app.status) || app.status === 'Hearing Scheduled';
    area.style.display = showForm ? 'block' : 'none';

    const draft = JSON.parse(localStorage.getItem(draftKey(app.id)) || 'null');
    $('hearing-date').value = hearing?.scheduledDate || draft?.scheduledDate || '';
    $('hearing-time').value = hearing?.scheduledTime || draft?.scheduledTime || '09:00';
    $('hearing-venue').value = hearing?.location || draft?.location || '';
    $('hearing-notes').value = hearing?.notes || hearing?.meetingNotes || draft?.notes || '';
    $('deadline-exception').checked = !!(draft?.deadlineException || hearing?.deadlineException);
    $('exception-reason').hidden = !$('deadline-exception').checked;
    $('exception-reason').value = draft?.exceptionReason || '';

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
      btn.textContent = 'Open Form 4 — Parole Granted';
    } else if (outcome === 'Parole Refused') {
      btn.textContent = 'Open Form 5 — Parole Refused';
    }
  }

  function renderDecisionArea(app) {
    const area = $('decision-area');
    const progress = PMSStorage.getBoardAssessmentProgress(app);
    const outcome = PMSStorage.getBoardDecisionOutcome(app);
    const finalized = PMSStorage.isBoardDecisionFinalized(app);
    const inReview = ['Hearing Scheduled', 'Pending Board Review', 'Parole Granted', 'Parole Refused', 'Pending Approval', 'Refused'].includes(app.status);
    const mine = PMSStorage.getBoardAssessmentForActor(app, actor);
    const noteEl = $('decision-area-note');
    const assessorForm = $('assessor-form');
    const chairForm = $('chair-decision-form');
    const select = $('hearing-decision');
    const recordBtn = $('btn-record-decision');

    area.hidden = !inReview && !finalized;
    if (!inReview && !finalized) return;

    if (finalized && progress.complete) {
      assessorForm.hidden = true;
      chairForm.hidden = true;
      recordBtn.hidden = true;
      noteEl.hidden = false;
      noteEl.textContent = `Board decision finalized: ${outcome}. ${outcome === 'Parole Granted' ? 'Complete Form 4 to issue the parole grant.' : 'Complete Form 5 to record the refusal.'}`;
      updateOpenFormButton(app);
      return;
    }

    recordBtn.hidden = false;

    if (canAssess) {
      assessorForm.hidden = false;
      chairForm.hidden = true;
      updateOpenFormButton(app);
      noteEl.hidden = false;
      noteEl.textContent = progress.complete
        ? 'All board votes are in. The outcome will be finalized automatically.'
        : `Panel progress: ${progress.submitted}/${progress.total}. Cast your Approve, Deny, or Defer vote when ready — other members vote separately.`;

      const statusEl = $('assessor-form-status');
      if (mine?.submissionStatus === 'Submitted') {
        statusEl.hidden = false;
        statusEl.innerHTML = `<strong>Your vote recorded:</strong> ${mine.vote}${mine.score != null ? ` (${mine.score}%)` : ''} on ${PMSUI.fmtDate(mine.submittedAt)}. You may update it below if needed.`;
        $('assessment-vote').value = mine.vote || '';
        $('assessment-score').value = mine.score ?? '';
        $('assessment-feedback').value = mine.feedback || '';
      } else {
        statusEl.hidden = true;
        $('assessment-vote').value = mine?.vote || '';
        $('assessment-score').value = mine?.score ?? '';
        $('assessment-feedback').value = mine?.feedback || '';
      }

      recordBtn.textContent = mine?.submissionStatus === 'Submitted' ? 'Update My Vote' : 'Submit My Vote';
      recordBtn.disabled = false;
      return;
    }

    assessorForm.hidden = true;
    chairForm.hidden = false;
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
    select.disabled = !canDecide || finalRecorded || !progress.complete;
    $('hearing-denial-reason').disabled = !canDecide || finalRecorded || !progress.complete;
    $('hearing-conditions').disabled = !canDecide || finalRecorded || !progress.complete;
  }

  function selectCase(index) {
    if (index < 0 || index >= queue.length) return;
    currentIndex = index;
    const item = queue[index];
    currentAppId = item.appId;
    const { app, prisoner, hearing } = item;
    const institution = prisoner ? PMSStorage.getInstitutionById(prisoner.institutionId) : null;

    renderQueue();

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
    } else if (PMSStorage.isCommanderVerified(app) && PMSStorage.isForm3Complete(app.formData?.form3)) {
      badge.className = 'eligibility-badge eligible';
      badge.textContent = 'Verified · Ready for hearing';
    } else {
      badge.className = 'eligibility-badge pending';
      badge.textContent = 'Pending verification';
    }

    $('session-current').innerHTML = `${esc(name)} <span class="session-current-id">#${esc(pid)}</span>`;
    $('session-date').textContent = hearing?.scheduledDate
      ? PMSUI.fmtDate(hearing.scheduledDate)
      : PMSUI.fmtDate(new Date().toISOString());

    renderDossier(app);
    renderVotes(app);
    renderPanel(app);
    renderAudit(app);
    renderDeadline(app, hearing);
    renderScheduleForm(app, hearing);
    renderDecisionArea(app);

    const url = new URL(location.href);
    url.searchParams.set('appId', app.id);
    history.replaceState(null, '', url);
  }

  function getScheduleBlockers(app, forUpdate) {
    const blockers = typeof PMSWorkflow !== 'undefined'
      ? [...PMSWorkflow.canAdvanceApplication(app, 'Hearing Scheduled').blockers]
      : [];
    if (!forUpdate && !SCHEDULABLE_STATUSES.includes(app.status)
      && typeof PMSWorkflow !== 'undefined'
      && !PMSWorkflow.canTransition(actor, app.status, 'Hearing Scheduled')) {
      blockers.push(`Case must be ready for hearing scheduling (current status: ${app.status}).`);
    }
    return blockers;
  }

  async function scheduleHearing() {
    if (!canSchedule || !currentAppId) return;
    const app = PMSStorage.getApplicationById(currentAppId);
    if (!app) return;

    const hearing = getActiveHearing(app.id);
    const forUpdate = !!(hearing && app.status === 'Hearing Scheduled');
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
      };
      if (hearing) payload.id = hearing.id;

      await PMSStorage.saveHearing(payload, actor);
      localStorage.removeItem(draftKey(app.id));
      showToast(hearing ? 'Hearing updated and stakeholders notified.' : 'Hearing scheduled and stakeholders notified.');
      renderQueue();
      selectCase(currentIndex);
    } catch (err) {
      showToast(err.message || 'Could not schedule hearing.');
    }
  }

  async function recordDecision() {
    if (!currentAppId) return;
    const app = PMSStorage.getApplicationById(currentAppId);
    if (!app) return;

    const decision = $('hearing-decision').value;
    const denialReason = $('hearing-denial-reason').value.trim();
    const conditions = $('hearing-conditions').value.trim();

    if (canAssess) {
      const vote = $('assessment-vote').value;
      const scoreVal = $('assessment-score').value;
      const feedback = $('assessment-feedback').value.trim();
      if (!vote) {
        showToast('Please select Approve, Deny, or Defer.');
        $('assessment-vote').focus();
        return;
      }
      if (vote === 'Refused' && !feedback) {
        showToast('Please provide reasons when denying parole.');
        $('assessment-feedback').focus();
        return;
      }
      const payload = { vote, feedback, recommendation: vote };
      if (scoreVal !== '' && !Number.isNaN(Number(scoreVal))) payload.score = Number(scoreVal);
      try {
        PMSStorage.saveBoardAssessment(currentAppId, payload, actor);
        showToast('Your vote has been recorded. Other members may vote when ready.');
        selectCase(currentIndex);
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

  function bindEvents() {
    $('btn-prev')?.addEventListener('click', () => {
      if (currentIndex > 0) selectCase(currentIndex - 1);
    });

    $('btn-next')?.addEventListener('click', () => {
      if (currentIndex < queue.length - 1) selectCase(currentIndex + 1);
    });

    $('btn-print')?.addEventListener('click', () => window.print());
    $('btn-schedule')?.addEventListener('click', scheduleHearing);

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
  }

  async function init() {
    await PMSStorage.ensureLoaded();
    THRESHOLD = PMSStorage.PAROLE_APPROVAL_THRESHOLD || 80;

    actor = PMSAuth.requireRole(PORTAL_ROLES);
    if (!actor) return;

    canSchedule = typeof PMSRBAC !== 'undefined'
      ? PMSRBAC.canScheduleHearing(actor)
      : SCHEDULE_ROLES.includes(actor.role);
    canDecide = DECIDE_ROLES.includes(actor.role);
    canAssess = typeof PMSRBAC !== 'undefined'
      ? PMSRBAC.canSubmitAssessment(actor)
      : ASSESS_ROLES.includes(actor.role);
    currentAppId = new URLSearchParams(location.search).get('appId') || '';

    $('user-label').textContent = actor.boardPosition
      ? `${actor.boardPosition}: ${actor.firstName} ${actor.lastName}`
      : `${actor.role}: ${actor.firstName} ${actor.lastName}`;
    $('user-avatar').textContent = (actor.firstName || '?').charAt(0).toUpperCase();

    const today = new Date();
    $('session-badge').textContent = `Session ${today.toISOString().slice(0, 10)} · Active`;

    bindEvents();
    renderQueue();
    if (queue.length) {
      const idx = currentAppId ? queue.findIndex((q) => q.appId === currentAppId) : 0;
      selectCase(idx >= 0 ? idx : 0);
    }
  }

  return { init };
})();
