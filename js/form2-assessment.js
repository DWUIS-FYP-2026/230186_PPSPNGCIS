/**
 * Form 2 — Assessment Reports (PPR & DAR/DDR) page controller.
 */
const PMSForm2Assessment = (() => {
  const PPR_FILE_IDS = ['pprVictimDocs', 'pprSponsorDocs', 'pprReintegrationDocs', 'pprCustomaryDocs'];
  const DAR_FILE_IDS = ['darConductDocs', 'darTrainingDocs', 'darHealthDocs', 'darRiskDocs'];

  let actor = null;
  let appId = null;
  let app = null;
  let prisoner = null;
  let institution = null;
  let canEditPpr = false;
  let canEditDar = false;
  let pprLocked = false;
  let darLocked = false;

  function $(id) { return document.getElementById(id); }

  function normalizeRole(role) {
    return typeof PMSRBAC !== 'undefined' ? PMSRBAC.normalizeRole(role) : role;
  }

  function formatDisplayDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function prisonerDisplayName(p) {
    return p.fullLegalName || p.full_legal_name
      || [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ')
      || '—';
  }

  function sentenceDisplay(p) {
    if (p.sentenceType === 'Life' || p.sentence_type === 'Life') return 'Life (10-year eligibility)';
    const years = p.totalSentenceYears ?? p.total_sentence_years;
    if (years != null) return `${years} year(s)`;
    const months = typeof PMSStorage !== 'undefined' ? PMSStorage.getSentenceDurationMonths(p) : null;
    if (months) return `${Math.round(months / 12 * 10) / 10} year(s)`;
    return '—';
  }

  function showToast(message, type = 'info') {
    const existing = document.querySelector('.custom-toast');
    if (existing) existing.remove();
    const colors = { success: '#1a7a5a', error: '#b22234', info: '#003366', warning: '#b8860b' };
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

  function updateStatus(elementId, text, className) {
    const el = $(elementId);
    if (el) {
      el.textContent = text;
      el.className = `status-badge ${className}`;
    }
  }

  function setupFileUpload(inputId, previewId) {
    const input = $(inputId);
    const preview = $(previewId);
    if (!input || !preview) return;

    input.addEventListener('change', () => {
      const files = input.files;
      if (!files?.length) {
        preview.innerHTML = '';
        const container = input.closest('.field-with-attachment');
        if (container) container.classList.remove('has-attachment');
        return;
      }
      preview.innerHTML = Array.from(files).map((f) => {
        const size = (f.size / 1024).toFixed(1);
        return `<span class="file-chip">📎 ${f.name} (${size} KB)</span>`;
      }).join('');
      const container = input.closest('.field-with-attachment');
      if (container) container.classList.add('has-attachment');
    });
  }

  function collectFileNames(ids) {
    const result = {};
    ids.forEach((id) => {
      const input = $(id);
      result[id] = input?.files?.length ? Array.from(input.files).map((f) => f.name) : [];
    });
    return result;
  }

  function collectPPR() {
    return {
      victimStatements: $('victimStatements')?.value.trim() || '',
      communityRisk: $('communityRisk')?.value || '',
      communityStatements: $('communityStatements')?.value.trim() || '',
      sponsorName: $('sponsorName')?.value.trim() || '',
      sponsorRelationship: $('sponsorRelationship')?.value.trim() || '',
      sponsorCapability: $('sponsorCapability')?.value || '',
      sponsorNotes: $('sponsorNotes')?.value.trim() || '',
      verifiedResidence: $('verifiedResidence')?.value.trim() || '',
      accommodationStability: $('accommodationStability')?.value || '',
      reintegrationPlan: $('reintegrationPlan')?.value.trim() || '',
      customarySettlement: $('customarySettlement')?.value.trim() || '',
      restorativeAssessment: $('restorativeAssessment')?.value || '',
      pprOfficer: $('pprOfficer')?.value.trim() || '',
      pprDate: $('pprDate')?.value || '',
      attachments: collectFileNames(PPR_FILE_IDS),
    };
  }

  function collectDAR() {
    return {
      disciplinaryHistory: $('disciplinaryHistory')?.value || '',
      conductLog: $('conductLog')?.value.trim() || '',
      adjustmentRating: $('adjustmentRating')?.value || '',
      trainingProgress: $('trainingProgress')?.value.trim() || '',
      vocationalTraining: $('vocationalTraining')?.value.trim() || '',
      rehabProgress: $('rehabProgress')?.value || '',
      mentalHealth: $('mentalHealth')?.value || '',
      emotionalMaturity: $('emotionalMaturity')?.value.trim() || '',
      physicalHealth: $('physicalHealth')?.value || '',
      recidivismRisk: document.querySelector('input[name="recidivismRisk"]:checked')?.value || 'Low',
      recidivismNotes: $('recidivismNotes')?.value.trim() || '',
      darOfficer: $('darOfficer')?.value.trim() || '',
      darDate: $('darDate')?.value || '',
      attachments: collectFileNames(DAR_FILE_IDS),
    };
  }

  function mapPprForStorage(data, { submit = false } = {}) {
    return {
      ...data,
      clerkName: data.pprOfficer,
      personalParticulars: [data.victimStatements, data.verifiedResidence, data.reintegrationPlan].filter(Boolean).join('\n\n'),
      communitySummary: data.victimStatements,
      communitySupport: data.communityRisk,
      reintegrationRisk: data.communityRisk,
      confirmed: submit,
      status: submit ? 'submitted' : 'draft',
    };
  }

  function mapDarForStorage(data, { submit = false } = {}) {
    return {
      ...data,
      officerName: data.darOfficer,
      institutionName: institution?.name || 'Bomana Correctional Institution',
      assessmentSummary: [data.conductLog, data.trainingProgress, data.recidivismNotes].filter(Boolean).join('\n\n'),
      summary: data.conductLog,
      conductRating: data.disciplinaryHistory,
      programCompletion: data.trainingProgress,
      confirmed: submit,
      status: submit ? 'submitted' : 'draft',
    };
  }

  function validatePPR(data) {
    const required = [
      ['victimStatements', 'Victim / family statements'],
      ['communityRisk', 'Community tension / risk'],
      ['sponsorName', 'Sponsor name'],
      ['sponsorRelationship', 'Sponsor relationship'],
      ['sponsorCapability', 'Sponsor capability'],
      ['verifiedResidence', 'Verified residence'],
      ['accommodationStability', 'Accommodation stability'],
      ['pprOfficer', 'Parole officer name'],
      ['pprDate', 'Assessment date'],
    ];
    for (const [key, label] of required) {
      if (!data[key]?.trim?.() && !data[key]) {
        showToast(`${label} is required (PPR).`, 'error');
        return false;
      }
    }
    return true;
  }

  function validateDAR(data) {
    const required = [
      ['disciplinaryHistory', 'Disciplinary history'],
      ['conductLog', 'Conduct log'],
      ['adjustmentRating', 'Institutional adjustment'],
      ['trainingProgress', 'Completed programs'],
      ['rehabProgress', 'Rehabilitation progress'],
      ['mentalHealth', 'Mental health assessment'],
      ['physicalHealth', 'Physical health status'],
      ['darOfficer', 'CS officer name'],
      ['darDate', 'Assessment date'],
    ];
    for (const [key, label] of required) {
      if (!data[key]?.trim?.() && !data[key]) {
        showToast(`${label} is required (DAR).`, 'error');
        return false;
      }
    }
    return true;
  }

  async function saveDraft(sectionKey) {
    const isPpr = sectionKey === 'ppr';
    const raw = isPpr ? collectPPR() : collectDAR();
    const mapped = isPpr ? mapPprForStorage(raw) : mapDarForStorage(raw);
    const form2 = app.formData?.form2 || { sections: {} };
    form2.sections = { ...(form2.sections || {}), [sectionKey]: { ...mapped, savedAt: new Date().toISOString() } };
    PMSStorage.saveFormData(appId, 'form2', form2, actor);
    app = PMSStorage.getApplicationById(appId);
    updateStatus(isPpr ? 'pprStatus' : 'darStatus', 'IN PROGRESS', 'in-progress');
    showToast(`${isPpr ? 'Pre-Parole Report' : 'Detainee Assessment Report'} draft saved.`, 'success');
  }

  async function submitSection(sectionKey) {
    const isPpr = sectionKey === 'ppr';
    if (isPpr && !canEditPpr) {
      showToast('Only DJAG Parole Clerk may submit the PPR section.', 'error');
      return;
    }
    if (!isPpr && !canEditDar) {
      showToast('Only CS Parole staff may submit the DAR section.', 'error');
      return;
    }

    const raw = isPpr ? collectPPR() : collectDAR();
    if (isPpr ? !validatePPR(raw) : !validateDAR(raw)) return;

    const mapped = isPpr ? mapPprForStorage(raw, { submit: true }) : mapDarForStorage(raw, { submit: true });

    try {
      await PMSStorage.saveForm2Section(appId, sectionKey, mapped, actor);

      if (typeof PMSApi !== 'undefined' && PMSApi.getToken()) {
        try {
          if (isPpr) await PMSApi.submitPreParoleReport(appId, mapped);
          else await PMSApi.submitDetaineeReport(appId, mapped);
        } catch (_) { /* local save succeeded */ }
      }

      app = PMSStorage.getApplicationById(appId);
      if (isPpr) {
        pprLocked = true;
        updateStatus('pprStatus', 'COMPLETED', 'completed');
        lockCard('pprCard', true);
      } else {
        darLocked = true;
        updateStatus('darStatus', 'COMPLETED', 'completed');
        lockCard('darCard', true);
      }
      checkBothSubmitted();
      showToast(`${isPpr ? 'Pre-Parole Report' : 'Detainee Assessment Report'} submitted successfully.`, 'success');
    } catch (err) {
      showToast(err.message || 'Submission failed.', 'error');
    }
  }

  function lockCard(cardId, locked) {
    const card = $(cardId);
    if (!card) return;
    card.classList.toggle('locked', locked);
    card.querySelectorAll('input, select, textarea, button').forEach((el) => {
      if (el.type === 'file') el.disabled = locked;
      else if (el.tagName === 'BUTTON') el.disabled = locked;
      else if (!el.readOnly) el.readOnly = locked;
    });
    card.querySelectorAll('input[type="radio"]').forEach((el) => { el.disabled = locked; });
  }

  function checkBothSubmitted() {
    const f2 = app?.formData?.form2;
    const complete = typeof PMSStorage !== 'undefined' && PMSStorage.isForm2Complete(f2);
    if (complete) {
      updateStatus('reportStatus', 'READY FOR BOARD HEARING', 'completed');
      showToast('Both reports are complete. Ready for board hearing scheduling.', 'success');
    }
  }

  async function submitBothReports() {
    const ppr = app?.formData?.form2?.sections?.ppr;
    const ddr = app?.formData?.form2?.sections?.ddr;
    if (!ppr?.submitted || !ddr?.submitted) {
      if (!validatePPR(collectPPR()) || !validateDAR(collectDAR())) return;
      showToast('Submit each report section individually first, or complete all required fields.', 'error');
      return;
    }
    if (typeof PMSStorage !== 'undefined' && PMSStorage.isForm2Complete(app.formData.form2)) {
      showToast('Both reports submitted to the Parole Board workflow.', 'success');
      updateStatus('reportStatus', 'READY FOR BOARD HEARING', 'completed');
      setTimeout(() => {
        window.location.href = `form3.html?appId=${encodeURIComponent(appId)}`;
      }, 1200);
    }
  }

  function populateSummary() {
    $('applicationId').textContent = app.caseNumber || app.id;
    $('detaineeName').textContent = prisonerDisplayName(prisoner);
    $('ciNumber').textContent = prisoner.ciNumber || prisoner.ci_number || prisoner.prisonerNumber || prisoner.id;
    $('facilityName').textContent = institution?.name || 'Bomana Correctional Institution';
    $('sentenceDisplay').textContent = sentenceDisplay(prisoner);
    $('eligibilityDate').textContent = app.eligibilityDate ? formatDisplayDate(app.eligibilityDate) : '—';
  }

  function fillFormFromStorage() {
    const ppr = app.formData?.form2?.sections?.ppr || {};
    const dar = app.formData?.form2?.sections?.ddr || {};

    const setVal = (id, val) => { const el = $(id); if (el && val != null && val !== '') el.value = val; };

    setVal('victimStatements', ppr.victimStatements || ppr.communitySummary);
    setVal('communityRisk', ppr.communityRisk || ppr.communitySupport || ppr.reintegrationRisk);
    setVal('communityStatements', ppr.communityStatements);
    setVal('sponsorName', ppr.sponsorName);
    setVal('sponsorRelationship', ppr.sponsorRelationship);
    setVal('sponsorCapability', ppr.sponsorCapability);
    setVal('sponsorNotes', ppr.sponsorNotes);
    setVal('verifiedResidence', ppr.verifiedResidence);
    setVal('accommodationStability', ppr.accommodationStability);
    setVal('reintegrationPlan', ppr.reintegrationPlan);
    setVal('customarySettlement', ppr.customarySettlement);
    setVal('restorativeAssessment', ppr.restorativeAssessment);
    setVal('pprOfficer', ppr.pprOfficer || ppr.clerkName || `${actor.firstName} ${actor.lastName}`);
    setVal('pprDate', ppr.pprDate || new Date().toISOString().slice(0, 10));

    setVal('disciplinaryHistory', dar.disciplinaryHistory || dar.conductRating);
    setVal('conductLog', dar.conductLog || dar.summary);
    setVal('adjustmentRating', dar.adjustmentRating);
    setVal('trainingProgress', dar.trainingProgress || dar.programCompletion);
    setVal('vocationalTraining', dar.vocationalTraining);
    setVal('rehabProgress', dar.rehabProgress);
    setVal('mentalHealth', dar.mentalHealth);
    setVal('emotionalMaturity', dar.emotionalMaturity);
    setVal('physicalHealth', dar.physicalHealth);
    setVal('recidivismNotes', dar.recidivismNotes);
    setVal('darOfficer', dar.darOfficer || dar.officerName || `${actor.firstName} ${actor.lastName}`);
    setVal('darDate', dar.darDate || new Date().toISOString().slice(0, 10));

    const risk = dar.recidivismRisk || 'Low';
    const radio = document.querySelector(`input[name="recidivismRisk"][value="${risk}"]`);
    if (radio) radio.checked = true;

    const form1 = app.formData?.form1;
    const d = form1?.sectionD || form1?.sections?.D || {};
    if (!ppr.sponsorName && (d.sponsor_name || d.sponsorName)) {
      setVal('sponsorName', d.sponsor_name || d.sponsorName);
      setVal('sponsorRelationship', d.sponsor_relationship || d.sponsorRelationship);
      setVal('verifiedResidence', [d.proposed_residence || d.proposedResidence, d.proposed_residence_province || d.proposedResidenceProvince].filter(Boolean).join(', '));
      setVal('reintegrationPlan', [d.employment_plans || d.employmentPlans, d.community_service_plans || d.communityPlans].filter(Boolean).join('\n'));
    }

    if (ppr.submitted) {
      pprLocked = true;
      updateStatus('pprStatus', 'COMPLETED', 'completed');
      lockCard('pprCard', true);
    } else if (ppr.savedAt || Object.keys(ppr).length) {
      updateStatus('pprStatus', 'IN PROGRESS', 'in-progress');
    }

    if (dar.submitted) {
      darLocked = true;
      updateStatus('darStatus', 'COMPLETED', 'completed');
      lockCard('darCard', true);
    } else if (dar.savedAt || Object.keys(dar).length) {
      updateStatus('darStatus', 'IN PROGRESS', 'in-progress');
    }

    checkBothSubmitted();
  }

  function applyRoleLocks() {
    if (!canEditPpr && !pprLocked) lockCard('pprCard', true);
    if (!canEditDar && !darLocked) lockCard('darCard', true);
    if (!canEditPpr) {
      $('btnSavePpr')?.setAttribute('disabled', 'disabled');
      $('btnSubmitPpr')?.setAttribute('disabled', 'disabled');
    }
    if (!canEditDar) {
      $('btnSaveDar')?.setAttribute('disabled', 'disabled');
      $('btnSubmitDar')?.setAttribute('disabled', 'disabled');
    }
  }

  function bindEvents() {
    PPR_FILE_IDS.forEach((id) => setupFileUpload(id, `${id}Preview`));
    DAR_FILE_IDS.forEach((id) => setupFileUpload(id, `${id}Preview`));

    $('btnSavePpr')?.addEventListener('click', () => saveDraft('ppr'));
    $('btnSubmitPpr')?.addEventListener('click', () => submitSection('ppr'));
    $('btnSaveDar')?.addEventListener('click', () => saveDraft('ddr'));
    $('btnSubmitDar')?.addEventListener('click', () => submitSection('ddr'));
    $('btnSubmitBoth')?.addEventListener('click', submitBothReports);
    $('btnPreview')?.addEventListener('click', () => window.print());
    $('btnBackForm1')?.addEventListener('click', () => {
      if (confirm('Return to Form 1? Unsaved changes may be lost.')) {
        window.location.href = `form1.html?appId=${encodeURIComponent(appId)}`;
      }
    });
  }

  async function boot(resolvedAppId) {
    appId = resolvedAppId;
    app = PMSStorage.getApplicationById(appId);
    prisoner = app ? PMSStorage.getPrisonerById(app.prisonerId) : null;
    if (!app || !prisoner) {
      alert('Application or detainee record not found.');
      window.location.href = '../dashboard-pngcs.html';
      return;
    }

    institution = PMSStorage.getInstitutionById(prisoner.institutionId);
    const role = normalizeRole(actor.role);
    canEditPpr = ['DJAG Parole Clerk', 'System Administrator'].includes(role);
    canEditDar = ['PNGCS Parole Clerk', 'CS Parole Officer', 'System Administrator'].includes(role);

    populateSummary();
    fillFormFromStorage();
    bindEvents();
    applyRoleLocks();

    $('form2-root').classList.remove('hidden');
    $('selection-panel')?.classList.add('hidden');

    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'form1') {
      showToast('Form 1 submitted. Complete the assessment reports below.', 'success');
    }
  }

  async function init() {
    await PMSStorage.ensureLoaded();
    actor = PMSAuth.requireRole(['PNGCS Parole Clerk', 'CS Parole Officer', 'DJAG Parole Clerk', 'System Administrator']);
    if (!actor) return;

    const params = new URLSearchParams(window.location.search);
    let resolvedAppId = params.get('appId');

    if (resolvedAppId) {
      const checkApp = PMSStorage.getApplicationById(resolvedAppId);
      const f1 = checkApp?.formData?.form1;
      const form1Ready = PMSStorage.isForm1Complete(f1)
        || f1?.status === 'submitted'
        || ['REPORT_PREPARATION', 'Pending Commander Review'].includes(checkApp?.status);
      if (!form1Ready && typeof PMSFormWorkflow !== 'undefined' && !PMSFormWorkflow.canAccess(resolvedAppId, 2)) {
        alert('Form 1 must be completed before accessing Form 2.');
        window.location.href = `form1.html?appId=${encodeURIComponent(resolvedAppId)}`;
        return;
      }
      await boot(resolvedAppId);
      return;
    }

    $('selection-panel')?.classList.remove('hidden');
    const apps = PMSStorage.getApplications().filter((a) => {
      const fd = a.formData || {};
      return PMSStorage.isForm1Complete(fd.form1) || fd.form1?.status === 'submitted';
    });
    const prisoners = apps.map((a) => PMSStorage.getPrisonerById(a.prisonerId)).filter(Boolean);

    PMSPrisonerCombobox.mount({
      prisonerList: PMSRBAC.filterPrisonersForUser(actor, prisoners),
      onSelect: async (prisonerId) => {
        const match = apps.find((a) => a.prisonerId === prisonerId);
        if (!match) return;
        window.history.replaceState({}, '', `${window.location.pathname}?appId=${encodeURIComponent(match.id)}`);
        await boot(match.id);
      },
    });
  }

  return { init, collectPPR, collectDAR };
})();
