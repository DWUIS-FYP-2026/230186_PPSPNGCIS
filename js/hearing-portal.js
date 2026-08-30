/**
 * Parole Hearing Portal — Board View (queue, dossier, scheduling, decisions).
 */
(async () => {
  await PMSStorage.ensureLoaded();

  const PORTAL_ROLES = [
    'DJAG Secretary', 'DJAG Parole Clerk', 'System Administrator',
    'Parole Board Member', 'Doctor', 'CS Commissioner',
  ];
  const SCHEDULE_ROLES = ['DJAG Secretary', 'DJAG Parole Clerk', 'System Administrator'];
  const DECIDE_ROLES = ['Parole Board Member', 'System Administrator'];
  const ASSESS_ROLES = ['Doctor', 'CS Commissioner', 'DJAG Secretary'];
  const PANEL_ROLES = ['Parole Board Member', 'Doctor', 'CS Commissioner', 'DJAG Secretary'];
  const SCHEDULABLE_STATUSES = ['Pre-Parole Report Prepared', 'Hearing Scheduled'];
  const THRESHOLD = PMSStorage.PAROLE_APPROVAL_THRESHOLD || 80;

  const actor = PMSAuth.requireRole(PORTAL_ROLES);
  if (!actor) return;

  const canSchedule = SCHEDULE_ROLES.includes(actor.role);
  const canDecide = DECIDE_ROLES.includes(actor.role);
  const canAssess = ASSESS_ROLES.includes(actor.role);

  const $ = (id) => document.getElementById(id);
  let queue = [];
  let currentIndex = 0;
  let currentAppId = new URLSearchParams(location.search).get('appId') || '';

  if ($('back-link') && typeof PMSAuth !== 'undefined') {
    $('back-link').href = '../' + PMSAuth.getDashboardForRole(actor.role);
  }
  $('user-label').textContent = actor.boardPosition
    ? `${actor.boardPosition}: ${actor.firstName} ${actor.lastName}`
    : `${actor.role}: ${actor.firstName} ${actor.lastName}`;
  $('user-avatar').textContent = (actor.firstName || '?').charAt(0).toUpperCase();

  const today = new Date();
  $('session-badge').innerHTML = `<i class="fi fi-rr-circle" aria-hidden="true"></i> Session #${today.toISOString().slice(0, 10)} · Active`;

  function showToast(msg) {
    const el = $('toast');
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

  function eligibleForSchedule() {
    return PMSStorage.getParoleApplications().filter((app) => {
      if (app.status === 'Draft') return false;
      const advance = PMSWorkflow.canAdvanceApplication(app, 'Hearing Scheduled');
      if (!advance.allowed) return false;
      if (SCHEDULABLE_STATUSES.includes(app.status)) return true;
      return PMSWorkflow.canTransition(actor, app.status, 'Hearing Scheduled');
    });
  }

  function getActiveHearing(appId) {
    return PMSStorage.getHearingsByApplication(appId)
      .find((h) => !['Cancelled', 'Completed'].includes(h.status)) || null;
  }

  function queueStatus(item, index) {
    if (index === currentIndex) return { cls: 'status-current', label: 'Current' };
    if (item.app?.boardDecision || item.app?.status === 'Refused' || item.app?.status === 'Approved') {
      return { cls: 'status-done', label: 'Done' };
    }
    if (!item.hearing) return { cls: 'status-pending', label: 'Pending' };
    if (['Completed'].includes(item.hearing.status)) return { cls: 'status-done', label: 'Done' };
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

    return items;
  }

  function renderQueue() {
    queue = buildQueue();
    $('queue-count').textContent = queue.length;
    $('session-docket').textContent = `${queue.length} case${queue.length === 1 ? '' : 's'}`;

    if (!queue.length) {
      $('queue-list').innerHTML = '<div class="log-item empty">No cases in hearing docket.</div>';
      $('queue-remaining').textContent = '0 remaining';
      return;
    }

    if (currentAppId) {
      const idx = queue.findIndex((q) => q.appId === currentAppId);
      if (idx >= 0) currentIndex = idx;
    }
    currentIndex = Math.min(currentIndex, queue.length - 1);

    $('queue-list').innerHTML = queue.map((item, i) => {
      const p = item.prisoner;
      const name = p ? `${p.firstName} ${p.lastName}` : item.appId;
      const id = p?.prisonerNumber || item.app?.caseNumber || item.appId;
      const st = queueStatus(item, i);
      return `<div class="queue-item${i === currentIndex ? ' active' : ''}" data-index="${i}" data-app-id="${esc(item.appId)}">
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
      el.addEventListener('click', () => selectCase(parseInt(el.dataset.index, 10)));
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
    $('dossier-status').innerHTML = complete === docs.length
      ? `<i class="fi fi-rr-check-circle" aria-hidden="true"></i> Complete · ${complete} docs`
      : `<i class="fi fi-rr-exclamation" aria-hidden="true"></i> ${complete}/${docs.length} docs`;
    $('dossier-status').className = complete === docs.length ? 'dossier-status' : 'dossier-status incomplete';
    $('doc-list').innerHTML = docs.map((d) =>
      `<span class="doc-item${d.ok ? '' : ' missing'}"><i class="fi fi-rr-document" aria-hidden="true"></i> ${esc(d.label)}</span>`
    ).join('');
  }

  function renderVotes(app) {
    const assessments = PMSStorage.getBoardAssessments(app.id);
    const panelUsers = PMSStorage.getUsers().filter((u) => PANEL_ROLES.includes(u.role) && u.status === 'Active');
    let approve = 0;
    let deny = 0;
    let abstain = 0;

    assessments.forEach((a) => {
      if (a.score >= THRESHOLD) approve += 1;
      else if (a.score != null) deny += 1;
      else abstain += 1;
    });

    if (app.boardDecision?.outcome === 'Parole Granted') approve += 1;
    else if (app.boardDecision?.outcome === 'Parole Refused') deny += 1;
    else if (app.status === 'Deferred') abstain += 1;

    $('vote-approve').textContent = approve;
    $('vote-deny').textContent = deny;
    $('vote-abstain').textContent = abstain;
    $('vote-meta').innerHTML = `<i class="fi fi-rr-clock" aria-hidden="true"></i> ${assessments.length} of ${panelUsers.length} recorded`;
  }

  function renderPanel(app) {
    const assessments = PMSStorage.getBoardAssessments(app.id);
    const byAssessor = Object.fromEntries(assessments.map((a) => [a.assessorId, a]));
    const members = PMSStorage.getUsers().filter((u) => PANEL_ROLES.includes(u.role) && u.status === 'Active');

    $('panel-members').innerHTML = members.map((u) => {
      const a = byAssessor[u.id];
      let voteHtml = '<span class="pending"><i class="fi fi-rr-clock" aria-hidden="true"></i> Pending</span>';
      if (a) {
        if (a.score >= THRESHOLD) {
          voteHtml = '<span class="approved"><i class="fi fi-rr-check-circle" aria-hidden="true"></i> Approve</span>';
        } else {
          voteHtml = '<span class="denied"><i class="fi fi-rr-cross-circle" aria-hidden="true"></i> Deny</span>';
        }
      } else if (app.boardDecision && app.boardDecision.decidedBy === u.id) {
        voteHtml = app.boardDecision.outcome === 'Parole Granted'
          ? '<span class="approved"><i class="fi fi-rr-check-circle" aria-hidden="true"></i> Approve</span>'
          : '<span class="denied"><i class="fi fi-rr-cross-circle" aria-hidden="true"></i> Deny</span>';
      }

      return `<div class="panel-member">
        <div class="avatar">${esc(initials(u.firstName, u.lastName))}</div>
        <div class="info">
          <div class="name">${esc(u.firstName)} ${esc(u.lastName)}</div>
          <div class="role">${esc(u.boardPosition || u.role)}</div>
        </div>
        <div class="vote-indicator">${voteHtml}</div>
      </div>`;
    }).join('') || '<div class="log-item empty">No panel members configured.</div>';
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
    if (!info) { alert.hidden = true; return; }

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

  function renderScheduleForm(app, hearing) {
    const area = $('schedule-area');
    area.hidden = !canSchedule;
    if (!canSchedule) return;

    const needsSchedule = !hearing || app.status === 'Pre-Parole Report Prepared';
    area.style.display = needsSchedule || hearing ? 'block' : 'none';

    const draft = JSON.parse(localStorage.getItem(draftKey(app.id)) || 'null');
    $('hearing-date').value = hearing?.scheduledDate || draft?.scheduledDate || '';
    $('hearing-time').value = hearing?.scheduledTime || draft?.scheduledTime || '09:00';
    $('hearing-venue').value = hearing?.location || draft?.location || '';
    $('hearing-notes').value = hearing?.notes || hearing?.meetingNotes || draft?.notes || '';
    $('deadline-exception').checked = !!draft?.deadlineException;
    $('exception-reason').hidden = !draft?.deadlineException;
    $('exception-reason').value = draft?.exceptionReason || '';

    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    $('hearing-date').min = minDate.toISOString().slice(0, 10);

    $('btn-schedule').innerHTML = hearing
      ? '<i class="fas fa-calendar-check"></i> Update & Notify'
      : '<i class="fas fa-calendar-check"></i> Schedule & Notify';
    $('btn-cancel').hidden = !hearing;
  }

  function renderDecisionArea(app) {
    const area = $('decision-area');
    const inReview = ['Hearing Scheduled', 'Pending Board Review'].includes(app.status);
    const select = $('hearing-decision');

    if (canAssess && !canDecide) {
      area.hidden = !inReview;
      select.innerHTML = `
        <option value="">Select action…</option>
        <option value="assess">Submit Board Assessment</option>`;
      $('btn-record-decision').disabled = !inReview;
      $('btn-open-form').hidden = true;
      return;
    }

    select.innerHTML = `
      <option value="">Select decision…</option>
      <option value="Approved">Approve Parole</option>
      <option value="Refused">Deny Parole</option>
      <option value="Deferred">Defer / Continue</option>`;
    $('btn-open-form').hidden = false;

    area.hidden = !inReview;
    $('btn-record-decision').disabled = !canDecide || !inReview || !!app.boardDecision;
    select.disabled = !canDecide;
    $('hearing-denial-reason').disabled = !canDecide;
    $('hearing-conditions').disabled = !canDecide;
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
    $('offender-id').textContent = `#${pid}`;
    $('offender-offense').textContent = prisoner?.offense ? `Offense: ${prisoner.offense}` : 'Offense: —';
    $('offender-facility').textContent = institution?.name || '—';

    const score = PMSStorage.calculateParoleScore(app);
    const badge = $('eligibility-badge');
    if (app.boardDecision?.outcome === 'Parole Refused' || app.status === 'Refused') {
      badge.className = 'eligibility-badge denied';
      badge.innerHTML = '<i class="fi fi-rr-times-circle" aria-hidden="true"></i> Refused';
    } else if (score.complete && score.meetsThreshold) {
      badge.className = 'eligibility-badge eligible';
      badge.innerHTML = '<i class="fi fi-rr-check-circle" aria-hidden="true"></i> Eligible · Score ' + score.percent + '%';
    } else if (PMSStorage.isCommanderVerified(app) && PMSStorage.isForm3Complete(app.formData?.form3)) {
      badge.className = 'eligibility-badge eligible';
      badge.innerHTML = '<i class="fi fi-rr-check-circle" aria-hidden="true"></i> Verified · Ready for hearing';
    } else {
      badge.className = 'eligibility-badge pending';
      badge.innerHTML = '<i class="fi fi-rr-clock" aria-hidden="true"></i> Pending verification';
    }

    $('session-current').innerHTML = `${esc(name)} <span style="font-weight:400;color:#4a6b88;">#${esc(pid)}</span>`;
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
    const blockers = [...PMSWorkflow.canAdvanceApplication(app, 'Hearing Scheduled').blockers];
    if (!forUpdate && !SCHEDULABLE_STATUSES.includes(app.status) && !PMSWorkflow.canTransition(actor, app.status, 'Hearing Scheduled')) {
      blockers.push(`Case must be in "Pre-Parole Report Prepared" status (current: ${app.status}).`);
    }
    return blockers;
  }

  async function scheduleHearing() {
    if (!canSchedule || !currentAppId) return;
    const app = PMSStorage.getApplicationById(currentAppId);
    if (!app) return;

    const hearing = getActiveHearing(app.id);
    const forUpdate = !!(hearing && app.status === 'Hearing Scheduled');
    const blockers = getScheduleBlockers(app, forUpdate);
    if (blockers.length && !forUpdate) {
      showToast(blockers[0]);
      return;
    }

    const scheduledDate = $('hearing-date').value;
    const scheduledTime = $('hearing-time').value;
    const location = $('hearing-venue').value.trim();
    const notes = $('hearing-notes').value.trim();
    const deadlineException = $('deadline-exception').checked;
    const exceptionReason = $('exception-reason').value.trim();

    if (!scheduledDate || !location) {
      showToast('Hearing date and venue are required.');
      return;
    }

    if (typeof PMSValidation !== 'undefined' && !deadlineException) {
      const v = PMSValidation.validateHearingDate(scheduledDate, app);
      if (!v.valid) { showToast(v.errors[0]); return; }
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

    if (decision === 'assess' && canAssess) {
      const score = prompt('Enter assessment score (0–100):', '85');
      if (score == null) return;
      try {
        PMSStorage.saveBoardAssessment(currentAppId, {
          score: Number(score),
          feedback: denialReason || '',
          recommendation: Number(score) >= THRESHOLD ? 'Recommend' : 'Do not recommend',
        }, actor);
        showToast('Assessment submitted.');
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
          outcome: decision === 'Approved' ? 'Approved' : decision === 'Refused' ? 'Refused' : decision,
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

  $('btn-prev').addEventListener('click', () => {
    if (currentIndex > 0) selectCase(currentIndex - 1);
  });

  $('btn-next').addEventListener('click', () => {
    if (currentIndex < queue.length - 1) selectCase(currentIndex + 1);
  });

  $('btn-print').addEventListener('click', () => window.print());

  $('btn-schedule').addEventListener('click', scheduleHearing);

  $('btn-save-draft').addEventListener('click', () => {
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

  $('btn-cancel').addEventListener('click', async () => {
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

  $('deadline-exception').addEventListener('change', (e) => {
    $('exception-reason').hidden = !e.target.checked;
  });

  $('btn-record-decision').addEventListener('click', recordDecision);

  $('btn-open-form').addEventListener('click', () => {
    if (!currentAppId) return;
    const app = PMSStorage.getApplicationById(currentAppId);
    const score = app ? PMSStorage.calculateParoleScore(app) : { meetsThreshold: false };
    PMSForms.openForm(score.meetsThreshold ? 4 : 5, currentAppId);
  });

  $('btn-reset-decision').addEventListener('click', () => {
    $('hearing-decision').value = '';
    $('hearing-denial-reason').value = '';
    $('hearing-conditions').value = '';
  });

  renderQueue();
  if (queue.length) {
    const idx = currentAppId ? queue.findIndex((q) => q.appId === currentAppId) : 0;
    selectCase(idx >= 0 ? idx : 0);
  }
})();
