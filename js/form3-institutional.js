/** Form 3 — Parole Hearing Record (hearing phase) */
const PMSForm3Institutional = (() => {
  const FIELD_IDS = [
    'dateOfAdmission', 'sentenceReviewDate', 'conductDuringSentence', 'disciplinaryRecord',
    'programParticipation', 'workAssignment', 'mentalHealthAssessment', 'medicalAssessment',
    'institutionalRecommendation', 'recommendationNotes', 'officerName', 'commanderName', 'preparedDate',
    'hearingProceedings', 'boardMembersPresent', 'detaineePresent', 'legalRepresentative', 'hearingOutcomeNotes',
  ];

  function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function $(id) {
    return document.getElementById(id);
  }

  let officerAuth = null;
  let submitGate = null;

  function showToast(msg) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  function mountOfficerAuth(actor, app, viewOnly) {
    if (typeof PMSFormOfficerAuth === 'undefined') return;
    try {
      const savedAuth = app?.formData?.form3?.digitalSignature || null;
      const formComplete = PMSStorage.isForm3Complete(app?.formData?.form3);
      officerAuth = PMSFormOfficerAuth.create({
        mount: '#officer-auth-mount',
        actor,
        applicationId: app?.id || '',
        formNumber: 3,
        readOnly: viewOnly || formComplete,
        savedRecord: savedAuth,
        onVerified: () => submitGate?.sync(),
      });
      submitGate = PMSFormOfficerAuth.gateSubmitButtons(officerAuth, ['btn-submit-form3'], {
        canEnable: () => !viewOnly && !PMSStorage.isForm3Complete(app?.formData?.form3),
      });
      submitGate.sync();
    } catch (err) {
      console.error('Officer authorization failed to mount:', err);
    }
  }

  function collectPayload() {
    const data = {};
    FIELD_IDS.forEach((id) => {
      const el = $(id);
      if (el) data[id] = el.value.trim();
    });
    data.commanderRecommendation = data.institutionalRecommendation;
    data.institutionalReport = [
      data.conductDuringSentence,
      data.programParticipation,
      data.disciplinaryRecord,
    ].filter(Boolean).join('\n\n');
    data.recommendation = data.institutionalRecommendation;
    return data;
  }

  function populateForm(data = {}) {
    FIELD_IDS.forEach((id) => {
      const el = $(id);
      if (!el || data[id] == null) return;
      el.value = data[id];
    });
    const rec = data.institutionalRecommendation || data.commanderRecommendation || data.recommendation;
    if (rec && $('institutionalRecommendation')) $('institutionalRecommendation').value = rec;
    if (data.officerName && $('officerName')) $('officerName').value = data.officerName;
    else if (data.commanderName && $('officerName') && !$('officerName').value) {
      /* officerName takes precedence */
    }
    if (data.commanderName && $('commanderName')) $('commanderName').value = data.commanderName;
    if (data.preparedDate && $('preparedDate')) $('preparedDate').value = String(data.preparedDate).slice(0, 10);
    else if (data.submittedAt && $('preparedDate')) $('preparedDate').value = String(data.submittedAt).slice(0, 10);
  }

  function setReadOnly(viewOnly) {
    FIELD_IDS.forEach((id) => {
      const el = $(id);
      if (el) el.disabled = viewOnly;
    });
    $('btn-save-draft')?.style.setProperty('display', viewOnly ? 'none' : '');
    $('btn-submit-form3')?.style.setProperty('display', viewOnly ? 'none' : '');
    if (viewOnly && !$('form3-view-banner')) {
      const banner = document.createElement('div');
      banner.id = 'form3-view-banner';
      banner.className = 'wf-readonly-banner';
      banner.textContent = 'View only — Form 3 is maintained by CS Parole Clerk.';
      document.querySelector('.page-main')?.insertBefore(banner, document.querySelector('.page-main')?.firstChild);
    }
  }

  function renderReadinessAlert(app) {
    const alert = $('readiness-alert');
    if (!alert || typeof PMSValidation === 'undefined') return true;
    const report = PMSValidation.validateForm3Checkpoint(app);
    if (report.allPassed) {
      alert.classList.add('hidden');
      alert.innerHTML = '';
      return true;
    }
    const issues = report.items.filter((i) => !i.ok).map((i) => i.label).slice(0, 3);
    alert.classList.remove('hidden');
    alert.innerHTML = `<strong>Prerequisites incomplete:</strong> ${esc(issues.join('; '))}${issues.length < report.items.filter((i) => !i.ok).length ? '…' : ''} — complete Forms 1 and 2 before submitting Form 3.`;
    return false;
  }

  function renderHearingSummary(app) {
    const host = $('hearing-summary');
    if (!host || !app) return;
    const hearing = PMSStorage.getHearingsByApplication(app.id).find((h) => !['Cancelled'].includes(h.status));
    if (!hearing) {
      host.innerHTML = '<p class="form3-hearing-summary__empty">No hearing scheduled yet. After commander verification, the DJAG Secretary schedules the parole hearing — then complete this Form 3 hearing record.</p>';
      return;
    }
    host.innerHTML = `<dl class="form3-hearing-summary__grid">
      <div><dt>Scheduled date</dt><dd>${esc(PMSUI?.fmtDate?.(hearing.scheduledDate) || hearing.scheduledDate || '—')}${hearing.scheduledTime ? ` · ${esc(hearing.scheduledTime)}` : ''}</dd></div>
      <div><dt>Venue</dt><dd>${esc(hearing.location || '—')}</dd></div>
      <div><dt>Status</dt><dd><span class="status-badge eligible">${esc(hearing.status || 'Scheduled')}</span></dd></div>
      ${hearing.notes ? `<div class="form3-hearing-summary__notes"><dt>Notes</dt><dd>${esc(hearing.notes)}</dd></div>` : ''}
    </dl>`;
  }

  function updateStatusBadge(app) {
    const badge = $('form3Status');
    if (!badge) return;
    const f3 = app?.formData?.form3;
    if (PMSStorage.isForm3Complete(f3)) {
      badge.textContent = 'SUBMITTED';
      badge.className = 'status-badge completed';
    } else if (f3 && Object.keys(f3).length > 1) {
      badge.textContent = 'DRAFT';
      badge.className = 'status-badge in-progress';
    } else {
      badge.textContent = 'DRAFT';
      badge.className = 'status-badge pending';
    }
  }

  function updateNavButtons(app, wf) {
    const hearingBtn = $('btn-open-hearing');
    const nextBtn = $('btn-next-form');
    const canHearing = typeof PMSFormWorkflow !== 'undefined'
      && (PMSFormWorkflow.canAccessHearingPortal?.() || PMSFormWorkflow.canScheduleHearing?.());
    const f3Done = PMSStorage.isForm3Complete(app?.formData?.form3);

    if (hearingBtn) hearingBtn.hidden = !(canHearing && f3Done);
    if (nextBtn) {
      const outcome = PMSFormWorkflow.getOutcomeFormN?.(app.id) || null;
      nextBtn.hidden = !outcome;
      if (outcome) nextBtn.textContent = `Form ${outcome} →`;
    }

    const submitBtn = $('btn-submit-form3');
    if (submitBtn && PMSStorage.isForm3Complete(app?.formData?.form3)) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Form 3 Submitted';
    }
  }

  async function init() {
    await PMSStorage.ensureLoaded();
    const session = PMSStorage.getSession();
    if (!session) {
      window.location.replace('../index.html');
      return;
    }
    const actor = PMSStorage.getUserById(session.id) || session;
    actor.role = PMSAuth.normalizeRole(actor.role);
    if (!PMSRBAC.requireFormAccess(actor, 3, 'view')) return;

    const viewOnly = !PMSRBAC.canAccessForm(actor, 3, 'edit');
    const wf = PMSFormWorkflow.initPage(3);
    if (wf.blocked) return;

    const appId = wf.appId;
    let app = appId && appId !== '_default' ? PMSStorage.getApplicationById(appId) : null;
    const prisoner = app ? PMSStorage.getPrisonerById(app.prisonerId) : null;
    const institution = prisoner ? PMSStorage.getInstitutionById(prisoner.institutionId) : null;

    if (app && prisoner) {
      const prisonerName = [prisoner.firstName, prisoner.middleName, prisoner.lastName].filter(Boolean).join(' ');
      if ($('detaineeName')) $('detaineeName').textContent = prisonerName;
      if ($('ciNumber')) $('ciNumber').textContent = prisoner.prisonerNumber || prisoner.id;
      if ($('facilityName')) $('facilityName').textContent = institution?.name || '—';
      if ($('applicationDate')) {
        $('applicationDate').textContent = app.submittedAt
          ? new Date(app.submittedAt).toLocaleDateString('en-GB')
          : '—';
      }
      if ($('applicationId')) $('applicationId').textContent = app.caseNumber || app.id;
      if ($('case-status')) $('case-status').textContent = app.status || '—';
      if ($('dateOfAdmission') && prisoner.dateOfAdmission && !$('dateOfAdmission').value) {
        $('dateOfAdmission').value = String(prisoner.dateOfAdmission).slice(0, 10);
      }
      PMSFormWorkflow.mountFormChrome(3, app.id);
    }

    if (app?.formData?.form3) populateForm(app.formData.form3);
    if (!$('officerName')?.value && !viewOnly) {
      $('officerName').value = `${actor.firstName || ''} ${actor.lastName || ''}`.trim();
    }
    if (!$('preparedDate')?.value) $('preparedDate').value = new Date().toISOString().slice(0, 10);

    mountOfficerAuth(actor, app, viewOnly);
    setReadOnly(viewOnly);
    renderReadinessAlert(app);
    renderHearingSummary(app);
    updateStatusBadge(app);
    updateNavButtons(app, wf);
    submitGate?.sync();

    if (app?.formData?.form3 && PMSStorage.isForm3Complete(app.formData.form3)) {
      PMSFormWorkflow.showContinueBanner(3, app.id);
    }

    function saveDraft(options = {}) {
      const { silent = false } = options;
      if (!app) {
        if (!silent) showToast('Application context is required.');
        return;
      }
      if (viewOnly || PMSStorage.isForm3Complete(app?.formData?.form3)) return;
      const payload = {
        ...collectPayload(),
        status: 'draft',
        submitted: false,
        savedAt: new Date().toISOString(),
        saveSource: silent ? 'autosave' : 'manual',
      };
      PMSStorage.saveFormData(app.id, 'form3', payload, actor);
      app = PMSStorage.getApplicationById(app.id);
      updateStatusBadge(app);
      if (!silent) showToast('Draft saved.');
    }

    $('btn-save-draft')?.addEventListener('click', () => {
      try {
        saveDraft({ silent: false });
      } catch (err) {
        showToast(err.message || 'Could not save draft.');
      }
    });

    if (typeof PMSFormAutosave !== 'undefined' && !viewOnly) {
      PMSFormAutosave.create({
        root: '#form3-form',
        onSave: ({ silent }) => {
          saveDraft({ silent });
        },
        enabled: () => !!app?.id && !viewOnly && !PMSStorage.isForm3Complete(app?.formData?.form3),
      });
    }

    $('btn-submit-form3')?.addEventListener('click', async () => {
      if (!app || !prisoner) {
        showToast('Application context is required.');
        return;
      }
      if (!PMSFormOfficerAuth.requireVerified(officerAuth, {
        showToast: (msg) => showToast(msg),
        message: 'Enter your 6-digit PIN and click Verify & Sign before submitting Form 3.',
      })) {
        return;
      }
      if (!renderReadinessAlert(app)) {
        showToast('Complete Forms 1 and 2 before submitting Form 3.');
        return;
      }
      const payload = collectPayload();
      const validation = PMSValidation.validateForm3(payload);
      if (!validation.valid) {
        showToast(validation.errors[0] || 'Please complete all required fields.');
        PMSValidation.showFieldErrors($('form3-form'), validation.errors);
        return;
      }
      try {
        const digitalSignature = officerAuth?.getRecord();
        const submitPayload = {
          ...payload,
          digitalSignature,
          submitted: true,
          status: 'submitted',
          submittedAt: new Date().toISOString(),
        };
        PMSStorage.saveFormData(app.id, 'form3', submitPayload, actor);
        officerAuth?.lock();
        PMSFormWorkflow.markComplete(3, app.id, { submitted: true });
        PMSFormWorkflow.mountFormChrome(3, app.id);
        app = PMSStorage.getApplicationById(app.id);
        populateForm(app.formData.form3);
        updateStatusBadge(app);
        updateNavButtons(app, wf);
        submitGate?.sync();
        renderHearingSummary(app);
        showToast('Form 3 hearing record submitted.');
        PMSFormWorkflow.showContinueBanner(3, app.id);
      } catch (err) {
        showToast(err.message || 'Could not submit Form 3.');
      }
    });

    $('btn-open-hearing')?.addEventListener('click', () => {
      if (!app?.id) return;
      if (PMSFormWorkflow.canScheduleHearing?.()) {
        window.location.href = PMSFormWorkflow.schedulePortalHref(app.id);
      } else {
        window.location.href = PMSFormWorkflow.hearingPortalHref(app.id);
      }
    });

    $('btn-prev-form')?.addEventListener('click', () => {
      if (app?.id) PMSFormWorkflow.openForm(2, app.id);
    });

    $('btn-next-form')?.addEventListener('click', () => {
      if (!app?.id) return;
      const outcome = PMSFormWorkflow.getOutcomeFormN?.(app.id);
      if (outcome) PMSFormWorkflow.openForm(outcome, app.id);
    });

    $('btn-print')?.addEventListener('click', () => window.print());
  }

  return { init };
})();
