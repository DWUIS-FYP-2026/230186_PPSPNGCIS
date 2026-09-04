/** Form 3 — Institutional Report controller */
const PMSForm3Institutional = (() => {
  function applyViewOnly(actor) {
    document.getElementById('btn-save')?.style.setProperty('display', 'none');
    document.getElementById('btn-submit')?.style.setProperty('display', 'none');
    ['commander-name', 'recommendation', 'institutional-report', 'conduct-summary'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'SELECT') el.disabled = true;
      else el.readOnly = true;
    });
    if (!document.getElementById('form3-view-banner')) {
      const banner = document.createElement('div');
      banner.id = 'form3-view-banner';
      banner.className = 'wf-readonly-banner';
      banner.innerHTML = '🔒 <strong>View only</strong> — Reviewing Form 3 maintained by PNGCS.';
      document.querySelector('.page-main')?.insertBefore(banner, document.querySelector('.page-main')?.firstChild);
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
    const app = appId && appId !== '_default' ? PMSStorage.getApplicationById(appId) : null;
    const prisoner = app ? PMSStorage.getPrisonerById(app.prisonerId) : null;
    const institution = prisoner ? PMSStorage.getInstitutionById(prisoner.institutionId) : null;

    if (app && prisoner) {
      document.getElementById('cs-number').value = prisoner.prisonerNumber || prisoner.id;
      document.getElementById('full-name').value = [prisoner.firstName, prisoner.middleName, prisoner.lastName].filter(Boolean).join(' ');
      document.getElementById('facility').value = institution?.name || '—';
      document.getElementById('application-date').value = app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('en-GB') : '—';
      PMSFormWorkflow.mountFormChrome(3, app.id);
    }

    const STORAGE_KEY = wf.getDataKey();
    const commanderName = document.getElementById('commander-name');
    const recommendation = document.getElementById('recommendation');
    const institutionalReport = document.getElementById('institutional-report');
    const conductSummary = document.getElementById('conduct-summary');
    const toast = document.getElementById('toast');

    if (!viewOnly) commanderName.value = `${actor.firstName} ${actor.lastName}`;
    if (viewOnly) applyViewOnly(actor);

    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3500);
    }

    function getFormPayload() {
      return {
        commanderName: commanderName.value.trim(),
        commanderRecommendation: recommendation.value,
        recommendation: recommendation.value,
        institutionalReport: institutionalReport.value.trim(),
        conductSummary: conductSummary.value.trim(),
      };
    }

    function validateForm() {
      if (typeof PMSValidation !== 'undefined') {
        const result = PMSValidation.validateForm3(getFormPayload());
        if (!result.valid) {
          showToast(result.errors[0] || 'Please complete all required fields.');
          return false;
        }
        return true;
      }
      if (!commanderName.value.trim() || !recommendation.value || !institutionalReport.value.trim()) {
        showToast('Please complete reporting officer, recommendation, and institutional report.');
        return false;
      }
      return true;
    }

    function applyState(data) {
      if (!data) return;
      if (data.commanderName) commanderName.value = data.commanderName;
      if (data.commanderRecommendation || data.recommendation) {
        recommendation.value = data.commanderRecommendation || data.recommendation;
      }
      if (data.institutionalReport) institutionalReport.value = data.institutionalReport;
      if (data.conductSummary) conductSummary.value = data.conductSummary;
    }

    function persistDraft(status = 'draft') {
      const payload = {
        ...getFormPayload(),
        status,
        savedAt: new Date().toISOString(),
      };
      if (app?.id) {
        PMSStorage.saveFormData(app.id, 'form3', payload, actor);
      } else {
        saveState();
      }
      return payload;
    }

    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getFormPayload()));
    }

    function loadState() {
      try {
        applyState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
      } catch (_) { /* ignore */ }
      if (app?.formData?.form3) applyState(app.formData.form3);
    }

    document.getElementById('btn-save')?.addEventListener('click', () => {
      if (!validateForm()) return;
      if (!app?.id) {
        saveState();
        showToast('Draft saved locally. Open Form 3 from a linked application to save to the system.');
        return;
      }
      persistDraft('draft');
      showToast('Institutional report draft saved to the application.');
    });

    document.getElementById('btn-submit')?.addEventListener('click', async () => {
      if (!validateForm()) return;
      if (!app || !prisoner) {
        showToast('Application context is required. Open Form 3 from a linked parole application.');
        return;
      }
      saveState();
      try {
        const payload = {
          ...persistDraft('approved'),
          submitted: true,
          submittedAt: new Date().toISOString(),
          commanderId: actor.id,
        };
        PMSStorage.saveFormData(app.id, 'form3', payload, actor);
        wf.markCompleteAndAdvance({ submitted: true });
        showToast('Institutional report submitted and linked to the parole application.');
        PMSFormWorkflow.navigateAfterSubmit(3, app.id);
      } catch (err) {
        showToast(err.message || 'Could not submit institutional report.');
      }
    });

    document.getElementById('btn-prev-form')?.addEventListener('click', () => {
      if (app?.id) PMSFormWorkflow.openForm(2, app.id);
    });
    document.getElementById('btn-next-hearing')?.addEventListener('click', () => {
      if (app?.id && PMSFormWorkflow.canAccessHearingPortal()) {
        window.location.href = PMSFormWorkflow.hearingPortalHref(app.id);
      } else {
        showToast('Hearing Portal is available to DJAG staff after Form 3 is submitted.');
      }
    });
    document.getElementById('btn-print').addEventListener('click', () => {
      if (!viewOnly && !validateForm()) return;
      window.print();
    });

    loadState();
  }

  return { init };
})();
