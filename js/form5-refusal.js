/** Form 5 — Applications After Refusal controller */
const PMSForm5Refusal = (() => {
  function checkedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => el.value);
  }

  function setCheckedValues(name, values) {
    if (!Array.isArray(values)) return;
    document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
      el.checked = values.includes(el.value);
    });
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
    if (!PMSRBAC.requireFormAccess(actor, 5, 'view')) return;

    const wf = PMSFormWorkflow.initPage(5);
    if (wf.blocked) return;

    const appId = wf.appId;
    const app = appId && appId !== '_default' ? PMSStorage.getApplicationById(appId) : null;
    const prisoner = app ? PMSStorage.getPrisonerById(app.prisonerId) : null;
    const institution = prisoner ? PMSStorage.getInstitutionById(prisoner.institutionId) : null;
    const hearing = app ? (PMSStorage.getHearingsByApplication(app.id)[0] || null) : null;

    const $ = (id) => document.getElementById(id);
    const prisonerId = $('prisoner-id');
    const applicationIdNew = $('application-id-new');
    const fullName = $('full-name');
    const gender = $('gender');
    const dateOfBirth = $('date-of-birth');
    const facility = $('facility');
    const originalOffence = $('original-offence');
    const dateRefusal = $('date-refusal');
    const refusalNo = $('refusal-no');
    const refusalOther = $('refusal-other');
    const reapplyDate = $('reapply-date');
    const reapplicationDate = $('reapplication-date');
    const recalcCompleted = $('recalc-completed');
    const refusalReasonOther = $('refusal-reason-other');
    const attachedDocsOther = $('attached-docs-other');
    const certName = $('cert-name');
    const certPosition = $('cert-position');
    const certDate = $('cert-date');
    const issuedBanner = $('issued-banner');
    const toast = $('toast');

    if (prisoner) {
      prisonerId.value = prisoner.prisonerNumber || prisoner.id;
      fullName.value = [prisoner.firstName, prisoner.middleName, prisoner.lastName].filter(Boolean).join(' ');
      gender.value = prisoner.gender || gender.value;
      dateOfBirth.value = prisoner.dateOfBirth
        ? new Date(prisoner.dateOfBirth).toLocaleDateString('en-GB')
        : dateOfBirth.value;
      facility.value = institution?.name || facility.value;
      originalOffence.value = prisoner.offence || prisoner.primaryOffence || originalOffence.value;
    }
    if (app?.id) {
      const appIdEl = $('applicationId');
      if (appIdEl) appIdEl.textContent = app.caseNumber || app.id;
      applicationIdNew.value = app.caseNumber || app.id;
      if (app.boardDecision?.decidedAt) {
        dateRefusal.value = new Date(app.boardDecision.decidedAt).toLocaleDateString('en-GB');
      } else if (hearing?.scheduledDate) {
        dateRefusal.value = new Date(hearing.scheduledDate).toLocaleDateString('en-GB');
      }
      PMSFormWorkflow.mountFormChrome(5, app.id);
    }

    certName.value = `${actor.firstName} ${actor.lastName}`;
    if (!reapplyDate.value) {
      const d = new Date();
      d.setMonth(d.getMonth() + 6);
      reapplyDate.value = d.toISOString().slice(0, 10);
    }
    if (!reapplicationDate.value) reapplicationDate.value = new Date().toISOString().slice(0, 10);
    if (!certDate.value) certDate.value = new Date().toISOString().slice(0, 10);

    const STORAGE_KEY = wf.getDataKey();
    let issued = false;
    let officerAuth = null;
    let submitGate = null;

    function mountOfficerAuth() {
      if (typeof PMSFormOfficerAuth === 'undefined') return;
      try {
        const savedAuth = app?.formData?.form5?.digitalSignature || null;
        officerAuth = PMSFormOfficerAuth.create({
          mount: '#officer-auth-mount',
          actor,
          applicationId: app?.id || '',
          formNumber: 5,
          readOnly: issued,
          savedRecord: savedAuth,
          onVerified: () => submitGate?.sync(),
        });
        submitGate = PMSFormOfficerAuth.gateSubmitButtons(officerAuth, ['btn-issue'], {
          canEnable: () => !issued,
        });
        submitGate.sync();
      } catch (err) {
        console.error('Officer authorization failed to mount:', err);
      }
    }

    function updateSummaryBanner() {
      if ($('detaineeName')) $('detaineeName').textContent = fullName?.value || '—';
      if ($('ciNumber')) $('ciNumber').textContent = prisonerId?.value || '—';
      if ($('facilityName')) $('facilityName').textContent = facility?.value || '—';
      if ($('refusalNoDisplay')) $('refusalNoDisplay').textContent = refusalNo?.value || '—';
      if ($('reapplyDisplay')) {
        $('reapplyDisplay').textContent = reapplyDate?.value
          ? new Date(reapplyDate.value).toLocaleDateString('en-GB')
          : '—';
      }
      const statusEl = $('formStatus');
      if (statusEl) {
        statusEl.textContent = issued ? 'ISSUED' : 'DRAFT';
        statusEl.className = issued ? 'status-badge completed' : 'status-badge pending';
      }
    }

    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3500);
    }

    function validateForm() {
      if (!reapplyDate.value) { showToast('Please set the date eligible to reapply.'); reapplyDate.focus(); return false; }
      if (!checkedValues('refusal-reason').length) {
        showToast('Please select at least one reason for refusal.');
        return false;
      }
      return true;
    }

    function getState() {
      return {
        prisonerId: prisonerId.value,
        applicationIdNew: applicationIdNew.value,
        fullName: fullName.value,
        gender: gender.value,
        dateOfBirth: dateOfBirth.value,
        facility: facility.value,
        originalOffence: originalOffence.value,
        dateRefusal: dateRefusal.value,
        refusalNo: refusalNo.value,
        refusalSummary: checkedValues('refusal-summary'),
        refusalOther: refusalOther.value,
        reapplyDate: reapplyDate.value,
        reapplicationDate: reapplicationDate.value,
        form1Attached: document.querySelector('input[name="form1-attached"]:checked')?.value || 'yes',
        recalcCompleted: recalcCompleted.checked,
        refusalReason: checkedValues('refusal-reason'),
        refusalReasonOther: refusalReasonOther.value,
        improvement: checkedValues('improvement'),
        attachedDocs: checkedValues('attached-docs'),
        attachedDocsOther: attachedDocsOther.value,
        certName: certName.value,
        certPosition: certPosition.value,
        certDate: certDate.value,
        // Legacy keys for storage compatibility
        justification: refusalReasonOther.value || checkedValues('refusal-reason').join(', '),
        issued,
      };
    }

    function applyState(data) {
      if (!data) return;
      if (data.prisonerId) prisonerId.value = data.prisonerId;
      if (data.applicationIdNew) applicationIdNew.value = data.applicationIdNew;
      if (data.fullName) fullName.value = data.fullName;
      if (data.gender) gender.value = data.gender;
      if (data.dateOfBirth) dateOfBirth.value = data.dateOfBirth;
      if (data.facility) facility.value = data.facility;
      if (data.originalOffence) originalOffence.value = data.originalOffence;
      if (data.dateRefusal) dateRefusal.value = data.dateRefusal;
      if (data.refusalNo) refusalNo.value = data.refusalNo;
      setCheckedValues('refusal-summary', data.refusalSummary);
      if (data.refusalOther) refusalOther.value = data.refusalOther;
      if (data.reapplyDate) reapplyDate.value = data.reapplyDate;
      if (data.reapplicationDate) reapplicationDate.value = data.reapplicationDate;
      if (data.form1Attached) {
        const radio = document.querySelector(`input[name="form1-attached"][value="${data.form1Attached}"]`);
        if (radio) radio.checked = true;
      }
      if (typeof data.recalcCompleted === 'boolean') recalcCompleted.checked = data.recalcCompleted;
      setCheckedValues('refusal-reason', data.refusalReason);
      if (data.refusalReasonOther) refusalReasonOther.value = data.refusalReasonOther;
      setCheckedValues('improvement', data.improvement);
      setCheckedValues('attached-docs', data.attachedDocs);
      if (data.attachedDocsOther) attachedDocsOther.value = data.attachedDocsOther;
      if (data.certName) certName.value = data.certName;
      if (data.certPosition) certPosition.value = data.certPosition;
      if (data.certDate) certDate.value = data.certDate;
      if (data.justification && !data.refusalReasonOther) refusalReasonOther.value = data.justification;
      issued = !!data.issued;
      issuedBanner.classList.toggle('show', issued);
      updateSummaryBanner();
    }

    function persistDraft(status = 'draft', options = {}) {
      const { saveSource = 'manual' } = options;
      const state = { ...getState(), status, savedAt: new Date().toISOString(), saveSource };
      if (app?.id) PMSStorage.saveFormData(app.id, 'form5', state, actor);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(getState()));
      updateSummaryBanner();
      return state;
    }

    function loadState() {
      try { applyState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); } catch (_) { /* ignore */ }
      if (app?.formData?.form5) applyState(app.formData.form5);
    }

    $('btn-save').addEventListener('click', () => {
      if (!validateForm()) return;
      persistDraft('draft');
      showToast(app?.id ? 'Reapplication record saved to the application.' : 'Draft saved locally.');
    });

    $('btn-issue').addEventListener('click', async () => {
      if (!validateForm()) return;
      if (!PMSFormOfficerAuth.requireVerified(officerAuth, {
        showToast: (msg) => showToast(msg),
        message: 'Enter your 6-digit PIN and click Verify & Sign before issuing Form 5.',
      })) return;
      if (!app) { showToast('Application context is required.'); return; }
      const outcome = PMSStorage.getBoardDecisionOutcome(app);
      if (outcome !== 'Parole Refused') {
        showToast('Board decision must be Parole Refused. Use Form 4 if parole was granted.');
        return;
      }
      if (!PMSStorage.requiredBoardAssessmentsComplete(app)) {
        showToast('All board member votes must be recorded before issuing Form 5.');
        return;
      }
      if (!window.confirm('Issue official Form 5 — Applications After Refusal?')) return;
      try {
        const digitalSignature = officerAuth?.getRecord();
        const draft = persistDraft('draft');
        PMSStorage.issueForm5Refusal(app.id, { ...draft, digitalSignature }, actor);
        issued = true;
        officerAuth?.lock();
        issuedBanner.classList.add('show');
        updateSummaryBanner();
        submitGate?.sync();
        showToast('Form 5 — Applications After Refusal issued.');
        PMSFormWorkflow.navigateAfterSubmit(5, app.id);
      } catch (err) {
        showToast(err.message || 'Could not issue Form 5.');
      }
    });

    $('btn-prev-form')?.addEventListener('click', () => { if (app?.id) PMSFormWorkflow.openForm(3, app.id); });
    $('btn-print').addEventListener('click', () => { if (validateForm()) window.print(); });

    loadState();
    mountOfficerAuth();
    updateSummaryBanner();
    submitGate?.sync();

    if (typeof PMSFormAutosave !== 'undefined') {
      PMSFormAutosave.create({
        root: '#form5-refusal',
        onSave: ({ silent }) => {
          if (issued) return;
          persistDraft('draft', { saveSource: silent ? 'autosave' : 'manual' });
        },
        enabled: () => !issued,
      });
    }
  }

  return { init };
})();
