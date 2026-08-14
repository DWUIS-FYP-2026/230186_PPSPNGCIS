(async () => {

  await PMSStorage.ensureLoaded();

  const actor = PMSAuth.requireRole(['PNGCS Parole Clerk']);

  if (!actor) return;



  const panelTitles = {

    overview: ['Overview', 'PNGCS Parole Clerk — operational summary'],

    prisoners: ['Prisoner Records', 'Register and manage prisoner records (PNGCS data ownership)'],

    eligibility: ['Eligibility Verification', 'Verify parole eligibility per legal requirements'],

    applications: ['Parole Applications', 'Prepare Forms 1–5 and submit to DJAG'],

    forms: ['Forms 1–5', 'Prepare and manage parole application forms'],

    notifications: ['Notifications', 'Eligibility and application alerts'],

    reports: ['Operational Reports', 'Institutional parole statistics'],

    profile: ['Profile', 'Your account information'],

  };



  function scopePrisoners() {

    return PMSRBAC.filterPrisonersForUser(actor, PMSStorage.getPrisoners());

  }



  function scopeApps() {

    let list = PMSStorage.getParoleApplications();

    if (actor.institutionId) list = list.filter((a) => a.institutionId === actor.institutionId);

    return list;

  }

  const FORM_WORKFLOW = [
    { n: 1, key: 'form1', label: 'Form 1 — Parole Eligibility Screening', owner: 'PNGCS Parole Clerk', prereqs: [] },
    { n: 2, key: 'form2', label: 'Form 2 — Personal Particulars', owner: 'PNGCS Parole Clerk', prereqs: [] },
    { n: 3, key: 'form3', label: 'Form 3 — Institutional Report', owner: 'Jail Commander', prereqs: ['form1', 'form2'] },
    { n: 4, key: 'form4', label: 'Form 4 — Pre-Parole Report', owner: 'DJAG Parole Clerk', prereqs: ['form1', 'form2', 'form3'] },
    { n: 5, key: 'form5', label: 'Form 5 — Board Decision', owner: 'Parole Board', prereqs: ['form1', 'form2', 'form3', 'form4'] },
  ];

  let comboboxPrisoners = [];
  let comboboxLocked = false;
  let comboboxOnSelect = null;

  function getSelectablePrisoners(app = null) {
    const ids = new Set();
    const list = [];
    scopePrisoners().forEach((p) => {
      const prog = PMSStorage.getPrisonerProgress(p);
      const hasActiveApp = scopeApps().some((a) => a.prisonerId === p.id && !['Approved', 'Refused'].includes(a.status));
      const eligible = prog.eligible || p.status === 'Eligible for Parole Application' || hasActiveApp;
      if (eligible && !ids.has(p.id)) {
        ids.add(p.id);
        list.push(p);
      }
    });
    if (app?.prisonerId) {
      const p = PMSStorage.getPrisonerById(app.prisonerId);
      if (p && !ids.has(p.id)) list.unshift(p);
    }
    return list.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  }

  function formatPrisonerOption(p) {
    return {
      title: `${p.firstName} ${p.lastName}`,
      meta: `ID: ${p.prisonerNumber} · Status: ${p.status}`,
    };
  }

  function formatPrisonerSelection(p) {
    return `${p.firstName} ${p.lastName} — ${p.prisonerNumber}`;
  }

  function filterComboboxPrisoners(query) {
    const term = query.trim().toLowerCase();
    if (!term) return comboboxPrisoners;
    return comboboxPrisoners.filter((p) =>
      `${p.firstName} ${p.lastName} ${p.prisonerNumber} ${p.id}`.toLowerCase().includes(term));
  }

  function showComboboxList(open) {
    const list = document.getElementById('app-prisoner-listbox');
    const input = document.getElementById('app-prisoner-search');
    if (!list || !input) return;
    list.classList.toggle('hidden', !open);
    input.setAttribute('aria-expanded', String(open));
  }

  function renderComboboxResults(query = '') {
    const list = document.getElementById('app-prisoner-listbox');
    if (!list) return;
    const matches = filterComboboxPrisoners(query);
    if (!matches.length) {
      list.innerHTML = '<li class="prisoner-combobox__empty">No matching prisoners found.</li>';
      return;
    }
    list.innerHTML = matches.map((p) => {
      const opt = formatPrisonerOption(p);
      return `<li class="prisoner-combobox__option" role="option" data-prisoner-id="${PMSUI.esc(p.id)}" tabindex="-1">
        <strong>${PMSUI.esc(opt.title)}</strong>
        <span class="prisoner-combobox__option-meta">${PMSUI.esc(opt.meta)}</span>
      </li>`;
    }).join('');
  }

  function selectComboboxPrisoner(prisonerId) {
    if (comboboxLocked) return;
    const hidden = document.getElementById('app-prisoner');
    const input = document.getElementById('app-prisoner-search');
    const clearBtn = document.getElementById('app-prisoner-clear');
    const p = comboboxPrisoners.find((x) => x.id === prisonerId);
    hidden.value = prisonerId || '';
    input.value = p ? formatPrisonerSelection(p) : '';
    clearBtn?.classList.toggle('hidden', !prisonerId);
    showComboboxList(false);
    comboboxOnSelect?.(prisonerId);
  }

  function initPrisonerCombobox({ prisoners, selectedId, locked, onSelect }) {
    comboboxPrisoners = prisoners;
    comboboxLocked = locked;
    comboboxOnSelect = onSelect;

    const wrap = document.getElementById('app-prisoner-combobox');
    const hidden = document.getElementById('app-prisoner');
    const input = document.getElementById('app-prisoner-search');
    const clearBtn = document.getElementById('app-prisoner-clear');

    wrap?.classList.toggle('prisoner-combobox--locked', locked);
    hidden.value = selectedId || '';
    const selected = prisoners.find((p) => p.id === selectedId);
    input.value = selected ? formatPrisonerSelection(selected) : '';
    input.disabled = locked;
    clearBtn?.classList.toggle('hidden', !selectedId || locked);
    renderComboboxResults('');

    if (!wrap?.dataset.bound) {
      wrap.dataset.bound = 'true';
      input.addEventListener('input', () => {
        if (comboboxLocked) return;
        renderComboboxResults(input.value);
        showComboboxList(true);
      });
      input.addEventListener('focus', () => {
        if (comboboxLocked) return;
        renderComboboxResults(input.value);
        showComboboxList(true);
      });
      clearBtn?.addEventListener('click', () => selectComboboxPrisoner(''));
      document.getElementById('app-prisoner-listbox')?.addEventListener('click', (e) => {
        const opt = e.target.closest('[data-prisoner-id]');
        if (opt) selectComboboxPrisoner(opt.dataset.prisonerId);
      });
      document.addEventListener('click', (e) => {
        if (!wrap?.contains(e.target)) showComboboxList(false);
      });
    }
  }

  function resolveApplicationForPrisoner(prisonerId) {
    const appId = document.getElementById('app-id')?.value;
    if (appId && prisonerId) {
      const byId = PMSStorage.getApplicationById(appId);
      if (byId?.prisonerId === prisonerId) return byId;
    }
    if (!prisonerId) return null;
    return scopeApps().find((a) => a.prisonerId === prisonerId && !['Approved', 'Refused'].includes(a.status)) || null;
  }

  function prereqsMet(checks, prereqs) {
    return prereqs.every((k) => checks[k]);
  }

  function getFormRowState(formDef, checks, activeFormNumber) {
    const done = !!checks[formDef.key];
    const canEdit = PMSRBAC.canAccessForm(actor, formDef.n, 'edit');
    const canView = PMSRBAC.canAccessForm(actor, formDef.n, 'view');
    const prereqsOk = prereqsMet(checks, formDef.prereqs);

    if (done) {
      return { state: 'completed', badge: 'Completed', icon: 'bi-check-circle-fill', clickable: canView || canEdit, reason: 'Completed' };
    }
    if (!prereqsOk) {
      return { state: 'locked', badge: 'Locked', icon: 'bi-lock-fill', clickable: false, reason: 'Complete prior forms first' };
    }
    if (!canEdit && !canView) {
      return { state: 'locked', badge: 'Restricted', icon: 'bi-shield-lock', clickable: false, reason: `Restricted to ${formDef.owner}` };
    }
    if (!canEdit && canView) {
      return { state: 'pending', badge: 'Pending', icon: 'bi-hourglass-split', clickable: true, reason: `Awaiting ${formDef.owner}` };
    }
    if (formDef.n === activeFormNumber) {
      return { state: 'active', badge: 'In Progress', icon: 'bi-pencil-square', clickable: true, reason: 'Continue this form' };
    }
    return { state: 'pending', badge: 'Ready', icon: 'bi-circle', clickable: true, reason: 'Available to complete' };
  }

  function getActiveFormNumber(checks) {
    for (const f of FORM_WORKFLOW) {
      if (checks[f.key]) continue;
      if (!prereqsMet(checks, f.prereqs)) continue;
      if (PMSRBAC.canAccessForm(actor, f.n, 'edit')) return f.n;
    }
    return null;
  }

  function updateAppStatusBanner(app, prisonerId) {
    const banner = document.getElementById('app-status-banner');
    if (!banner) return;
    if (!prisonerId) {
      banner.classList.add('hidden');
      banner.innerHTML = '';
      return;
    }
    const p = PMSStorage.getPrisonerById(prisonerId);
    if (app) {
      banner.classList.remove('hidden');
      banner.innerHTML = `<i class="bi bi-file-earmark-text" aria-hidden="true"></i>
        <span>Application <strong>${PMSUI.esc(app.id)}</strong> · Status: <strong>${PMSUI.esc(app.status)}</strong>${p ? ` · ${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : ''}</span>`;
      return;
    }
    banner.classList.remove('hidden');
    banner.innerHTML = `<i class="bi bi-info-circle" aria-hidden="true"></i>
      <span>No draft application yet for <strong>${PMSUI.esc(p?.firstName || '')} ${PMSUI.esc(p?.lastName || '')}</strong>. Saving or opening a form will create a draft.</span>`;
  }

  function onPrisonerSelected(prisonerId) {
    if (!prisonerId) {
      document.getElementById('app-id').value = '';
      renderFormsPanel(null);
      updateAppStatusBanner(null, '');
      document.getElementById('btn-submit-djag').disabled = true;
      return;
    }
    const existing = resolveApplicationForPrisoner(prisonerId);
    document.getElementById('app-id').value = existing?.id || '';
    renderFormsPanel(existing);
    updateAppStatusBanner(existing, prisonerId);
    const app = existing || { prisonerId, formData: {} };
    document.getElementById('btn-submit-djag').disabled = app?.status && !['Draft', 'Returned for Correction'].includes(app.status);
  }



  async function refresh(panel) {

    await PMSStorage.syncParoleNotifications(actor);

    PMSUI.updateNotifBadge(actor);

    ({ overview: renderOverview, prisoners: renderPrisoners, eligibility: renderEligibility,

       applications: renderApplications, notifications: renderNotifications, reports: renderReports })[panel]?.();

  }



  function renderOverview() {

    const prisoners = scopePrisoners();

    const apps = scopeApps();

    document.getElementById('stat-prisoners').textContent = prisoners.length;

    document.getElementById('stat-eligible').textContent = prisoners.filter((p) => PMSStorage.getPrisonerProgress(p).eligible).length;

    document.getElementById('stat-drafts').textContent = apps.filter((a) => a.status === 'Draft').length;

    document.getElementById('stat-notifications').textContent = PMSStorage.getUnreadCountForUser(actor);

    const notifs = PMSStorage.getNotificationsForUser(actor).slice(0, 5);

    document.getElementById('overview-notifications').innerHTML = notifs.length

      ? notifs.map((n) => `<div class="overview-row"><strong>${PMSUI.esc(n.title)}</strong><span class="meta">${PMSUI.esc(n.message.slice(0, 80))}${n.message.length > 80 ? '…' : ''}</span></div>`).join('')

      : '<p class="empty-state">No notifications.</p>';

  }



  function renderPrisoners() {

    const q = document.getElementById('prisoner-search').value.toLowerCase();

    let list = scopePrisoners().filter((p) => !q || `${p.firstName} ${p.lastName} ${p.prisonerNumber}`.toLowerCase().includes(q));

    document.getElementById('prisoners-tbody').innerHTML = list.map((p) => {

      const prog = PMSStorage.getPrisonerProgress(p);

      return `<tr class="${prog.eligible ? 'row-eligible' : ''}"><td>${PMSUI.esc(p.prisonerNumber)}</td><td>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</td><td>${PMSUI.instName(p.institutionId)}</td><td>${PMSUI.fmtDate(p.sentenceStartDate)}</td><td>${PMSUI.fmtDate(p.sentenceEndDate)}</td><td>${PMSUI.progressBar(p)}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(p.status)}">${PMSUI.esc(p.status)}</span></td><td>

        <a href="${PMSRBAC.prisonerEditUrl(p.id)}" class="btn-icon">Edit</a>

        <a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">View</a>

      </td></tr>`;

    }).join('') || '<tr><td colspan="8" class="empty-state">No records.</td></tr>';

  }



  function renderEligibility() {

    document.getElementById('eligibility-rule').textContent = PMSStorage.getSettings().paroleEligibilityLabel;

    document.getElementById('eligibility-tbody').innerHTML = scopePrisoners().map((p) => {

      const prog = PMSStorage.getPrisonerProgress(p);

      return `<tr class="${prog.eligible ? 'row-eligible' : ''}"><td><a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)} (${PMSUI.esc(p.prisonerNumber)})</a></td><td>${PMSUI.fmtDate(p.sentenceStartDate)}</td><td>${Math.floor(prog.totalMonths / 12)}y ${prog.totalMonths % 12}m</td><td>${prog.percent.toFixed(0)}%</td><td>${PMSUI.fmtDate(prog.eligibilityDate)}${prog.eligible ? ' <span class="eligible-tag">ELIGIBLE</span>' : ''}</td><td>${PMSUI.esc(p.status)}</td><td>${prog.eligible ? `<button type="button" class="btn-icon" data-start-app="${p.id}">Start Application</button>` : '—'}</td></tr>`;

    }).join('');

  }



  function formsSummary(app) {

    const s = PMSStorage.getFormCompletionSummary(app);

    return `${s.completed}/5 forms complete`;

  }



  function renderFormsPanel(app) {

    const area = document.getElementById('forms-upload-area');

    const prisonerId = document.getElementById('app-prisoner')?.value;

    if (!prisonerId) {

      area.innerHTML = `<div class="form-workflow-empty"><i class="bi bi-person-lines-fill"></i> Select a prisoner to view form progress and next actions.</div>`;

      return;

    }

    const checks = app?.id ? PMSStorage.getFormCompletionSummary(app).checks : {};

    const summary = app?.id ? PMSStorage.getFormCompletionSummary(app) : { completed: 0, total: 5 };

    const activeFormNumber = getActiveFormNumber(checks);

    const rows = FORM_WORKFLOW.map((f) => {

      const rowState = getFormRowState(f, checks, activeFormNumber);

      const clickable = rowState.clickable && (app?.id || rowState.state === 'active' || rowState.state === 'pending');

      const rowClass = [

        'form-workflow-row',

        `form-workflow-row--${rowState.state}`,

        clickable ? 'form-workflow-row--clickable' : '',

      ].filter(Boolean).join(' ');

      const attrs = clickable

        ? `data-form-row="${f.n}" data-clickable="true" role="button" tabindex="0" title="${PMSUI.esc(rowState.reason)}"`

        : `title="${PMSUI.esc(rowState.reason)}"`;

      return `<div class="${rowClass}" ${attrs}>

        <div class="form-workflow-row__icon"><i class="bi ${rowState.icon}" aria-hidden="true"></i></div>

        <div class="form-workflow-row__body">

          <strong>${PMSUI.esc(f.label)}</strong>

          <span class="meta">${PMSUI.esc(f.owner)}${rowState.state === 'locked' && !prereqsMet(checks, f.prereqs) ? ' · Requires prior forms' : ''}</span>

        </div>

        <span class="form-workflow-badge form-workflow-badge--${rowState.state}">${PMSUI.esc(rowState.badge)}</span>

        <i class="bi bi-chevron-right form-workflow-row__chevron" aria-hidden="true"></i>

      </div>`;

    }).join('');

    area.innerHTML = `

      <div class="form-workflow-panel">

        <div class="form-workflow-panel__header">

          <h3>Forms 1–5 Workflow</h3>

          <span class="form-workflow-panel__summary">${summary.completed}/${summary.total} complete</span>

        </div>

        <p class="field-hint" style="margin-bottom:0.75rem">Complete Forms 1 and 2 (PNGCS). Form 3 is completed by the Jail Commander before DJAG submission.</p>

        <div class="form-workflow-list">${rows}</div>

      </div>`;

  }



  function renderApplications() {

    document.getElementById('applications-tbody').innerHTML = scopeApps().map((a) => {

      const p = PMSStorage.getPrisonerById(a.prisonerId);

      return `<tr><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : '—'}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${formsSummary(a)}</td><td>${PMSUI.fmtDate(a.submittedAt)}</td><td><button type="button" class="btn-icon" data-edit-app="${a.id}">Manage</button></td></tr>`;

    }).join('') || '<tr><td colspan="5" class="empty-state">No applications.</td></tr>';

  }



  function renderNotifications() {
    PMSUI.renderNotificationPanel('notification-list', actor);
  }



  function renderReports() {
    if (typeof PMSReports !== 'undefined') {
      PMSReports.mount('reports-body', 'reports-filter-bar', actor);
    }
  }



  function openAppModal(app = null, prisonerId = null) {

    document.getElementById('app-id').value = app?.id || '';

    const prisoners = getSelectablePrisoners(app);

    const selectedId = prisonerId || app?.prisonerId || '';

    initPrisonerCombobox({

      prisoners,

      selectedId,

      locked: !!app,

      onSelect: onPrisonerSelected,

    });

    const initialApp = app || resolveApplicationForPrisoner(selectedId);

    if (initialApp?.id) document.getElementById('app-id').value = initialApp.id;

    renderFormsPanel(initialApp);

    updateAppStatusBanner(initialApp, selectedId);

    document.getElementById('btn-submit-djag').disabled = initialApp?.status && !['Draft', 'Returned for Correction'].includes(initialApp.status);

    document.getElementById('app-modal').showModal();

  }



  function ensureAppId() {

    let appId = document.getElementById('app-id').value;

    const pid = document.getElementById('app-prisoner').value;

    if (!appId && pid) {

      const p = PMSStorage.getPrisonerById(pid);

      const app = PMSStorage.saveParoleApplication({ prisonerId: pid, institutionId: p.institutionId, status: 'Draft' }, actor);

      appId = app.id;

      document.getElementById('app-id').value = appId;

    }

    return appId;

  }



  PMSSidebar.init({

    user: actor,

    activePanel: 'overview',

    onNavigate: (panel, meta) => PMSUI.switchPanel(panel, panelTitles, refresh, meta?.navId),

  });

  PMSUI.initShell(actor);

  PMSUI.bindModalClose();
  PMSUI.bindNotificationPanel('notification-list', actor, () => refresh('notifications'));



  document.getElementById('btn-add-prisoner').addEventListener('click', () => {

    window.location.href = PMSRBAC.prisonerEditUrl();

  });

  document.getElementById('btn-new-app').addEventListener('click', () => openAppModal());

  document.getElementById('prisoner-search').addEventListener('input', () => renderPrisoners());

  document.getElementById('btn-save-draft').addEventListener('click', async () => {

    const pid = document.getElementById('app-prisoner').value;

    if (!pid) { alert('Please select a prisoner.'); return; }

    const p = PMSStorage.getPrisonerById(pid);

    const saved = await PMSStorage.saveParoleApplication({ id: document.getElementById('app-id').value || undefined, prisonerId: pid, institutionId: p.institutionId, status: 'Draft' }, actor);

    document.getElementById('app-id').value = saved.id;

    renderFormsPanel(saved);

    updateAppStatusBanner(saved, pid);

    document.getElementById('app-modal').close();

    refresh('applications');

  });



  document.getElementById('app-form').addEventListener('submit', async (e) => {

    e.preventDefault();

    try {

      const appId = ensureAppId();

      await PMSStorage.submitApplicationToDJAG(appId, actor);

      document.getElementById('app-modal').close();

      refresh('applications');

      alert('Application submitted to DJAG successfully.');

    } catch (err) { alert(err.message); }

  });



  document.addEventListener('click', (e) => {

    if (e.target.closest('[data-start-app]')) openAppModal(null, e.target.closest('[data-start-app]').dataset.startApp);

    if (e.target.closest('[data-edit-app]')) openAppModal(PMSStorage.getApplicationById(e.target.closest('[data-edit-app]').dataset.editApp));

    const formRow = e.target.closest('[data-form-row][data-clickable="true"]');

    if (formRow) {

      const pid = document.getElementById('app-prisoner').value;

      if (!pid) { alert('Please select a prisoner first.'); return; }

      const appId = ensureAppId();

      renderFormsPanel(PMSStorage.getApplicationById(appId));

      updateAppStatusBanner(PMSStorage.getApplicationById(appId), pid);

      PMSForms.openForm(parseInt(formRow.dataset.formRow, 10), appId);

    }

    if (e.target.closest('[data-open-form]')) {

      const appId = ensureAppId();

      PMSForms.openForm(parseInt(e.target.closest('[data-open-form]').dataset.openForm, 10), appId);

    }

    if (e.target.closest('[data-read]')) return;

  });

  document.addEventListener('keydown', (e) => {

    const row = e.target.closest('[data-form-row][data-clickable="true"]');

    if (row && (e.key === 'Enter' || e.key === ' ')) {

      e.preventDefault();

      row.click();

    }

  });



  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) refresh('overview');

})();

