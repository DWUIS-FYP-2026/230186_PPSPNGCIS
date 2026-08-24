/**
 * Shared engine for official PMS parole forms (Forms 1–5).
 */
const PMSForms = (() => {
  const FORM_PATHS = {
    1: 'forms/form1.html',
    2: 'forms/form2.html',
    3: 'forms/form3.html',
    4: 'forms/form4.html',
    5: 'forms/form5.html',
  };

  function getParams() {
    return new URLSearchParams(window.location.search);
  }

  function injectFormShell(ctx) {
    if (document.querySelector('.form-app-bar') || !ctx) return;
    const def = PMSStorage.PAROLE_FORMS.find((f) => f.number === ctx.formNumber);
    const dash = PMSAuth.getDashboardForRole(ctx.user.role);
    const bar = document.createElement('header');
    bar.className = 'form-app-bar no-print';
    bar.innerHTML = `
      <div class="form-app-bar__inner">
        <div class="form-app-bar__brand">
          <img src="../images/PNG CS Logo.jpg" alt="" class="form-app-bar__logo">
          <div>
            <span class="form-app-bar__system">Parole Management System</span>
            <strong class="form-app-bar__title">${esc(def?.name || `Form ${ctx.formNumber}`)}</strong>
          </div>
        </div>
        <div class="form-app-bar__meta">
          <span class="status-pill status-pill--${PMSUI?.statusClass?.(ctx.app.status) || 'pending'}">${esc(ctx.app.status)}</span>
          <button type="button" class="btn-secondary btn-sm" id="form-bar-back"><i class="fi fi-rr-arrow-left"></i> Dashboard</button>
        </div>
      </div>`;
    document.body.insertBefore(bar, document.body.firstChild);
    document.body.classList.add('form-page--integrated');
    document.getElementById('form-bar-back')?.addEventListener('click', () => { window.location.href = dash; });
  }

  function init(formNumber, mode = 'edit') {
    const session = PMSStorage.getSession();
    if (!session) { window.location.href = '../index.html'; return null; }
    const user = PMSStorage.getUserById(session.id) || session;
    if (!PMSRBAC.requireFormAccess(user, formNumber, mode)) return null;

    const appId = getParams().get('appId');
    const prisonerId = getParams().get('prisonerId');

    if (formNumber === 1) {
      let app = appId ? PMSStorage.getApplicationById(appId) : null;
      let prisoner = null;
      let institution = null;

      if (app) {
        prisoner = PMSStorage.getPrisonerById(app.prisonerId);
        institution = PMSStorage.getInstitutionById(app.institutionId);
      } else if (prisonerId) {
        prisoner = PMSStorage.getPrisonerById(prisonerId);
        if (prisoner) {
          app = PMSStorage.getOrCreateDraftApplication(prisonerId, user);
          institution = PMSStorage.getInstitutionById(app.institutionId);
        }
      }

      const ctx = { user, app, prisoner, institution, appId: app?.id || null, formNumber, mode };
      injectFormShell(ctx);
      return ctx;
    }

    if (!appId) { alert('Application ID required'); window.history.back(); return null; }

    const app = PMSStorage.getApplicationById(appId);
    if (!app) { alert('Application not found'); window.history.back(); return null; }

    const prisoner = PMSStorage.getPrisonerById(app.prisonerId);
    const institution = PMSStorage.getInstitutionById(app.institutionId);
    const ctx = { user, app, prisoner, institution, appId, formNumber };
    injectFormShell(ctx);
    return ctx;
  }

  function populateMeta(ctx) {
    const el = document.getElementById('form-meta');
    if (!el || !ctx) return;
    const p = ctx.prisoner;
    const prog = PMSStorage.getPrisonerProgress(p);
    const formKey = `form${ctx.formNumber}`;
    const formId = ctx.app.formData?.[formKey]?.formId;
    el.innerHTML = `
      <div class="row g-2">
        <div class="col-md-3"><strong>Application ID:</strong> ${esc(ctx.app.id)}</div>
        ${formId ? `<div class="col-md-3"><strong>Form ID:</strong> ${esc(formId)}</div>` : ''}
        <div class="col-md-3"><strong>Prisoner ID:</strong> ${esc(p.prisonerNumber || p.id)}</div>
        <div class="col-md-3"><strong>Name:</strong> ${esc(p.firstName)} ${esc(p.lastName)}</div>
        <div class="col-md-3"><strong>Institution:</strong> ${esc(ctx.institution?.name || '—')}</div>
        <div class="col-md-3"><strong>Application Status:</strong> <span class="workflow-badge">${esc(ctx.app.status)}</span></div>
        <div class="col-md-3"><strong>SSD:</strong> ${fmt(p.sentenceStartDate)}</div>
        <div class="col-md-3"><strong>SED:</strong> ${fmt(p.sentenceEndDate)}</div>
        <div class="col-md-3"><strong>Eligibility Date:</strong> ${fmt(prog.eligibilityDate)}</div>
        <div class="col-md-3"><strong>Offense:</strong> ${esc(p.offense)}</div>
      </div>`;
  }

  function formatSentenceLength(p) {
    const months = PMSStorage.getSentenceDurationMonths(p);
    if (!months) return '—';
    const years = Math.floor(months / 12);
    const rem = months % 12;
    const parts = [];
    if (years) parts.push(`${years} Year${years !== 1 ? 's' : ''}`);
    if (rem) parts.push(`${rem} Month${rem !== 1 ? 's' : ''}`);
    return parts.join(' ') || '—';
  }

  function populateForm1Document(ctx) {
    const p = ctx.prisoner;
    const prog = PMSStorage.getPrisonerProgress(p);
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val ?? '—';
    };
    setText('doc-application-id', ctx.app.id);
    setText('doc-prisoner-id', p.prisonerNumber || p.id);
    setText('doc-full-name', [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '));
    setText('doc-gender-dob', `${p.gender || '—'} / ${fmtLong(p.dateOfBirth)}`);
    setText('doc-institution', ctx.institution?.name || '—');
    setText('doc-offence', p.offense || '—');
    setText('doc-sentence-length', formatSentenceLength(p));
    setText('doc-ssd', fmtLong(p.sentenceStartDate));
    setText('doc-eligibility-date', fmtLong(prog.eligibilityDate));
    const statusEl = document.getElementById('doc-current-status');
    if (statusEl) {
      statusEl.textContent = prog.eligible ? 'ELIGIBLE' : (p.status || '—').toUpperCase();
      statusEl.className = `official-status-badge${prog.eligible ? ' official-status-badge--eligible' : ''}`;
    }
  }

  function loadIntoForm(formKey, data, prisoner) {
    const saved = data || {};
    document.querySelectorAll('[data-field]').forEach((el) => {
      const key = el.dataset.field;
      if (el.type === 'radio') {
        el.checked = saved[key] === el.value;
      } else if (el.type === 'checkbox') {
        el.checked = !!saved[key];
      } else if (saved[key] !== undefined) {
        el.value = saved[key];
      } else if (prisoner && prisoner[key] !== undefined) {
        el.value = prisoner[key];
      }
    });
    document.querySelectorAll('[data-readonly-prisoner]').forEach((el) => {
      const key = el.dataset.readonlyPrisoner;
      if (prisoner?.[key]) el.value = prisoner[key];
    });
  }

  function collectFormData() {
    const data = {};
    document.querySelectorAll('[data-field]').forEach((el) => {
      const key = el.dataset.field;
      if (el.type === 'radio') {
        if (el.checked) data[key] = el.value;
      } else if (el.type === 'checkbox') {
        data[key] = el.checked;
      } else {
        data[key] = el.value;
      }
    });
    return data;
  }

  async function saveAsync(formKey, ctx) {
    const data = collectFormData();
    await PMSStorage.saveFormData(ctx.appId, formKey, data, ctx.user);
    alert('Form saved successfully.');
  }

  function openForm(formNumber, appId) {
    if (typeof PMSFormWorkflow !== 'undefined') {
      PMSFormWorkflow.openForm(formNumber, appId);
      return;
    }
    window.location.href = `${FORM_PATHS[formNumber]}?appId=${appId}`;
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
  function fmt(d) { return d ? new Date(d).toLocaleDateString('en-PG') : '—'; }
  function fmtLong(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function bindCommonActions(ctx, formKey) {
    document.getElementById('btn-save')?.addEventListener('click', () => saveAsync(formKey, ctx));
    document.getElementById('btn-print')?.addEventListener('click', () => window.print());
    document.getElementById('btn-back')?.addEventListener('click', () => {
      window.location.href = PMSAuth.getDashboardForRole(ctx.user.role);
    });
    document.getElementById('btn-export')?.addEventListener('click', () => window.print());
  }

  function setReadOnlyIfViewOnly(ctx, formNumber) {
    if (!PMSRBAC.canAccessForm(ctx.user, formNumber, 'edit')) {
      document.querySelectorAll('[data-field]').forEach((el) => {
        if (el.type === 'radio' || el.type === 'checkbox') el.disabled = true;
        else {
          el.readOnly = true;
          el.classList.add('readonly-field');
        }
      });
      document.querySelectorAll('[data-checklist-field="result"]').forEach((el) => { el.disabled = true; });
      document.getElementById('btn-save')?.classList.add('d-none');
      document.getElementById('btn-save-draft')?.classList.add('d-none');
      document.getElementById('btn-submit-f1')?.classList.add('d-none');
    }
    if (formNumber === 1 && ctx.app?.formData?.form1?.status === 'submitted') {
      document.querySelectorAll('#parole-form [data-field]').forEach((el) => {
        if (el.type === 'radio' || el.type === 'checkbox') el.disabled = true;
        else if (!el.closest('#f1-section-g')) {
          el.readOnly = true;
          el.classList.add('readonly-field');
        }
      });
      document.getElementById('btn-save-draft')?.classList.add('d-none');
      document.getElementById('btn-submit-f1')?.classList.add('d-none');
    }
  }

  return {
    init, injectFormShell, populateMeta, populateForm1Document, loadIntoForm, collectFormData, save: saveAsync, openForm,
    bindCommonActions, setReadOnlyIfViewOnly, FORM_PATHS, esc, fmt, formatSentenceLength,
  };
})();
