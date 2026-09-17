/**
 * PMS Page Chrome — role-aware dashboard navigation on every workspace page.
 */
const PMSPageChrome = (() => {
  const ICONS_HREF = 'https://cdn.jsdelivr.net/npm/@flaticon/flaticon-uicons@3.3.1/css/regular/rounded.css';
  const SOLID_ICONS_HREF = 'https://cdn.jsdelivr.net/npm/@flaticon/flaticon-uicons@3.3.1/css/solid/rounded.css';

  function detectBasePath() {
    return location.pathname.includes('/forms/') ? '../' : '';
  }

  function ensureStyles(basePath) {
    const css = `${basePath}css/page-chrome.css`;
    if (!document.querySelector(`link[href="${css}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = css;
      document.head.appendChild(link);
    }
    [ICONS_HREF, SOLID_ICONS_HREF].forEach((href) => {
      if (document.querySelector(`link[href="${href}"]`)) return;
      const icons = document.createElement('link');
      icons.rel = 'stylesheet';
      icons.href = href;
      document.head.appendChild(icons);
    });
  }

  function getSessionUser() {
    if (typeof PMSStorage !== 'undefined') {
      const session = PMSStorage.getSession?.();
      if (session) {
        return PMSStorage.getUserById?.(session.id) || session;
      }
    }
    try {
      const raw = sessionStorage.getItem('pms_session');
      if (raw) return JSON.parse(raw);
    } catch (_) { /* ignore */ }
    return null;
  }

  function resolveDashboardHref(basePath, panel) {
    const user = getSessionUser();
    const role = user?.role;
    let dash = typeof PMSAuth !== 'undefined' ? PMSAuth.getDashboardForRole(role) : '';
    if (!dash || dash === 'index.html') {
      if (role) dash = typeof PMSAuth !== 'undefined' ? PMSAuth.getDashboardHub?.() || 'dashboard.html' : 'dashboard.html';
      else return `${basePath}index.html`;
    }
    const url = `${basePath}${dash}`;
    return panel ? `${url}?panel=${encodeURIComponent(panel)}` : url;
  }

  function resolveDashboardLabel() {
    const user = getSessionUser();
    if (typeof PMSAuth !== 'undefined' && PMSAuth.getDashboardLabelForRole) {
      return PMSAuth.getDashboardLabelForRole(user?.role);
    }
    return 'Dashboard';
  }

  function renderButton(href, label, options = {}) {
    const compact = options.compact ? ' pms-dashboard-btn--compact' : '';
    const variant = options.variant ? ` pms-dashboard-btn--${options.variant}` : '';
    if (options.variant === 'structured') {
      return `<a href="${href}" class="pms-dashboard-btn pms-dashboard-btn--structured${compact}" aria-label="Return to ${label}">
        <span class="pms-dashboard-btn__icon-box" aria-hidden="true"><i class="fi fi-rr-dashboard"></i></span>
        <span class="pms-dashboard-btn__label">${label}</span>
      </a>`;
    }
    return `<a href="${href}" class="pms-dashboard-btn${compact}${variant}" aria-label="Return to ${label}">
      <i class="fi fi-rr-dashboard" aria-hidden="true"></i>
      <span>${label}</span>
    </a>`;
  }

  function upgradeLink(el, href, label, options = {}) {
    el.href = href;
    el.classList.add('pms-dashboard-btn');
    el.setAttribute('aria-label', `Return to ${label}`);
    if (options.variant === 'structured') {
      el.classList.add('pms-dashboard-btn--structured');
      el.innerHTML = `<span class="pms-dashboard-btn__icon-box" aria-hidden="true"><i class="fi fi-rr-dashboard"></i></span><span class="pms-dashboard-btn__label" data-pms-dashboard-label>${label}</span>`;
      return;
    }
    const textEl = el.querySelector('[data-pms-dashboard-label]') || el.querySelector('span:not(.sr-only):not(.pms-dashboard-btn__icon-box)');
    if (textEl) textEl.textContent = label;
    else if (!el.querySelector('.fi-rr-dashboard')) {
      el.innerHTML = `<i class="fi fi-rr-dashboard" aria-hidden="true"></i><span data-pms-dashboard-label>${label}</span>`;
    } else if (textEl) {
      textEl.textContent = label;
    } else {
      el.insertAdjacentHTML('beforeend', `<span data-pms-dashboard-label>${label}</span>`);
    }
  }

  function mountPlaceholder(el, basePath, label) {
    if (el.dataset.pmsDashboardMounted) return;
    el.dataset.pmsDashboardMounted = '1';
    const panel = el.dataset.pmsDashboardPanel || '';
    const href = resolveDashboardHref(basePath, panel);
    const compact = el.dataset.pmsDashboardCompact === 'true';
    const variant = el.dataset.pmsDashboardVariant || '';
    const displayLabel = variant === 'structured' ? 'Dashboard' : label;

    if (el.tagName === 'A') {
      upgradeLink(el, href, displayLabel, { variant });
      if (compact) el.classList.add('pms-dashboard-btn--compact');
      if (variant && variant !== 'structured') el.classList.add(`pms-dashboard-btn--${variant}`);
      return;
    }

    el.innerHTML = renderButton(href, displayLabel, { compact, variant });
  }

  function wireLegacy(basePath, label) {
    const selectors = ['#back-link', '#btn-back-dash', '#btn-dashboard', '.back-link', '.back-bar a', '.back-dash'];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (el.closest('[data-pms-dashboard-btn]') && el !== document.querySelector('[data-pms-dashboard-btn]')) return;
        const panel = el.dataset?.pmsDashboardPanel || el.closest('[data-pms-dashboard-panel]')?.dataset.pmsDashboardPanel || '';
        const href = resolveDashboardHref(basePath, panel);
        upgradeLink(el, href, label);
      });
    });
  }

  function init(options = {}) {
    const basePath = options.basePath ?? detectBasePath();
    ensureStyles(basePath);
    const label = resolveDashboardLabel();
    document.querySelectorAll('[data-pms-dashboard-btn]').forEach((el) => mountPlaceholder(el, basePath, label));
    wireLegacy(basePath, label);
  }

  function getDashboardHref(basePath, panel) {
    return resolveDashboardHref(basePath ?? detectBasePath(), panel);
  }

  return { init, getDashboardHref, renderButton, detectBasePath, ensureStyles };
})();
