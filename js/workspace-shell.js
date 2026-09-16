/**
 * PMS Workspace Shell — sticky header, search, notification bell, role themes.
 * Navigation lives in the sidebar (sidebar-nav.js).
 */
const PMSWorkspace = (() => {
  const ROLE_THEME = {
    'System Administrator': 'theme-admin',
    'CS Parole Clerk': 'theme-corrections',
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

  function userInitial(user) {
    return (user?.firstName || user?.username || '?').charAt(0).toUpperCase();
  }

  function ensureHeaderBar(header) {
    let bar = header.querySelector('.workspace-header__bar');
    if (bar) return bar;

    const staleTools = header.querySelector('.workspace-header__tools');
    if (staleTools && !staleTools.querySelector('.header-actions')) staleTools.remove();

    bar = document.createElement('div');
    bar.className = 'workspace-header__bar';

    const primary = header.querySelector('.workspace-header__primary');
    const tools = header.querySelector('.workspace-header__tools');
    const mobileToggle = header.querySelector('#sidebar-mobile-toggle');

    if (mobileToggle) bar.appendChild(mobileToggle);
    bar.insertAdjacentHTML('beforeend', `
      <div class="workspace-header__search-wrap">
        <div class="workspace-search-bar">
          <input type="search" id="workspace-search" placeholder="Search records…" aria-label="Search records">
          <button type="button" class="workspace-search-btn" id="workspace-search-btn" aria-label="Search">
            <i class="fi fi-rr-search" aria-hidden="true"></i>
          </button>
        </div>
      </div>`);

    if (tools) {
      bar.appendChild(tools);
    } else {
      bar.insertAdjacentHTML('beforeend', `
        <div class="workspace-header__tools">
          <div class="header-actions">
            <div class="header-action-wrap">
              <button type="button" class="header-action-btn" id="workspace-notif-bell" aria-label="Open notifications">
                <i class="fi fi-rr-bell" aria-hidden="true"></i>
                <span class="header-badge header-badge--danger nav-notif-badge hidden" id="header-notif-badge">0</span>
              </button>
            </div>
            <button type="button" class="header-avatar-btn" id="workspace-avatar-btn" aria-label="Open profile">
              <span class="header-avatar" id="header-user-avatar">${esc(userInitial(currentUser))}</span>
            </button>
          </div>
        </div>`);
    }

    if (primary) {
      header.insertBefore(bar, primary);
    } else {
      header.prepend(bar);
    }
    return bar;
  }

  function ensureHeaderChrome(header, title, subtitle, subtitleId) {
    if (!header.querySelector('#sidebar-mobile-toggle')) {
      header.insertAdjacentHTML('afterbegin', `
        <button type="button" class="sidebar-mobile-toggle" id="sidebar-mobile-toggle" aria-label="Open navigation menu">
          <i class="fi fi-rr-menu-burger" aria-hidden="true"></i>
          <span class="sidebar-mobile-toggle__label">Menu</span>
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

    ensureHeaderBar(header);

    if (!header.querySelector('#workspace-notif-bell')) {
      const tools = header.querySelector('.workspace-header__tools');
      if (tools && !tools.querySelector('.header-actions')) {
        tools.innerHTML = `
          <div class="header-actions">
            <div class="header-action-wrap">
              <button type="button" class="header-action-btn" id="workspace-notif-bell" aria-label="Open notifications">
                <i class="fi fi-rr-bell" aria-hidden="true"></i>
                <span class="header-badge header-badge--danger nav-notif-badge hidden" id="header-notif-badge">0</span>
              </button>
            </div>
            <button type="button" class="header-avatar-btn" id="workspace-avatar-btn" aria-label="Open profile">
              <span class="header-avatar" id="header-user-avatar">${esc(userInitial(currentUser))}</span>
            </button>
          </div>`;
      }
    }

    const avatarEl = header.querySelector('#header-user-avatar');
    if (avatarEl && currentUser) avatarEl.textContent = userInitial(currentUser);
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
  }

  function syncNotifBadge(count) {
    document.querySelectorAll('.nav-notif-badge, #header-notif-badge').forEach((el) => {
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

  function runSearch() {
    const input = document.getElementById('workspace-search');
    if (!input) return;
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
  }

  function bindGlobalSearch() {
    const input = document.getElementById('workspace-search');
    const btn = document.getElementById('workspace-search-btn');
    if (input && !input.dataset.bound) {
      input.dataset.bound = '1';
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runSearch();
        }
      });
    }
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', runSearch);
    }
  }

  function bindHeaderActions(user) {
    if (!user) return;

    const avatarBtn = document.getElementById('workspace-avatar-btn');

    if (typeof PMSUI !== 'undefined') {
      PMSUI.bindNotificationBell?.(user, {
        toggleBtnId: 'workspace-notif-bell',
        onOpen: () => PMSUI.updateNotifBadge(user),
      });
    }

    if (avatarBtn && !avatarBtn.dataset.bound) {
      avatarBtn.dataset.bound = '1';
      avatarBtn.addEventListener('click', () => {
        const profileBtn = document.querySelector('.sidebar-nav .nav-item[data-panel="profile"]');
        if (profileBtn) profileBtn.click();
        else if (typeof PMSUI !== 'undefined') PMSUI.switchPanel?.('profile');
      });
    }
  }

  function init(user) {
    if (!user) return;
    currentUser = user;
    applyRoleTheme(user.role);
    upgradeHeader(user);
    bindGlobalSearch();
    bindHeaderActions(user);
    if (typeof PMSSidebar !== 'undefined') PMSSidebar.bindMobileToggle?.();
    if (typeof PMSGlobalSearch !== 'undefined') PMSGlobalSearch.bind(user);
    PMSUI?.updateNotifBadge?.(user);
  }

  return { init, syncNotifBadge, updateBreadcrumb, applyRoleTheme };
})();
