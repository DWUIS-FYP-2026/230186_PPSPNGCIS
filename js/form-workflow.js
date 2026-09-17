/**
 * PMS Form Workflow — sequential completion gates for Forms 1–5 (official definitions).
 */
const PMSFormWorkflow = (() => {
  const WORKFLOW_KEY = 'png_parole_workflow';

  const FORM_DEFS = [
    {
      n: 1,
      key: 'form1',
      title: 'Form 1 — Parole Eligibility Screening',
      prereqs: [],
      dashboard: '../dashboard.html',
      dataKey: 'png_form1_screening',
      path: 'forms/form1.html',
    },
    {
      n: 2,
      key: 'form2',
      title: 'Form 2 — Assessment Records (DDR & PPR)',
      prereqs: ['form1'],
      dashboard: '../dashboard.html',
      dataKey: 'png_form2_assessments',
      path: 'forms/form2.html',
      sections: ['ddr', 'ppr'],
    },
    {
      n: 3,
      key: 'form3',
      title: 'Form 3 — Parole Hearing Record',
      prereqs: ['form1', 'form2'],
      dashboard: '../dashboard.html',
      dataKey: 'png_form3_institutional',
      path: 'forms/form3.html',
    },
    {
      n: 4,
      key: 'form4',
      title: 'Form 4 — Discharge of Parole Order',
      prereqs: ['form1', 'form2', 'form3'],
      dashboard: '../dashboard.html',
      dataKey: 'png_form4_granted',
      path: 'forms/form4.html',
    },
    {
      n: 5,
      key: 'form5',
      title: 'Form 5 — Applications After Refusal',
      prereqs: ['form1', 'form2', 'form3'],
      dashboard: '../dashboard.html',
      dataKey: 'png_form5_refused',
      path: 'forms/form5.html',
    },
  ];

  function showWorkflowAlert(message) {
    if (typeof PMSUI !== 'undefined' && PMSUI.showError) PMSUI.showError(message);
    else window.alert(message);
  }

  function getSessionUser() {
    if (typeof PMSStorage !== 'undefined') {
      const session = PMSStorage.getSession?.();
      if (session) return PMSStorage.getUserById?.(session.id) || session;
    }
    try {
      const raw = sessionStorage.getItem('pms_session');
      if (raw) return JSON.parse(raw);
    } catch (_) { /* ignore */ }
    return null;
  }

  function canUserEditForms() {
    if (typeof PMSRBAC === 'undefined') return true;
    const user = getSessionUser();
    if (!user) return false;
    return PMSRBAC.canEditForms(user);
  }

  function canUserEditForm(formN) {
    const user = getSessionUser();
    if (!user) return false;
    if (typeof PMSRBAC !== 'undefined') return PMSRBAC.canAccessForm(user, formN, 'edit');
    return canUserEditForms();
  }

  function getDashboardHref() {
    if (typeof PMSPageChrome !== 'undefined') {
      return PMSPageChrome.getDashboardHref('../');
    }
    const user = getSessionUser();
    const dash = typeof PMSAuth !== 'undefined' ? PMSAuth.getDashboardForRole(user?.role) : '';
    if (dash && dash !== 'index.html') return `../${dash}`;
    return '../index.html';
  }

  function applyViewOnlyMode(formN) {
    if (canUserEditForm(formN)) return false;
    injectStyles();

    const main = document.querySelector('.page-main');
    if (main && !document.getElementById('wf-readonly-banner')) {
      const banner = document.createElement('div');
      banner.id = 'wf-readonly-banner';
      banner.className = 'wf-readonly-banner';
      banner.innerHTML = '🔒 <strong>View only</strong> — You may view but not modify this form.';
      const progress = document.getElementById('wf-progress');
      if (progress) progress.insertAdjacentElement('afterend', banner);
      else main.insertBefore(banner, main.firstChild);
    }

    document.querySelectorAll('input:not([type="hidden"]), select, textarea, button').forEach((el) => {
      if (el.closest('.wf-gate') || el.closest('.wf-readonly-banner')) return;
      if (el.classList.contains('back-link') || el.classList.contains('pms-dashboard-btn')) return;
      if (el.id && (el.id.includes('print') || el.id === 'btn-print' || el.id === 'btn-print-conditions')) return;
      if (el.type === 'checkbox' || el.type === 'radio') el.disabled = true;
      else if (el.tagName === 'SELECT') el.disabled = true;
      else if (el.tagName === 'BUTTON') {
        if (!el.id?.includes('print') && !/print/i.test(el.textContent || '')) el.style.display = 'none';
      } else if (el.tagName === 'INPUT' && el.type === 'file') el.disabled = true;
      else if (!el.readOnly) { el.readOnly = true; el.classList.add('readonly-field'); }
    });

    document.querySelectorAll('.upload-zone').forEach((zone) => {
      zone.style.pointerEvents = 'none';
      zone.style.opacity = '0.65';
    });

    document.getElementById('wf-continue')?.remove();
    return true;
  }

  function getAppId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('appId') || '_default';
  }

  function loadAll() {
    try { return JSON.parse(localStorage.getItem(WORKFLOW_KEY) || '{}'); } catch (_) { return {}; }
  }

  function saveAll(data) { localStorage.setItem(WORKFLOW_KEY, JSON.stringify(data)); }

  function getAppWorkflow(appId) {
    const all = loadAll();
    if (!all[appId]) all[appId] = { forms: {} };
    return all[appId];
  }

  function getDataStorageKey(formN, appId) {
    const def = FORM_DEFS.find((f) => f.n === formN);
    const base = def?.dataKey || `png_form${formN}`;
    const id = appId || getAppId();
    return id === '_default' ? base : `${base}__${id}`;
  }

  function readFormData(formN, appId) {
    try { return JSON.parse(localStorage.getItem(getDataStorageKey(formN, appId)) || 'null'); } catch (_) { return null; }
  }

  function isFormDataComplete(formN, appId) {
    if (typeof PMSStorage !== 'undefined' && appId && appId !== '_default') {
      const app = PMSStorage.getApplicationById(appId);
      if (app?.formData) {
        const fd = app.formData[`form${formN}`] || {};
        if (formN === 1) return PMSStorage.isForm1Complete(fd);
        if (formN === 2) return PMSStorage.isForm2Complete?.(fd) ?? false;
        if (formN === 3) return PMSStorage.isForm3Complete?.(fd) ?? (!!fd.commanderRecommendation && fd.status === 'approved');
        if (formN === 4) return PMSStorage.isForm4Complete?.(fd) ?? fd.status === 'Parole Granted';
        if (formN === 5) return PMSStorage.isForm5Complete?.(fd) ?? fd.status === 'Parole Refused';
      }
    }

    const wf = getAppWorkflow(appId);
    if (wf.forms[formN]?.completed) return true;

    const data = readFormData(formN, appId);
    if (!data) return false;

    switch (formN) {
      case 1: return data.status === 'submitted' || data.status === 'verified';
      case 2: return PMSStorage?.isForm2Complete?.(data) || (data.sections?.ddr?.submitted && data.sections?.ppr?.submitted);
      case 3: return data.status === 'approved' || (data.commanderRecommendation && data.submitted === true);
      case 4: return data.status === 'Parole Granted';
      case 5: return data.status === 'Parole Refused';
      default: return false;
    }
  }

  function getChecks(appId) {
    const id = appId || getAppId();
    const checks = {};
    FORM_DEFS.forEach((f) => { checks[f.key] = isFormDataComplete(f.n, id); });
    return checks;
  }

  function prereqsMet(checks, prereqs) { return (prereqs || []).every((key) => checks[key]); }

  function getDef(formN) { return FORM_DEFS.find((f) => f.n === formN); }

  function getBlockingForm(appId, formN) {
    const checks = getChecks(appId);
    const def = getDef(formN);
    if (!def) return null;
    for (const key of def.prereqs) {
      if (!checks[key]) return FORM_DEFS.find((f) => f.key === key) || null;
    }
    if ((formN === 4 || formN === 5) && appId && appId !== '_default' && typeof PMSStorage !== 'undefined') {
      const app = PMSStorage.getApplicationById(appId);
      if (app) {
        if (!PMSStorage.isBoardDecisionFinalized(app)) {
          return { n: 0, key: 'board', title: 'Board Decision — awaiting all panel votes' };
        }
        const outcome = PMSStorage.getBoardDecisionOutcome(app);
        if (formN === 4 && outcome === 'Parole Refused') {
          return { n: 5, key: 'form5', title: 'Form 5 — Applications After Refusal' };
        }
        if (formN === 5 && outcome === 'Parole Granted') {
          return { n: 4, key: 'form4', title: 'Form 4 — Discharge of Parole Order' };
        }
      }
    }
    return null;
  }

  function hasFormData(formN, appId) {
    if (isFormDataComplete(formN, appId)) return true;
    if (appId && appId !== '_default' && typeof PMSStorage !== 'undefined') {
      const app = PMSStorage.getApplicationById(appId);
      const fd = app?.formData?.[`form${formN}`];
      if (fd && typeof fd === 'object') {
        const keys = Object.keys(fd).filter((k) => {
          const v = fd[k];
          if (v == null || v === '') return false;
          if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false;
          return true;
        });
        if (keys.length > 0) return true;
      }
    }
    const data = readFormData(formN, appId);
    return !!(data && Object.keys(data).length > 0);
  }

  function canUserViewForm(formN) {
    const user = getSessionUser();
    if (!user) return true;
    if (typeof PMSRBAC === 'undefined') return true;
    return PMSRBAC.canAccessForm(user, formN, 'view');
  }

  /** Allow navigation to view saved or completed forms even when workflow gates block editing. */
  function canOpenForReview(appId, formN) {
    if (!getDef(formN)) return false;
    if (!canUserViewForm(formN)) return false;
    if (canAccess(appId, formN)) return true;
    if (formN === 1) return true;
    if (hasFormData(formN, appId)) return true;
    return false;
  }

  function canAccess(appId, formN) {
    const checks = getChecks(appId);
    const def = getDef(formN);
    if (!def) return false;
    if (!prereqsMet(checks, def.prereqs)) return false;
    if (!appId || appId === '_default' || typeof PMSStorage === 'undefined') return true;
    const app = PMSStorage.getApplicationById(appId);
    if (!app) return false;
    if (formN === 3) return true;
    if (formN === 4) return PMSStorage.canProceedToForm4(app);
    if (formN === 5) return PMSStorage.canProceedToForm5(app);
    return true;
  }

  function markComplete(formN, appId, meta) {
    if (!canUserEditForm(formN)) return null;
    const id = appId || getAppId();
    const all = loadAll();
    if (!all[id]) all[id] = { forms: {} };
    all[id].forms[formN] = { completed: true, completedAt: new Date().toISOString(), ...(meta || {}) };
    saveAll(all);
    if (typeof PMSStorage !== 'undefined' && PMSStorage.ensureLoaded) {
      PMSStorage.ensureLoaded().then(() => syncToPMSStorage(id, formN)).catch(() => {});
    } else {
      syncToPMSStorage(id, formN);
    }
    return all[id];
  }

  function syncToPMSStorage(appId, formN) {
    if (typeof PMSStorage === 'undefined' || appId === '_default') return;
    try {
      const app = PMSStorage.getApplicationById(appId);
      if (!app) return;
      const data = readFormData(formN, appId) || {};
      const key = `form${formN}`;
      const patch = { ...data, workflowComplete: true };
      const actor = PMSStorage.getSession() || { id: 'system', firstName: 'System', lastName: '' };

      if (formN === 1) {
        patch.status = patch.status || 'submitted';
        patch.screeningDate = patch.screeningDate || new Date().toISOString().slice(0, 10);
        patch.eligibilityOutcome = patch.eligibilityOutcome || 'eligible';
      }
      if (formN === 2) patch.assessmentSubmitted = true;
      if (formN === 3) {
        const existing = app.formData?.form3;
        if (PMSStorage.isForm3Complete(existing)) return;
        patch.status = patch.status || 'submitted';
        patch.submitted = true;
      }
      if (formN === 4) {
        patch.status = 'submitted';
        patch.investigationSummary = patch.investigationSummary || patch.summary || 'Pre-parole investigation complete';
      }
      if (formN === 5) {
        patch.status = 'recorded';
        patch.boardDecision = patch.boardDecision || patch.outcome;
      }

      PMSStorage.saveFormData(appId, key, patch, actor);
    } catch (_) { /* offline */ }
  }

  function formHref(formN, appId, { review = false } = {}) {
    const id = encodeURIComponent(appId || getAppId());
    const inFormsDir = /\/forms(\/|$)/.test(window.location.pathname);
    const base = inFormsDir ? `form${formN}.html?appId=${id}` : `forms/form${formN}.html?appId=${id}`;
    return review ? `${base}&mode=review` : base;
  }

  function openForm(formN, appId, options = {}) {
    const id = appId || getAppId();
    const def = getDef(formN);
    if (!def) return;
    const editable = canAccess(id, formN);
    const reviewable = canOpenForReview(id, formN);
    if (!editable && !reviewable) {
      const blocker = getBlockingForm(id, formN);
      showWorkflowAlert(`Complete ${blocker?.title || 'the previous form'} before opening ${def.title}.`);
      return;
    }
    window.location.href = formHref(formN, id, { review: options.review || !editable });
  }

  function getOutcomeFormN(appId) {
    if (!appId || appId === '_default' || typeof PMSStorage === 'undefined') return null;
    const app = PMSStorage.getApplicationById(appId);
    if (!app || !PMSStorage.isBoardDecisionFinalized(app)) return null;
    const outcome = PMSStorage.getBoardDecisionOutcome(app);
    if (outcome === 'Parole Granted') return 4;
    if (outcome === 'Parole Refused') return 5;
    return null;
  }

  /** Forms 4 and 5 are mutually exclusive — only the board-outcome form appears in the workflow. */
  function getWorkflowSteps(appId) {
    const base = FORM_DEFS.filter((f) => f.n <= 3);
    const outcomeN = getOutcomeFormN(appId);
    if (outcomeN === 4) return [...base, getDef(4)];
    if (outcomeN === 5) return [...base, getDef(5)];
    if (!appId || appId === '_default') return FORM_DEFS;
    return base;
  }

  function redirectToOutcomeFormIfNeeded(formN, appId) {
    const outcomeN = getOutcomeFormN(appId);
    if (!outcomeN || outcomeN === formN || (formN !== 4 && formN !== 5)) return false;
    window.location.replace(formHref(outcomeN, appId));
    return true;
  }

  function getNextForm(formN, appId) {
    if (formN === 3) {
      const outcomeN = getOutcomeFormN(appId);
      return outcomeN ? getDef(outcomeN) : null;
    }
    if (formN === 4 || formN === 5) return null;
    return FORM_DEFS.find((f) => f.n === formN + 1) || null;
  }

  function getPrevForm(formN) {
    if (formN === 4 || formN === 5) return getDef(3);
    return FORM_DEFS.find((f) => f.n === formN - 1) || null;
  }

  function getProgressMountParent() {
    return document.getElementById('form-workflow-nav')
      || document.querySelector('.page-main')
      || document.getElementById('form1-root')
      || document.getElementById('form2-root')
      || document.querySelector('.container');
  }

  function navigateAfterSubmit(formN, appId, { delay = 1500 } = {}) {
    if (!appId || appId === '_default') return;
    markComplete(formN, appId, { submitted: true });
    const go = () => {
      if (formN === 1) openForm(2, appId);
      else if (formN === 2) openForm(3, appId);
      else if (formN === 3) {
        if (canScheduleHearing()) window.location.href = schedulePortalHref(appId);
        else if (canAccessHearingPortal()) window.location.href = hearingPortalHref(appId);
        else window.location.href = getDashboardHref();
      } else {
        window.location.href = getDashboardHref();
      }
    };
    if (delay > 0) setTimeout(go, delay);
    else go();
  }

  function canAccessHearingPortal() {
    const user = getSessionUser();
    if (!user) return false;
    return [
      'DJAG Secretary', 'DJAG Parole Clerk', 'System Administrator',
      'Doctor', 'CS Commissioner',
    ].includes(user.role);
  }

  function canScheduleHearing() {
    const user = getSessionUser();
    if (!user) return false;
    return typeof PMSRBAC !== 'undefined'
      ? PMSRBAC.canScheduleHearing(user)
      : user.role === 'DJAG Secretary';
  }

  function hearingPortalHref(appId) {
    const id = encodeURIComponent(appId || getAppId());
    const inFormsDir = /\/forms(\/|$)/.test(window.location.pathname);
    return inFormsDir ? `board-decisions.html?appId=${id}` : `forms/board-decisions.html?appId=${id}`;
  }

  function schedulePortalHref(appId) {
    const id = encodeURIComponent(appId || getAppId());
    const inFormsDir = /\/forms(\/|$)/.test(window.location.pathname);
    return inFormsDir ? `hearing-schedule.html?appId=${id}` : `forms/hearing-schedule.html?appId=${id}`;
  }

  function injectStyles() {
    if (document.getElementById('pms-form-workflow-styles')) return;
    const style = document.createElement('style');
    style.id = 'pms-form-workflow-styles';
    style.textContent = `
      .wf-gate { position:fixed;inset:0;background:rgba(0,43,92,.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:1.5rem; }
      .wf-gate__panel { background:#fff;border-radius:10px;max-width:440px;width:100%;padding:2rem;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.25);border-top:4px solid #b71c1c; }
      .wf-gate__panel h2 { font-size:1.25rem;color:#002b5c;margin-bottom:.75rem; }
      .wf-gate__panel p { color:#5a6b7d;margin-bottom:1.25rem;line-height:1.55; }
      .wf-gate__actions { display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap; }
      .wf-gate__btn { padding:.625rem 1.25rem;border-radius:6px;font-weight:600;font-size:.9375rem;cursor:pointer;border:none;font-family:inherit; }
      .wf-gate__btn--primary { background:#002b5c;color:#fff; }
      .wf-gate__btn--secondary { background:#fff;color:#002b5c;border:2px solid #002b5c; }
      .wf-continue { display:none;margin-top:1rem;padding:1rem 1.25rem;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap; }
      .wf-continue.show { display:flex; }
      .wf-continue__text { font-size:.9375rem;font-weight:600;color:#1b5e20; }
      .wf-continue__btn { padding:.5rem 1rem;background:#1e6b32;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-family:inherit; }
      body.wf-blocked .page-main { pointer-events:none;opacity:.45;user-select:none;filter:grayscale(.2); }
      .wf-form-nav__btn:hover { background:#eef2f7;border-color:#0f2942; }
      .wf-form-nav__btn--primary:hover { background:#0a1f33; }
      .wf-form-nav__btn:disabled { opacity:.45;cursor:not-allowed; }
    `;
    document.head.appendChild(style);
  }

  function renderProgressBar(currentFormN, appId) {
    injectStyles();
    const checks = getChecks(appId);
    const steps = getWorkflowSteps(appId);
    document.getElementById('wf-progress')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'wf-progress';
    wrap.className = 'wf-progress no-print';
    wrap.innerHTML = `<div class="wf-progress__title">Parole Case Workflow</div>
      <div class="wf-progress__steps">${steps.map((f) => {
        const done = checks[f.key];
        const current = f.n === currentFormN;
        const accessible = canAccess(appId, f.n) || done || current;
        const locked = !accessible;
        let extra = '';
        if (f.n === 2 && !done && typeof PMSStorage !== 'undefined') {
          const app = PMSStorage.getApplicationById(appId);
          const ddr = PMSStorage.isForm2SectionVerified?.(app?.formData?.form2?.sections?.ddr);
          const ppr = PMSStorage.isForm2SectionVerified?.(app?.formData?.form2?.sections?.ppr);
          if (ddr || ppr) extra = ` (${ddr ? 'DDR✓' : 'DDR—'}${ppr ? ' PPR✓' : ' PPR—'})`;
        }
        const cls = ['wf-step', done ? 'wf-step--done' : '', current ? 'wf-step--current' : '', locked ? 'wf-step--locked' : ''].filter(Boolean).join(' ');
        return `<div class="${cls}" data-form-n="${f.n}" title="${f.title}">Form ${f.n}${done ? ' ✓' : extra}</div>`;
      }).join('')}</div>`;

    const mount = getProgressMountParent();
    if (mount) {
      if (mount.id === 'form-workflow-nav') mount.innerHTML = '';
      mount.insertBefore(wrap, mount.firstChild);
    }

    wrap.querySelectorAll('.wf-step[data-form-n]').forEach((el) => {
      el.addEventListener('click', () => {
        const n = Number(el.dataset.formN);
        if (Number.isNaN(n)) return;
        if (n === currentFormN) return;
        if (!canOpenForReview(appId, n)) {
          const blocker = getBlockingForm(appId, n);
          showWorkflowAlert(`Complete ${blocker?.title || 'the previous form'} before opening Form ${n}.`);
          return;
        }
        openForm(n, appId);
      });
    });
  }

  function renderFormNavBar(currentFormN, appId) {
    injectStyles();
    if (!appId || appId === '_default') return;

    const prev = getPrevForm(currentFormN);
    const next = getNextForm(currentFormN, appId);
    const checks = getChecks(appId);
    const outcomeN = getOutcomeFormN(appId);
    let navHost = document.getElementById('wf-form-nav');
    if (!navHost) {
      navHost = document.createElement('div');
      navHost.id = 'wf-form-nav';
      navHost.className = 'wf-form-nav no-print';
      const mount = getProgressMountParent();
      if (mount) mount.appendChild(navHost);
    }

    const showHearing = currentFormN <= 3 && checks.form3 && canAccessHearingPortal();
    const outcomeBtn = outcomeN && currentFormN === 3 && currentFormN !== outcomeN
      ? `<button type="button" class="wf-form-nav__btn wf-form-nav__btn--primary" data-wf-nav="outcome">Open Form ${outcomeN} →</button>`
      : '';
    navHost.innerHTML = `
      <span class="wf-form-nav__label">Navigate:</span>
      ${prev ? `<button type="button" class="wf-form-nav__btn" data-wf-nav="prev">← Form ${prev.n}</button>` : ''}
      ${next ? `<button type="button" class="wf-form-nav__btn wf-form-nav__btn--primary" data-wf-nav="next"${canAccess(appId, next.n) ? '' : ' disabled'}>Form ${next.n} →</button>` : ''}
      ${outcomeBtn}
      ${showHearing ? '<button type="button" class="wf-form-nav__btn" data-wf-nav="hearing">Hearing Portal</button>' : ''}`;

    navHost.querySelector('[data-wf-nav="prev"]')?.addEventListener('click', () => { if (prev) openForm(prev.n, appId); });
    navHost.querySelector('[data-wf-nav="next"]')?.addEventListener('click', () => { if (next) openForm(next.n, appId); });
    navHost.querySelector('[data-wf-nav="outcome"]')?.addEventListener('click', () => { if (outcomeN) openForm(outcomeN, appId); });
    navHost.querySelector('[data-wf-nav="hearing"]')?.addEventListener('click', () => {
      window.location.href = canScheduleHearing() ? schedulePortalHref(appId) : hearingPortalHref(appId);
    });
  }

  function syncMirroredCompletions(appId) {
    const id = appId || getAppId();
    if (!id || id === '_default' || typeof PMSStorage === 'undefined') return false;
    const all = loadAll();
    if (!all[id]) all[id] = { forms: {} };
    let changed = false;
    FORM_DEFS.forEach((f) => {
      if (all[id].forms[f.n]?.completed) return;
      if (!isFormDataComplete(f.n, id)) return;
      all[id].forms[f.n] = {
        completed: true,
        completedAt: new Date().toISOString(),
        mirrored: true,
      };
      changed = true;
    });
    if (changed) saveAll(all);
    return changed;
  }

  function mountFormChrome(formN, appId) {
    if (!appId || appId === '_default') return;
    syncMirroredCompletions(appId);
    renderProgressBar(formN, appId);
    renderFormNavBar(formN, appId);
  }

  function showGate(formN, appId) {
    injectStyles();
    const def = getDef(formN);
    const blocker = getBlockingForm(appId, formN);
    document.body.classList.add('wf-blocked');
    const gate = document.createElement('div');
    gate.className = 'wf-gate';
    gate.id = 'wf-gate';
    gate.innerHTML = `
      <div class="wf-gate__panel" role="dialog">
        <h2>Form Locked</h2>
        <p>${blocker?.key === 'board'
          ? `All three board members (DJAG Secretary, PNGCS Commissioner, and Psychiatrist) must submit their Approve, Deny, or Defer votes before <strong>${def?.title || 'this form'}</strong> can be opened.`
          : `Complete <strong>${blocker?.title || 'the previous form'}</strong> before accessing <strong>${def?.title || 'this form'}</strong>.`}</p>
        <div class="wf-gate__actions">
          ${blocker?.key === 'board' ? `<button type="button" class="wf-gate__btn wf-gate__btn--primary" id="wf-gate-open-hearing">Open Hearing Portal</button>` : ''}
          ${blocker && blocker.n > 0 ? `<button type="button" class="wf-gate__btn wf-gate__btn--primary" id="wf-gate-open-blocker">Open ${blocker.title}</button>` : ''}
          <button type="button" class="wf-gate__btn wf-gate__btn--secondary" id="wf-gate-back">Back to Dashboard</button>
        </div>
      </div>`;
    document.body.appendChild(gate);
    document.getElementById('wf-gate-back')?.addEventListener('click', () => { window.location.href = getDashboardHref(); });
    document.getElementById('wf-gate-open-blocker')?.addEventListener('click', () => { if (blocker?.n) openForm(blocker.n, appId); });
    document.getElementById('wf-gate-open-hearing')?.addEventListener('click', () => { window.location.href = hearingPortalHref(appId); });
  }

  function showContinueBanner(formN, appId) {
    injectStyles();
    let banner = document.getElementById('wf-continue');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'wf-continue';
      banner.className = 'wf-continue';
      const actions = document.querySelector('.actions-bar') || document.querySelector('.actions');
      if (actions) actions.parentNode.insertBefore(banner, actions);
      else document.querySelector('.page-main')?.appendChild(banner)
        || document.getElementById('form1-root')?.appendChild(banner)
        || document.getElementById('form2-root')?.appendChild(banner);
    }

    if (formN === 3 && canAccessHearingPortal()) {
      banner.innerHTML = `<span class="wf-continue__text">Form 3 submitted — board members can record their votes in the hearing portal</span>
        <button type="button" class="wf-continue__btn" id="wf-continue-btn">Open Hearing Portal →</button>`;
      banner.classList.add('show');
      document.getElementById('wf-continue-btn')?.addEventListener('click', () => { window.location.href = hearingPortalHref(appId); });
      return;
    }

    if (formN === 3) {
      banner.innerHTML = `<span class="wf-continue__text">Form 3 submitted — the Parole Board will vote, then the DJAG Secretary issues Form 4 or Form 5</span>`;
      banner.classList.add('show');
      return;
    }

    const next = getNextForm(formN, appId);
    if (!next) return;
    banner.innerHTML = `<span class="wf-continue__text">✅ ${getDef(formN)?.title} completed — ready for ${next.title}</span>
      <button type="button" class="wf-continue__btn" id="wf-continue-btn">Continue to Form ${next.n} →</button>`;
    banner.classList.add('show');
    document.getElementById('wf-continue-btn')?.addEventListener('click', () => openForm(next.n, appId));
  }

  function showReviewBanner(formN, appId) {
    if (canAccess(appId, formN)) return;
    injectStyles();
    const blocker = getBlockingForm(appId, formN);
    let banner = document.getElementById('wf-review-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'wf-review-banner';
      banner.className = 'wf-readonly-banner';
      const mount = getProgressMountParent();
      const progress = document.getElementById('wf-progress');
      if (progress) progress.insertAdjacentElement('afterend', banner);
      else if (mount) mount.insertBefore(banner, mount.firstChild);
    }
    banner.innerHTML = blocker?.key === 'board'
      ? '👁 <strong>Review mode</strong> — Board decision is not final yet. This form is view-only until all panel votes are recorded.'
      : `👁 <strong>Review mode</strong> — Viewing saved data. Complete <strong>${blocker?.title || 'prior forms'}</strong> before editing this form.`;
    banner.style.display = 'block';
  }

  function initPage(formN) {
    injectStyles();
    document.body.classList.add('pms-form-page');
    const appId = getAppId();
    const params = new URLSearchParams(window.location.search);
    const reviewMode = params.get('mode') === 'review';
    if (redirectToOutcomeFormIfNeeded(formN, appId)) {
      return { appId, blocked: true, markCompleteAndAdvance: () => {}, refreshProgress: () => {} };
    }
    migrateLegacyData(formN, appId);
    const backLink = document.querySelector('.back-link');
    if (backLink) backLink.href = getDashboardHref();
    mountFormChrome(formN, appId);

    const editable = canAccess(appId, formN);
    const reviewable = canOpenForReview(appId, formN);

    if (!editable && !reviewable) {
      showGate(formN, appId);
      return { appId, blocked: true, markCompleteAndAdvance: () => {}, refreshProgress: () => mountFormChrome(formN, appId) };
    }

    const viewOnly = reviewMode || !editable || !canUserEditForm(formN);
    if (viewOnly) {
      applyViewOnlyMode(formN);
      if (!editable && reviewable) showReviewBanner(formN, appId);
    }

    if (editable && isFormDataComplete(formN, appId)) showContinueBanner(formN, appId);

    return {
      appId,
      blocked: false,
      readOnly: viewOnly,
      getDataKey: () => getDataStorageKey(formN, appId),
      markCompleteAndAdvance(meta) {
        if (viewOnly || !editable) return;
        markComplete(formN, appId, meta);
        mountFormChrome(formN, appId);
        showContinueBanner(formN, appId);
      },
      refreshProgress: () => mountFormChrome(formN, appId),
    };
  }

  function migrateLegacyData(formN, appId) {
    if (appId === '_default') return;
    const def = getDef(formN);
    if (!def) return;
    const scopedKey = getDataStorageKey(formN, appId);
    const legacyKey = def.dataKey;
    if (!localStorage.getItem(scopedKey) && localStorage.getItem(legacyKey)) {
      localStorage.setItem(scopedKey, localStorage.getItem(legacyKey));
    }
  }

  return {
    FORM_DEFS, getAppId, getDataStorageKey, getChecks, canAccess, canOpenForReview, hasFormData, getBlockingForm,
    markComplete, openForm, initPage, isFormDataComplete, prereqsMet, canUserEditForms, canUserEditForm,
    hearingPortalHref, schedulePortalHref, canAccessHearingPortal, canScheduleHearing, mountFormChrome, navigateAfterSubmit,
    getNextForm, getPrevForm, formHref, getOutcomeFormN, getWorkflowSteps, showContinueBanner, getDef,
    syncMirroredCompletions,
  };
})();
