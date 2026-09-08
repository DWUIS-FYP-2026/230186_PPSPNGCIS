(async () => {

  await PMSStorage.ensureLoaded();

  const actor = PMSAuth.requireRole(['CS Parole Clerk']);

  if (!actor) return;



  if (!PMSRBAC.canModifyPrisoner(actor)) {

    PMSAuth.redirectAccessDenied('Only CS Parole Clerks may create or modify prisoner records.');

    return;

  }



  const params = new URLSearchParams(window.location.search);

  const prisonerId = params.get('id');

  let prisoner = null;



  if (prisonerId) {

    prisoner = PMSRBAC.requirePrisonerModify(actor, prisonerId);

    if (!prisoner) return;

  } else {

    PMSRBAC.requirePrisonerModify(actor);

  }



  let prisonerDocsExisting = prisoner?.documents ? [...prisoner.documents] : [];

  let pendingDocs = [];



  const dashUrl = PMSAuth.getDashboardForRole(actor.role);



  function populateInstitutions() {

    const sel = document.getElementById('prisoner-institution');

    sel.innerHTML = PMSStorage.getInstitutions().map((i) =>

      `<option value="${i.id}">${PMSUI.esc(i.name)}</option>`

    ).join('');

  }



  function buildStatusNote(derived, prog, settings) {
    const thresholdPct = (settings.paroleEligibilityFraction * 100).toFixed(1);
    const servedPct = prog.percent.toFixed(0);
    const rule = settings.paroleEligibilityLabel.toLowerCase();

    if (derived === 'Awaiting Eligibility') {
      return `The computed status is currently <strong>Awaiting Eligibility</strong>, as the percentage served (${servedPct}%) has not yet reached the required ${rule} minimum eligibility threshold (~${thresholdPct}%).`;
    }
    if (derived === 'Eligible for Parole Application') {
      return `The computed status is <strong>Eligible for Parole Application</strong>. The prisoner has served ${servedPct}% of the sentence and meets the ${rule} threshold (~${thresholdPct}%).`;
    }
    if (derived === 'Sentence Completed') {
      return `The computed status is <strong>Sentence Completed</strong> because the sentence end date has passed.`;
    }
    if (derived === 'Released') {
      return `The computed status is <strong>Released</strong> based on parole approval and release workflow.`;
    }
    return `The computed status is <strong>${PMSUI.esc(derived)}</strong>, determined from sentence progress (${servedPct}% served) and any active parole application workflow.`;
  }

  function calloutVariant(derived, prog, settings) {
    if (derived === 'Eligible for Parole Application' || prog.eligible) return 'success';
    if (derived === 'Awaiting Eligibility') return 'info';
    if (['Assessment in Progress', 'Hearing Scheduled'].includes(derived)) return 'warning';
    return 'info';
  }

  function calloutIcon(variant) {
    return ({ success: 'fi fi-rr-check-circle', warning: 'fi fi-rr-triangle-warning', info: 'fi fi-rr-info' })[variant] || 'fi fi-rr-info';
  }

  function renderSentenceMetrics(data) {
    const el = document.getElementById('prisoner-calc-fields');
    if (!el) return;

    if (data.empty) {
      el.innerHTML = `
        <div class="sentence-metrics__empty">
          <i class="fi fi-rr-calculator" aria-hidden="true"></i>
          <p>${PMSUI.esc(data.message || 'Enter SSD and SED to calculate duration and eligibility metrics.')}</p>
        </div>`;
      return;
    }

    if (data.error) {
      el.innerHTML = `
        <div class="sentence-metrics__callout sentence-metrics__callout--danger">
          <i class="fi fi-rr-exclamation" aria-hidden="true"></i>
          <p>${PMSUI.esc(data.error)}</p>
        </div>`;
      return;
    }

    const { durationLabel, eligibilityDate, servedPct, rule, derived, prog, settings } = data;
    const thresholdPct = settings.paroleEligibilityFraction * 100;
    const variant = calloutVariant(derived, prog, settings);
    const fillWidth = Math.min(100, Math.max(0, prog.percent));
    const thresholdLeft = Math.min(100, Math.max(0, thresholdPct));

    el.innerHTML = `
      <div class="sentence-metrics__panel">
        <div class="sentence-metrics__grid">
          <div class="sentence-metrics__item">
            <span class="sentence-metrics__key">Total Sentence Duration</span>
            <strong class="sentence-metrics__value">${PMSUI.esc(durationLabel)}</strong>
          </div>
          <div class="sentence-metrics__item">
            <span class="sentence-metrics__key">Parole Eligibility Date</span>
            <strong class="sentence-metrics__value">${PMSUI.esc(eligibilityDate)}</strong>
          </div>
          <div class="sentence-metrics__item">
            <span class="sentence-metrics__key">Percentage Served</span>
            <strong class="sentence-metrics__value">${servedPct}%</strong>
          </div>
          <div class="sentence-metrics__item">
            <span class="sentence-metrics__key">Calculation Rule</span>
            <strong class="sentence-metrics__value sentence-metrics__value--rule">${PMSUI.esc(rule)}</strong>
          </div>
        </div>
        <div class="sentence-metrics__progress">
          <div class="sentence-metrics__progress-header">
            <span class="sentence-metrics__progress-label">Sentence progress</span>
            <strong class="sentence-metrics__progress-pct">${servedPct}% served</strong>
          </div>
          <div class="sentence-metrics__track" role="progressbar" aria-valuenow="${servedPct}" aria-valuemin="0" aria-valuemax="100" aria-label="Percentage of sentence served">
            <div class="sentence-metrics__fill${prog.eligible ? ' sentence-metrics__fill--eligible' : ''}" style="width:${fillWidth.toFixed(1)}%"></div>
            <div class="sentence-metrics__threshold" style="left:${thresholdLeft.toFixed(1)}%" title="Eligibility threshold (~${thresholdPct.toFixed(1)}%)">
              <span class="sentence-metrics__threshold-label">${thresholdPct.toFixed(0)}%</span>
            </div>
          </div>
          <div class="sentence-metrics__progress-meta">
            <span>Start</span>
            <span>Eligibility threshold</span>
            <span>End</span>
          </div>
        </div>
        <div class="sentence-metrics__callout sentence-metrics__callout--${variant}">
          <i class="${calloutIcon(variant)}" aria-hidden="true"></i>
          <p>${buildStatusNote(derived, prog, settings)}</p>
        </div>
      </div>`;
  }

  function updateCalcFields() {
    const ssd = document.getElementById('prisoner-ssd').value;
    const sed = document.getElementById('prisoner-sed').value;
    const statusEl = document.getElementById('prisoner-status-display');

    if (!ssd || !sed) {
      renderSentenceMetrics({ empty: true });
      statusEl.value = prisoner?.status || 'Awaiting Eligibility';
      return;
    }

    const validation = PMSEligibility.validateSentenceDates(ssd, sed);
    if (!validation.valid) {
      renderSentenceMetrics({ error: validation.error });
      statusEl.value = prisoner?.status || 'Awaiting Eligibility';
      return;
    }

    const mock = { sentenceStartDate: ssd, sentenceEndDate: sed, status: prisoner?.status || 'Awaiting Eligibility', id: prisoner?.id || 'preview' };
    const prog = PMSStorage.getPrisonerProgress(mock);
    const settings = PMSStorage.getSettings();
    const derived = PMSEligibility.derivePrisonerStatus(mock, { applications: PMSStorage.getParoleApplications() });
    const months = PMSStorage.getSentenceDurationMonths(mock);

    renderSentenceMetrics({
      durationLabel: `${Math.floor(months / 12)}y ${months % 12}m`,
      eligibilityDate: PMSUI.fmtDate(prog.eligibilityDate),
      servedPct: prog.percent.toFixed(0),
      rule: settings.paroleEligibilityLabel,
      derived,
      prog,
      settings,
    });

    statusEl.value = derived;
  }



  function renderDocList() {

    const list = document.getElementById('prisoner-doc-list');

    const all = [...prisonerDocsExisting, ...pendingDocs.map((d) => ({ ...d, pending: true }))];

    list.innerHTML = all.length ? all.map((d) =>

      `<li>${PMSUI.esc(d.name)}${d.pending ? ' <span class="meta">(pending upload)</span>' : ''} <button type="button" class="btn-link btn-sm" data-remove-doc="${d.id}">Remove</button></li>`

    ).join('') : '<li class="meta">No documents attached.</li>';

  }



  function loadForm(p) {

    document.getElementById('edit-title').textContent = p ? 'Edit Prisoner Record' : 'Register New Prisoner';

    document.getElementById('edit-subtitle').textContent = p

      ? `Updating record ${p.prisonerNumber}. Status and eligibility are recalculated on save.`

      : 'Complete all required fields. Prisoner ID and status are assigned automatically.';

    document.getElementById('prisoner-id').value = p?.id || '';

    document.getElementById('prisoner-number').value = p?.prisonerNumber || '';

    document.getElementById('prisoner-number').placeholder = p ? '' : 'Automatically Generated';

    document.getElementById('prisoner-institution').value = p?.institutionId || actor.institutionId || '';

    document.getElementById('prisoner-first-name').value = p?.firstName || '';

    document.getElementById('prisoner-last-name').value = p?.lastName || '';

    document.getElementById('prisoner-dob').value = p?.dateOfBirth || '';

    document.getElementById('prisoner-gender').value = p?.gender || '';

    document.getElementById('prisoner-offense').value = p?.offense || '';

    document.getElementById('prisoner-ssd').value = p?.sentenceStartDate || '';

    document.getElementById('prisoner-sed').value = p?.sentenceEndDate || '';

    document.getElementById('btn-delete-prisoner').classList.toggle('hidden', !p);

    prisonerDocsExisting = p?.documents ? [...p.documents] : [];

    pendingDocs = [];

    updateCalcFields();

    renderDocList();

  }



  populateInstitutions();

  loadForm(prisoner);



  document.getElementById('btn-cancel').href = prisoner

    ? PMSRBAC.prisonerProfileUrl(prisoner.id)

    : `${dashUrl}?panel=prisoners`;



  document.getElementById('prisoner-ssd').addEventListener('change', updateCalcFields);

  document.getElementById('prisoner-sed').addEventListener('change', updateCalcFields);

  document.getElementById('prisoner-ssd').addEventListener('input', updateCalcFields);

  document.getElementById('prisoner-sed').addEventListener('input', updateCalcFields);



  document.getElementById('prisoner-doc-upload').addEventListener('change', async (e) => {

    for (const file of e.target.files) {

      const dataUrl = await new Promise((res, rej) => {

        const r = new FileReader();

        r.onload = () => res(r.result);

        r.onerror = rej;

        r.readAsDataURL(file);

      });

      pendingDocs.push({

        id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,

        name: file.name,

        type: file.type,

        size: file.size,

        dataUrl,

      });

    }

    e.target.value = '';

    renderDocList();

  });



  document.getElementById('prisoner-doc-list').addEventListener('click', (e) => {

    const btn = e.target.closest('[data-remove-doc]');

    if (!btn) return;

    const docId = btn.dataset.removeDoc;

    pendingDocs = pendingDocs.filter((d) => d.id !== docId);

    if (prisoner?.id) {

      try {

        PMSStorage.removePrisonerDocument(prisoner.id, docId, actor);

        prisonerDocsExisting = prisonerDocsExisting.filter((d) => d.id !== docId);

      } catch (err) {

        PMSAuth.showPermissionError(err);

      }

    } else {

      prisonerDocsExisting = prisonerDocsExisting.filter((d) => d.id !== docId);

    }

    renderDocList();

  });



  document.getElementById('btn-delete-prisoner').addEventListener('click', () => {

    if (!prisoner || !confirm('Delete this prisoner record? This action requires approval and is permanently audit-logged.')) return;

    try {

      PMSStorage.deletePrisoner(prisoner.id, actor);

      window.location.href = `${dashUrl}?panel=prisoners`;

    } catch (err) {

      PMSAuth.showPermissionError(err);

    }

  });



  document.getElementById('prisoner-edit-form').addEventListener('submit', async (e) => {

    e.preventDefault();

    const ssd = document.getElementById('prisoner-ssd').value;

    const sed = document.getElementById('prisoner-sed').value;

    const validation = PMSEligibility.validateSentenceDates(ssd, sed);

    if (!validation.valid) {

      alert(validation.error);

      return;

    }

    const submitBtn = e.target.querySelector('[type="submit"]');

    const originalLabel = submitBtn?.textContent;

    if (submitBtn) {

      submitBtn.disabled = true;

      submitBtn.textContent = 'Saving…';

    }

    try {

      const id = document.getElementById('prisoner-id').value;

      const payload = {

        id: id || undefined,

        institutionId: document.getElementById('prisoner-institution').value,

        firstName: document.getElementById('prisoner-first-name').value.trim(),

        lastName: document.getElementById('prisoner-last-name').value.trim(),

        dateOfBirth: document.getElementById('prisoner-dob').value || null,

        gender: document.getElementById('prisoner-gender').value || null,

        offense: document.getElementById('prisoner-offense').value.trim(),

        sentenceStartDate: ssd,

        sentenceEndDate: sed,

        documents: prisonerDocsExisting,

      };

      const saved = PMSStorage.savePrisoner(payload, actor);



      for (const doc of pendingDocs) {

        PMSStorage.addPrisonerDocument(saved.id, doc, actor);

      }

      await PMSStorage.flushSyncToDatabase();

      await PMSStorage.reloadAll();

      PMSUI.showToast(id

        ? `Prisoner ${saved.prisonerNumber} updated successfully.`

        : `Prisoner ${saved.prisonerNumber} registered successfully.`);

      setTimeout(() => {

        window.location.href = PMSRBAC.prisonerProfileUrl(saved.id);

      }, 600);

    } catch (err) {

      PMSUI.showToast(err.message || 'Failed to save prisoner record.', 'error', 6000);

      console.error(err);

    } finally {

      if (submitBtn) {

        submitBtn.disabled = false;

        submitBtn.textContent = originalLabel;

      }

    }

  });



  PMSSidebar.init({

    user: actor,

    activePanel: 'prisoners',

    onNavigate: (panel) => {

      window.location.href = `${dashUrl}?panel=${panel}`;

    },

  });

  PMSUI.initShell(actor);

})();

