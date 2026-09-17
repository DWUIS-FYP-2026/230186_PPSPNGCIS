/**
 * Form 2 — Assessment Reports (PPR & DAR/DDR) page controller.
 */
const PMSForm2Assessment = (() => {
  const PPR_FILE_IDS = [
    'pprInmateDocs',
    'pprSocialCaseDocs',
    'pprCommunityDocs',
    'pprVictimImpactDocs',
    'pprReintegrationDocs',
    'pprBoardInterviewDocs',
    'pprSignoffDocs',
  ];
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
  let activeReportSection = null;
  let officerAuth = null;
  let submitGate = null;

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
    if (typeof PMSFormsEngine !== 'undefined' && PMSFormsEngine.formatSentenceLength) {
      return PMSFormsEngine.formatSentenceLength(p);
    }
    if (p.sentenceType === 'Life' || p.sentence_type === 'Life') return 'Life (10 Years)';
    const months = typeof PMSStorage !== 'undefined' ? PMSStorage.getSentenceDurationMonths(p) : 0;
    if (months > 0) {
      const years = Math.floor(months / 12);
      const rem = months % 12;
      const parts = [];
      if (years) parts.push(`${years} Year${years !== 1 ? 's' : ''}`);
      if (rem) parts.push(`${rem} Month${rem !== 1 ? 's' : ''}`);
      return parts.join(', ');
    }
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
    const mirrorIds = elementId === 'darStatus' ? ['darStatus', 'darHubStatus']
      : elementId === 'pprStatus' ? ['pprStatus', 'pprHubStatus']
        : [elementId];
    mirrorIds.forEach((id) => {
      const el = $(id);
      if (el) {
        el.textContent = text;
        el.className = `status-badge ${className}`;
      }
    });
  }

  function syncUrlSection(section) {
    const params = new URLSearchParams(window.location.search);
    if (section) params.set('section', section);
    else params.delete('section');
    const qs = params.toString();
    window.history.replaceState({}, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }

  function updateFormActionsVisibility() {
    const onHub = !activeReportSection;
    $('btnPreview')?.classList.toggle('hidden', onHub);
    document.body.classList.toggle('form2-view-workspace', !onHub);
  }

  function showReportsHub() {
    activeReportSection = null;
    $('reportsHub')?.classList.remove('hidden');
    $('reportsWorkspace')?.classList.add('hidden');
    $('darCard')?.classList.add('hidden');
    $('pprCard')?.classList.add('hidden');
    syncUrlSection(null);
    updateFormActionsVisibility();
    remountOfficerAuth();
  }

  function openReportSection(section) {
    const isPpr = section === 'ppr';
    const isDar = section === 'dar' || section === 'ddr';
    if (!isPpr && !isDar) return;

    activeReportSection = isPpr ? 'ppr' : 'dar';
    $('reportsHub')?.classList.add('hidden');
    $('reportsWorkspace')?.classList.remove('hidden');
    $('darCard')?.classList.toggle('hidden', !isDar);
    $('pprCard')?.classList.toggle('hidden', !isPpr);

    const title = $('reportsWorkspaceTitle');
    if (title) {
      title.textContent = isDar
        ? 'Detainee Assessment Report (DAR)'
        : 'Pre-Parole Report (PPR)';
    }

    syncUrlSection(activeReportSection);
    updateFormActionsVisibility();
    remountOfficerAuth();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function normalizeStoredAttachment(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') return { fileName: entry, dataUrl: null };
    return entry;
  }

  function renderAttachmentChip(file, { pending = false } = {}) {
    const name = typeof file === 'string' ? file : file.fileName;
    const size = file?.fileSize ? ` (${(file.fileSize / 1024).toFixed(1)} KB)` : '';
    const pendingLabel = pending ? ' · pending save' : '';
    const downloadBtn = !pending && file?.dataUrl && file?.id
      ? ` <button type="button" class="file-chip__download" data-f2-local-download="${file.id}">Download</button>`
      : (!pending && !file?.dataUrl ? ' (name only)' : '');
    return `<span class="file-chip">${name}${size}${pendingLabel}${downloadBtn}</span>`;
  }

  function setupFileUpload(inputId, previewId) {
    const input = $(inputId);
    const preview = $(previewId);
    if (!input || !preview) return;

    input.addEventListener('change', () => {
      const files = input.files;
      if (!files?.length) return;
      preview.innerHTML = Array.from(files).map((f) => renderAttachmentChip({
        fileName: f.name,
        fileSize: f.size,
      }, { pending: true })).join('');
      input.closest('.field-with-attachment')?.classList.add('has-attachment');
    });
  }

  async function collectAttachmentFiles(ids, existingSection = {}) {
    const existing = existingSection.attachments || {};
    const result = {};
    for (const id of ids) {
      const input = $(id);
      const previous = (existing[id] || []).map(normalizeStoredAttachment).filter(Boolean);
      if (input?.files?.length) {
        const uploaded = [];
        for (const file of input.files) {
          uploaded.push({
            id: `F2A-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            dataUrl: await readFileAsDataUrl(file),
            uploadedAt: new Date().toISOString(),
            uploadedBy: actor.id,
            uploadedByName: `${actor.firstName} ${actor.lastName}`,
          });
        }
        result[id] = uploaded;
      } else {
        result[id] = previous;
      }
    }
    return result;
  }

  function getCardBody(cardId) {
    const card = $(cardId);
    return card?.querySelector('.ppr-form-body') || card?.querySelector('.card-body') || card;
  }

  function setRadio(name, value) {
    if (!value) return;
    const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (radio) radio.checked = true;
  }

  function syncPprLegacyFields() {
    const vpoName = $('pprVpoName')?.value.trim() || '';
    const vpoContact = $('pprVpoContact')?.value.trim() || '';
    if ($('sponsorName')) $('sponsorName').value = vpoName;
    if ($('sponsorNotes')) {
      $('sponsorNotes').value = vpoContact ? `VPO contact: ${vpoContact}` : '';
    }
    const leader = $('pprCommunityInterview')?.value.trim() || '';
    const pastor = $('pprPastorInterview')?.value.trim() || '';
    const parts = [];
    if (leader) parts.push(`Community leader interview:\n${leader}`);
    if (pastor) parts.push(`Pastor interview:\n${pastor}`);
    if ($('communityStatements')) $('communityStatements').value = parts.join('\n\n');
  }

  function collectPPR() {
    syncPprLegacyFields();
    return {
      pprInmateName: $('pprInmateName')?.value.trim() || '',
      pprInmateId: $('pprInmateId')?.value.trim() || '',
      pprFacility: $('pprFacility')?.value.trim() || '',
      pprSentenceStart: $('pprSentenceStart')?.value || '',
      pprEligibilityDate: $('pprEligibilityDate')?.value || '',
      pprFamilyHistory: $('pprFamilyHistory')?.value.trim() || '',
      pprPsychologicalStanding: $('pprPsychologicalStanding')?.value.trim() || '',
      pprEducationLevel: $('pprEducationLevel')?.value || '',
      pprEmploymentHistory: $('pprEmploymentHistory')?.value.trim() || '',
      pprCommunityLeaderName: $('pprCommunityLeaderName')?.value.trim() || '',
      pprCommunityVillage: $('pprCommunityVillage')?.value.trim() || '',
      pprCommunityInterview: $('pprCommunityInterview')?.value.trim() || '',
      communitySafety: document.querySelector('input[name="communitySafety"]:checked')?.value || '',
      pprPastorName: $('pprPastorName')?.value.trim() || '',
      pprPastorChurch: $('pprPastorChurch')?.value.trim() || '',
      pprPastorInterview: $('pprPastorInterview')?.value.trim() || '',
      victimStatements: $('victimStatements')?.value.trim() || '',
      communityRisk: $('communityRisk')?.value || '',
      victimStatementReceived: document.querySelector('input[name="victimStatementReceived"]:checked')?.value || '',
      verifiedResidence: $('verifiedResidence')?.value.trim() || '',
      pprEmploymentPlan: $('pprEmploymentPlan')?.value.trim() || '',
      pprVpoName: $('pprVpoName')?.value.trim() || '',
      pprVpoContact: $('pprVpoContact')?.value.trim() || '',
      sponsorName: $('sponsorName')?.value.trim() || $('pprVpoName')?.value.trim() || '',
      sponsorRelationship: $('sponsorRelationship')?.value.trim() || 'VPO',
      sponsorCapability: $('sponsorCapability')?.value || 'Adequate',
      sponsorNotes: $('sponsorNotes')?.value.trim() || '',
      accommodationStability: $('accommodationStability')?.value || '',
      reintegrationPlan: $('reintegrationPlan')?.value.trim() || '',
      pprInterviewConducted: document.querySelector('input[name="pprInterviewConducted"]:checked')?.value || 'pending',
      pprBoardInterviewDate: $('pprBoardInterviewDate')?.value || '',
      pprInterviewSummary: $('pprInterviewSummary')?.value.trim() || '',
      pprBoardInterviewer: $('pprBoardInterviewer')?.value.trim() || '',
      pprInmateDemeanor: $('pprInmateDemeanor')?.value || '',
      pprRecommendation: document.querySelector('input[name="pprRecommendation"]:checked')?.value || '',
      pprRecommendationJustification: $('pprRecommendationJustification')?.value.trim() || '',
      communityStatements: $('communityStatements')?.value.trim() || '',
      customarySettlement: $('customarySettlement')?.value.trim() || '',
      restorativeAssessment: $('restorativeAssessment')?.value || '',
      pprOfficer: $('pprOfficer')?.value.trim() || '',
      pprDate: $('pprDate')?.value || '',
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
    };
  }

  async function attachSectionFiles(data, sectionKey, fileIds) {
    const existing = app.formData?.form2?.sections?.[sectionKey] || {};
    data.attachments = await collectAttachmentFiles(fileIds, existing);
    return data;
  }

  function mapPprForStorage(data, { submit = false } = {}) {
    const communityBlock = [
      data.pprCommunityLeaderName && `Leader: ${data.pprCommunityLeaderName}`,
      data.pprCommunityVillage,
      data.pprCommunityInterview,
      data.pprPastorName && `Pastor: ${data.pprPastorName}`,
      data.pprPastorChurch,
      data.pprPastorInterview,
    ].filter(Boolean).join('\n\n');
    return {
      ...data,
      clerkName: data.pprOfficer,
      personalParticulars: [
        data.pprFamilyHistory,
        data.pprPsychologicalStanding,
        data.pprEmploymentHistory,
        data.verifiedResidence,
        data.reintegrationPlan,
      ].filter(Boolean).join('\n\n'),
      communitySummary: data.victimStatements || communityBlock,
      communitySupport: data.communityRisk,
      reintegrationRisk: data.communityRisk,
      communityStatements: data.communityStatements || communityBlock,
      confirmed: submit,
      status: submit ? 'submitted' : 'draft',
    };
  }

  function mapDarForStorage(data, { submit = false } = {}) {
    return {
      ...data,
      officerName: data.darOfficer,
      institutionName: institution?.name || 'Correctional Institution',
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
      ['pprFamilyHistory', 'Family history & upbringing'],
      ['pprCommunityLeaderName', 'Community leader name'],
      ['pprCommunityVillage', 'Village / community'],
      ['pprCommunityInterview', 'Community leader interview summary'],
      ['pprPastorName', 'Pastor name'],
      ['pprPastorChurch', 'Church / organization'],
      ['pprPastorInterview', 'Pastor interview summary'],
      ['victimStatements', 'Victim / family consultation'],
      ['communityRisk', 'Tribal conflict / retaliatory risk'],
      ['verifiedResidence', 'Proposed residence'],
      ['pprEmploymentPlan', 'Employment / livelihood plan'],
      ['pprVpoName', 'VPO name'],
      ['pprVpoContact', 'VPO contact'],
      ['accommodationStability', 'Accommodation stability'],
      ['reintegrationPlan', 'Reintegration support plan'],
      ['pprRecommendation', 'PPR recommendation'],
      ['pprRecommendationJustification', 'Recommendation justification'],
      ['pprOfficer', 'Parole officer name'],
      ['pprDate', 'Report date'],
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

  function resolveApplicationForPrisoner(prisonerId, apps) {
    const candidates = apps.filter((a) => a.prisonerId === prisonerId);
    if (!candidates.length) return null;
    const terminal = ['Approved', 'Refused', 'Released', 'Deferred'];
    const active = candidates.filter((a) => !terminal.includes(a.status));
    const pool = active.length ? active : candidates;
    return pool.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
  }

  async function saveDraft(sectionKey, options = {}) {
    const { silent = false } = options;
    const isPpr = sectionKey === 'ppr';
    if (isPpr && !canEditPpr) {
      if (!silent) showToast('Only DJAG Parole Clerk may edit the PPR section.', 'error');
      return;
    }
    if (!isPpr && !canEditDar) {
      if (!silent) showToast('Only CS Parole Clerk may edit the DAR section.', 'error');
      return;
    }
    try {
      const raw = isPpr ? collectPPR() : collectDAR();
      await attachSectionFiles(raw, sectionKey, isPpr ? PPR_FILE_IDS : DAR_FILE_IDS);
      const mapped = isPpr ? mapPprForStorage(raw) : mapDarForStorage(raw);
      const form2 = app.formData?.form2 || { sections: {} };
      form2.sections = {
        ...(form2.sections || {}),
        [sectionKey]: {
          ...mapped,
          savedAt: new Date().toISOString(),
          saveSource: silent ? 'autosave' : 'manual',
        },
      };
      PMSStorage.saveFormData(appId, 'form2', { ...form2, saveSource: silent ? 'autosave' : 'manual' }, actor);
      app = PMSStorage.getApplicationById(appId);
      updateStatus(isPpr ? 'pprStatus' : 'darStatus', 'IN PROGRESS', 'in-progress');
      if (!silent) {
        showToast(`${isPpr ? 'Pre-Parole Report' : 'Detainee Assessment Report'} draft saved.`, 'success');
      }
    } catch (err) {
      if (!silent) showToast(err.message || 'Could not save draft.', 'error');
      throw err;
    }
  }

  function getActiveSectionKey() {
    if (activeReportSection === 'ppr') return 'ppr';
    if (activeReportSection === 'dar') return 'ddr';
    return null;
  }

  function canAutosaveActiveSection() {
    const key = getActiveSectionKey();
    if (!key || !appId) return false;
    if (key === 'ppr') return canEditPpr && !pprLocked;
    return canEditDar && !darLocked;
  }

  function shouldAutosaveForm2Event(e) {
    const el = e.target;
    if (!el?.closest) return false;
    const card = el.closest('#pprCard, #darCard');
    if (!card || card.classList.contains('hidden')) return false;
    if (card.id === 'pprCard') return activeReportSection === 'ppr' && canEditPpr && !pprLocked;
    return activeReportSection === 'dar' && canEditDar && !darLocked;
  }

  function mountOfficerAuth() {
    if (typeof PMSFormOfficerAuth === 'undefined') return;
    try {
      const sectionKey = getActiveSectionKey();
      const savedAuth = sectionKey
        ? (app?.formData?.form2?.sections?.[sectionKey]?.digitalSignature || null)
        : null;
      const canSign = sectionKey === 'ppr'
        ? (canEditPpr && !pprLocked)
        : sectionKey === 'ddr'
          ? (canEditDar && !darLocked)
          : false;
      officerAuth = PMSFormOfficerAuth.create({
        mount: '#officer-auth-mount',
        actor,
        applicationId: app?.id || '',
        formNumber: 2,
        readOnly: !canSign,
        savedRecord: savedAuth?.verified ? savedAuth : null,
        onVerified: () => submitGate?.sync(),
      });
      submitGate = PMSFormOfficerAuth.gateSubmitButtons(
        officerAuth,
        ['btnSubmitDar', 'btnSubmitPpr', 'btnSubmitBoth'],
        {
          canEnable: (btn) => {
            if (btn.id === 'btnSubmitPpr') return canEditPpr && !pprLocked;
            if (btn.id === 'btnSubmitDar') return canEditDar && !darLocked;
            if (btn.id === 'btnSubmitBoth') {
              return typeof PMSStorage !== 'undefined'
                && !PMSStorage.isForm2Complete(app?.formData?.form2);
            }
            return true;
          },
        },
      );
      submitGate.sync();
    } catch (err) {
      console.error('Officer authorization failed to mount:', err);
    }
  }

  function remountOfficerAuth() {
    officerAuth = null;
    submitGate = null;
    mountOfficerAuth();
  }

  function requirePinForSubmit() {
    return PMSFormOfficerAuth.requireVerified(officerAuth, {
      showToast,
      message: 'Enter your 6-digit PIN and click Verify & Sign before submitting.',
    });
  }

  async function submitSection(sectionKey) {
    const isPpr = sectionKey === 'ppr';
    if (isPpr && !canEditPpr) {
      showToast('Only DJAG Parole Clerk may submit the PPR section.', 'error');
      return;
    }
    if (!isPpr && !canEditDar) {
      showToast('Only CS Parole Clerk may submit the DAR section.', 'error');
      return;
    }
    if (!requirePinForSubmit()) return;

    const raw = isPpr ? collectPPR() : collectDAR();
    if (isPpr ? !validatePPR(raw) : !validateDAR(raw)) return;

    await attachSectionFiles(raw, sectionKey, isPpr ? PPR_FILE_IDS : DAR_FILE_IDS);
    const digitalSignature = officerAuth?.getRecord();
    const mapped = {
      ...(isPpr ? mapPprForStorage(raw, { submit: true }) : mapDarForStorage(raw, { submit: true })),
      digitalSignature,
      formSection: sectionKey,
    };

    try {
      await PMSStorage.saveForm2Section(appId, sectionKey, mapped, actor);
      app = PMSStorage.getApplicationById(appId);

      if (typeof PMSStorage !== 'undefined' && PMSStorage.isAct1991ParoleSyncEnabled()
        && typeof PMSApi !== 'undefined' && PMSApi.getToken()) {
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
      updateSectionControls();
      updatePprProgress();
      submitGate?.sync();
      if (PMSStorage.isForm2Complete(app.formData?.form2)) {
        finalizeForm2Submission();
      } else {
        showToast(
          `${isPpr ? 'Pre-Parole Report' : 'Detainee Assessment Report'} submitted successfully. The report stays open for review.`,
          'success',
        );
      }
    } catch (err) {
      showToast(err.message || 'Submission failed.', 'error');
    }
  }

  function showSectionBanner(cardId, message) {
    const body = getCardBody(cardId);
    if (!body) return;
    let banner = body.querySelector('.section-readonly-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'section-readonly-banner';
      banner.setAttribute('role', 'note');
      body.insertBefore(banner, body.firstChild);
    }
    banner.innerHTML = `<span>${message}</span>`;
  }

  function verifiedByMessage(section, fallback) {
    const sig = section?.digitalSignature;
    if (sig?.verified && sig.officerName) {
      const when = sig.timestamp ? ` on ${formatDisplayDate(sig.timestamp)}` : '';
      const role = sig.role ? ` (${sig.role})` : '';
      return `Verified by ${sig.officerName}${role}${when}.`;
    }
    return fallback;
  }

  function lockCard(cardId, locked) {
    const card = $(cardId);
    if (!card) return;
    card.classList.toggle('locked', locked);
    const scope = getCardBody(cardId);
    if (!scope) return;
    scope.querySelectorAll('input, select, textarea, button').forEach((el) => {
      if (el.closest('.section-readonly-banner')) return;
      if (el.dataset.sectionControl === 'true') return;
      if (el.tagName === 'BUTTON') {
        el.disabled = locked;
        return;
      }
      if (el.type === 'file' || el.type === 'radio' || el.type === 'checkbox') {
        el.disabled = locked;
        return;
      }
      if (el.tagName === 'SELECT') {
        el.disabled = locked;
        return;
      }
      el.readOnly = locked;
      el.classList.toggle('readonly-field', locked);
    });
    scope.querySelectorAll('.ppr-upload-btn').forEach((label) => {
      if (locked) {
        label.setAttribute('aria-disabled', 'true');
        label.classList.add('is-disabled');
      } else {
        label.removeAttribute('aria-disabled');
        label.classList.remove('is-disabled');
      }
    });
    scope.querySelectorAll('.file-upload-wrapper').forEach((zone) => {
      zone.style.pointerEvents = locked ? 'none' : '';
      zone.style.opacity = locked ? '0.65' : '';
    });
  }

  function updateSectionControls() {
    const showPprEdit = canEditPpr && pprLocked;
    const showDarEdit = canEditDar && darLocked;
    $('btnEditPpr')?.classList.toggle('hidden', !showPprEdit);
    $('btnEditDar')?.classList.toggle('hidden', !showDarEdit);
    document.querySelector('[data-section-actions="ppr"]')?.classList.toggle('hidden', !canEditPpr || pprLocked);
    document.querySelector('[data-section-actions="dar"]')?.classList.toggle('hidden', !canEditDar || darLocked);
    submitGate?.sync();
  }

  function unlockSection(sectionKey) {
    const isPpr = sectionKey === 'ppr';
    if (isPpr && !canEditPpr) {
      showToast('Only DJAG Parole Clerk may edit the PPR section.', 'error');
      return;
    }
    if (!isPpr && !canEditDar) {
      showToast('Only CS Parole Clerk may edit the DAR section.', 'error');
      return;
    }

    const form2 = app.formData?.form2 || { sections: {} };
    const existing = form2.sections?.[sectionKey] || {};
    form2.sections = {
      ...(form2.sections || {}),
      [sectionKey]: {
        ...existing,
        submitted: false,
        confirmed: false,
        status: 'draft',
        reopenedAt: new Date().toISOString(),
        reopenedBy: actor.id,
      },
    };
    if (form2.status === 'submitted') form2.status = 'draft';
    delete form2.submittedAt;
    PMSStorage.saveFormData(appId, 'form2', form2, actor);
    app = PMSStorage.getApplicationById(appId);

    if (isPpr) {
      pprLocked = false;
      lockCard('pprCard', false);
      updateStatus('pprStatus', 'IN PROGRESS', 'in-progress');
    } else {
      darLocked = false;
      lockCard('darCard', false);
      updateStatus('darStatus', 'IN PROGRESS', 'in-progress');
    }
    updateStatus('reportStatus', 'REPORTS IN PROGRESS', 'in-progress');
    updateSectionControls();
    showToast(`${isPpr ? 'Pre-Parole Report' : 'Detainee Assessment Report'} unlocked for editing.`, 'info');
  }

  function applyForm2CompleteUi() {
    app = PMSStorage.getApplicationById(appId);
    const f2 = app?.formData?.form2;
    const complete = typeof PMSStorage !== 'undefined' && PMSStorage.isForm2Complete(f2);
    if (!complete) return;
    updateStatus('reportStatus', 'READY FOR BOARD HEARING', 'completed');
    updatePprProgress();
    showForm2CompleteNotice();
  }

  function showForm2CompleteNotice() {
    const hubIntro = $('reportsHub')?.querySelector('.reports-hub__intro');
    if (hubIntro && !hubIntro.dataset.completeNotice) {
      hubIntro.dataset.completeNotice = 'true';
      hubIntro.textContent = 'Both DAR and PPR are complete. Open either report to review submitted assessments. Leave this page when you are finished.';
    }
    const workspaceBar = document.querySelector('.reports-workspace__bar');
    if (workspaceBar && !workspaceBar.querySelector('.form2-complete-notice')) {
      const notice = document.createElement('p');
      notice.className = 'form2-complete-notice';
      notice.setAttribute('role', 'status');
      notice.textContent = 'Assessments complete — reports remain available for review until you close this page.';
      workspaceBar.appendChild(notice);
    }
  }

  function finalizeForm2Submission() {
    updateStatus('reportStatus', 'READY FOR BOARD HEARING', 'completed');
    showToast(
      'PPR and DAR submitted to the board workflow. Reports stay open for review until you leave this page.',
      'success',
    );
    if (typeof PMSFormWorkflow !== 'undefined') {
      PMSFormWorkflow.markComplete(2, appId, { submitted: true });
    }
    updatePprProgress();
    showForm2CompleteNotice();
  }

  async function submitBothReports() {
    if (!requirePinForSubmit()) return;
    const ppr = app?.formData?.form2?.sections?.ppr;
    const ddr = app?.formData?.form2?.sections?.ddr;
    if (!ppr?.submitted || !ddr?.submitted) {
      if (!validatePPR(collectPPR()) || !validateDAR(collectDAR())) return;
      showToast('Submit each report section individually first, or complete all required fields.', 'error');
      return;
    }
    if (typeof PMSStorage !== 'undefined' && PMSStorage.isForm2Complete(app.formData.form2)) {
      finalizeForm2Submission();
    }
  }

  function populateSummary() {
    $('applicationId').textContent = app.caseNumber || app.id;
    $('detaineeName').textContent = prisonerDisplayName(prisoner);
    $('ciNumber').textContent = prisoner.ciNumber || prisoner.ci_number || prisoner.prisonerNumber || prisoner.id;
    $('facilityName').textContent = institution?.name || 'Correctional Institution';
    $('sentenceDisplay').textContent = sentenceDisplay(prisoner);
    $('eligibilityDate').textContent = app.eligibilityDate ? formatDisplayDate(app.eligibilityDate) : '—';
  }

  function updatePprProgress() {
    const darDone = !!(app?.formData?.form2?.sections?.ddr?.submitted);
    const pprDone = !!(app?.formData?.form2?.sections?.ppr?.submitted);
    const bothDone = typeof PMSStorage !== 'undefined' && PMSStorage.isForm2Complete(app?.formData?.form2);
    const steps = {
      dar: document.querySelector('[data-ppr-step="dar"]'),
      ppr: document.querySelector('[data-ppr-step="ppr"]'),
      board: document.querySelector('[data-ppr-step="board"]'),
      decision: document.querySelector('[data-ppr-step="decision"]'),
    };
    Object.values(steps).forEach((el) => el?.classList.remove('active', 'completed'));
    if (steps.dar) steps.dar.classList.add(darDone ? 'completed' : 'active');
    if (steps.ppr) {
      if (pprDone) steps.ppr.classList.add('completed');
      else if (darDone) steps.ppr.classList.add('active');
    }
    if (steps.board && pprDone) steps.board.classList.add('active');
    if (steps.decision && bothDone) steps.decision.classList.add('completed');
  }

  let pprRecRadiosBound = false;

  function initPprRecommendationRadios() {
    const sync = () => {
      document.querySelectorAll('.ppr-rec-option').forEach((label) => {
        const input = label.querySelector('input[type="radio"]');
        label.classList.toggle('selected', !!input?.checked);
      });
    };
    if (!pprRecRadiosBound) {
      document.querySelector('.ppr-rec-grid')?.addEventListener('change', sync);
      pprRecRadiosBound = true;
    }
    sync();
  }

  function populateInmateInfo() {
    const setVal = (id, val) => { const el = $(id); if (el && val != null && val !== '') el.value = val; };
    setVal('pprInmateName', prisonerDisplayName(prisoner));
    setVal('pprInmateId', prisoner.ciNumber || prisoner.ci_number || prisoner.prisonerNumber || prisoner.id);
    setVal('pprFacility', institution?.name || 'Correctional Institution');
    const sentenceStart = prisoner.sentenceStartDate || prisoner.sentence_start_date || prisoner.dateOfSentence;
    if (sentenceStart) {
      const d = new Date(sentenceStart);
      if (!Number.isNaN(d.getTime())) setVal('pprSentenceStart', d.toISOString().slice(0, 10));
    }
    if (app.eligibilityDate) {
      const d = new Date(app.eligibilityDate);
      if (!Number.isNaN(d.getTime())) setVal('pprEligibilityDate', d.toISOString().slice(0, 10));
    }
  }

  function resetPprSection() {
    if (!confirm('Reset all PPR fields? Unsaved changes will be lost.')) return;
    const setVal = (id, val) => { const el = $(id); if (el) el.value = val; };
    const body = getCardBody('pprCard');
    if (!body) return;
    body.querySelectorAll('input:not([type="radio"]):not([type="hidden"]), textarea, select').forEach((el) => {
      if (el.classList.contains('readonly-field') || el.readOnly) return;
      el.value = '';
    });
    body.querySelectorAll('input[type="radio"]').forEach((el) => { el.checked = false; });
    setRadio('pprRecommendation', 'recommend');
    setRadio('pprInterviewConducted', 'pending');
    PPR_FILE_IDS.forEach((id) => {
      const input = $(id);
      const preview = $(`${id}Preview`);
      if (input) input.value = '';
      if (preview) preview.innerHTML = '';
    });
    populateInmateInfo();
    setVal('pprOfficer', `${actor.firstName} ${actor.lastName}`);
    setVal('pprDate', new Date().toISOString().slice(0, 10));
    initPprRecommendationRadios();
  }

  function restoreSavedAttachments(section, idMap = {}) {
    const attachments = section?.attachments || {};
    Object.entries(attachments).forEach(([key, entries]) => {
      const targetId = idMap[key] || key;
      const preview = $(`${targetId}Preview`);
      if (!preview || !Array.isArray(entries) || !entries.length) return;
      preview.innerHTML = entries.map((entry) => renderAttachmentChip(normalizeStoredAttachment(entry))).join('');
      preview.closest('.field-with-attachment')?.classList.add('has-attachment');
    });
  }

  function fillFormFromStorage({ skipActiveEdit = false } = {}) {
    const ppr = app.formData?.form2?.sections?.ppr || {};
    const dar = app.formData?.form2?.sections?.ddr || {};
    const skipPpr = skipActiveEdit && activeReportSection === 'ppr' && canEditPpr && !pprLocked;
    const skipDar = skipActiveEdit && activeReportSection === 'dar' && canEditDar && !darLocked;

    const setVal = (id, val) => { const el = $(id); if (el && val != null && val !== '') el.value = val; };

    populateInmateInfo();
    if (!skipPpr) {
    setVal('pprFamilyHistory', ppr.pprFamilyHistory);
    setVal('pprPsychologicalStanding', ppr.pprPsychologicalStanding);
    setVal('pprEducationLevel', ppr.pprEducationLevel);
    setVal('pprEmploymentHistory', ppr.pprEmploymentHistory);
    setVal('pprCommunityLeaderName', ppr.pprCommunityLeaderName);
    setVal('pprCommunityVillage', ppr.pprCommunityVillage);
    setVal('pprCommunityInterview', ppr.pprCommunityInterview);
    setVal('pprPastorName', ppr.pprPastorName);
    setVal('pprPastorChurch', ppr.pprPastorChurch);
    setVal('pprPastorInterview', ppr.pprPastorInterview);
    setVal('victimStatements', ppr.victimStatements || ppr.communitySummary);
    setVal('communityRisk', ppr.communityRisk || ppr.communitySupport || ppr.reintegrationRisk);
    setVal('verifiedResidence', ppr.verifiedResidence);
    setVal('pprEmploymentPlan', ppr.pprEmploymentPlan);
    setVal('pprVpoName', ppr.pprVpoName || ppr.sponsorName);
    setVal('pprVpoContact', ppr.pprVpoContact);
    setVal('sponsorName', ppr.sponsorName || ppr.pprVpoName);
    setVal('sponsorRelationship', ppr.sponsorRelationship || 'VPO');
    setVal('sponsorCapability', ppr.sponsorCapability || 'Adequate');
    setVal('sponsorNotes', ppr.sponsorNotes);
    setVal('accommodationStability', ppr.accommodationStability);
    setVal('reintegrationPlan', ppr.reintegrationPlan);
    setVal('pprBoardInterviewDate', ppr.pprBoardInterviewDate);
    setVal('pprInterviewSummary', ppr.pprInterviewSummary);
    setVal('pprBoardInterviewer', ppr.pprBoardInterviewer);
    setVal('pprInmateDemeanor', ppr.pprInmateDemeanor);
    setVal('pprRecommendationJustification', ppr.pprRecommendationJustification);
    setVal('communityStatements', ppr.communityStatements);
    setVal('customarySettlement', ppr.customarySettlement);
    setVal('restorativeAssessment', ppr.restorativeAssessment);
    setVal('pprOfficer', ppr.pprOfficer || ppr.clerkName || `${actor.firstName} ${actor.lastName}`);
    setVal('pprDate', ppr.pprDate || new Date().toISOString().slice(0, 10));

    setRadio('communitySafety', ppr.communitySafety);
    setRadio('victimStatementReceived', ppr.victimStatementReceived);
    setRadio('pprInterviewConducted', ppr.pprInterviewConducted || 'pending');
    setRadio('pprRecommendation', ppr.pprRecommendation || 'recommend');
    }

    if (!skipDar) {
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
    }

    const form1 = app.formData?.form1;
    const d = form1?.sectionD || form1?.sections?.D || {};
    if (!skipPpr) {
    if (!ppr.pprVpoName && !ppr.sponsorName && (d.sponsor_name || d.sponsorName)) {
      setVal('pprVpoName', d.sponsor_name || d.sponsorName);
      setVal('sponsorName', d.sponsor_name || d.sponsorName);
      setVal('sponsorRelationship', d.sponsor_relationship || d.sponsorRelationship || 'VPO');
    }
    if (!ppr.verifiedResidence) {
      setVal('verifiedResidence', [d.proposed_residence || d.proposedResidence, d.proposed_residence_province || d.proposedResidenceProvince].filter(Boolean).join(', '));
    }
    if (!ppr.pprEmploymentPlan) {
      setVal('pprEmploymentPlan', d.employment_plans || d.employmentPlans || '');
    }
    if (!ppr.reintegrationPlan) {
      setVal('reintegrationPlan', [d.employment_plans || d.employmentPlans, d.community_service_plans || d.communityPlans].filter(Boolean).join('\n'));
    }
    }

    initPprRecommendationRadios();
    if (!skipPpr) {
      restoreSavedAttachments(ppr, {
        pprVictimDocs: 'pprCommunityDocs',
        pprCustomaryDocs: 'pprSignoffDocs',
      });
    }
    if (!skipDar) restoreSavedAttachments(dar);
    updatePprProgress();

    const pprVerified = typeof PMSStorage.isForm2SectionVerified === 'function'
      ? PMSStorage.isForm2SectionVerified(ppr)
      : !!ppr.submitted;
    const darVerified = typeof PMSStorage.isForm2SectionVerified === 'function'
      ? PMSStorage.isForm2SectionVerified(dar)
      : !!dar.submitted;

    if (pprVerified) {
      pprLocked = true;
      updateStatus('pprStatus', 'COMPLETED', 'completed');
      lockCard('pprCard', true);
    } else if (ppr.savedAt || Object.keys(ppr).length) {
      updateStatus('pprStatus', 'IN PROGRESS', 'in-progress');
    }

    if (darVerified) {
      darLocked = true;
      updateStatus('darStatus', 'COMPLETED', 'completed');
      lockCard('darCard', true);
    } else if (dar.savedAt || Object.keys(dar).length) {
      updateStatus('darStatus', 'IN PROGRESS', 'in-progress');
    }

    applyForm2CompleteUi();
    updateSectionControls();
    submitGate?.sync();
  }

  function applyRoleLocks() {
    const ppr = app?.formData?.form2?.sections?.ppr;
    const dar = app?.formData?.form2?.sections?.ddr;
    if (!canEditPpr || pprLocked) {
      lockCard('pprCard', true);
      showSectionBanner('pprCard', verifiedByMessage(
        ppr,
        'View only — Pre-Parole Report is completed by DJAG Parole Clerk.',
      ));
    }
    if (!canEditDar || darLocked) {
      lockCard('darCard', true);
      showSectionBanner('darCard', verifiedByMessage(
        dar,
        'View only — Detainee Assessment Report is completed by CS Parole Clerk.',
      ));
    }
    updateSectionControls();
  }

  function syncLiveVerification() {
    if (!appId) return;
    const next = PMSStorage.getApplicationById(appId);
    if (!next) return;
    app = next;
    const wasPprLocked = pprLocked;
    const wasDarLocked = darLocked;
    fillFormFromStorage({ skipActiveEdit: true });
    applyRoleLocks();
    const sectionKey = getActiveSectionKey();
    const saved = sectionKey ? app.formData?.form2?.sections?.[sectionKey]?.digitalSignature : null;
    if ((pprLocked && !wasPprLocked) || (darLocked && !wasDarLocked) || (saved?.verified && !officerAuth?.isVerified())) {
      remountOfficerAuth();
    }
    if (typeof PMSFormWorkflow !== 'undefined') PMSFormWorkflow.mountFormChrome(2, appId);
  }

  function bindEvents() {
    PPR_FILE_IDS.forEach((id) => setupFileUpload(id, `${id}Preview`));
    DAR_FILE_IDS.forEach((id) => setupFileUpload(id, `${id}Preview`));

    $('btnSavePpr')?.addEventListener('click', () => saveDraft('ppr'));
    $('btnSubmitPpr')?.addEventListener('click', () => submitSection('ppr'));
    $('btnEditPpr')?.addEventListener('click', () => unlockSection('ppr'));
    $('btnResetPpr')?.addEventListener('click', resetPprSection);
    $('btnSaveDar')?.addEventListener('click', () => saveDraft('ddr'));
    $('btnSubmitDar')?.addEventListener('click', () => submitSection('ddr'));
    $('btnEditDar')?.addEventListener('click', () => unlockSection('ddr'));
    $('btnSubmitBoth')?.addEventListener('click', submitBothReports);
    $('btnOpenDar')?.addEventListener('click', () => openReportSection('dar'));
    $('btnOpenPpr')?.addEventListener('click', () => openReportSection('ppr'));
    $('btnBackToHub')?.addEventListener('click', showReportsHub);
    $('btnPreview')?.addEventListener('click', () => {
      if (!activeReportSection) {
        showToast('Open a report to preview or print.', 'info');
        return;
      }
      document.body.classList.add(`form2-print-${activeReportSection}`);
      window.print();
      document.body.classList.remove(`form2-print-${activeReportSection}`);
    });
    $('btnBackForm1')?.addEventListener('click', () => {
      if (typeof PMSFormWorkflow !== 'undefined' && appId) {
        PMSFormWorkflow.openForm(1, appId);
      } else {
        window.location.href = `form1.html?appId=${encodeURIComponent(appId)}`;
      }
    });
    $('btnNextForm3')?.addEventListener('click', () => {
      if (typeof PMSFormWorkflow !== 'undefined' && appId) PMSFormWorkflow.openForm(3, appId);
    });

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-f2-local-download]');
      if (!btn || !appId) return;
      try {
        PMSStorage.downloadForm2Attachment(appId, btn.dataset.f2LocalDownload);
      } catch (err) {
        showToast(err.message || 'Could not download file.', 'error');
      }
    });
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

    institution = PMSStorage.getInstitutionById(prisoner.institutionId || app.institutionId);
    const role = normalizeRole(actor.role);
    canEditPpr = typeof PMSRBAC !== 'undefined'
      ? PMSRBAC.canEditForm2Section(actor, 'ppr')
      : ['DJAG Parole Clerk', 'System Administrator'].includes(role);
    canEditDar = typeof PMSRBAC !== 'undefined'
      ? PMSRBAC.canEditForm2Section(actor, 'ddr')
      : ['CS Parole Clerk', 'System Administrator'].includes(role);

    if (['Approved', 'Refused', 'Released'].includes(app.status)) {
      showToast(`This case is already ${app.status.toLowerCase()}. Form 2 changes are saved for the record only.`, 'warning');
    }

    if (typeof mountForm2PprSection === 'function') mountForm2PprSection();

    mountOfficerAuth();
    populateSummary();
    fillFormFromStorage();
    bindEvents();
    applyRoleLocks();
    submitGate?.sync();

    if (typeof PMSFormAutosave !== 'undefined') {
      PMSFormAutosave.create({
        root: '#form2-root',
        debounceMs: 1500,
        enabled: () => canAutosaveActiveSection(),
        shouldHandleEvent: shouldAutosaveForm2Event,
        onSave: async ({ silent }) => {
          const key = getActiveSectionKey();
          if (key) await saveDraft(key, { silent });
        },
      });
    }

    if (typeof PMSFormWorkflow !== 'undefined') {
      PMSFormWorkflow.mountFormChrome(2, appId);
    }

    const sectionParam = new URLSearchParams(window.location.search).get('section');
    if (sectionParam === 'ppr') {
      openReportSection('ppr');
    } else if (sectionParam === 'dar' || sectionParam === 'ddr') {
      openReportSection('dar');
    } else {
      showReportsHub();
    }

    $('form2-root')?.classList.remove('hidden');
    $('selection-panel')?.classList.add('hidden');

    if (typeof PMSUI?.bindLiveDataRefresh === 'function') {
      PMSUI.bindLiveDataRefresh(() => { syncLiveVerification(); }, { refreshOnFocus: true });
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'form1') {
      showToast('Form 1 submitted. Complete the assessment reports below.', 'success');
    }
  }

  async function init() {
    await PMSStorage.ensureLoaded();
    actor = PMSAuth.requireRole(['CS Parole Clerk', 'CS Parole Officer', 'DJAG Parole Clerk', 'System Administrator']);
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
        if (typeof PMSUI !== 'undefined') PMSUI.showError('Form 1 must be completed before accessing Form 2.');
        else alert('Form 1 must be completed before accessing Form 2.');
        window.location.href = `form1.html?appId=${encodeURIComponent(resolvedAppId)}`;
        return;
      }
      await boot(resolvedAppId);
      return;
    }

    $('selection-panel')?.classList.remove('hidden');
    const apps = PMSStorage.getParoleApplications().filter((a) => {
      const fd = a.formData || {};
      return PMSStorage.isForm1Complete(fd.form1) || fd.form1?.status === 'submitted';
    });
    const prisoners = apps.map((a) => PMSStorage.getPrisonerById(a.prisonerId)).filter(Boolean);

    PMSPrisonerCombobox.mount({
      prisonerList: PMSRBAC.filterPrisonersForUser(actor, prisoners),
      onSelect: async (prisonerId) => {
        const match = resolveApplicationForPrisoner(prisonerId, apps);
        if (!match) return;
        window.history.replaceState({}, '', `${window.location.pathname}?appId=${encodeURIComponent(match.id)}`);
        await boot(match.id);
      },
    });
  }

  return { init, collectPPR, collectDAR };
})();
