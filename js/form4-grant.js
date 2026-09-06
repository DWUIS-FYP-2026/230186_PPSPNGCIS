/** Form 4 — Parole Granted controller */
const PMSForm4Grant = (() => {
  const CONDITION_IDS = [
    'cond-weekly', 'cond-reside', 'cond-curfew', 'cond-offences', 'cond-ncd',
    'cond-anger', 'cond-testing',
  ];

  async function init() {
    await PMSStorage.ensureLoaded();
    const actor = PMSAuth.requireRole(['Parole Board Member', 'DJAG Parole Clerk', 'System Administrator']);
    if (!actor) return;

    const wf = PMSFormWorkflow.initPage(4);
    if (wf.blocked) return;

    const appId = wf.appId;
    const app = appId && appId !== '_default' ? PMSStorage.getApplicationById(appId) : null;
    const prisoner = app ? PMSStorage.getPrisonerById(app.prisonerId) : null;
    const institution = prisoner ? PMSStorage.getInstitutionById(prisoner.institutionId) : null;
    const hearing = app ? (PMSStorage.getHearingsByApplication(app.id)[0] || null) : null;

    if (prisoner) {
      document.getElementById('cs-number').value = prisoner.prisonerNumber || prisoner.id;
      document.getElementById('full-name').value = [prisoner.firstName, prisoner.middleName, prisoner.lastName].filter(Boolean).join(' ');
      document.getElementById('facility').value = institution?.name || '—';
      if (hearing) {
        document.getElementById('hearing-date').value = hearing.scheduledDate
          ? new Date(hearing.scheduledDate).toLocaleDateString('en-GB')
          : '—';
      }
    }
    if (app?.id) {
      const appIdEl = document.getElementById('applicationId');
      if (appIdEl) appIdEl.textContent = app.caseNumber || app.id;
      PMSFormWorkflow.mountFormChrome(4, app.id);
    }

    document.getElementById('decision-by').value = `${actor.firstName} ${actor.lastName}${actor.boardPosition ? ` (${actor.boardPosition})` : ''}`;
    document.getElementById('decision-date').value = new Date().toLocaleDateString('en-GB');

    const STORAGE_KEY = wf.getDataKey();
    let issued = false;

    const releaseDate = document.getElementById('release-date');
    const paroleDuration = document.getElementById('parole-duration');
    const supervisionLevel = document.getElementById('supervision-level');
    const releaseAddress = document.getElementById('release-address');
    const additionalConditions = document.getElementById('additional-conditions');
    const issuedBanner = document.getElementById('issued-banner');
    const toast = document.getElementById('toast');

    if (!releaseDate.value) releaseDate.value = new Date().toISOString().slice(0, 10);

    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3500);
    }

    function getConditionsState() {
      const state = {};
      CONDITION_IDS.forEach((id) => { state[id] = document.getElementById(id).checked; });
      return state;
    }

    function applyConditionsState(state) {
      if (!state) return;
      CONDITION_IDS.forEach((id) => {
        if (Object.prototype.hasOwnProperty.call(state, id)) {
          document.getElementById(id).checked = state[id];
        }
      });
    }

    function validateForm() {
      if (!releaseDate.value) { showToast('Please set the release date.'); releaseDate.focus(); return false; }
      if (!paroleDuration.value) { showToast('Please select parole duration.'); paroleDuration.focus(); return false; }
      if (!supervisionLevel.value) { showToast('Please select supervision level.'); supervisionLevel.focus(); return false; }
      if (!releaseAddress.value.trim()) { showToast('Please enter the release address.'); releaseAddress.focus(); return false; }
      const requiredMissing = CONDITION_IDS.filter((id) => {
        const el = document.getElementById(id);
        return el.dataset.required === 'true' && !el.checked;
      });
      if (requiredMissing.length) {
        showToast('All standard parole conditions must remain checked.');
        return false;
      }
      return true;
    }

    function getState() {
      return {
        releaseDate: releaseDate.value,
        paroleDuration: paroleDuration.value,
        supervisionLevel: supervisionLevel.value,
        releaseAddress: releaseAddress.value,
        additionalConditions: additionalConditions.value,
        conditions: getConditionsState(),
        issued,
      };
    }

    function applyState(data) {
      if (!data) return;
      if (data.releaseDate) releaseDate.value = data.releaseDate;
      if (data.paroleDuration) paroleDuration.value = data.paroleDuration;
      if (data.supervisionLevel) supervisionLevel.value = data.supervisionLevel;
      if (data.releaseAddress) releaseAddress.value = data.releaseAddress;
      if (data.additionalConditions) additionalConditions.value = data.additionalConditions;
      applyConditionsState(data.conditions);
      issued = !!data.issued;
      issuedBanner.classList.toggle('show', issued);
    }

    function persistDraft(status = 'draft') {
      const state = { ...getState(), status, savedAt: new Date().toISOString() };
      if (app?.id) {
        PMSStorage.saveFormData(app.id, 'form4', state, actor);
      } else {
        saveState();
      }
      return state;
    }

    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getState()));
    }

    function loadState() {
      try {
        applyState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
      } catch (_) { /* ignore */ }
      if (app?.formData?.form4) {
        applyState(app.formData.form4);
        if (app.formData.form4.justification && !additionalConditions.value) {
          additionalConditions.value = app.formData.form4.boardDecisionSummary || '';
        }
      }
      if (app?.boardDecision?.conditions && !additionalConditions.value) {
        additionalConditions.value = app.boardDecision.conditions;
      }
    }

    document.getElementById('btn-save').addEventListener('click', () => {
      if (!validateForm()) return;
      if (!app?.id) {
        saveState();
        showToast('Draft saved locally. Open Form 4 from a linked application to save to the system.');
        return;
      }
      persistDraft('draft');
      showToast('Parole approval record saved to the application.');
    });

    document.getElementById('btn-issue').addEventListener('click', async () => {
      if (!validateForm()) return;
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
      if (!window.confirm('Issue official Form 4 — Parole Granted based on the board decision?')) return;
      try {
        const draft = persistDraft('draft');
        PMSStorage.issueForm4Grant(app.id, draft, actor);
        issued = true;
        saveState();
        wf.markCompleteAndAdvance({ issued: true });
        issuedBanner.classList.add('show');
        showToast('Form 4 — Parole Granted issued.');
        PMSFormWorkflow.navigateAfterSubmit(4, app.id);
      } catch (err) {
        showToast(err.message || 'Could not issue parole grant.');
      }
    });

    document.getElementById('btn-prev-form')?.addEventListener('click', () => {
      if (app?.id) PMSFormWorkflow.openForm(3, app.id);
    });
    document.getElementById('btn-switch-form5')?.addEventListener('click', () => {
      if (app?.id) PMSFormWorkflow.openForm(5, app.id);
    });
    document.getElementById('btn-print-conditions').addEventListener('click', () => {
      document.body.classList.add('print-conditions');
      window.print();
      window.addEventListener('afterprint', function cleanup() {
        document.body.classList.remove('print-conditions');
        window.removeEventListener('afterprint', cleanup);
      });
    });
    document.getElementById('btn-print').addEventListener('click', () => {
      if (!validateForm()) return;
      window.print();
    });

    loadState();
  }

  return { init };
})();
