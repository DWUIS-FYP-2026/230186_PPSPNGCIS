(async () => {

  await PMSStorage.ensureLoaded();

  const actor = PMSAuth.requireDashboardRole('dashboard-pngcs.html');

  if (!actor) return;



  const panelTitles = {

    overview: ['Overview', 'CS Parole Clerk — operational summary'],

    prisoners: ['Prisoner Records', 'Register and manage prisoner records (PNGCS data ownership)'],

    eligibility: ['Eligibility Verification', 'Verify parole eligibility per legal requirements'],

    applications: ['Parole Applications', 'Prepare Forms 1–3 and submit to DJAG'],

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
    { n: 1, key: 'form1', label: 'Form 1 — Parole Eligibility Screening', owner: 'CS Parole Officer', prereqs: [] },
    { n: 2, key: 'form2', label: 'Form 2 — Personal Particulars', owner: 'CS Parole Clerk', prereqs: ['form1'] },
    { n: 3, key: 'form3', label: 'Form 3 — Parole Hearing Record', owner: 'CS Parole Clerk', prereqs: ['form1', 'form2'] },
    { n: 4, key: 'form4', label: 'Form 4 — Discharge of Parole Order', owner: 'DJAG Secretary', prereqs: ['form1', 'form2', 'form3'], outcome: 'Parole Granted' },
    { n: 5, key: 'form5', label: 'Form 5 — Applications After Refusal', owner: 'DJAG Secretary', prereqs: ['form1', 'form2', 'form3'], outcome: 'Parole Refused' },
  ];

  function getFormWorkflowForApp(app) {
    const base = FORM_WORKFLOW.filter((f) => f.n <= 3);
    if (!app) return FORM_WORKFLOW;
    const outcome = PMSStorage.getBoardDecisionOutcome?.(app);
    if (outcome === 'Parole Granted') return [...base, FORM_WORKFLOW.find((f) => f.n === 4)];
    if (outcome === 'Parole Refused') return [...base, FORM_WORKFLOW.find((f) => f.n === 5)];
    return base;
  }

  let comboboxPrisoners = [];
  let comboboxLocked = false;
  let comboboxOnSelect = null;

  function getSelectablePrisoners(app = null) {
    const ids = new Set();
    const list = [];
    scopePrisoners().forEach((p) => {
      const eligible = PMSStorage.isEligibleParoleApplicant(p, scopeApps());
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

  function getFormRowState(formDef, checks, activeFormNumber, app = null) {
    const done = !!checks[formDef.key];
    const canEdit = PMSRBAC.canAccessForm(actor, formDef.n, 'edit');
    const canView = PMSRBAC.canAccessForm(actor, formDef.n, 'view');
    const prereqsOk = prereqsMet(checks, formDef.prereqs);
    const hasData = app?.id && typeof PMSFormWorkflow !== 'undefined'
      && PMSFormWorkflow.hasFormData(formDef.n, app.id);

    if (done) {
      return { state: 'completed', badge: 'Completed', icon: 'fi fi-rr-check-circle', clickable: canView || canEdit, reason: 'View completed form' };
    }
    if (!prereqsOk && hasData) {
      return {
        state: 'review',
        badge: 'Review',
        icon: 'fi fi-rr-eye',
        clickable: canView || canEdit,
        reason: 'View saved form data (complete prior forms to edit)',
      };
    }
    if (!prereqsOk) {
      return { state: 'locked', badge: 'Locked', icon: 'fi fi-rr-lock', clickable: false, reason: 'Complete prior forms first' };
    }
    if (!canEdit && !canView) {
      return { state: 'locked', badge: 'Restricted', icon: 'fi fi-rr-shield', clickable: false, reason: `Restricted to ${formDef.owner}` };
    }
    if (!canEdit && canView) {
      return { state: 'pending', badge: 'Pending', icon: 'fi fi-rr-hourglass', clickable: true, reason: `Awaiting ${formDef.owner}` };
    }
    if (formDef.n === activeFormNumber) {
      return { state: 'active', badge: 'In Progress', icon: 'fi fi-rr-edit', clickable: true, reason: 'Continue this form' };
    }
    return { state: 'pending', badge: 'Ready', icon: 'fi fi-rr-circle', clickable: true, reason: 'Available to complete' };
  }

  function getActiveFormNumber(checks, app) {
    const workflow = getFormWorkflowForApp(app);
    for (const f of workflow) {
      if (checks[f.key]) continue;
      if (!prereqsMet(checks, f.prereqs)) continue;
      if (PMSRBAC.canAccessForm(actor, f.n, 'edit')) return f.n;
    }
    return null;
  }

  function findApplicationForPrisoner(prisonerId) {
    if (!prisonerId) return null;
    return scopeApps().find((a) => a.prisonerId === prisonerId && !['Approved', 'Refused'].includes(a.status)) || null;
  }

  function resolveWorkflowFormForPrisoner(prisonerId) {
    const app = findApplicationForPrisoner(prisonerId);
    if (!app) return { formN: 1, appId: null, label: 'Form 1 — start application' };

    const target = PMSStorage.resolveApplicationEditTarget(app, actor);
    if (target?.formN) {
      const def = getFormWorkflowForApp(app).find((f) => f.n === target.formN);
      return {
        formN: target.formN,
        appId: app.id,
        label: target.label || def?.label || `Form ${target.formN}`,
      };
    }
    if (target?.label) {
      return { formN: null, appId: app.id, label: target.label };
    }

    const checks = PMSStorage.getFormCompletionSummary(app).checks;
    const activeFormNumber = getActiveFormNumber(checks, app);
    if (activeFormNumber) {
      const def = getFormWorkflowForApp(app).find((f) => f.n === activeFormNumber);
      return { formN: activeFormNumber, appId: app.id, label: def?.label || `Form ${activeFormNumber}` };
    }

    const workflow = getFormWorkflowForApp(app);
    for (const f of workflow) {
      if (checks[f.key]) continue;
      if (!prereqsMet(checks, f.prereqs)) continue;
      const canView = PMSRBAC.canAccessForm(actor, f.n, 'view');
      const canEdit = PMSRBAC.canAccessForm(actor, f.n, 'edit');
      if (canView || canEdit) return { formN: f.n, appId: app.id, label: f.label };
    }

    for (const f of workflow) {
      if (!checks[f.key]) return { formN: f.n, appId: app.id, label: f.label };
    }

    const last = workflow[workflow.length - 1];
    return { formN: last.n, appId: app.id, label: last.label };
  }

  function openPrisonerWorkflowForm(prisonerId) {
    const app = findApplicationForPrisoner(prisonerId);
    if (!app) {
      openNewApplication(prisonerId);
      return;
    }
    PMSUI.navigateToApplicationEdit(app.id, actor);
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
      banner.innerHTML = `<i class="fi fi-rr-document" aria-hidden="true"></i>
        <span>Application <strong>${PMSUI.esc(app.id)}</strong> · Status: <strong>${PMSUI.esc(app.status)}</strong>${p ? ` · ${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}` : ''}</span>`;
      return;
    }
    banner.classList.remove('hidden');
    banner.innerHTML = `<i class="fi fi-rr-info" aria-hidden="true"></i>
      <span>No draft application yet for <strong>${PMSUI.esc(p?.firstName || '')} ${PMSUI.esc(p?.lastName || '')}</strong>. Saving or opening a form will create a draft.</span>`;
  }

  function updateForm1Actions(prisonerId, app) {
    const canStart = !!prisonerId;
    const form1Done = app?.id ? PMSStorage.getFormCompletionSummary(app).checks.form1 : false;
    document.getElementById('form1-start-panel')?.classList.toggle('hidden', !canStart || form1Done);
    const startBtn = document.getElementById('btn-start-form1');
    const startFooterBtn = document.getElementById('btn-start-form1-footer');
    if (startBtn) startBtn.disabled = !canStart;
    if (startFooterBtn) {
      startFooterBtn.disabled = !canStart;
      startFooterBtn.querySelector('span').textContent = form1Done ? 'View Form 1' : 'Open Form 1';
    }
  }

  function openNewApplication(prisonerId = null) {
    const url = prisonerId
      ? `forms/form1.html?prisonerId=${encodeURIComponent(prisonerId)}`
      : 'forms/form1.html';
    window.location.href = url;
  }

  function startForm1() {
    const pid = document.getElementById('app-prisoner').value;
    if (!pid) {
      PMSUI.showError('Please select a detainee first.');
      return;
    }
    const appId = ensureAppId();
    document.getElementById('app-modal').close();
    PMSForms.openForm(1, appId);
  }

  function onPrisonerSelected(prisonerId) {
    if (!prisonerId) {
      document.getElementById('app-id').value = '';
      renderFormsPanel(null);
      updateAppStatusBanner(null, '');
      updateForm1Actions('', null);
      document.getElementById('btn-submit-djag').disabled = true;
      return;
    }
    const existing = resolveApplicationForPrisoner(prisonerId);
    document.getElementById('app-id').value = existing?.id || '';
    renderFormsPanel(existing);
    updateAppStatusBanner(existing, prisonerId);
    updateForm1Actions(prisonerId, existing);
    const app = existing || { prisonerId, formData: {} };
    const summary = app?.id ? PMSStorage.getFormCompletionSummary(app) : { checks: {} };
    document.getElementById('btn-submit-djag').disabled = !app?.id
      || !summary.checks.form1
      || !summary.checks.form2
      || (app?.status && !['Draft', 'Returned for Correction'].includes(app.status));
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
    const eligible = PMSStorage.countEligibleParoleApplicants(actor.institutionId);
    const form1Pending = apps.filter((a) => PMSStorage.isActiveParoleApplication(a) && !PMSStorage.isForm1Complete(a.formData?.form1)).length;
    const activeCases = apps.filter((a) => PMSStorage.isActiveParoleApplication(a)).length;
    const unread = PMSStorage.getUnreadCountForUser(actor);

    PMSUI.setStat('stat-prisoners', prisoners.length);
    PMSUI.setStat('stat-eligible', eligible);
    PMSUI.setStat('stat-drafts', form1Pending);
    PMSUI.setStat('stat-notifications', unread);

    PMSUI.syncOverviewNotifHeader(unread);
    const notifs = PMSUI.recentNotifications(actor, 5);
    document.getElementById('overview-notifications').innerHTML = `
      <div class="overview-row"><strong>Form 1 completed</strong><span class="meta">${PMSUI.formatStat(apps.filter((a) => PMSStorage.isForm1Complete(a.formData?.form1)).length)} cases</span></div>
      <div class="overview-row"><strong>Active cases</strong><span class="meta">${PMSUI.formatStat(activeCases)}</span></div>
      <div class="overview-row"><strong>Requiring action</strong><span class="meta">${PMSUI.formatStat(apps.filter((a) => ['Draft', 'Returned for Correction', 'Pending Commander Review'].includes(a.status)).length)}</span></div>
      ${notifs.length ? notifs.map((n) => PMSUI.renderOverviewNotificationRow(n, actor)).join('') : ''}`;

    if (typeof PMSCalendar !== 'undefined') PMSCalendar.mount('dashboard-calendar', actor);

  }

  function setupStatCards() {
    const cols = ['ID', 'Name', 'Institution', 'Status', ''];
    PMSUI.bindStatCards([
      {
        statId: 'stat-eligible',
        title: 'Eligible for Parole',
        columns: ['ID', 'Name', 'Institution', 'Eligibility', ''],
        getRows: () => PMSStorage.getEligibleParoleApplicants(actor.institutionId)
          .map((p) => PMSUI.prisonerDrilldownRow(p, `<td>${PMSUI.fmtDate(PMSStorage.getPrisonerProgress(p).eligibilityDate)}</td>`)),
      },
      {
        statId: 'stat-prisoners',
        title: 'Prisoner Records',
        columns: ['ID', 'Name', 'Institution', 'Status', ''],
        getRows: () => scopePrisoners().map((p) => PMSUI.prisonerDrilldownRow(p, `<td><span class="status-pill status-pill--${PMSUI.statusClass(p.status)}">${PMSUI.esc(p.status)}</span></td>`)),
      },
      {
        statId: 'stat-drafts',
        title: 'Form 1 Pending',
        columns: cols,
        getRows: () => scopeApps()
          .filter((a) => PMSStorage.isActiveParoleApplication(a) && !PMSStorage.isForm1Complete(a.formData?.form1))
          .map((a) => PMSUI.appDrilldownRow(a)),
      },
    ], {
      notificationsStatId: 'stat-notifications',
      onNotificationsClick: () => PMSUI.switchPanel('notifications', panelTitles, refresh, 'notifications'),
    });
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

    document.getElementById('eligibility-tbody').innerHTML = PMSStorage.getEligibleParoleApplicants(actor.institutionId).map((p) => {

      const prog = PMSStorage.getPrisonerProgress(p);
      const app = findApplicationForPrisoner(p.id);
      const workflow = resolveWorkflowFormForPrisoner(p.id);
      const canOpenForm = prog.eligible || !!app;
      const nameCell = canOpenForm
        ? `<a href="#" class="eligibility-prisoner-link" data-open-prisoner-form="${PMSUI.esc(p.id)}" title="Open ${PMSUI.esc(workflow.label)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)} (${PMSUI.esc(p.prisonerNumber)})</a>`
        : `${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)} (${PMSUI.esc(p.prisonerNumber)})`;
      const formStatus = app
        ? `<span class="meta">${PMSUI.esc(workflow.label)}</span>`
        : (prog.eligible ? '<span class="meta">No application yet</span>' : '—');
      const startAction = prog.eligible && !app
        ? `<button type="button" class="btn-icon" data-start-app="${PMSUI.esc(p.id)}">Start Application</button>`
        : (app ? `<button type="button" class="btn-icon" data-open-prisoner-form="${PMSUI.esc(p.id)}">Review Forms</button>` : '—');

      const rowAttrs = app
        ? `class="eligibility-row--clickable ${prog.eligible ? 'row-eligible' : ''}" data-open-prisoner-form="${PMSUI.esc(p.id)}" title="Open ${PMSUI.esc(workflow.label)}" tabindex="0" role="button"`
        : `class="${prog.eligible ? 'row-eligible' : ''}"`;
      return `<tr ${rowAttrs}><td>${nameCell}</td><td>${PMSUI.fmtDate(p.sentenceStartDate)}</td><td>${Math.floor(prog.totalMonths / 12)}y ${prog.totalMonths % 12}m</td><td>${prog.percent.toFixed(0)}%</td><td>${PMSUI.fmtDate(prog.eligibilityDate)}${prog.eligible ? ' <span class="eligible-tag">ELIGIBLE</span>' : ''}</td><td>${PMSUI.esc(p.status)}</td><td>${formStatus}</td><td>${startAction}</td></tr>`;

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

      area.innerHTML = `<div class="form-workflow-empty"><i class="fi fi-rr-address-card"></i> Select a prisoner to view form progress and next actions.</div>`;

      return;

    }

    const checks = app?.id ? PMSStorage.getFormCompletionSummary(app).checks : {};

    const summary = app?.id ? PMSStorage.getFormCompletionSummary(app) : { completed: 0, total: 5 };

    const activeFormNumber = getActiveFormNumber(checks, app);

    const rows = getFormWorkflowForApp(app).map((f) => {

      const rowState = getFormRowState(f, checks, activeFormNumber, app);

      const clickable = rowState.clickable && (app?.id || rowState.state === 'active' || rowState.state === 'pending' || rowState.state === 'review' || rowState.state === 'completed');

      const rowClass = [

        'form-workflow-row',

        `form-workflow-row--${rowState.state}`,

        clickable ? 'form-workflow-row--clickable' : '',

      ].filter(Boolean).join(' ');

      const attrs = clickable

        ? `data-form-row="${f.n}" data-clickable="true" role="button" tabindex="0" title="${PMSUI.esc(rowState.reason)}"`

        : `title="${PMSUI.esc(rowState.reason)}"`;

      return `<div class="${rowClass}" ${attrs}>

        <div class="form-workflow-row__icon"><i class="${rowState.icon}" aria-hidden="true"></i></div>

        <div class="form-workflow-row__body">

          <strong>${PMSUI.esc(f.label)}</strong>

          <span class="meta">${PMSUI.esc(f.owner)}${rowState.state === 'locked' && !prereqsMet(checks, f.prereqs) ? ' · Requires prior forms' : ''}</span>

        </div>

        <span class="form-workflow-badge form-workflow-badge--${rowState.state}">${PMSUI.esc(rowState.badge)}</span>

        <i class="fi fi-rr-angle-right form-workflow-row__chevron" aria-hidden="true"></i>

      </div>`;

    }).join('');

    area.innerHTML = `

      <div class="form-workflow-panel">

        <div class="form-workflow-panel__header">

          <h3>Forms 1–5 Workflow</h3>

          <span class="form-workflow-panel__summary">${summary.completed}/${summary.total} complete</span>

        </div>

        <p class="field-hint" style="margin-bottom:0.75rem">Complete Forms 1 and 2, then Form 3 (institutional report) before DJAG submission.</p>

        <div class="form-workflow-list">${rows}</div>

      </div>`;

  }



  function renderApplications() {

    document.getElementById('applications-tbody').innerHTML = scopeApps().map((a) => {

      const p = PMSStorage.getPrisonerById(a.prisonerId);

      return `<tr ${PMSUI.applicationRowAttributes(a, actor)}><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : '—'}</td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${formsSummary(a)}</td><td>${PMSUI.fmtDate(a.submittedAt)}</td><td>${PMSUI.renderApplicationActionButtons(a, actor)}</td></tr>`;

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
    updateForm1Actions(selectedId, initialApp);

    const summary = initialApp?.id ? PMSStorage.getFormCompletionSummary(initialApp) : { checks: {} };
    document.getElementById('btn-submit-djag').disabled = !initialApp?.id
      || !summary.checks.form1
      || !summary.checks.form2
      || (initialApp?.status && !['Draft', 'Returned for Correction'].includes(initialApp.status));

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

  PMSUI.setPanelNavigator((panel, navId) => PMSUI.switchPanel(panel, panelTitles, refresh, navId));

  PMSUI.initShell(actor);

  PMSUI.bindModalClose();
  PMSUI.bindNotificationPanel('notification-list', actor, () => refresh('notifications'));



  document.getElementById('btn-add-prisoner').addEventListener('click', () => {

    window.location.href = PMSRBAC.prisonerEditUrl();

  });

  document.getElementById('btn-new-app').addEventListener('click', () => openNewApplication());
  document.getElementById('btn-start-form1')?.addEventListener('click', startForm1);
  document.getElementById('btn-start-form1-footer')?.addEventListener('click', startForm1);

  document.getElementById('prisoner-search').addEventListener('input', () => renderPrisoners());

  document.getElementById('btn-save-draft').addEventListener('click', async () => {

    const pid = document.getElementById('app-prisoner').value;

    if (!pid) { PMSUI.showError('Please select a prisoner.'); return; }

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

      PMSUI.showSuccess('Application submitted to DJAG successfully.');

    } catch (err) { PMSUI.showError(err.message); }

  });



  document.addEventListener('click', (e) => {

    const prisonerFormBtn = e.target.closest('[data-open-prisoner-form]');
    if (prisonerFormBtn && !e.target.closest('a[href]:not([href="#"])')) {
      e.preventDefault();
      openPrisonerWorkflowForm(prisonerFormBtn.dataset.openPrisonerForm);
      return;
    }

    if (e.target.closest('[data-start-app]')) openNewApplication(e.target.closest('[data-start-app]').dataset.startApp);

    if (e.target.closest('[data-edit-app]')) openAppModal(PMSStorage.getApplicationById(e.target.closest('[data-edit-app]').dataset.editApp));

    const formRow = e.target.closest('[data-form-row][data-clickable="true"]');

    if (formRow) {

      const pid = document.getElementById('app-prisoner').value;

      if (!pid) { PMSUI.showError('Please select a prisoner first.'); return; }

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

    const eligRow = e.target.closest('[data-open-prisoner-form].eligibility-row--clickable');
    if (eligRow && eligRow === document.activeElement && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openPrisonerWorkflowForm(eligRow.dataset.openPrisonerForm);
    }

  });



  PMSUI.bindOverviewNotifications('overview-notifications', actor, () => refresh('overview'));

  PMSUI.bindApplicationActionHandlers(() => refresh('applications'));
  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) refresh('overview');

  PMSUI.bindLiveDataRefresh(() => {
    const active = document.querySelector('.sidebar-nav .nav-item.active')?.dataset.panel || 'overview';
    refresh(active);
  });
  setupStatCards();

})();

