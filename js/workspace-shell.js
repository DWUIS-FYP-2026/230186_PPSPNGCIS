/**
 * PMS Workspace Shell — page header, role themes, breadcrumbs.
 * Navigation lives in the sidebar only (no duplicate menus on the page).
 */
const PMSWorkspace = (() => {
  const ROLE_THEME = {
    'System Administrator': 'theme-admin',
    'PNGCS Parole Clerk': 'theme-corrections',
    'CS Parole Officer': 'theme-corrections',
    'Jail Commander': 'theme-corrections',
    'DJAG Parole Clerk': 'theme-djag',
    'DJAG Secretary': 'theme-djag',
    'Doctor': 'theme-board',
    'CS Commissioner': 'theme-corrections',
    'Parole Board Member': 'theme-board',
  };

  let currentUser = null;

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }

  function applyRoleTheme(role) {
    document.body.classList.remove('theme-admin', 'theme-corrections', 'theme-djag', 'theme-board');
    const theme = ROLE_THEME[role] || 'theme-admin';
    document.body.classList.add(theme);
  }

  function tickDate() {
    const el = document.getElementById('workspace-date');
    if (!el) return;
    const now = new Date();
    const text = now.toLocaleDateString('en-PG', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
    el.textContent = text;
    el.setAttribute('datetime', now.toISOString());
  }

  function ensureHeaderChrome(header, title, subtitle, subtitleId) {
    if (!header.querySelector('#sidebar-mobile-toggle')) {
      header.insertAdjacentHTML('afterbegin', `
        <button type="button" class="sidebar-mobile-toggle" id="sidebar-mobile-toggle" aria-label="Open navigation menu">
          <i class="fi fi-rr-menu-burger" aria-hidden="true"></i><span>Menu</span>
        </button>`);
    }
    if (!header.querySelector('.workspace-header__primary')) {
      header.insertAdjacentHTML('beforeend', `
        <div class="workspace-header__primary">
          <div class="workspace-header__titles">
            <h1 id="panel-title">${esc(title)}</h1>
            <p id="${subtitleId}">${esc(subtitle)}</p>
          </div>
        </div>`);
    }
    if (!header.querySelector('.workspace-header__tools')) {
      header.insertAdjacentHTML('beforeend', `
        <div class="workspace-header__tools">
          <time class="workspace-date" id="workspace-date"></time>
          <label class="workspace-search">
            <i class="fi fi-rr-search" aria-hidden="true"></i>
            <input type="search" id="workspace-search" placeholder="Search records…" aria-label="Search records">
          </label>
        </div>`);
    }
  }

  function upgradeHeader(user) {
    let header = document.querySelector('.workspace-header');
    const legacy = document.querySelector('.command-bar, .topbar:not(.workspace-header)');

    const titleEl = document.getElementById('panel-title') || legacy?.querySelector('h1');
    const subtitleEl = document.getElementById('panel-subtitle') || document.getElementById('page-subtitle') || legacy?.querySelector('p');
    const title = titleEl?.textContent?.trim() || 'Dashboard';
    const subtitle = subtitleEl?.textContent?.trim() || '';
    const subtitleId = subtitleEl?.id === 'page-subtitle' ? 'page-subtitle' : 'panel-subtitle';

    if (!header && legacy) {
      legacy.classList.add('workspace-header');
      legacy.classList.remove('command-bar', 'topbar');
      header = legacy;
      header.innerHTML = '';
    }

    if (!header) return;

    ensureHeaderChrome(header, title, subtitle, subtitleId);
    header.dataset.workspaceReady = 'true';
    tickDate();
    window.setInterval(tickDate, 60000);
  }

  function syncNotifBadge(count) {
    document.querySelectorAll('.nav-notif-badge').forEach((el) => {
      el.textContent = count;
      el.classList.toggle('hidden', !count);
      el.classList.toggle('nav-notif-badge--active', count > 0);
      el.setAttribute('aria-label', count ? `${count} unread notifications` : 'No unread notifications');
    });
  }

  function updateBreadcrumb(title) {
    const leaf = document.getElementById('breadcrumb-leaf');
    if (leaf && title) leaf.textContent = title;
  }

  function bindGlobalSearch() {
    const input = document.getElementById('workspace-search');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const q = input.value.trim().toLowerCase();
      const tableSearch = document.querySelector('.search-input:not([id="workspace-search"])');
      if (tableSearch) {
        tableSearch.value = input.value;
        tableSearch.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (!q) return;
      document.querySelectorAll('.inbox-item, .activity-item, .data-table tbody tr').forEach((row) => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
      });
    });
  }

  function init(user) {
    if (!user) return;
    currentUser = user;
    applyRoleTheme(user.role);
    upgradeHeader(user);
    bindGlobalSearch();
    if (typeof PMSSidebar !== 'undefined') PMSSidebar.bindMobileToggle?.();
    if (typeof PMSGlobalSearch !== 'undefined') PMSGlobalSearch.bind(user);
    PMSUI?.updateNotifBadge?.(user);
  }

  return { init, syncNotifBadge, updateBreadcrumb, applyRoleTheme };
})();
