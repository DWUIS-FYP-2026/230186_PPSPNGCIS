/**
 * PMS shared script loader — one place for dashboard and form dependencies.
 */
const PMSCore = (() => {
  const DASHBOARD_CHAIN = [
    'workspace-shell.js',
    'id-generator.js',
    'eligibility-engine.js',
    'storage.js',
    'pms-validation.js',
    'global-search.js',
    'form-workflow.js',
    'auth.js',
    'rbac.js',
    'workflow.js',
    'forms-engine.js',
    'pms-brand.js',
    'sidebar-nav.js',
    'ui-shared.js',
    'page-chrome.js',
    'reports-engine.js',
    'dashboard-calendar.js',
  ];

  const FORM_CHAIN = [
    'id-generator.js',
    'storage.js',
    'auth.js',
    'rbac.js',
    'ui-shared.js',
    'page-chrome.js',
    'pms-validation.js',
    'form1-validation.js',
    'form-workflow.js',
    'forms-engine.js',
    'pms-brand.js',
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.body.appendChild(el);
    });
  }

  async function loadChain(basePath, scripts) {
    for (const file of scripts) {
      await loadScript(`${basePath}${file}`);
    }
  }

  function ensureStylesheet(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  async function bootDashboard(roleScript, extraScripts = []) {
    try {
      ensureStylesheet('css/page-chrome.css');
      await loadChain('js/', [...DASHBOARD_CHAIN, ...extraScripts]);
      if (typeof PMSStorage !== 'undefined') await PMSStorage.ensureLoaded();
      PMSBrand?.upgradeCommandBadges?.(document, '');
      PMSBrand?.wireLogoFallbacks?.(document);
      PMSPageChrome?.init?.({ basePath: '' });
      if (roleScript) await loadScript(`js/${roleScript}`);
    } catch (err) {
      console.error('Dashboard boot failed:', err);
      const msg = document.createElement('div');
      msg.className = 'cal-error';
      msg.style.margin = '2rem';
      msg.textContent = `Failed to load dashboard: ${err.message || 'Unknown error'}. Try refreshing the page.`;
      document.body.prepend(msg);
      throw err;
    }
  }

  async function bootForm(extraScripts = []) {
    try {
      ensureStylesheet('../css/page-chrome.css');
      await loadChain('../js/', [...FORM_CHAIN, ...extraScripts]);
      if (typeof PMSStorage !== 'undefined') await PMSStorage.ensureLoaded();
      PMSBrand?.upgradeCommandBadges?.(document, '../');
      PMSBrand?.wireLogoFallbacks?.(document);
      PMSPageChrome?.init?.({ basePath: '../' });
    } catch (err) {
      console.error('Form boot failed:', err);
      throw err;
    }
  }

  return { bootDashboard, bootForm, loadChain, DASHBOARD_CHAIN, FORM_CHAIN };
})();
