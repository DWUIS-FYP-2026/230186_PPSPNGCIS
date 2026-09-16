/** Form 4 — Discharge of Parole Order controller */
const PMSForm4Grant = (() => {
  async function init() {
    await PMSStorage.ensureLoaded();
    const actor = PMSAuth.requireRole(['DJAG Secretary', 'DJAG Parole Clerk', 'System Administrator']);
    if (!actor) return;

    const wf = PMSFormWorkflow.initPage(4);
    if (wf.blocked) return;

    const appId = wf.appId;
    const app = appId && appId !== '_default' ? PMSStorage.getApplicationById(appId) : null;
    const prisoner = app ? PMSStorage.getPrisonerById(app.prisonerId) : null;
    const institution = prisoner ? PMSStorage.getInstitutionById(prisoner.institutionId) : null;

    const $ = (id) => document.getElementById(id);
    const paroleeId = $('parolee-id');
    const fullName = $('full-name');
    const dateOfBirth = $('date-of-birth');
    const gender = $('gender');
    const originalOffence = $('original-offence');
    const dateParoled = $('date-paroled');
    const paroleOrderNo = $('parole-order-no');
    const supervisingCbc = $('supervising-cbc');
    const paroleOfficer = $('parole-officer');
    const dateCompleted = $('date-completed');
    const parolePeriod = $('parole-period');
    const decisionDate = $('decision-date');
    const preparedBy = $('prepared-by');
    const preparedPosition = $('prepared-position');
    const dateIssued = $('date-issued');
    const issuedBanner = $('issued-banner');
    const toast = $('toast');

    if (prisoner) {
      paroleeId.value = prisoner.prisonerNumber || prisoner.id;
      fullName.value = [prisoner.firstName, prisoner.middleName, prisoner.lastName].filter(Boolean).join(' ');
      dateOfBirth.value = prisoner.dateOfBirth
        ? new Date(prisoner.dateOfBirth).toLocaleDateString('en-GB')
        : dateOfBirth.value;
      gender.value = prisoner.gender || gender.value;
      originalOffence.value = prisoner.offence || prisoner.primaryOffence || originalOffence.value;
      if (institution) supervisingCbc.value = institution.name;
    }
    if (app?.id) {
      const appIdEl = $('applicationId');
      if (appIdEl) appIdEl.textContent = app.caseNumber || app.id;
      if (app.caseNumber) paroleOrderNo.value = app.caseNumber.replace('PMS', 'PO');
      PMSFormWorkflow.mountFormChrome(4, app.id);
    }

    preparedBy.value = `${actor.firstName} ${actor.lastName}`;
    decisionDate.value = new Date().toLocaleDateString('en-GB');
    if (!dateCompleted.value) dateCompleted.value = new Date().toISOString().slice(0, 10);
    if (!dateIssued.value) dateIssued.value = new Date().toISOString().slice(0, 10);

    const STORAGE_KEY = wf.getDataKey();
    let issued = false;
    let officerAuth = null;
    let submitGate = null;

    function mountOfficerAuth() {
      if (typeof PMSFormOfficerAuth === 'undefined') return;
      try {
        const savedAuth = app?.formData?.form4?.digitalSignature || null;
        officerAuth = PMSFormOfficerAuth.create({
          mount: '#officer-auth-mount',
          actor,
          applicationId: app?.id || '',
          formNumber: 4,
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
      if ($('ciNumber')) $('ciNumber').textContent = paroleeId?.value || '—';
      if ($('facilityName')) $('facilityName').textContent = supervisingCbc?.value || institution?.name || '—';
      if ($('paroleOrderDisplay')) $('paroleOrderDisplay').textContent = paroleOrderNo?.value || '—';
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
      if (!dateCompleted.value) { showToast('Please set the date completed on parole.'); dateCompleted.focus(); return false; }
      if (!parolePeriod.value.trim()) { showToast('Please enter total period on parole.'); parolePeriod.focus(); return false; }
      return true;
    }

    function getState() {
      return {
        paroleeId: paroleeId.value,
        fullName: fullName.value,
        dateOfBirth: dateOfBirth.value,
        gender: gender.value,
        originalOffence: originalOffence.value,
        dateParoled: dateParoled.value,
        paroleOrderNo: paroleOrderNo.value,
        supervisingCbc: supervisingCbc.value,
        paroleOfficer: paroleOfficer.value,
        dateCompleted: dateCompleted.value,
        parolePeriod: parolePeriod.value,
        decisionDate: decisionDate.value,
        preparedBy: preparedBy.value,
        preparedPosition: preparedPosition.value,
        dateIssued: dateIssued.value,
        issued,
      };
    }

    function applyState(data) {
      if (!data) return;
      if (data.paroleeId) paroleeId.value = data.paroleeId;
      if (data.fullName) fullName.value = data.fullName;
      if (data.dateOfBirth) dateOfBirth.value = data.dateOfBirth;
      if (data.gender) gender.value = data.gender;
      if (data.originalOffence) originalOffence.value = data.originalOffence;
      if (data.dateParoled) dateParoled.value = data.dateParoled;
      if (data.paroleOrderNo) paroleOrderNo.value = data.paroleOrderNo;
      if (data.supervisingCbc) supervisingCbc.value = data.supervisingCbc;
      if (data.paroleOfficer) paroleOfficer.value = data.paroleOfficer;
      if (data.dateCompleted) dateCompleted.value = data.dateCompleted;
      if (data.parolePeriod) parolePeriod.value = data.parolePeriod;
      if (data.decisionDate) decisionDate.value = data.decisionDate;
      if (data.preparedBy) preparedBy.value = data.preparedBy;
      if (data.preparedPosition) preparedPosition.value = data.preparedPosition;
      if (data.dateIssued) dateIssued.value = data.dateIssued;
      // Legacy field mapping
      if (data.releaseDate && !data.dateCompleted) dateCompleted.value = data.releaseDate;
      if (data.paroleDuration && !data.parolePeriod) parolePeriod.value = `${data.paroleDuration} months`;
      issued = !!data.issued;
      issuedBanner.classList.toggle('show', issued);
      updateSummaryBanner();
    }

    function persistDraft(status = 'draft', options = {}) {
      const { saveSource = 'manual' } = options;
      const state = { ...getState(), status, savedAt: new Date().toISOString(), saveSource };
      if (app?.id) PMSStorage.saveFormData(app.id, 'form4', state, actor);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(getState()));
      updateSummaryBanner();
      return state;
    }

    function loadState() {
      try { applyState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); } catch (_) { /* ignore */ }
      if (app?.formData?.form4) applyState(app.formData.form4);
    }

    $('btn-save').addEventListener('click', () => {
      if (!validateForm()) return;
      persistDraft('draft');
      showToast(app?.id ? 'Discharge record saved to the application.' : 'Draft saved locally.');
    });

    $('btn-issue').addEventListener('click', async () => {
      if (!validateForm()) return;
      if (!PMSFormOfficerAuth.requireVerified(officerAuth, {
        showToast: (msg) => showToast(msg),
        message: 'Enter your 6-digit PIN and click Verify & Sign before issuing Form 4.',
      })) return;
      if (!app || !prisoner) { showToast('Application context is required.'); return; }
      const outcome = PMSStorage.getBoardDecisionOutcome(app);
      if (outcome !== 'Parole Granted') {
        showToast('Board decision must be Parole Granted. Use Form 5 if parole was refused.');
        return;
      }
      if (!PMSStorage.requiredBoardAssessmentsComplete(app)) {
        showToast('All board member votes must be recorded before issuing Form 4.');
        return;
      }
      if (!window.confirm('Issue official Form 4 — Discharge of Parole Order?')) return;
      try {
        const digitalSignature = officerAuth?.getRecord();
        const draft = persistDraft('draft');
        PMSStorage.issueForm4Grant(app.id, { ...draft, digitalSignature }, actor);
        issued = true;
        officerAuth?.lock();
        issuedBanner.classList.add('show');
        updateSummaryBanner();
        submitGate?.sync();
        showToast('Form 4 issued — case archived to parole granted records.');
        PMSFormWorkflow.navigateAfterSubmit(4, app.id);
      } catch (err) {
        showToast(err.message || 'Could not issue Form 4.');
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
        root: '#form4-grant',
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
