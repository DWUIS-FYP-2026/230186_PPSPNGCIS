/**
 * PMS Brand — dual-agency logo markup (matches index.html landing page).
 */
const PMSBrand = (() => {
  const PNGCS_LOGO = 'PNG CS Logo.jpg';
  const DJAG_LOGO = 'djag_logo.jpg';
  const PNGCS_FALLBACK = 'NationalEmblem.jpg';

  function detectBasePath() {
    return location.pathname.includes('/forms/') ? '../' : '';
  }

  function logoBadgesInner(basePath = '') {
    const png = `${basePath}images/${PNGCS_LOGO}`;
    const pngFallback = `${basePath}images/${PNGCS_FALLBACK}`;
    const djag = `${basePath}images/${DJAG_LOGO}`;
    return `<span class="pms-logo-badge pms-logo-badge--pngcs"><img src="${png}" alt="PNG Correctional Service" data-pms-logo-fallback="${pngFallback}"></span>
      <span class="pms-logo-divider" aria-hidden="true"></span>
      <span class="pms-logo-badge pms-logo-badge--djag"><img src="${djag}" alt="Department of Justice and Attorney General"></span>`;
  }

  function logoBadgesHtml(basePath = '', compact = false) {
    const compactClass = compact ? ' pms-brand-logos--compact' : '';
    return `<div class="pms-brand-logos${compactClass}" aria-hidden="true">${logoBadgesInner(basePath)}</div>`;
  }

  function mountInto(el, basePath = '', compact = false) {
    if (!el || el.querySelector('img[src*="images/"]')) return;
    el.dataset.pmsBrandMounted = '1';
    el.classList.add('pms-brand-logos');
    if (compact) el.classList.add('pms-brand-logos--compact');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = logoBadgesInner(basePath);
    wireLogoFallbacks(el);
  }

  function wireLogoFallbacks(root = document) {
    root.querySelectorAll('img[data-pms-logo-fallback]').forEach((img) => {
      if (img.dataset.pmsFallbackWired) return;
      img.dataset.pmsFallbackWired = '1';
      img.addEventListener('error', () => {
        const fallback = img.getAttribute('data-pms-logo-fallback');
        if (fallback && img.src !== fallback) img.src = fallback;
      }, { once: true });
    });
  }

  function upgradeCommandBadges(root = document, basePath) {
    const bp = basePath ?? detectBasePath();
    root.querySelectorAll('[data-pms-brand-badges], .command-bar__badges').forEach((el) => {
      mountInto(el, bp, el.dataset.pmsBrandCompact === 'true');
    });
    wireLogoFallbacks(root);
  }

  return { logoBadgesHtml, logoBadgesInner, mountInto, upgradeCommandBadges, wireLogoFallbacks, detectBasePath, PNGCS_LOGO, DJAG_LOGO };
})();
