/** Form 5 — Parole Refused controller */
const PMSForm5Refusal = (() => {
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
    const viewOnly = !PMSRBAC.canAccessForm(actor, 5, 'edit');

    const wf = PMSFormWorkflow.initPage(5);
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
    if (app?.id) PMSFormWorkflow.mountFormChrome(5, app.id);

    const STORAGE_KEY = wf.getDataKey();
    let issued = false;

    const refusalReason = document.getElementById('refusal-reason');
    const justification = document.getElementById('justification');
    const reapplyDate = document.getElementById('reapply-date');
    const issuedBanner = document.getElementById('issued-banner');
    const toast = document.getElementById('toast');

    if (!reapplyDate.value) {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      reapplyDate.value = d.toISOString().slice(0, 10);
    }

    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3500);
    }

    function validateForm() {
      if (!refusalReason.value) { showToast('Please select a reason for refusal.'); refusalReason.focus(); return false; }
      if (!justification.value.trim()) { showToast('Please provide a detailed justification.'); justification.focus(); return false; }
      if (!reapplyDate.value) { showToast('Please set the reapplication eligible date.'); reapplyDate.focus(); return false; }
      return true;
    }

    function getState() {
      return {
        refusalReason: refusalReason.value,
        justification: justification.value,
        reapplyDate: reapplyDate.value,
        issued,
      };
    }

    function applyState(data) {
      if (!data) return;
      if (data.refusalReason) refusalReason.value = data.refusalReason;
      if (data.justification) justification.value = data.justification;
      if (data.reapplyDate) reapplyDate.value = data.reapplyDate;
      issued = !!data.issued;
      issuedBanner.classList.toggle('show', issued);
    }

    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getState()));
    }

    function loadState() {
      try {
        applyState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
      } catch (_) { /* ignore */ }
      if (app?.formData?.form5) applyState(app.formData.form5);
    }

    document.getElementById('btn-save').addEventListener('click', () => {
      if (!validateForm()) return;
      saveState();
      showToast('Refusal record saved successfully.');
    });

    document.getElementById('btn-issue').addEventListener('click', async () => {
      if (!validateForm()) return;
      if (!app) { showToast('Application context is required.'); return; }
      const score = PMSStorage.calculateParoleScore(app);
      if (score.meetsThreshold) {
        showToast(`Score ${score.percent}% meets 80% threshold. Use Form 4 for parole grant.`);
        return;
      }
      if (!window.confirm('Record official Parole Refusal based on the calculated score?')) return;
      try {
        PMSStorage.routeParoleOutcome(app.id, actor);
        issued = true;
        saveState();
        wf.markCompleteAndAdvance({ issued: true });
        issuedBanner.classList.add('show');
        showToast('Form 5 — Parole Refused recorded.');
        PMSFormWorkflow.navigateAfterSubmit(5, app.id);
      } catch (err) {
        showToast(err.message || 'Could not record refusal.');
      }
    });

    document.getElementById('btn-prev-form')?.addEventListener('click', () => {
      if (app?.id) PMSFormWorkflow.openForm(3, app.id);
    });
    document.getElementById('btn-switch-form4')?.addEventListener('click', () => {
      if (app?.id) PMSFormWorkflow.openForm(4, app.id);
    });
    document.getElementById('btn-print').addEventListener('click', () => {
      if (!validateForm()) return;
      window.print();
    });

    loadState();
  }

  return { init };
})();
