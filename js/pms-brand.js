/**
 * PMS Brand — dual-agency logo markup (matches index.html landing page).
 */
const PMSBrand = (() => {
  const PNGCS_LOGO = 'PNG CS Logo.jpg';
  const DJAG_LOGO = 'djag_logo.jpg';

  function logoBadgesInner(basePath = '') {
    return `<span class="pms-logo-badge pms-logo-badge--pngcs"><img src="${basePath}images/${PNGCS_LOGO}" alt="PNG Correctional Service"></span>
      <span class="pms-logo-divider"></span>
      <span class="pms-logo-badge pms-logo-badge--djag"><img src="${basePath}images/${DJAG_LOGO}" alt="Department of Justice and Attorney General"></span>`;
  }

  function logoBadgesHtml(basePath = '', compact = false) {
    const compactClass = compact ? ' pms-brand-logos--compact' : '';
    return `<div class="pms-brand-logos${compactClass}" aria-hidden="true">${logoBadgesInner(basePath)}</div>`;
  }

  function mountInto(el, basePath = '', compact = false) {
    if (!el) return;
    el.dataset.pmsBrandMounted = '1';
    el.classList.add('pms-brand-logos');
    if (compact) el.classList.add('pms-brand-logos--compact');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = logoBadgesInner(basePath);
  }

  function upgradeCommandBadges(root = document) {
    root.querySelectorAll('.command-bar__badges').forEach((el) => mountInto(el, '', false));
  }

  return { logoBadgesHtml, logoBadgesInner, mountInto, upgradeCommandBadges, PNGCS_LOGO, DJAG_LOGO };
})();
