/**
 * Form 1 — Simplified Parole Application (prisoner details + eligibility assessment).
 */
const PMSForm1Parole = (() => {
  let actor = null;
  let appId = null;
  let prisoner = null;
  let app = null;
  let institution = null;
  let locked = false;
  let viewOnly = false;
  let officerAuth = null;
  let submitGate = null;

  function $(id) { return document.getElementById(id); }

  function formatDisplayDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function formatInputDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  function sentenceLengthLabel(p) {
    if (typeof PMSFormsEngine !== 'undefined' && PMSFormsEngine.formatSentenceLength) {
      return PMSFormsEngine.formatSentenceLength(p);
    }
    const months = typeof PMSStorage !== 'undefined' ? PMSStorage.getSentenceDurationMonths(p) : 0;
    if (months > 0) {
      const years = Math.floor(months / 12);
      const rem = months % 12;
      const parts = [];
      if (years) parts.push(`${years} Year${years !== 1 ? 's' : ''}`);
      if (rem) parts.push(`${rem} Month${rem !== 1 ? 's' : ''}`);
      return parts.join(', ') || '0 Months';
    }
    if (p.sentenceType === 'Life' || p.sentence_type === 'Life') return 'Life (10 Years)';
    return p.sentence || '—';
  }

  function prisonerFullName(p) {
    return p.fullLegalName
      || p.full_legal_name
      || [p.lastName, p.firstName].filter(Boolean).join(', ').replace(/^, /, '')
      || [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ')
      || '—';
  }

  function prisonerFirstName(p) {
    if (p.firstName) return p.firstName;
    const full = p.fullLegalName || p.full_legal_name || '';
    if (full.includes(',')) {
      const given = full.split(',')[1]?.trim();
      return given?.split(/\s+/)[0] || given || '—';
    }
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) return parts.slice(0, -1).join(' ');
    return parts[0] || '—';
  }

  function prisonerLastName(p) {
    if (p.lastName) return p.lastName;
    const full = p.fullLegalName || p.full_legal_name || '';
    if (full.includes(',')) return full.split(',')[0]?.trim() || '—';
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) return parts[parts.length - 1];
    return '—';
  }

  function formatParoleEligibilityDate(p) {
    if (!p || typeof PMSStorage === 'undefined') return '—';
    const eligibility = PMSStorage.getParoleEligibilityDate(p);
    if (!eligibility) return '—';
    const iso = eligibility instanceof Date
      ? eligibility.toISOString().slice(0, 10)
      : String(eligibility).slice(0, 10);
    return formatDisplayDate(iso);
  }

  function buildPrisonerDetails() {
    const startDate = prisoner.sentenceStartDate || prisoner.sentence_start_date;
    return {
      application_id: app.caseNumber || app.id,
      prisoner_id: prisoner.prisonerNumber || prisoner.ciNumber || prisoner.ci_number || prisoner.id,
      first_name: prisonerFirstName(prisoner),
      last_name: prisonerLastName(prisoner),
      full_name: prisonerFullName(prisoner),
      gender: prisoner.gender || '—',
      date_of_birth: prisoner.dateOfBirth || prisoner.date_of_birth || '',
      correctional_institution: institution?.name || 'Correctional Institution',
      offence: prisoner.offense || prisoner.offence || '—',
      sentence_length: sentenceLengthLabel(prisoner),
      sentence_length_months: typeof PMSStorage !== 'undefined' ? PMSStorage.getSentenceDurationMonths(prisoner) : null,
      sentence_start_date: startDate || '',
      eligibility_date: formatParoleEligibilityDate(prisoner),
      current_status: prisoner.status || app.status || 'Eligible',
      cs_parole_officer: `${actor.firstName} ${actor.lastName}`,
      application_date: app.submittedAt || app.createdAt || new Date().toISOString(),
    };
  }

  function setDisplayStatus(text, eligible = true) {
    const el = $('displayStatus');
    if (!el) return;
    el.textContent = (text || '—').toUpperCase();
    el.classList.toggle('is-ineligible', !eligible);
  }

  function populateForm() {
    const startDate = prisoner.sentenceStartDate || prisoner.sentence_start_date;
    const appIdText = app.caseNumber || app.id;
    const officerName = `${actor.firstName} ${actor.lastName}`;

    $('applicationId').textContent = appIdText;
    $('displayApplicationId').textContent = appIdText;
    $('displayPrisonerId').textContent = prisoner.prisonerNumber || prisoner.ciNumber || prisoner.ci_number || prisoner.id;
    $('displayFirstName').textContent = prisonerFirstName(prisoner);
    $('displayLastName').textContent = prisonerLastName(prisoner);
    $('displayGender').textContent = prisoner.gender || '—';
    $('displayDob').textContent = formatDisplayDate(prisoner.dateOfBirth || prisoner.date_of_birth);
    $('displayFacility').textContent = institution?.name || 'Correctional Institution';
    $('displayOffence').textContent = prisoner.offense || prisoner.offence || '—';
    $('displaySentenceLength').textContent = sentenceLengthLabel(prisoner);
    $('displaySentenceStart').textContent = formatDisplayDate(startDate);
    $('displayEligibilityDate').textContent = formatParoleEligibilityDate(prisoner);
    $('displayOfficer').textContent = officerName;
    $('displayApplicationDate').textContent = formatDisplayDate(app.submittedAt || app.createdAt || new Date());

    const prog = typeof PMSStorage !== 'undefined' ? PMSStorage.getPrisonerProgress(prisoner) : { eligible: true };
    setDisplayStatus(prog.eligible ? 'ELIGIBLE' : (prisoner.status || app.status || 'PENDING'), prog.eligible);

    const form1 = app.formData?.form1;
    const secE = form1?.sections?.E || form1?.sectionE || {};
    const assessment = secE.eligibility_assessment
      || (secE.prisoner_consent || secE.prisonerConsent ? 'eligible' : null)
      || (form1?.eligibilityOutcome === 'not_eligible' ? 'not_eligible' : null);
    if (assessment === 'eligible') $('eligibilityEligible').checked = true;
    if (assessment === 'not_eligible') $('eligibilityNotEligible').checked = true;

    const savedAuth = secE.digital_signature || secE.digitalSignature || form1?.digitalSignature || null;
    if (officerAuth && savedAuth?.verified) {
      officerAuth.restore(savedAuth);
    }
  }

  function mountOfficerAuth() {
    if (typeof PMSFormOfficerAuth === 'undefined') return;
    try {
      const form1 = app.formData?.form1;
      const secE = form1?.sections?.E || form1?.sectionE || {};
      const savedAuth = secE.digital_signature || secE.digitalSignature || form1?.digitalSignature || null;
      officerAuth = PMSFormOfficerAuth.create({
        mount: '#officer-auth-mount',
        actor,
        applicationId: app.id,
        formNumber: 1,
        readOnly: viewOnly || locked,
        savedRecord: savedAuth,
        onVerified: () => submitGate?.sync(),
      });
      submitGate = PMSFormOfficerAuth.gateSubmitButtons(officerAuth, ['btnSubmit'], {
        canEnable: () => !locked && !viewOnly,
      });
      submitGate.sync();
    } catch (err) {
      console.error('Officer authorization failed to mount:', err);
    }
  }

  function getEligibilityValue() {
    return document.querySelector('input[name="eligibility"]:checked')?.value || '';
  }

  function collectFormData() {
    const eligibility = getEligibilityValue();
    const prisonerDetails = buildPrisonerDetails();
    const digitalSignature = officerAuth?.getRecord() || null;
    const officerSignDate = digitalSignature?.timestamp?.slice(0, 10)
      || new Date().toISOString().slice(0, 10);
    return {
      applicationId: app.id,
      caseNumber: app.caseNumber || app.id,
      prisonerDetails,
      sectionE: {
        eligibility_assessment: eligibility,
        prisoner_consent: eligibility === 'eligible',
        consent_date: eligibility === 'eligible' ? officerSignDate : '',
        digital_signature: digitalSignature,
        officer_signature: digitalSignature?.officerName || `${actor.firstName} ${actor.lastName}`,
        officer_sign_date: digitalSignature ? officerSignDate : '',
        signature: 'Recorded in PMS',
      },
      digitalSignature,
      eligibilityOutcome: eligibility === 'eligible' ? 'eligible' : eligibility === 'not_eligible' ? 'not_eligible' : null,
    };
  }

  function validateAssessment() {
    const eligibility = getEligibilityValue();
    if (!eligibility) {
      showToast('Select Eligible or Not Eligible before continuing.', 'error');
      return false;
    }
    if (!PMSFormOfficerAuth.requireVerified(officerAuth, {
      showToast,
      message: 'Enter your 6-digit PIN and click Verify & Sign before submitting Form 1.',
    })) {
      return false;
    }
    return true;
  }

  function showToast(message, type = 'info') {
    const existing = document.querySelector('.custom-toast');
    if (existing) existing.remove();
    const colors = { success: '#2a9d8f', error: '#e63946', info: '#1a1a2e', warning: '#b8860b' };
    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.style.background = colors[type] || colors.info;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.4s';
      setTimeout(() => toast.remove(), 500);
    }, 4000);
  }

  function buildForm1Bundle(payload, status = 'draft') {
    return {
      ...payload,
      prisonerDetails: payload.prisonerDetails,
      sectionE: payload.sectionE,
      sections: {
        prisonerDetails: payload.prisonerDetails,
        E: payload.sectionE,
      },
      status,
      savedAt: new Date().toISOString(),
      screeningDate: new Date().toISOString().slice(0, 10),
      eligibilityOutcome: payload.eligibilityOutcome || 'eligible',
      recommendationReason: status === 'submitted'
        ? 'Form 1 — Parole Application submitted.'
        : 'Form 1 parole application saved.',
      officerName: payload.sectionE.digital_signature?.officerName
        || payload.sectionE.officer_signature
        || `${actor.firstName} ${actor.lastName}`,
      digitalSignature: payload.digitalSignature || payload.sectionE.digital_signature,
      officerId: actor.officerId || actor.employeeNumber || actor.id,
    };
  }

  async function saveForm(options = {}) {
    const { silent = false } = options;
    if (locked) return;
    try {
      const payload = collectFormData();
      const bundle = {
        ...buildForm1Bundle(payload, 'draft'),
        savedAt: new Date().toISOString(),
        saveSource: silent ? 'autosave' : 'manual',
      };
      await PMSStorage.saveForm1Screening(appId, bundle, actor, { draft: true });
      app = PMSStorage.getApplicationById(appId);

      if (!silent && typeof PMSStorage !== 'undefined' && PMSStorage.isAct1991ParoleSyncEnabled()
        && typeof PMSApi !== 'undefined' && PMSApi.getToken()) {
        try {
          await PMSApi.generateForm1(prisoner.id, {});
        } catch (_) { /* offline/local ok */ }
      }

      if (!silent) showToast(`Form 1 draft saved (${app.caseNumber || appId}).`, 'success');
    } catch (err) {
      if (!silent) showToast(err.message || 'Could not save Form 1 draft.', 'error');
      throw err;
    }
  }

  async function submitForm() {
    if (locked) return;
    if (!validateAssessment()) return;

    const payload = collectFormData();
    if (payload.eligibilityOutcome === 'not_eligible') {
      showToast('Detainee marked Not Eligible — Form 1 will be saved but parole workflow cannot proceed.', 'warning');
    }

    try {
      await PMSStorage.saveForm1Screening(appId, {
        ...buildForm1Bundle(payload, 'submitted'),
        submittedAt: new Date().toISOString(),
      }, actor, { submit: payload.eligibilityOutcome === 'eligible' });
      app = PMSStorage.getApplicationById(appId);

      if (typeof PMSStorage !== 'undefined' && PMSStorage.isAct1991ParoleSyncEnabled()
        && typeof PMSApi !== 'undefined' && PMSApi.getToken()) {
        try {
          await PMSApi.generateForm1(prisoner.id, {});
          if (payload.eligibilityOutcome === 'eligible') {
            await PMSApi.recordConsent(appId, {
              consent: true,
              consentDate: payload.sectionE.consent_date,
              signature: 'Recorded in PMS',
              notes: 'Form 1 submitted — eligibility confirmed (digital record)',
            });
          }
        } catch (_) { /* local save succeeded */ }
      }

      locked = true;
      officerAuth?.lock();
      document.querySelectorAll('#paroleForm input').forEach((el) => { el.disabled = true; });
      $('btnSave').disabled = true;
      $('btnSubmit').disabled = true;

      if (payload.eligibilityOutcome === 'eligible') {
        showToast('Form 1 submitted. Proceeding to Report Preparation phase.', 'success');
        if (typeof PMSFormWorkflow !== 'undefined') {
          PMSFormWorkflow.navigateAfterSubmit(1, appId);
        } else {
          setTimeout(() => {
            window.location.href = `form2.html?appId=${encodeURIComponent(appId)}&from=form1`;
          }, 1500);
        }
      } else {
        showToast('Form 1 saved — detainee recorded as Not Eligible.', 'success');
      }
    } catch (err) {
      showToast(err.message || 'Submission failed.', 'error');
    }
  }

  function previewForm() {
    if (typeof PMSStorage !== 'undefined' && PMSStorage.isAct1991ParoleSyncEnabled()
      && typeof PMSApi !== 'undefined' && PMSApi.getToken() && appId) {
      const url = `${PMSApi.getBaseUrl()}/api/parole/form1/${encodeURIComponent(appId)}/download`;
      window.open(url, '_blank');
      return;
    }
    window.print();
  }

  function resetForm() {
    if (confirm('Reload Form 1 and discard unsaved edits on this page?')) {
      location.reload();
    }
  }

  function bindEvents() {
    $('btnSave').addEventListener('click', saveForm);
    $('btnSubmit').addEventListener('click', submitForm);
    $('btnPreview').addEventListener('click', previewForm);
    $('btnReset').addEventListener('click', resetForm);
    $('btnNextForm2')?.addEventListener('click', () => {
      if (typeof PMSFormWorkflow !== 'undefined' && appId) PMSFormWorkflow.openForm(2, appId);
    });
  }

  function applyViewOnlyLock() {
    locked = true;
    officerAuth?.lock();
    document.querySelectorAll('#paroleForm input').forEach((el) => { el.disabled = true; });
    $('btnSave') && ($('btnSave').style.display = 'none');
    $('btnSubmit') && ($('btnSubmit').style.display = 'none');
    $('btnReset') && ($('btnReset').style.display = 'none');
    if (!$('form1-view-banner')) {
      const banner = document.createElement('div');
      banner.id = 'form1-view-banner';
      banner.className = 'wf-readonly-banner';
      banner.innerHTML = 'View only — reviewing Form 1 submitted by PNGCS.';
      $('form1-root')?.insertBefore(banner, $('form1-root').firstChild);
    }
  }

  async function boot(resolvedAppId) {
    appId = resolvedAppId;
    app = PMSStorage.getApplicationById(appId);
    prisoner = app ? PMSStorage.getPrisonerById(app.prisonerId) : null;
    if (!app || !prisoner) {
      if (typeof PMSUI !== 'undefined') PMSUI.showError('Application or detainee record not found.');
      else alert('Application or detainee record not found.');
      window.location.href = typeof PMSPageChrome !== 'undefined'
        ? PMSPageChrome.getDashboardHref('../')
        : '../dashboard.html';
      return;
    }

    institution = PMSStorage.getInstitutionById(prisoner.institutionId);
    mountOfficerAuth();
    populateForm();
    bindEvents();

    if (typeof PMSFormWorkflow !== 'undefined') {
      PMSFormWorkflow.mountFormChrome(1, appId);
    }

    if (app.formData?.form1?.status === 'submitted' || app.status === 'REPORT_PREPARATION') {
      locked = true;
      officerAuth?.lock();
      $('btnSave').disabled = true;
      $('btnSubmit').disabled = true;
    }
    submitGate?.sync();

    if (viewOnly) applyViewOnlyLock();

    if (typeof PMSFormAutosave !== 'undefined' && !locked && !viewOnly) {
      PMSFormAutosave.create({
        root: '#paroleForm',
        onSave: ({ silent }) => saveForm({ silent }),
        enabled: () => !locked && !viewOnly && !!appId,
      });
    }

    $('form1-root').classList.remove('hidden');
    $('selection-panel').classList.add('hidden');

    if (typeof PMSUI?.bindLiveDataRefresh === 'function') {
      PMSUI.bindLiveDataRefresh(() => {
        const next = PMSStorage.getApplicationById(appId);
        if (!next) return;
        app = next;
        const form1 = app.formData?.form1;
        const complete = PMSStorage.isForm1Complete(form1) || form1?.status === 'submitted';
        if (typeof PMSFormWorkflow !== 'undefined') PMSFormWorkflow.mountFormChrome(1, appId);
        if (!complete) return;
        populateForm();
        if (!locked) {
          locked = true;
          officerAuth?.lock();
          if ($('btnSave')) $('btnSave').disabled = true;
          if ($('btnSubmit')) $('btnSubmit').disabled = true;
        }
        if (viewOnly) applyViewOnlyLock();
        if (typeof PMSFormWorkflow !== 'undefined') PMSFormWorkflow.mountFormChrome(1, appId);
        submitGate?.sync();
      }, { refreshOnFocus: true });
    }
  }

  async function init() {
    await PMSStorage.ensureLoaded();
    const session = PMSStorage.getSession();
    if (!session) {
      window.location.replace('../index.html');
      return;
    }
    actor = PMSStorage.getUserById(session.id) || session;
    actor.role = PMSAuth.normalizeRole(actor.role);
    if (!PMSRBAC.requireFormAccess(actor, 1, 'view')) return;
    viewOnly = !PMSRBAC.canAccessForm(actor, 1, 'edit');

    const params = new URLSearchParams(window.location.search);
    let resolvedAppId = params.get('appId');
    const prisonerIdParam = params.get('prisonerId');

    if (viewOnly && !resolvedAppId && !prisonerIdParam) {
      window.location.href = typeof PMSPageChrome !== 'undefined'
        ? PMSPageChrome.getDashboardHref('../')
        : `../${PMSAuth.getDashboardForRole(actor.role)}`;
      return;
    }

    if (!resolvedAppId && prisonerIdParam) {
      if (viewOnly) {
        const existing = PMSStorage.getParoleApplications().find((a) => a.prisonerId === prisonerIdParam && !['Approved', 'Refused', 'Released'].includes(a.status));
        resolvedAppId = existing?.id || null;
      } else {
        const created = PMSStorage.getOrCreateDraftApplication(prisonerIdParam, actor);
        resolvedAppId = created.id;
      }
      if (resolvedAppId) {
        window.history.replaceState({}, '', `${window.location.pathname}?appId=${encodeURIComponent(resolvedAppId)}`);
      }
    }

    if (resolvedAppId) {
      await boot(resolvedAppId);
      return;
    }

    if (viewOnly) {
      window.location.href = typeof PMSPageChrome !== 'undefined'
        ? PMSPageChrome.getDashboardHref('../')
        : `../${PMSAuth.getDashboardForRole(actor.role)}`;
      return;
    }

    $('selection-panel').classList.remove('hidden');
    PMSPrisonerCombobox.mount({
      prisonerList: PMSRBAC.filterPrisonersForUser(actor, PMSStorage.getPrisoners()).filter((p) => {
        const prog = PMSStorage.getPrisonerProgress(p);
        return prog.eligible || p.status === 'Eligible for Parole Application';
      }),
      onSelect: async (prisonerId) => {
        if (!prisonerId) return;
        const created = PMSStorage.getOrCreateDraftApplication(prisonerId, actor);
        window.history.replaceState({}, '', `${window.location.pathname}?appId=${encodeURIComponent(created.id)}`);
        await boot(created.id);
      },
    });
  }

  return { init, collectFormData };
})();
