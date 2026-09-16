/** Form 3 — Parole Hearing Record (hearing phase) */
const PMSForm3Institutional = (() => {
  const FIELD_IDS = [
    'hearingProceedings', 'boardMembersPresent', 'detaineePresent', 'legalRepresentative',
    'hearingOutcomeNotes', 'officerName', 'preparedDate',
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

  function getActiveHearing(appId) {
    if (!appId || typeof PMSStorage === 'undefined') return null;
    return PMSStorage.getHearingsByApplication(appId)
      .find((h) => !['Cancelled'].includes(h.status)) || null;
  }

  function fmtDate(value) {
    if (!value) return '—';
    if (typeof PMSUI !== 'undefined' && PMSUI.fmtDate) return PMSUI.fmtDate(value);
    try {
      return new Date(value).toLocaleDateString('en-GB');
    } catch (_) {
      return String(value);
    }
  }

  function splitHearingNotes(hearing) {
    if (typeof PMSStorage !== 'undefined' && typeof PMSStorage.splitHearingScheduleNotes === 'function') {
      return PMSStorage.splitHearingScheduleNotes(hearing);
    }
    const raw = String(hearing?.notes || hearing?.meetingNotes || '');
    const match = raw.match(/\n?\[Deadline exception:\s*([\s\S]*?)\]\s*$/i);
    if (match) {
      return {
        notes: raw.slice(0, match.index).trim(),
        exceptionReason: match[1].trim(),
        deadlineException: true,
      };
    }
    return {
      notes: raw,
      exceptionReason: hearing?.exceptionReason || '',
      deadlineException: !!hearing?.deadlineException,
    };
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
        canEnable: () => !viewOnly
          && !PMSStorage.isForm3Complete(app?.formData?.form3)
          && !!getActiveHearing(app?.id),
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
    return data;
  }

  function populateForm(data = {}) {
    FIELD_IDS.forEach((id) => {
      const el = $(id);
      if (!el || data[id] == null) return;
      el.value = data[id];
    });
    if (data.preparedDate && $('preparedDate')) $('preparedDate').value = String(data.preparedDate).slice(0, 10);
    else if (data.submittedAt && $('preparedDate') && !$('preparedDate').value) {
      $('preparedDate').value = String(data.submittedAt).slice(0, 10);
    }
  }

  function setHearingRecordEnabled(enabled) {
    const section = $('hearing-record-section');
    section?.classList.toggle('form3-record--locked', !enabled);
    FIELD_IDS.forEach((id) => {
      const el = $(id);
      if (el) el.disabled = !enabled;
    });
    $('btn-save-draft')?.style.setProperty('display', enabled ? '' : 'none');
    $('btn-submit-form3')?.style.setProperty('display', enabled ? '' : 'none');
  }

  function setReadOnly(viewOnly) {
    if (!viewOnly) return;
    FIELD_IDS.forEach((id) => {
      const el = $(id);
      if (el) el.disabled = true;
    });
    $('btn-save-draft')?.style.setProperty('display', 'none');
    $('btn-submit-form3')?.style.setProperty('display', 'none');
    if (!$('form3-view-banner')) {
      const banner = document.createElement('div');
      banner.id = 'form3-view-banner';
      banner.className = 'wf-readonly-banner';
      banner.textContent = 'View only — Form 3 shows the hearing date set by the DJAG Secretary.';
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

  function renderDeadlineAlert(app, hearing) {
    const alert = $('deadline-alert');
    if (!alert || typeof PMSStorage.getHearingDeadlineInfo !== 'function') return;
    const info = PMSStorage.getHearingDeadlineInfo(app);
    if (!info) {
      alert.hidden = true;
      return;
    }
    alert.hidden = false;
    alert.className = 'form3-deadline-alert no-print';
    if (hearing?.scheduledDate) {
      alert.classList.add('scheduled');
      alert.textContent = `Hearing scheduled ${fmtDate(hearing.scheduledDate)}${hearing.scheduledTime ? ` at ${hearing.scheduledTime}` : ''} · Deadline ${fmtDate(info.deadlineAt)}`;
      return;
    }
    if (info.overdue) {
      alert.classList.add('overdue');
      alert.textContent = `Hearing deadline exceeded (${Math.abs(info.daysRemaining)} days overdue). Awaiting DJAG Secretary to schedule.`;
      return;
    }
    alert.textContent = `${info.daysRemaining} day(s) remaining to schedule within the 14-day requirement (deadline: ${fmtDate(info.deadlineAt)}).`;
  }

  function fillScheduleFields(app) {
    const hearing = getActiveHearing(app?.id);
    const whenEl = $('hearingWhen');
    const pending = $('schedule-pending');
    const split = splitHearingNotes(hearing);
    const dateLabel = hearing?.scheduledDate ? fmtDate(hearing.scheduledDate) : '';
    const timeLabel = hearing?.scheduledTime || '';

    if (whenEl) {
      whenEl.textContent = hearing?.scheduledDate
        ? `${dateLabel}${timeLabel ? ` · ${timeLabel}` : ''}`
        : 'Not scheduled';
    }
    if (pending) pending.hidden = !!hearing?.scheduledDate;

    if ($('hearing-date')) $('hearing-date').value = hearing?.scheduledDate || '';
    if ($('hearing-time')) $('hearing-time').value = hearing?.scheduledTime || '';
    if ($('hearing-venue')) $('hearing-venue').value = hearing?.location || '';
    if ($('hearing-notes')) $('hearing-notes').value = split.notes;
    if ($('deadline-exception')) $('deadline-exception').checked = split.deadlineException;
    if ($('exception-reason')) {
      $('exception-reason').hidden = !split.deadlineException;
      $('exception-reason').value = split.exceptionReason;
    }

    ['hearing-date', 'hearing-time', 'hearing-venue', 'hearing-notes', 'deadline-exception', 'exception-reason']
      .forEach((id) => {
        const el = $(id);
        if (!el) return;
        el.disabled = true;
        if (el.type !== 'checkbox') el.readOnly = true;
      });

    renderDeadlineAlert(app, hearing);
    return hearing;
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

  function updateNavButtons(app) {
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
      if ($('applicationId')) $('applicationId').textContent = app.caseNumber || app.id;
      if ($('case-status')) $('case-status').textContent = app.status || '—';
      PMSFormWorkflow.mountFormChrome(3, app.id);
    }

    if (app?.formData?.form3) populateForm(app.formData.form3);
    if (!$('officerName')?.value && !viewOnly) {
      $('officerName').value = `${actor.firstName || ''} ${actor.lastName || ''}`.trim();
    }
    if (!$('preparedDate')?.value) $('preparedDate').value = new Date().toISOString().slice(0, 10);

    const hearing = fillScheduleFields(app);
    const hearingSet = !!hearing?.scheduledDate;
    const formComplete = PMSStorage.isForm3Complete(app?.formData?.form3);
    setHearingRecordEnabled(!viewOnly && hearingSet && !formComplete);
    mountOfficerAuth(actor, app, viewOnly);
    if (viewOnly || formComplete) setReadOnly(true);
    renderReadinessAlert(app);
    updateStatusBadge(app);
    updateNavButtons(app);
    submitGate?.sync();

    if (app?.formData?.form3 && formComplete) {
      PMSFormWorkflow.showContinueBanner(3, app.id);
    }

    function saveDraft(options = {}) {
      const { silent = false } = options;
      if (!app) {
        if (!silent) showToast('Application context is required.');
        return;
      }
      if (viewOnly || PMSStorage.isForm3Complete(app?.formData?.form3)) return;
      if (!getActiveHearing(app.id)?.scheduledDate) {
        if (!silent) showToast('The DJAG Secretary must set the hearing date before this record can be saved.');
        return;
      }
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
        enabled: () => !!app?.id
          && !viewOnly
          && !PMSStorage.isForm3Complete(app?.formData?.form3)
          && !!getActiveHearing(app.id)?.scheduledDate,
      });
    }

    $('btn-submit-form3')?.addEventListener('click', async () => {
      if (!app || !prisoner) {
        showToast('Application context is required.');
        return;
      }
      if (!getActiveHearing(app.id)?.scheduledDate) {
        showToast('The DJAG Secretary must set the hearing date before Form 3 can be submitted.');
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
        updateNavButtons(app);
        submitGate?.sync();
        fillScheduleFields(app);
        setHearingRecordEnabled(false);
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

    async function syncScheduleFromSecretary() {
      if (!app?.id) return;
      try {
        if (typeof PMSStorage.pullRemoteHearingSessions === 'function') {
          await PMSStorage.pullRemoteHearingSessions();
        }
        app = PMSStorage.getApplicationById(app.id) || app;
        const live = fillScheduleFields(app);
        const canRecord = !viewOnly && !!live?.scheduledDate && !PMSStorage.isForm3Complete(app?.formData?.form3);
        setHearingRecordEnabled(canRecord);
        if ($('case-status')) $('case-status').textContent = app.status || '—';
        submitGate?.sync();
      } catch (_) { /* keep current schedule view */ }
    }

    window.setInterval(syncScheduleFromSecretary, 4000);
  }

  return { init };
})();
