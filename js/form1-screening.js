/**
 * PMS Form 1 — Parole Eligibility Screening (database-connected workflow form).
 */
const PMSForm1Screening = (() => {
  let ctx = null;
  let readOnly = false;

  function esc(s) {
    return PMSForms.esc(s);
  }

  function fmt(d) {
    return PMSForms.fmt(d);
  }

  function fmtLong(d) {
    return PMSForms.fmtLong(d);
  }

  function getPrisonerExtended(p) {
    const extra = p?.extraAttributes || {};
    return {
      middleName: extra.middleName || p?.middleName || '',
      housingUnit: extra.housingUnit || p?.housingUnit || '',
      statuteCode: extra.statuteCode || p?.statuteCode || '',
      sentencingCourt: extra.sentencingCourt || p?.sentencingCourt || '',
      sentencingDate: extra.sentencingDate || p?.sentencingDate || '',
      sentenceType: extra.sentenceType || p?.sentenceType || '',
    };
  }

  function setFieldValue(id, value, empty = '—') {
    const el = document.getElementById(id);
    if (el) el.textContent = value || empty;
  }

  function setInputValue(selector, value) {
    const el = document.querySelector(selector);
    if (el && value != null && value !== '') el.value = value;
  }

  function populateIdentification(prisoner, institution) {
    const ext = getPrisonerExtended(prisoner);
    const fullName = [prisoner.firstName, ext.middleName, prisoner.lastName].filter(Boolean).join(' ');
    setFieldValue('f1-full-name', fullName);
    setFieldValue('f1-prisoner-id', prisoner.prisonerNumber || prisoner.id);
    setFieldValue('f1-dob', fmtLong(prisoner.dateOfBirth));
    setFieldValue('f1-gender', prisoner.gender);
    setFieldValue('f1-facility', institution?.name);
    setFieldValue('f1-housing', ext.housingUnit);
    setFieldValue('f1-province', institution?.province || prisoner.province);
  }

  function populateSentence(prisoner, progress, settings) {
    const ext = getPrisonerExtended(prisoner);
    const months = PMSStorage.getSentenceDurationMonths(prisoner);
    setFieldValue('f1-offence', prisoner.offense);
    setFieldValue('f1-statute', ext.statuteCode);
    setFieldValue('f1-court', ext.sentencingCourt);
    setFieldValue('f1-sentencing-date', fmtLong(ext.sentencingDate));
    setFieldValue('f1-sentence-length', PMSForms.formatSentenceLength(prisoner));
    setFieldValue('f1-ssd', fmtLong(prisoner.sentenceStartDate));
    setFieldValue('f1-sed', fmtLong(prisoner.sentenceEndDate));
    setFieldValue('f1-eligibility-date', fmtLong(progress.eligibilityDate));
    setFieldValue('f1-max-expiration', fmtLong(prisoner.sentenceEndDate));
    setFieldValue('f1-sentence-type', ext.sentenceType);
    setFieldValue('f1-served-pct', progress.totalMonths ? `${progress.percent.toFixed(1)}%` : '—');
    setFieldValue('f1-eligibility-rule', settings.paroleEligibilityLabel);

    const statusEl = document.getElementById('f1-computed-status');
    if (statusEl) {
      const derived = prisoner.computedStatus || prisoner.status;
      statusEl.textContent = derived || '—';
      statusEl.className = `official-status-badge${progress.eligible ? ' official-status-badge--eligible' : ''}`;
    }
  }

  function renderChecklist(form1, prisoner, progress, settings) {
    const tbody = document.getElementById('f1-checklist-body');
    if (!tbody) return;

    const auto = PMSForm1Validation.computeAutoCriteria(prisoner, progress, settings);
    const saved = form1?.checklist || {};
    const user = ctx?.user;
    const officerName = user ? `${user.firstName} ${user.lastName}` : '';

    tbody.innerHTML = PMSForm1Validation.CRITERIA.map((c) => {
      const autoRow = auto[c.id];
      const row = saved[c.id] || (c.auto ? autoRow : {});
      const result = row.result || (c.auto ? autoRow?.result : '') || '';
      const disabled = readOnly || c.auto ? 'disabled' : '';
      const sourceBadge = c.auto
        ? '<span class="field-source field-source--system">System</span>'
        : '<span class="field-source field-source--officer">Officer</span>';

      const resultCell = c.auto
        ? `<span class="checklist-result checklist-result--${result}">${esc(result.toUpperCase() || '—')}</span>`
        : `<select class="form-select form-select-sm" data-checklist="${c.id}" data-checklist-field="result" ${disabled} required>
            <option value="">Select…</option>
            <option value="pass"${result === 'pass' ? ' selected' : ''}>Pass</option>
            <option value="fail"${result === 'fail' ? ' selected' : ''}>Fail</option>
            <option value="na"${result === 'na' ? ' selected' : ''}>N/A</option>
          </select>`;

      const comments = row.comments || (c.auto ? autoRow?.comments : '') || '';
      const verifier = row.verifiedByName || (c.auto ? 'PMS' : officerName);

      return `<tr data-criterion="${c.id}">
        <td>${esc(c.label)} ${sourceBadge}</td>
        <td>${resultCell}</td>
        <td>${esc(row.verification || (c.auto ? 'PMS eligibility engine' : 'Officer verification'))}</td>
        <td>${esc(verifier)}</td>
        <td><input type="text" class="form-control form-control-sm${c.auto ? ' readonly-field' : ''}" data-checklist="${c.id}" data-checklist-field="comments" value="${esc(comments)}" ${c.auto || readOnly ? 'readonly' : ''}></td>
      </tr>`;
    }).join('');
  }

  function collectChecklist() {
    const checklist = {};
    PMSForm1Validation.CRITERIA.forEach((c) => {
      const resultEl = document.querySelector(`[data-checklist="${c.id}"][data-checklist-field="result"]`);
      const commentsEl = document.querySelector(`[data-checklist="${c.id}"][data-checklist-field="comments"]`);
      if (c.auto) {
        const auto = PMSForm1Validation.computeAutoCriteria(ctx.prisoner, PMSStorage.getPrisonerProgress(ctx.prisoner), PMSStorage.getSettings());
        checklist[c.id] = {
          ...auto[c.id],
          criterion: c.label,
          source: c.source,
          verifiedBy: ctx.user.id,
          verifiedByName: `${ctx.user.firstName} ${ctx.user.lastName}`,
          verifiedAt: new Date().toISOString(),
          comments: commentsEl?.value || auto[c.id]?.comments || '',
        };
      } else if (resultEl) {
        checklist[c.id] = {
          result: resultEl.value,
          criterion: c.label,
          source: c.source,
          verification: 'Officer verification',
          verifiedBy: ctx.user.id,
          verifiedByName: `${ctx.user.firstName} ${ctx.user.lastName}`,
          verifiedAt: new Date().toISOString(),
          comments: commentsEl?.value || '',
        };
      }
    });
    return checklist;
  }

  function collectFormData() {
    const base = PMSForms.collectFormData();
    return {
      ...base,
      checklist: collectChecklist(),
      prisonerId: ctx.prisoner?.id,
      applicationId: ctx.app?.id,
    };
  }

  function populateOfficerFields(form1) {
    const user = ctx.user;
    setInputValue('[data-field="officerName"]', form1?.officerName || `${user.firstName} ${user.lastName}`);
    setInputValue('[data-field="officerId"]', form1?.officerId || user.officerId || user.employeeNumber || user.id);
    setInputValue('[data-field="officerRank"]', form1?.officerRank || user.rank || user.position || '');
    if (!form1?.screeningDate) {
      setInputValue('[data-field="screeningDate"]', new Date().toISOString().split('T')[0]);
    }
  }

  function populateSupervisorFields(form1) {
    const canReview = ['Jail Commander', 'System Administrator'].includes(
      PMSRBAC.normalizeRole(ctx.user.role)
    );
    const section = document.getElementById('f1-section-g');
    if (!section) return;

    const submitted = form1?.status === 'submitted';
    const supervisorReadOnly = readOnly || !canReview || !submitted;
    section.querySelectorAll('[data-field]').forEach((el) => {
      if (supervisorReadOnly) {
        if (el.type === 'radio' || el.type === 'checkbox') el.disabled = true;
        else {
          el.readOnly = true;
          el.classList.add('readonly-field');
        }
      }
    });

    if (canReview && submitted && !form1?.supervisorReview?.reviewedAt && !readOnly) {
      setInputValue('[data-field="supervisorName"]', `${ctx.user.firstName} ${ctx.user.lastName}`);
      setInputValue('[data-field="supervisorId"]', ctx.user.officerId || ctx.user.employeeNumber || ctx.user.id);
    }
  }

  function bindPrisonerBanner(prisoner, app) {
    const banner = document.getElementById('f1-selected-prisoner');
    if (!banner || !prisoner) return;
    banner.classList.remove('hidden');
    banner.innerHTML = `
      <div class="selected-prisoner-banner__inner">
        <i class="fi fi-rr-id-badge" aria-hidden="true"></i>
        <div>
          <strong>${esc(prisoner.firstName)} ${esc(prisoner.lastName)}</strong>
          <span class="selected-prisoner-banner__meta">Prisoner ID: ${esc(prisoner.prisonerNumber || prisoner.id)} · Application: ${esc(app?.id || '—')}</span>
        </div>
      </div>`;
  }

  function refreshForm(prisoner, app, form1) {
    if (!prisoner) return;
    const institution = PMSStorage.getInstitutionById(prisoner.institutionId);
    const progress = PMSStorage.getPrisonerProgress(prisoner);
    const settings = PMSStorage.getSettings();

    populateIdentification(prisoner, institution);
    populateSentence(prisoner, progress, settings);
    renderChecklist(form1 || {}, prisoner, progress, settings);
    populateOfficerFields(form1 || {});
    populateSupervisorFields(form1 || {});
    bindPrisonerBanner(prisoner, app);

    document.getElementById('f1-selection-panel')?.classList.add('hidden');
    document.getElementById('f1-form-sections')?.classList.remove('hidden');
  }

  function getSelectablePrisoners(user) {
    return PMSRBAC.filterPrisonersForUser(user, PMSStorage.getPrisoners())
      .filter((p) => {
        const prog = PMSStorage.getPrisonerProgress(p);
        const activeApp = PMSStorage.getParoleApplications().some(
          (a) => a.prisonerId === p.id && !['Approved', 'Refused'].includes(a.status)
        );
        return prog.eligible || p.status === 'Eligible for Parole Application' || activeApp;
      })
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  }

  async function onPrisonerSelected(prisonerId) {
    if (!prisonerId || !ctx) return;
    const prisoner = PMSRBAC.requirePrisonerView(ctx.user, prisonerId);
    if (!prisoner) return;

    const app = PMSStorage.getOrCreateDraftApplication(prisonerId, ctx.user);
    ctx.app = app;
    ctx.prisoner = prisoner;
    ctx.institution = PMSStorage.getInstitutionById(prisoner.institutionId);
    ctx.appId = app.id;

    const params = new URLSearchParams(window.location.search);
    params.set('appId', app.id);
    params.set('prisonerId', prisonerId);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);

    const form1 = app.formData?.form1 || {};
    PMSForms.loadIntoForm('form1', form1, prisoner);
    refreshForm(prisoner, app, form1);
  }

  function showErrors(errors) {
    const box = document.getElementById('f1-validation-errors');
    if (!box) {
      alert(errors.join('\n'));
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = `<strong>Please correct the following:</strong><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearErrors() {
    document.getElementById('f1-validation-errors')?.classList.add('hidden');
  }

  async function saveDraft() {
    clearErrors();
    if (!ctx?.app?.id || !ctx.prisoner) {
      showErrors(['Select a prisoner before saving.']);
      return;
    }
    const form1Data = collectFormData();
    form1Data.status = ctx.app.formData?.form1?.status === 'submitted' ? 'submitted' : 'draft';
    try {
      await PMSStorage.saveForm1Screening(ctx.app.id, form1Data, ctx.user, { draft: true });
      ctx.app = PMSStorage.getApplicationById(ctx.app.id);
      alert('Form 1 draft saved.');
    } catch (err) {
      showErrors([err.message || 'Save failed.']);
    }
  }

  async function submitForm() {
    clearErrors();
    if (!ctx?.app?.id || !ctx.prisoner) {
      showErrors(['Select a prisoner before submitting.']);
      return;
    }
    const form1Data = collectFormData();
    const progress = PMSStorage.getPrisonerProgress(ctx.prisoner);
    const validation = PMSForm1Validation.validateForm1(
      form1Data, ctx.prisoner, progress, PMSStorage.getSettings(), { submit: true }
    );
    if (!validation.valid) {
      showErrors(validation.errors);
      return;
    }

    try {
      await PMSStorage.saveForm1Screening(ctx.app.id, {
        ...form1Data,
        checklist: validation.checklist,
      }, ctx.user, { submit: true });
      ctx.app = PMSStorage.getApplicationById(ctx.app.id);
      readOnly = !PMSRBAC.canAccessForm(ctx.user, 1, 'edit') || ctx.app.formData?.form1?.status === 'submitted';
      PMSForms.setReadOnlyIfViewOnly(ctx, 1);
      populateSupervisorFields(ctx.app.formData?.form1);
      document.getElementById('btn-submit-f1')?.classList.add('hidden');
      alert('Form 1 — Parole Eligibility Screening submitted successfully.');
    } catch (err) {
      showErrors([err.message || 'Submit failed.']);
    }
  }

  async function saveSupervisorReview() {
    if (!ctx?.app?.id) return;
    const review = {
      supervisorName: document.querySelector('[data-field="supervisorName"]')?.value,
      supervisorId: document.querySelector('[data-field="supervisorId"]')?.value,
      reviewComments: document.querySelector('[data-field="supervisorComments"]')?.value,
      decision: document.querySelector('[data-field="supervisorDecision"]')?.value,
      reviewedAt: new Date().toISOString(),
      reviewedBy: ctx.user.id,
    };
    if (!review.decision) {
      showErrors(['Supervisor decision is required.']);
      return;
    }
    const form1 = { ...(ctx.app.formData?.form1 || {}), supervisorReview: review };
    try {
      await PMSStorage.saveForm1Screening(ctx.app.id, form1, ctx.user, { supervisorReview: true });
      ctx.app = PMSStorage.getApplicationById(ctx.app.id);
      alert('Supervisory review saved.');
    } catch (err) {
      showErrors([err.message || 'Review save failed.']);
    }
  }

  function initSelectionPanel(user) {
    const list = getSelectablePrisoners(user);
    PMSPrisonerCombobox.mount({
      prisonerList: list,
      onSelect: (id) => { if (id) onPrisonerSelected(id); },
    });
  }

  async function mount(initialCtx) {
    ctx = initialCtx;
    readOnly = !PMSRBAC.canAccessForm(ctx.user, 1, 'edit')
      || ctx.app?.formData?.form1?.status === 'submitted';

    if (ctx.app && ctx.prisoner) {
      PMSForms.loadIntoForm('form1', ctx.app.formData?.form1, ctx.prisoner);
      refreshForm(ctx.prisoner, ctx.app, ctx.app.formData?.form1);
      if (readOnly) {
        PMSForms.setReadOnlyIfViewOnly(ctx, 1);
        document.getElementById('btn-submit-f1')?.classList.add('hidden');
      }
    } else {
      initSelectionPanel(ctx.user);
    }

    document.getElementById('btn-save-draft')?.addEventListener('click', saveDraft);
    document.getElementById('btn-submit-f1')?.addEventListener('click', submitForm);
    document.getElementById('btn-save-supervisor')?.addEventListener('click', saveSupervisorReview);
    document.getElementById('btn-print')?.addEventListener('click', () => window.print());
    document.getElementById('btn-back')?.addEventListener('click', () => {
      window.location.href = PMSAuth.getDashboardForRole(ctx.user.role);
    });
  }

  return { mount, refreshForm, onPrisonerSelected };
})();
