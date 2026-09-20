/**
 * Shared board vote UI — Parole Board: DJAG Secretary, PNGCS Commissioner, Psychiatrist.
 * Internal auth roles remain Doctor / CS Commissioner / DJAG Secretary.
 */
const PMSBoardVote = (() => {
  const ASSESSOR_ROLES = Object.freeze(['Doctor', 'CS Commissioner', 'DJAG Secretary']);

  const BOARD_MEMBER_LABELS = Object.freeze({
    'DJAG Secretary': 'DJAG Secretary',
    'CS Commissioner': 'PNGCS Commissioner',
    Doctor: 'Psychiatrist',
  });

  /** Legacy stored boardPosition values → current display labels. Role key stays `Doctor`. */
  const LEGACY_BOARD_POSITION_LABELS = Object.freeze({
    'Medical Member': 'Psychiatrist',
    Psychiatric: 'Psychiatrist',
    'Commissioner PNGCS': 'PNGCS Commissioner',
  });

  const ROLE_CONFIG = Object.freeze({
    Doctor: {
      portalTitle: 'Board Vote',
      portalSubtitle: 'Complete the interview evaluation (1–5) and submit your vote with a clinical score. Form 2 verification is read-only.',
      roleLabel: 'Psychiatrist',
      formTitle: 'Your Board Vote',
      formNote: 'Review the Chairman and Commissioner Form 2 assessments above, complete the interview evaluation, then choose Approve, Deny, or Defer.',
      dashboardNote: 'Each of the three parole board members votes independently.',
      roleNote: 'You must include a clinical score (0–100) with your vote.',
      showMedicalScore: true,
      feedbackLabel: 'Psychiatric comments / feedback',
      feedbackPlaceholder: 'Clinical notes supporting your decision…',
    },
    'CS Commissioner': {
      portalTitle: 'Board Vote',
      portalSubtitle: 'Choose Approve, Deny, or Defer for each prisoner on the docket',
      roleLabel: 'PNGCS Commissioner',
      formTitle: 'Your Board Vote',
      formNote: 'Tap one option below, add any required details, then submit your vote.',
      dashboardNote: 'Each of the three parole board members votes independently.',
      roleNote: '',
      showMedicalScore: false,
      feedbackLabel: 'Comments / feedback',
      feedbackPlaceholder: 'Notes supporting your decision…',
    },
    'DJAG Secretary': {
      portalTitle: 'Board Vote',
      portalSubtitle: 'Choose Approve, Deny, or Defer for each prisoner on the docket',
      roleLabel: 'DJAG Secretary',
      formTitle: 'Your Board Vote',
      formNote: 'Tap one option below, add any required details, then submit your vote.',
      dashboardNote: 'Each of the three parole board members votes independently.',
      roleNote: '',
      showMedicalScore: false,
      feedbackLabel: 'Comments / feedback',
      feedbackPlaceholder: 'Notes supporting your decision…',
    },
  });

  const DEFAULT_CONFIG = ROLE_CONFIG['CS Commissioner'];
  const VOTE_OPTIONS = Object.freeze([
    { value: 'Approved', label: 'Approve Parole', short: 'Approve', hint: 'Grant release with conditions', variant: 'approve' },
    { value: 'Refused', label: 'Deny Parole', short: 'Deny', hint: 'Do not grant parole at this time', variant: 'deny' },
    { value: 'Deferred', label: 'Defer / Continue', short: 'Defer', hint: 'Need more information or time', variant: 'defer' },
  ]);
  const FIELD_IDS = Object.freeze({
    vote: 'assessment-vote',
    score: 'assessment-score',
    feedback: 'assessment-feedback',
    denialReason: 'assessment-denial-reason',
    conditions: 'assessment-conditions',
  });

  function getRoleConfig(actor) {
    return ROLE_CONFIG[actor?.role] || DEFAULT_CONFIG;
  }

  function getBoardMemberLabel(role) {
    return BOARD_MEMBER_LABELS[role] || role || '—';
  }

  function formatBoardPosition(userOrActor) {
    const raw = userOrActor?.boardPosition || userOrActor?.position;
    if (raw && LEGACY_BOARD_POSITION_LABELS[raw]) return LEGACY_BOARD_POSITION_LABELS[raw];
    if (raw) return raw;
    const role = userOrActor?.role;
    if (role && BOARD_MEMBER_LABELS[role]) return BOARD_MEMBER_LABELS[role];
    return role || '—';
  }

  function isAssessor(actor) {
    return ASSESSOR_ROLES.includes(actor?.role);
  }

  function showMedicalScore(actor) {
    return !!getRoleConfig(actor).showMedicalScore;
  }

  /** Logged-in user is the board Psychiatrist seat (internal role: Doctor). */
  function isPsychiatrist(actor) {
    return showMedicalScore(actor);
  }

  function portalHref(appId, inFormsDir = false) {
    const base = inFormsDir ? 'board-decisions.html' : 'forms/board-decisions.html';
    return appId ? `${base}?appId=${encodeURIComponent(appId)}` : base;
  }

  function resolveFieldIds(ids) {
    return { ...FIELD_IDS, ...(ids || {}) };
  }

  function formatVoteLabel(vote) {
    return VOTE_OPTIONS.find((o) => o.value === vote)?.label || vote || 'No decision';
  }

  function voteVariant(vote) {
    return VOTE_OPTIONS.find((o) => o.value === vote)?.variant || 'defer';
  }

  function setVoteChoice(vote, ids) {
    const f = resolveFieldIds(ids);
    const voteEl = document.getElementById(f.vote);
    if (voteEl) voteEl.value = vote || '';
    const grid = document.getElementById('vote-choice-grid');
    if (grid) {
      grid.querySelectorAll('.vote-choice-btn').forEach((btn) => {
        const selected = btn.dataset.vote === vote;
        btn.classList.toggle('is-selected', selected);
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    }
    applyVoteFieldVisibility(vote, ids);
  }

  function bindVoteChoiceButtons(ids) {
    const grid = document.getElementById('vote-choice-grid');
    if (!grid || grid.dataset.voteChoiceBound) return;
    grid.dataset.voteChoiceBound = 'true';
    grid.querySelectorAll('.vote-choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => setVoteChoice(btn.dataset.vote, ids));
    });
    const f = resolveFieldIds(ids);
    const voteEl = document.getElementById(f.vote);
    if (voteEl && !voteEl.dataset.voteChoiceSync) {
      voteEl.dataset.voteChoiceSync = 'true';
      voteEl.addEventListener('change', () => setVoteChoice(voteEl.value, ids));
    }
  }

  function focusVoteChoice() {
    const grid = document.getElementById('vote-choice-grid');
    const selected = grid?.querySelector('.vote-choice-btn.is-selected');
    (selected || grid?.querySelector('.vote-choice-btn'))?.focus();
  }

  function readFormValues(ids) {
    const f = resolveFieldIds(ids);
    const feedbackEl = document.getElementById(f.feedback);
    return {
      vote: document.getElementById(f.vote)?.value || '',
      score: document.getElementById(f.score)?.value || '',
      feedback: feedbackEl?.value.trim() || '',
      denialReason: document.getElementById(f.denialReason)?.value.trim() || '',
      conditions: document.getElementById(f.conditions)?.value.trim() || '',
    };
  }

  function populateForm(values, actor, ids) {
    const f = resolveFieldIds(ids);
    const voteEl = document.getElementById(f.vote);
    const scoreEl = document.getElementById(f.score);
    const feedbackEl = document.getElementById(f.feedback);
    const denialEl = document.getElementById(f.denialReason);
    const conditionsEl = document.getElementById(f.conditions);
    const vote = values?.vote || '';
    if (scoreEl) scoreEl.value = values?.score ?? '';
    if (feedbackEl) feedbackEl.value = values?.feedback || '';
    if (denialEl) denialEl.value = values?.denialReason || '';
    if (conditionsEl) conditionsEl.value = values?.conditions || '';
    applyMedicalScoreVisibility(actor, { scoreInput: scoreEl });
    setVoteChoice(vote, ids);
  }

  function buildPayload(values, actor, submissionStatus, extras = {}) {
    const payload = {
      submissionStatus,
      feedback: values.feedback,
      recommendation: values.vote || '',
      denialReason: values.denialReason || '',
      conditions: values.conditions || '',
    };
    if (values.vote) payload.vote = values.vote;
    if (showMedicalScore(actor) && values.score !== '' && !Number.isNaN(Number(values.score))) {
      payload.score = Number(values.score);
    }
    if (Array.isArray(extras.claimVerification)) payload.claimVerification = extras.claimVerification;
    if (extras.psychiatricObservation) payload.psychiatricObservation = extras.psychiatricObservation;
    if (extras.observations) payload.observations = extras.observations;
    if (extras.interviewNotes) payload.interviewNotes = extras.interviewNotes;
    return payload;
  }

  function validateDraft(values) {
    if (!values.vote && !values.feedback && values.score === '' && !values.denialReason && !values.conditions) {
      return { valid: false, message: 'Select a vote or enter comments before saving.' };
    }
    return { valid: true };
  }

  function validateSubmit(values, actor) {
    if (!values.vote) {
      return { valid: false, message: 'Please select Approve, Deny, or Defer.', focus: 'vote' };
    }
    if (values.vote === 'Refused' && !values.denialReason && !values.feedback) {
      return { valid: false, message: 'Please provide reasons when denying parole.', focus: 'denialReason' };
    }
    if (values.vote === 'Approved' && !values.conditions) {
      return { valid: false, message: 'Please enter parole conditions when approving parole.', focus: 'conditions' };
    }
    if (showMedicalScore(actor) && (values.score === '' || Number.isNaN(Number(values.score)))) {
      return { valid: false, message: 'Please enter a medical score (0–100).', focus: 'score' };
    }
    const scoreNum = Number(values.score);
    if (showMedicalScore(actor) && (scoreNum < 0 || scoreNum > 100)) {
      return { valid: false, message: 'Medical score must be between 0 and 100.', focus: 'score' };
    }
    return { valid: true };
  }

  function applyVoteFieldVisibility(vote, ids) {
    const f = resolveFieldIds(ids);
    const denialRow = document.getElementById('vote-denial-row');
    const conditionsRow = document.getElementById('vote-conditions-row');
    const showDenial = vote === 'Refused';
    const showConditions = vote === 'Approved';
    if (denialRow) denialRow.hidden = !showDenial;
    if (conditionsRow) conditionsRow.hidden = !showConditions;
    const denialEl = document.getElementById(f.denialReason);
    const conditionsEl = document.getElementById(f.conditions);
    if (!showDenial && denialEl) denialEl.value = '';
    if (!showConditions && conditionsEl) conditionsEl.value = '';
  }

  function bindVoteFieldVisibility(ids) {
    const f = resolveFieldIds(ids);
    const voteEl = document.getElementById(f.vote);
    if (!voteEl || voteEl.dataset.voteVisibilityBound) return;
    voteEl.dataset.voteVisibilityBound = 'true';
    voteEl.addEventListener('change', () => applyVoteFieldVisibility(voteEl.value, ids));
  }

  function applyPortalChrome(actor, els = {}) {
    const cfg = getRoleConfig(actor);
    if (els.pageTitle) els.pageTitle.textContent = cfg.portalTitle;
    if (els.pageSub) els.pageSub.textContent = cfg.portalSubtitle;
    if (els.formBadge) els.formBadge.textContent = cfg.portalTitle;
    if (els.roleBadge) {
      els.roleBadge.textContent = cfg.roleLabel;
      els.roleBadge.hidden = false;
    }
    if (els.userLabel && actor) {
      els.userLabel.textContent = `${formatBoardPosition(actor)}: ${actor.firstName} ${actor.lastName}`;
    }
    document.title = `${cfg.portalTitle} | PNG Parole System`;
  }

  function applyFormChrome(actor, els = {}) {
    const cfg = getRoleConfig(actor);
    if (els.formTitle) els.formTitle.textContent = cfg.formTitle;
    if (els.formNote) els.formNote.textContent = cfg.formNote;
    if (els.feedbackLabel) els.feedbackLabel.textContent = cfg.feedbackLabel;
    if (els.feedback) els.feedback.placeholder = cfg.feedbackPlaceholder;
    applyMedicalScoreVisibility(actor, { medicalScoreRow: els.medicalScoreRow, scoreInput: els.scoreInput });
    bindVoteFieldVisibility();
    bindVoteChoiceButtons();
  }

  function applyMedicalScoreVisibility(actor, els = {}) {
    const show = showMedicalScore(actor);
    if (els.medicalScoreRow) els.medicalScoreRow.hidden = !show;
    if (!show && els.scoreInput) els.scoreInput.value = '';
  }

  function statusMessage(assessment, opts = {}) {
    if (assessment?.submissionStatus === 'Submitted') {
      const scorePart = assessment.score != null ? ` (${assessment.score}%)` : '';
      const when = assessment.submittedAt
        ? PMSUI.fmtDateTime?.(assessment.submittedAt) || PMSUI.fmtDate(assessment.submittedAt)
        : PMSUI.fmtDate(assessment.updatedAt);
      if (opts.readOnly) {
        return `<strong>Vote already submitted:</strong> ${formatVoteLabel(assessment.vote)}${scorePart} · ${when}. No further vote is required for this hearing.`;
      }
      return `<strong>Your vote recorded:</strong> ${formatVoteLabel(assessment.vote)}${scorePart} on ${when}. You may change it below if needed.`;
    }
    if (assessment?.submissionStatus === 'Draft') {
      const scorePart = assessment.score != null ? ` (${assessment.score}%)` : '';
      const votePart = assessment.vote ? formatVoteLabel(assessment.vote) : 'No decision selected yet';
      return `<strong>Saved draft:</strong> ${votePart}${scorePart} · last updated ${PMSUI.fmtDate(assessment.updatedAt)}`;
    }
    return '';
  }

  function progressNote(progress) {
    if (progress.complete) return 'All board votes are in. The Board Chairman (DJAG Secretary) records the overall decision below.';
    return `Panel progress: ${progress.submitted}/${progress.total}. Save your decision at any time, then submit when ready — other members vote separately.`;
  }

  const FORM2_CLAIM_TOTAL = 10;
  const PSYCH_INDICATOR_TOTAL = 5;

  function getPanelForm2ReviewProgress(app) {
    const roles = ['DJAG Secretary', 'CS Commissioner'];
    const records = roles.map((role) => (
      typeof PMSStorage.getBoardAssessmentEntryForRole === 'function'
        ? PMSStorage.getBoardAssessmentEntryForRole(app, role)
        : null
    ));
    const recorded = records.filter((r) => {
      const claims = r?.claimVerification || [];
      return claims.filter((c) => c.status).length > 0 || r?.submissionStatus === 'Submitted';
    }).length;
    return { recorded, total: roles.length, complete: recorded === roles.length };
  }

  function getInterviewWorkflowProgress(app, actor) {
    const mine = PMSStorage.getBoardAssessmentForActor(app, actor);
    const claims = mine?.claimVerification || [];
    const claimsDone = claims.filter((c) => c.status).length;
    const claimsSigned = !!(mine?.digitalSignature?.verified && claimsDone >= FORM2_CLAIM_TOTAL);
    const psych = mine?.psychiatricObservation || {};
    const psychRated = Object.values(psych.indicators || {}).filter((v) => v).length;
    const psychComplete = psychRated >= PSYCH_INDICATOR_TOTAL && !!(psych.clinicalNotes || psych.demeanor);
    const psychSigned = !!(mine?.psychiatricObservationSavedAt
      && mine?.psychDigitalSignature?.verified
      && psychComplete);
    const docs = PMSStorage.getMedicalEvaluations(app?.id).length;
    const voteSubmitted = mine?.submissionStatus === 'Submitted';
    const voteDraft = mine?.submissionStatus === 'Draft'
      && !!(mine?.vote || mine?.feedback || mine?.score != null || claimsSigned || psychComplete);

    if (isPsychiatrist(actor)) {
      const review = getPanelForm2ReviewProgress(app);
      let currentStep = 'psych';
      if (psychSigned) currentStep = voteSubmitted ? 'complete' : 'vote';
      return {
        claims: {
          done: review.recorded,
          total: review.total,
          signed: review.complete,
          reviewOnly: true,
          status: review.complete ? 'completed' : (review.recorded ? 'current' : 'pending'),
        },
        psych: {
          rated: psychRated,
          total: PSYCH_INDICATOR_TOTAL,
          complete: psychComplete,
          signed: psychSigned,
          status: psychSigned ? 'completed' : 'current',
          docs,
        },
        vote: {
          submitted: voteSubmitted,
          draft: voteDraft,
          label: voteSubmitted ? formatVoteLabel(mine?.vote) : (voteDraft ? 'Draft saved' : 'Awaiting vote'),
          status: voteSubmitted ? 'completed' : (psychSigned ? 'current' : 'pending'),
          score: mine?.score,
        },
        currentStep,
        interviewComplete: psychSigned && voteSubmitted,
      };
    }

    let currentStep = 'form2';
    if (claimsSigned) currentStep = psychSigned ? (voteSubmitted ? 'complete' : 'vote') : 'psych';
    return {
      claims: {
        done: claimsDone,
        total: FORM2_CLAIM_TOTAL,
        signed: claimsSigned,
        status: claimsSigned ? 'completed' : (claimsDone ? 'current' : 'pending'),
      },
      psych: {
        rated: psychRated,
        total: PSYCH_INDICATOR_TOTAL,
        complete: psychComplete,
        signed: psychSigned,
        status: psychSigned ? 'completed' : (claimsSigned ? 'current' : 'pending'),
        docs,
      },
      vote: {
        submitted: voteSubmitted,
        draft: voteDraft,
        label: voteSubmitted ? formatVoteLabel(mine?.vote) : (voteDraft ? 'Draft saved' : 'Awaiting vote'),
        status: voteSubmitted ? 'completed' : ((claimsSigned && psychSigned) ? 'current' : 'pending'),
        score: mine?.score,
      },
      currentStep,
      interviewComplete: claimsSigned && psychSigned && voteSubmitted,
    };
  }

  function renderWorkflowStep(label, detail, status) {
    const icons = { completed: '✓', current: '●', pending: '○' };
    return `<li class="eval-workflow-step eval-workflow-step--${status}">
      <span class="eval-workflow-step__icon" aria-hidden="true">${icons[status] || '○'}</span>
      <span class="eval-workflow-step__body"><strong>${label}</strong><span class="meta">${PMSUI.esc(detail)}</span></span>
    </li>`;
  }

  function renderPsychiatristEvaluationCard(app, actor, hrefFn, { done = false } = {}) {
    const p = PMSStorage.getPrisonerById(app.prisonerId);
    const hearing = PMSStorage.getHearingsByApplication(app.id).find((h) => !['Cancelled', 'Completed'].includes(h.status));
    const wf = getInterviewWorkflowProgress(app, actor);
    const claimsDetail = wf.claims.reviewOnly
      ? (wf.claims.signed
        ? 'Chairman & Commissioner recorded'
        : `${wf.claims.done}/${wf.claims.total} panel assessments recorded`)
      : (wf.claims.signed
        ? 'Signed & saved'
        : `${wf.claims.done}/${wf.claims.total} claims marked`);
    const psychDetail = wf.psych.signed
      ? `Signed & saved${wf.psych.docs ? ` · ${wf.psych.docs} doc(s)` : ''}`
      : (wf.psych.complete
        ? `${wf.psych.rated}/${wf.psych.total} rated — awaiting PIN save`
        : `${wf.psych.rated}/${wf.psych.total} indicators${wf.psych.docs ? ` · ${wf.psych.docs} doc(s)` : ''}`);
    const voteDetail = wf.vote.submitted
      ? `${wf.vote.label}${wf.vote.score != null ? ` · ${wf.vote.score}%` : ''}`
      : wf.vote.label;
    const cardClass = done || wf.interviewComplete
      ? 'eval-queue-card eval-queue-card--done'
      : 'eval-queue-card eval-queue-card--pending';
    const btnLabel = wf.interviewComplete ? 'Review Evaluation' : 'Open Evaluation Portal';
    return `<article class="${cardClass}" data-app="${PMSUI.esc(app.id)}">
      <div class="eval-queue-card__header">
        <div>
          <strong class="eval-queue-card__name">${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)}</strong>
          <span class="eval-queue-card__case">${PMSUI.esc(app.caseNumber || app.id)}</span>
          ${hearing?.scheduledDate ? `<span class="meta">Hearing ${PMSUI.fmtDate(hearing.scheduledDate)}${hearing.scheduledTime ? ` · ${PMSUI.esc(hearing.scheduledTime)}` : ''}</span>` : ''}
        </div>
        <span class="status-pill status-pill--${PMSUI.statusClass(app.status)}">${PMSUI.esc(app.status)}</span>
      </div>
      <ol class="eval-workflow-steps">
        ${renderWorkflowStep(wf.claims.reviewOnly ? 'Form 2 assessments (read-only)' : 'Form 2 verification', claimsDetail, wf.claims.status)}
        ${renderWorkflowStep('Interview evaluation (1–5)', psychDetail, wf.psych.status)}
        ${renderWorkflowStep('Board vote', voteDetail, wf.vote.status)}
      </ol>
      <p class="eval-queue-card__hint">${wf.claims.reviewOnly
        ? 'Review the Chairman and Commissioner Form 2 assessments, complete the 1–5 interview evaluation, sign with your PIN, then submit your vote.'
        : 'Verify Form 2 claims, complete the 1–5 interview evaluation, sign with your PIN, then submit your vote in the portal.'}</p>
      <div class="eval-queue-card__actions">
        <a href="${hrefFn(app.id)}" class="btn-primary btn-sm">${btnLabel}</a>
        ${typeof PMSRBAC !== 'undefined' ? `<a href="${PMSRBAC.prisonerProfileUrl(app.prisonerId)}" class="btn-icon">Case File</a>` : ''}
      </div>
    </article>`;
  }

  function renderPsychiatristEvaluationQueue(actor, apps, options = {}) {
    const hrefFn = options.hrefFn || ((id) => portalHref(id, false));
    const cfg = getRoleConfig(actor);
    const eligible = apps.filter((a) =>
      ['Hearing Scheduled', 'Hearing In Progress', 'Pending Board Review', 'Pre-Parole Report Prepared', 'Deferred'].includes(a.status),
    );
    const pending = eligible.filter((a) => !getInterviewWorkflowProgress(a, actor).interviewComplete);
    const complete = eligible.filter((a) => getInterviewWorkflowProgress(a, actor).interviewComplete);

    const summary = pending.length
      ? `<p class="eval-queue-summary"><strong>${pending.length}</strong> case${pending.length === 1 ? '' : 's'} awaiting your evaluation${complete.length ? ` · ${complete.length} complete` : ''}</p>`
      : (complete.length
        ? `<p class="eval-queue-summary"><strong>${complete.length}</strong> evaluation${complete.length === 1 ? '' : 's'} complete</p>`
        : '');

    const pendingHtml = pending.length
      ? `<h3 class="decisions-subheading">Awaiting evaluation</h3>${pending.map((a) => renderPsychiatristEvaluationCard(a, actor, hrefFn)).join('')}`
      : '';
    const completeHtml = complete.length
      ? `<h3 class="decisions-subheading">Evaluation complete</h3>${complete.map((a) => renderPsychiatristEvaluationCard(a, actor, hrefFn, { done: true })).join('')}`
      : '';

    return `
      <p class="toolbar-note">${PMSUI.esc(cfg.dashboardNote)}</p>
      <p class="toolbar-note toolbar-note--role">Use the Board Evaluation Portal to review Chairman and Commissioner Form 2 assessments, complete the 1–5 interview evaluation, sign with your PIN, and submit your vote.</p>
      ${summary}
      ${pendingHtml}
      ${completeHtml}
      ${!pending.length && !complete.length ? '<p class="empty-state">No cases currently require psychiatric evaluation.</p>' : ''}`;
  }

  function renderDecisionsList(actor, apps, options = {}) {
    const cfg = getRoleConfig(actor);
    const hrefFn = options.hrefFn || ((id) => portalHref(id, false));
    const cardOpts = { primaryLabel: options.primaryLabel || 'Open Board Vote' };
    const eligible = apps.filter((a) => ['Hearing Scheduled', 'Hearing In Progress', 'Pending Board Review'].includes(a.status));
    const pending = eligible.filter((a) => !PMSStorage.hasSubmittedBoardAssessment(a, actor));
    const voted = eligible.filter((a) => PMSStorage.hasSubmittedBoardAssessment(a, actor));
    const roleNote = cfg.roleNote ? `<p class="toolbar-note toolbar-note--role">${PMSUI.esc(cfg.roleNote)}</p>` : '';

    const pendingHtml = pending.length
      ? `<h3 class="decisions-subheading">Awaiting your vote</h3>${pending.map((a) => renderDecisionCard(a, actor, hrefFn, { primary: true, ...cardOpts })).join('')}`
      : '';
    const votedHtml = voted.length
      ? `<h3 class="decisions-subheading">Your votes submitted</h3>${voted.map((a) => renderDecisionCard(a, actor, hrefFn, { done: true, ...cardOpts })).join('')}`
      : '';

    return `
      <p class="toolbar-note">${PMSUI.esc(cfg.dashboardNote)}</p>
      ${roleNote}
      ${pendingHtml}
      ${votedHtml}
      ${!pending.length && !voted.length ? '<p class="empty-state">No cases awaiting your vote.</p>' : ''}`;
  }

  function renderDecisionCard(app, actor, hrefFn, { primary = false, done = false, primaryLabel = 'Open Board Vote' } = {}) {
    const p = PMSStorage.getPrisonerById(app.prisonerId);
    const progress = PMSStorage.getBoardAssessmentProgress(app);
    const mine = PMSStorage.getBoardAssessmentForActor(app, actor);
    const outcome = PMSStorage.getBoardDecisionOutcome(app);
    const btnClass = primary ? 'btn-primary' : 'btn-outline';
    const btnLabel = done ? 'Review Vote' : primaryLabel;
    const formLink = done && PMSStorage.isBoardDecisionFinalized(app)
      ? `<a href="forms/form${outcome === 'Parole Granted' ? 4 : 5}.html?appId=${encodeURIComponent(app.id)}" class="btn-primary btn-sm">Open Form ${outcome === 'Parole Granted' ? 4 : 5}</a>`
      : (done && progress.complete ? '<span class="meta">Outcome finalizing…</span>' : '');
    const cardClass = done ? 'decision-card decision-card--done' : 'decision-card decision-card--pending';
    const prisonerName = `${PMSUI.esc(p?.firstName)} ${PMSUI.esc(p?.lastName)}`;
    const caseRef = PMSUI.esc(app.caseNumber || app.id);
    const voteBadge = mine?.vote
      ? `<span class="vote-badge vote-badge--${voteVariant(mine.vote)}">${PMSUI.esc(formatVoteLabel(mine.vote))}${mine.score != null ? ` · ${mine.score}%` : ''}</span>`
      : '<span class="vote-badge vote-badge--none">No vote yet</span>';
    const statusLine = progress.complete && outcome
      ? `<span class="meta">Board outcome: ${PMSUI.esc(outcome)}</span>`
      : `<span class="meta">Panel votes: ${progress.submitted}/${progress.total}</span>`;
    return `<div class="${cardClass}">
      <div class="decision-card__main">
        <strong class="decision-card__name">${prisonerName}</strong>
        <span class="decision-card__case">${caseRef}</span>
        ${voteBadge}
        ${statusLine}
      </div>
      <div class="decision-card__actions">
        <a href="${hrefFn(app.id)}" class="${btnClass} btn-sm">${btnLabel}</a>
        ${formLink}
      </div>
    </div>`;
  }

  return {
    ASSESSOR_ROLES,
    BOARD_MEMBER_LABELS,
    ROLE_CONFIG,
    VOTE_OPTIONS,
    FIELD_IDS,
    getRoleConfig,
    getBoardMemberLabel,
    formatBoardPosition,
    LEGACY_BOARD_POSITION_LABELS,
    isAssessor,
    showMedicalScore,
    isPsychiatrist,
    portalHref,
    formatVoteLabel,
    voteVariant,
    setVoteChoice,
    bindVoteChoiceButtons,
    focusVoteChoice,
    readFormValues,
    populateForm,
    buildPayload,
    validateDraft,
    validateSubmit,
    applyPortalChrome,
    applyFormChrome,
    applyMedicalScoreVisibility,
    applyVoteFieldVisibility,
    bindVoteFieldVisibility,
    statusMessage,
    progressNote,
    renderDecisionsList,
    renderDecisionCard,
    getInterviewWorkflowProgress,
    getPanelForm2ReviewProgress,
    renderPsychiatristEvaluationQueue,
    renderPsychiatristEvaluationCard,
    FORM2_CLAIM_TOTAL,
  };
})();
