/**
 * PMS Page Chrome — role-aware dashboard navigation on every workspace page.
 */
const PMSPageChrome = (() => {
  const ICONS_HREF = 'https://cdn.jsdelivr.net/npm/@flaticon/flaticon-uicons@3.3.1/css/regular/rounded.css';

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
    if (!document.querySelector(`link[href="${ICONS_HREF}"]`)) {
      const icons = document.createElement('link');
      icons.rel = 'stylesheet';
      icons.href = ICONS_HREF;
      document.head.appendChild(icons);
    }
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
    return `<a href="${href}" class="pms-dashboard-btn${compact}${variant}" aria-label="Return to ${label}">
      <i class="fi fi-rr-dashboard" aria-hidden="true"></i>
      <span>${label}</span>
    </a>`;
  }

  function upgradeLink(el, href, label) {
    el.href = href;
    el.classList.add('pms-dashboard-btn');
    el.setAttribute('aria-label', `Return to ${label}`);
    const textEl = el.querySelector('[data-pms-dashboard-label]') || el.querySelector('span:not(.sr-only)');
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

    if (el.tagName === 'A') {
      upgradeLink(el, href, label);
      if (compact) el.classList.add('pms-dashboard-btn--compact');
      if (variant) el.classList.add(`pms-dashboard-btn--${variant}`);
      return;
    }

    el.innerHTML = renderButton(href, label, { compact, variant });
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
