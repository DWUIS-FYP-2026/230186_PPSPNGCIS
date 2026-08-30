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
      dashboard: '../dashboard-pngcs.html',
      dataKey: 'png_form1_screening',
      path: 'forms/form1.html',
    },
    {
      n: 2,
      key: 'form2',
      title: 'Form 2 — Assessment Records (DDR & PPR)',
      prereqs: ['form1'],
      dashboard: '../dashboard-pngcs.html',
      dataKey: 'png_form2_assessments',
      path: 'forms/form2.html',
      sections: ['ddr', 'ppr'],
    },
    {
      n: 3,
      key: 'form3',
      title: 'Form 3 — Institutional Report',
      prereqs: ['form1', 'form2'],
      dashboard: '../dashboard-commander.html',
      dataKey: 'png_form3_institutional',
      path: 'forms/form3.html',
    },
    {
      n: 4,
      key: 'form4',
      title: 'Form 4 — Parole Granted',
      prereqs: ['form1', 'form2', 'form3'],
      dashboard: '../dashboard-board.html',
      dataKey: 'png_form4_granted',
      path: 'forms/form4.html',
    },
    {
      n: 5,
      key: 'form5',
      title: 'Form 5 — Parole Refused',
      prereqs: ['form1', 'form2', 'form3'],
      dashboard: '../dashboard-board.html',
      dataKey: 'png_form5_refused',
      path: 'forms/form5.html',
    },
  ];

  function getSessionUser() {
    if (typeof PMSStorage === 'undefined') return null;
    const session = PMSStorage.getSession();
    if (!session) return null;
    return PMSStorage.getUserById(session.id) || session;
  }

  function canUserEditForms() {
    if (typeof PMSRBAC === 'undefined') return true;
    const user = getSessionUser();
    if (!user) return false;
    return PMSRBAC.canEditForms(user);
  }

  function getDashboardHref() {
    const user = getSessionUser();
    if (user && typeof PMSAuth !== 'undefined') {
      return '../' + PMSAuth.getDashboardForRole(user.role);
    }
    return '../dashboard-pngcs.html';
  }

  function applyViewOnlyMode() {
    if (canUserEditForms()) return false;
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
      if (el.classList.contains('back-link')) return;
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
    return null;
  }

  function canAccess(appId, formN) {
    const checks = getChecks(appId);
    const def = getDef(formN);
    if (!def) return false;
    return prereqsMet(checks, def.prereqs);
  }

  function markComplete(formN, appId, meta) {
    if (!canUserEditForms() && formN <= 2) return null;
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
        patch.status = patch.status || 'approved';
        patch.commanderRecommendation = patch.commanderRecommendation || 'Verified';
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

  function formHref(formN, appId) {
    const id = encodeURIComponent(appId || getAppId());
    const inFormsDir = /\/forms(\/|$)/.test(window.location.pathname);
    return inFormsDir ? `form${formN}.html?appId=${id}` : `forms/form${formN}.html?appId=${id}`;
  }

  function openForm(formN, appId) {
    const id = appId || getAppId();
    const def = getDef(formN);
    if (!def) return;
    if (!canAccess(id, formN)) {
      const blocker = getBlockingForm(id, formN);
      alert(`Complete ${blocker?.title || 'the previous form'} before opening ${def.title}.`);
      return;
    }
    window.location.href = formHref(formN, id);
  }

  function getNextForm(formN) { return FORM_DEFS.find((f) => f.n === formN + 1) || null; }

  function canAccessHearingPortal() {
    const user = getSessionUser();
    if (!user) return false;
    return ['DJAG Secretary', 'DJAG Parole Clerk', 'System Administrator'].includes(user.role);
  }

  function hearingPortalHref(appId) {
    const id = encodeURIComponent(appId || getAppId());
    const inFormsDir = /\/forms(\/|$)/.test(window.location.pathname);
    return inFormsDir ? `hearing-portal.html?appId=${id}` : `forms/hearing-portal.html?appId=${id}`;
  }

  function injectStyles() {
    if (document.getElementById('pms-form-workflow-styles')) return;
    const style = document.createElement('style');
    style.id = 'pms-form-workflow-styles';
    style.textContent = `
      .wf-progress { background:#fff;border:1px solid #d0d8e4;border-radius:8px;padding:1rem 1.25rem;margin-bottom:1.25rem;box-shadow:0 2px 12px rgba(0,43,92,.06); }
      .wf-progress__title { font-size:.8125rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#5a6b7d;margin-bottom:.75rem; }
      .wf-progress__steps { display:flex;gap:.35rem;flex-wrap:wrap; }
      .wf-step { flex:1;min-width:4.5rem;text-align:center;padding:.5rem .35rem;border-radius:6px;font-size:.6875rem;font-weight:600;background:#eef2f7;color:#5a6b7d;border:1px solid #d0d8e4; }
      .wf-step--done { background:#e8f5e9;color:#1b5e20;border-color:#a5d6a7; }
      .wf-step--current { background:#002b5c;color:#fff;border-color:#002b5c; }
      .wf-step--locked { opacity:.55; }
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
      .wf-readonly-banner { background:#fff8e1;border:1px solid #ffe082;border-left:4px solid #ffc107;border-radius:8px;padding:.875rem 1rem;margin-bottom:1.25rem;font-size:.875rem;color:#664d03; }
    `;
    document.head.appendChild(style);
  }

  function renderProgressBar(currentFormN, appId) {
    injectStyles();
    const checks = getChecks(appId);
    document.getElementById('wf-progress')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'wf-progress';
    wrap.className = 'wf-progress';
    wrap.innerHTML = `<div class="wf-progress__title">Parole Case Workflow</div>
      <div class="wf-progress__steps">${FORM_DEFS.map((f) => {
        const done = checks[f.key];
        const current = f.n === currentFormN;
        const locked = !done && !current && !canAccess(appId, f.n);
        const cls = ['wf-step', done ? 'wf-step--done' : '', current ? 'wf-step--current' : '', locked ? 'wf-step--locked' : ''].filter(Boolean).join(' ');
        return `<div class="${cls}" title="${f.title}">Form ${f.n}${done ? ' ✓' : ''}</div>`;
      }).join('')}</div>`;
    document.querySelector('.page-main')?.insertBefore(wrap, document.querySelector('.page-main')?.firstChild);
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
        <p>Complete <strong>${blocker?.title || 'the previous form'}</strong> before accessing <strong>${def?.title || 'this form'}</strong>.</p>
        <div class="wf-gate__actions">
          ${blocker ? `<button type="button" class="wf-gate__btn wf-gate__btn--primary" id="wf-gate-open-blocker">Open ${blocker.title}</button>` : ''}
          <button type="button" class="wf-gate__btn wf-gate__btn--secondary" id="wf-gate-back">Back to Dashboard</button>
        </div>
      </div>`;
    document.body.appendChild(gate);
    document.getElementById('wf-gate-back')?.addEventListener('click', () => { window.location.href = getDashboardHref(); });
    document.getElementById('wf-gate-open-blocker')?.addEventListener('click', () => { if (blocker) openForm(blocker.n, appId); });
  }

  function showContinueBanner(formN, appId) {
    injectStyles();
    let banner = document.getElementById('wf-continue');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'wf-continue';
      banner.className = 'wf-continue';
      const actions = document.querySelector('.actions-bar');
      if (actions) actions.parentNode.insertBefore(banner, actions);
      else document.querySelector('.page-main')?.appendChild(banner);
    }

    if (formN === 3 && canAccessHearingPortal()) {
      banner.innerHTML = `<span class="wf-continue__text">✅ Form 3 completed — schedule the parole hearing for this prisoner</span>
        <button type="button" class="wf-continue__btn" id="wf-continue-btn">Open Hearing Portal →</button>`;
      banner.classList.add('show');
      document.getElementById('wf-continue-btn')?.addEventListener('click', () => { window.location.href = hearingPortalHref(appId); });
      return;
    }

    if (formN === 3) {
      banner.innerHTML = `<span class="wf-continue__text">✅ Form 3 submitted — DJAG will schedule the parole hearing within 14 days</span>`;
      banner.classList.add('show');
      return;
    }

    const next = getNextForm(formN);
    if (!next) return;
    banner.innerHTML = `<span class="wf-continue__text">✅ ${getDef(formN)?.title} completed — ready for ${next.title}</span>
      <button type="button" class="wf-continue__btn" id="wf-continue-btn">Continue to Form ${next.n} →</button>`;
    banner.classList.add('show');
    document.getElementById('wf-continue-btn')?.addEventListener('click', () => openForm(next.n, appId));
  }

  function initPage(formN) {
    injectStyles();
    document.body.classList.add('pms-form-page');
    const appId = getAppId();
    applyViewOnlyMode();
    migrateLegacyData(formN, appId);
    const backLink = document.querySelector('.back-link');
    if (backLink) backLink.href = getDashboardHref();
    renderProgressBar(formN, appId);

    if (!canAccess(appId, formN)) {
      showGate(formN, appId);
      return { appId, blocked: true, markCompleteAndAdvance: () => {}, refreshProgress: () => renderProgressBar(formN, appId) };
    }

    if (isFormDataComplete(formN, appId)) showContinueBanner(formN, appId);

    return {
      appId,
      blocked: false,
      getDataKey: () => getDataStorageKey(formN, appId),
      markCompleteAndAdvance(meta) {
        markComplete(formN, appId, meta);
        renderProgressBar(formN, appId);
        showContinueBanner(formN, appId);
      },
      refreshProgress: () => renderProgressBar(formN, appId),
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
    FORM_DEFS, getAppId, getDataStorageKey, getChecks, canAccess, getBlockingForm,
    markComplete, openForm, initPage, isFormDataComplete, prereqsMet, canUserEditForms,
    hearingPortalHref, canAccessHearingPortal,
  };
})();
