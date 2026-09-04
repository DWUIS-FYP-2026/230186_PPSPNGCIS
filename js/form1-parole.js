/**
 * Form 1 — Parole Application page controller (Sections A–E).
 */
const PMSForm1Parole = (() => {
  const PNG_PROVINCES = [
    'National Capital District', 'Central', 'East Sepik', 'East New Britain', 'Enga', 'Gulf',
    'Hela', 'Jiwaka', 'Madang', 'Manus', 'Milne Bay', 'Morobe', 'New Ireland', 'Northern (Oro)',
    'Southern Highlands', 'West New Britain', 'West Sepik (Sandaun)', 'Western (Fly)', 'Western Highlands',
  ];

  let actor = null;
  let appId = null;
  let prisoner = null;
  let app = null;
  let institution = null;
  let locked = false;
  let viewOnly = false;

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

  function deriveSentenceYears(p) {
    if (p.sentenceType === 'Life' || p.sentence_type === 'Life') return null;
    if (p.totalSentenceYears != null) return Number(p.totalSentenceYears);
    if (p.total_sentence_years != null) return Number(p.total_sentence_years);
    const months = typeof PMSStorage !== 'undefined' ? PMSStorage.getSentenceDurationMonths(p) : null;
    if (months) return Math.round((months / 12) * 10) / 10;
    return null;
  }

  function calculateEligibilityDates(sentenceYears, startDateStr) {
    if (!startDateStr) return { eligibility: '—', notification: '—' };
    const start = new Date(startDateStr);
    if (Number.isNaN(start.getTime())) return { eligibility: '—', notification: '—' };

    const isLife = prisoner?.sentenceType === 'Life' || prisoner?.sentence_type === 'Life';
    const eligibility = new Date(start);
    if (isLife) {
      eligibility.setUTCFullYear(eligibility.getUTCFullYear() + 10);
    } else if (sentenceYears && sentenceYears > 0) {
      const halfDays = Math.round(sentenceYears * 0.5 * 365.25);
      eligibility.setUTCDate(eligibility.getUTCDate() + halfDays);
    } else {
      return { eligibility: '—', notification: '—' };
    }

    const notification = new Date(eligibility);
    notification.setUTCMonth(notification.getUTCMonth() - 6);

    return {
      eligibility: formatDisplayDate(eligibility),
      notification: formatDisplayDate(notification),
    };
  }

  function mapStatusBadge(status) {
    const s = (status || 'Draft').toUpperCase();
    const badge = $('statusBadge');
    if (!badge) return;
    if (['ELIGIBLE', 'PENDING_ELIGIBILITY'].includes(s)) {
      badge.textContent = s.replace(/_/g, ' ');
      badge.className = 'status-badge eligible';
    } else if (['AWAITING_PRISONER_CONSENT', 'REPORT_PREPARATION', 'DRAFT'].includes(s)) {
      badge.textContent = s.replace(/_/g, ' ');
      badge.className = 'status-badge consent';
    } else if (['PAROLE_GRANTED', 'APPROVED'].includes(s)) {
      badge.textContent = 'PAROLE GRANTED';
      badge.className = 'status-badge granted';
    } else if (['PAROLE_DENIED', 'DECLINED', 'REFUSED'].includes(s)) {
      badge.textContent = s.replace(/_/g, ' ');
      badge.className = 'status-badge denied';
    } else {
      badge.textContent = s.replace(/_/g, ' ');
      badge.className = 'status-badge pending';
    }
  }

  function populateForm() {
    const fullName = prisoner.fullLegalName
      || prisoner.full_legal_name
      || [prisoner.lastName, prisoner.firstName].filter(Boolean).join(', ').replace(/^, /, '')
      || [prisoner.firstName, prisoner.lastName].filter(Boolean).join(' ');

    $('applicationId').textContent = app.caseNumber || app.id;
    $('fullName').value = fullName;
    $('aliases').value = prisoner.aliases || '';
    $('ciNumber').value = prisoner.ciNumber || prisoner.ci_number || prisoner.prisonerNumber || prisoner.id;
    $('dob').value = formatInputDate(prisoner.dateOfBirth || prisoner.date_of_birth);
    $('gender').value = prisoner.gender || 'Male';
    $('ciNumberDisplay').textContent = $('ciNumber').value;

    $('currentOffenses').value = prisoner.offense || '';
    const sentenceYears = deriveSentenceYears(prisoner);
    $('sentenceLength').value = sentenceYears ?? '';
    $('offenseCategory').value = prisoner.offenseCategory || prisoner.offense_category || 'Other';
    $('courtOfConviction').value = prisoner.courtOfConviction || prisoner.court_of_conviction || '';
    $('sentenceStartDate').value = formatInputDate(prisoner.sentenceStartDate || prisoner.sentence_start_date);

    const facilityName = institution?.name || 'Correctional Institution';
    $('facility').value = facilityName;
    $('facilityCode').value = institution?.code || 'BOM-001';
    $('cellBlock').value = prisoner.cellBlockUnit || prisoner.cell_block_unit || '';

    const dates = calculateEligibilityDates(sentenceYears, $('sentenceStartDate').value);
    $('eligibilityDate').textContent = app.eligibilityDate ? formatDisplayDate(app.eligibilityDate) : dates.eligibility;
    $('notificationDate').textContent = app.notificationDate ? formatDisplayDate(app.notificationDate) : dates.notification;

    mapStatusBadge(app.status);

    const form1 = app.formData?.form1;
    const saved = form1?.sections?.D || form1?.sectionD || form1;
    if (saved) {
      if (saved.sponsor_name || saved.sponsorName) $('sponsorName').value = saved.sponsor_name || saved.sponsorName;
      if (saved.sponsor_relationship || saved.sponsorRelationship) $('sponsorRelationship').value = saved.sponsor_relationship || saved.sponsorRelationship;
      if (saved.sponsor_contact || saved.sponsorContact) $('sponsorContact').value = saved.sponsor_contact || saved.sponsorContact;
      if (saved.sponsor_address || saved.sponsorAddress) $('sponsorAddress').value = saved.sponsor_address || saved.sponsorAddress;
      if (saved.proposed_residence || saved.proposedResidence) $('proposedResidence').value = saved.proposed_residence || saved.proposedResidence;
      if (saved.proposed_residence_province || saved.proposedResidenceProvince) $('proposedProvince').value = saved.proposed_residence_province || saved.proposedResidenceProvince;
      if (saved.employment_plans || saved.employmentPlans) $('employmentPlans').value = saved.employment_plans || saved.employmentPlans;
      if (saved.community_service_plans || saved.communityPlans) $('communityPlans').value = saved.community_service_plans || saved.communityPlans;
    }

    const consent = form1?.sections?.E || form1?.sectionE;
    if (consent?.prisoner_consent != null || consent?.prisonerConsent != null) {
      $('prisonerConsent').checked = !!(consent.prisoner_consent ?? consent.prisonerConsent);
    }
    if (consent?.consent_date || consent?.consentDate) {
      $('consentDate').value = formatInputDate(consent.consent_date || consent.consentDate);
    }

    updateConsentName();
    recalcEligibilityDisplay();
  }

  function updateConsentName() {
    const name = $('fullName').value.trim() || '[Name not entered]';
    $('consentNameDisplay').textContent = name;
  }

  function recalcEligibilityDisplay() {
    const years = parseFloat($('sentenceLength').value);
    const dates = calculateEligibilityDates(years, $('sentenceStartDate').value);
    if (!$('eligibilityDate').dataset.fromApp) {
      $('eligibilityDate').textContent = dates.eligibility;
      $('notificationDate').textContent = dates.notification;
    }
  }

  function collectSectionD() {
    return {
      sponsor_name: $('sponsorName').value.trim(),
      sponsor_relationship: $('sponsorRelationship').value.trim(),
      sponsor_contact: $('sponsorContact').value.trim(),
      sponsor_address: $('sponsorAddress').value.trim(),
      proposed_residence: $('proposedResidence').value.trim(),
      proposed_residence_province: $('proposedProvince').value,
      employment_plans: $('employmentPlans').value.trim(),
      community_service_plans: $('communityPlans').value.trim(),
    };
  }

  function collectFormData() {
    return {
      applicationId: app.id,
      caseNumber: app.caseNumber || app.id,
      sectionA: {
        full_legal_name: $('fullName').value.trim(),
        aliases: $('aliases').value.trim(),
        ci_number: $('ciNumber').value.trim(),
        date_of_birth: $('dob').value,
        gender: $('gender').value,
      },
      sectionB: {
        current_offenses: $('currentOffenses').value.trim(),
        sentence_length_years: parseFloat($('sentenceLength').value) || null,
        offense_category: $('offenseCategory').value,
        court_of_conviction: $('courtOfConviction').value.trim(),
        sentence_commencement_date: $('sentenceStartDate').value,
      },
      sectionC: {
        facility_name: $('facility').value,
        facility_code: $('facilityCode').value.trim(),
        cell_block_or_unit: $('cellBlock').value.trim(),
      },
      sectionD: collectSectionD(),
      sectionE: {
        prisoner_consent: $('prisonerConsent').checked,
        consent_date: $('consentDate').value,
        signature: 'Recorded in PMS',
      },
    };
  }

  function validateSectionD() {
    const d = collectSectionD();
    const required = [
      ['sponsor_name', 'Sponsor / guarantor name'],
      ['sponsor_relationship', 'Sponsor relationship'],
      ['sponsor_contact', 'Sponsor contact'],
      ['proposed_residence', 'Proposed residence'],
      ['proposed_residence_province', 'Proposed residence province'],
    ];
    for (const [key, label] of required) {
      if (!d[key]?.trim()) {
        showToast(`${label} is required (Section D).`, 'error');
        return false;
      }
    }
    return true;
  }

  function showToast(message, type = 'info') {
    const existing = document.querySelector('.custom-toast');
    if (existing) existing.remove();
    const colors = { success: '#2a9d8f', error: '#e63946', info: '#1a1a2e' };
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

  async function saveForm() {
    if (locked) return;
    const payload = collectFormData();
    const form1Bundle = {
      ...payload,
      sections: { A: payload.sectionA, B: payload.sectionB, C: payload.sectionC, D: payload.sectionD, E: payload.sectionE },
      status: 'draft',
      savedAt: new Date().toISOString(),
    };

    PMSStorage.saveFormData(appId, 'form1', form1Bundle, actor);

    if (typeof PMSApi !== 'undefined' && PMSApi.getToken()) {
      try {
        await PMSApi.generateForm1(prisoner.id, payload.sectionD);
      } catch (_) { /* offline/local ok */ }
    }

    showToast(`Form 1 draft saved (${app.caseNumber || appId}).`, 'success');
  }

  async function submitForm() {
    if (locked) return;
    if (!$('prisonerConsent').checked) {
      showToast('Prisoner consent is required before submission (Section E).', 'error');
      return;
    }
    if (!validateSectionD()) return;

    const payload = collectFormData();
    const consent = payload.sectionE.prisoner_consent;

    try {
      if (typeof PMSApi !== 'undefined' && PMSApi.getToken()) {
        await PMSApi.generateForm1(prisoner.id, payload.sectionD);
        await PMSApi.recordConsent(appId, {
          consent,
          consentDate: payload.sectionE.consent_date,
          signature: payload.sectionE.signature,
          notes: 'Form 1 submitted — prisoner consent recorded',
        });
      } else {
        const form1Bundle = {
          ...payload,
          sections: { A: payload.sectionA, B: payload.sectionB, C: payload.sectionC, D: payload.sectionD, E: payload.sectionE },
          status: 'submitted',
          submittedAt: new Date().toISOString(),
        };
        await PMSStorage.saveForm1Screening(appId, {
          ...form1Bundle,
          eligibilityOutcome: 'eligible',
          screeningDate: new Date().toISOString().slice(0, 10),
          officerName: `${actor.firstName} ${actor.lastName}`,
          recommendationReason: 'Form 1 — Parole Application submitted with prisoner consent.',
        }, actor, { submit: true });
      }

      locked = true;
      document.querySelectorAll('#paroleForm input:not([type=checkbox]), #paroleForm select, #paroleForm textarea').forEach((el) => {
        if (!el.classList.contains('readonly-input') && !el.readOnly) el.readOnly = true;
      });
      $('prisonerConsent').disabled = true;
      $('btnSave').disabled = true;
      $('btnSubmit').disabled = true;

      mapStatusBadge('REPORT_PREPARATION');
      showToast('Form 1 submitted. Proceeding to Report Preparation phase.', 'success');
      if (typeof PMSFormWorkflow !== 'undefined') {
        PMSFormWorkflow.navigateAfterSubmit(1, appId);
      } else {
        setTimeout(() => {
          window.location.href = `form2.html?appId=${encodeURIComponent(appId)}&from=form1`;
        }, 1500);
      }
    } catch (err) {
      showToast(err.message || 'Submission failed.', 'error');
    }
  }

  function previewForm() {
    if (typeof PMSApi !== 'undefined' && PMSApi.getToken() && appId) {
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
    $('fullName').addEventListener('input', updateConsentName);
    $('sentenceLength').addEventListener('input', recalcEligibilityDisplay);
    $('sentenceStartDate').addEventListener('change', recalcEligibilityDisplay);
    $('btnSave').addEventListener('click', saveForm);
    $('btnSubmit').addEventListener('click', submitForm);
    $('btnPreview').addEventListener('click', previewForm);
    $('btnReset').addEventListener('click', resetForm);
    $('btnNextForm2')?.addEventListener('click', () => {
      if (typeof PMSFormWorkflow !== 'undefined' && appId) PMSFormWorkflow.openForm(2, appId);
    });
  }

  function fillProvinceSelect() {
    const sel = $('proposedProvince');
    if (!sel || sel.options.length > 1) return;
    PNG_PROVINCES.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    });
    sel.value = institution?.province || 'National Capital District';
  }

  function applyViewOnlyLock() {
    locked = true;
    document.querySelectorAll('#paroleForm input:not([type=hidden]), #paroleForm select, #paroleForm textarea').forEach((el) => {
      if (el.type === 'checkbox' || el.type === 'radio') el.disabled = true;
      else if (!el.classList.contains('readonly-input')) {
        el.readOnly = true;
        el.classList.add('readonly-field');
      }
    });
    $('prisonerConsent') && ($('prisonerConsent').disabled = true);
    $('btnSave') && ($('btnSave').style.display = 'none');
    $('btnSubmit') && ($('btnSubmit').style.display = 'none');
    $('btnReset') && ($('btnReset').style.display = 'none');
    if (!$('form1-view-banner')) {
      const banner = document.createElement('div');
      banner.id = 'form1-view-banner';
      banner.className = 'wf-readonly-banner';
      banner.innerHTML = '🔒 <strong>View only</strong> — Reviewing Form 1 submitted by PNGCS.';
      $('form1-root')?.insertBefore(banner, $('form1-root').firstChild);
    }
  }

  async function boot(resolvedAppId) {
    appId = resolvedAppId;
    app = PMSStorage.getApplicationById(appId);
    prisoner = app ? PMSStorage.getPrisonerById(app.prisonerId) : null;
    if (!app || !prisoner) {
      alert('Application or detainee record not found.');
      window.location.href = typeof PMSPageChrome !== 'undefined'
        ? PMSPageChrome.getDashboardHref('../')
        : '../dashboard.html';
      return;
    }

    institution = PMSStorage.getInstitutionById(prisoner.institutionId);
    if (app.eligibilityDate) {
      $('eligibilityDate').dataset.fromApp = '1';
      $('notificationDate').dataset.fromApp = '1';
    }

    fillProvinceSelect();
    populateForm();
    bindEvents();

    if (typeof PMSFormWorkflow !== 'undefined') {
      PMSFormWorkflow.mountFormChrome(1, appId);
    }

    if (app.formData?.form1?.status === 'submitted' || app.status === 'REPORT_PREPARATION') {
      locked = true;
      $('btnSave').disabled = true;
      $('btnSubmit').disabled = true;
    }

    if (viewOnly) applyViewOnlyLock();

    $('form1-root').classList.remove('hidden');
    $('selection-panel').classList.add('hidden');
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

  return { init, collectFormData, PNG_PROVINCES };
})();
