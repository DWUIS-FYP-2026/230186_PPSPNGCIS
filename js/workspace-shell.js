/**
 * PMS Workspace Shell — page header, role themes, breadcrumbs.
 * Navigation lives in the sidebar only (no duplicate menus on the page).
 */
const PMSWorkspace = (() => {
  const ROLE_THEME = {
    'System Administrator': 'theme-admin',
    'PNGCS Parole Clerk': 'theme-corrections',
    'CS Parole Officer': 'theme-corrections',
    'DJAG Parole Clerk': 'theme-djag',
    'DJAG Secretary': 'theme-djag',
    'Jail Commander': 'theme-corrections',
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
    const el = document.getElementById('workspace-date') || document.getElementById('command-datetime');
    if (!el) return;
    const now = new Date();
    const text = now.toLocaleDateString('en-PG', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
    if (el.tagName === 'TIME') {
      el.textContent = text;
      el.setAttribute('datetime', now.toISOString());
    } else {
      el.textContent = text;
    }
  }

  function upgradeHeader(user) {
    const header = document.querySelector('.workspace-header') || document.querySelector('.command-bar, .topbar');
    if (!header || header.dataset.workspaceReady) return;

    const titleEl = document.getElementById('panel-title');
    const subtitleEl = document.getElementById('panel-subtitle') || document.getElementById('page-subtitle');
    const title = titleEl?.textContent || header.querySelector('h1')?.textContent || 'Dashboard';
    const subtitle = subtitleEl?.textContent || '';
    const actionsExtra = header.querySelector('.inst-topbar-actions');
    const actionsHtml = actionsExtra ? actionsExtra.outerHTML : '';

    header.className = 'workspace-header' + (header.classList.contains('inst-topbar') ? ' inst-topbar' : '');
    header.dataset.workspaceReady = 'true';
    header.innerHTML = `
      <button type="button" class="sidebar-mobile-toggle" id="sidebar-mobile-toggle" aria-label="Open navigation menu">
        <i class="fi fi-rr-menu-burger" aria-hidden="true"></i><span>Menu</span>
      </button>
      <div class="workspace-header__primary">
        <div class="workspace-header__titles">
          <h1 id="panel-title">${esc(title)}</h1>
          <p id="${subtitleEl?.id === 'page-subtitle' ? 'page-subtitle' : 'panel-subtitle'}">${esc(subtitle)}</p>
        </div>
      </div>
      <div class="workspace-header__tools">
        <time class="workspace-date" id="workspace-date"></time>
        <label class="workspace-search">
          <i class="fi fi-rr-search" aria-hidden="true"></i>
          <input type="search" id="workspace-search" placeholder="Search records…" aria-label="Search records">
        </label>
        ${actionsHtml}
      </div>`;

    tickDate();
    window.setInterval(tickDate, 60000);
  }

  function syncNotifBadge(count) {
    document.querySelectorAll('.nav-notif-badge').forEach((el) => {
      el.textContent = count;
      el.classList.toggle('hidden', !count);
    });
  }

  function updateBreadcrumb(title) {
    const leaf = document.getElementById('breadcrumb-leaf');
    if (leaf && title) leaf.textContent = title;
  }

  function bindGlobalSearch() {
    const input = document.getElementById('workspace-search');
    if (!input) return;
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
    if (typeof PMSGlobalSearch !== 'undefined') PMSGlobalSearch.bind(user);
    PMSUI?.updateNotifBadge?.(user);
  }

  return { init, syncNotifBadge, updateBreadcrumb, applyRoleTheme };
})();
