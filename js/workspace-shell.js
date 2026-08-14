/**
 * PMS Workspace Shell — header, quick actions toolbar, role themes, breadcrumbs.
 */
const PMSWorkspace = (() => {
  const ROLE_THEME = {
    'System Administrator': 'theme-admin',
    'PNGCS Parole Clerk': 'theme-corrections',
    'DJAG Parole Clerk': 'theme-djag',
    'Jail Commander': 'theme-corrections',
    'Parole Board Member': 'theme-board',
  };

  const QUICK_ACTIONS = {
    'System Administrator': [
      { icon: 'bi-person-plus', label: 'Add User', goto: 'users', action: 'add-user' },
      { icon: 'bi-building', label: 'Institutions', href: 'institutions.html' },
      { icon: 'bi-search', label: 'Prisoners', goto: 'prisoners' },
      { icon: 'bi-journal-text', label: 'Audit Log', goto: 'audit' },
      { icon: 'bi-bar-chart', label: 'Reports', goto: 'reports' },
      { icon: 'bi-gear', label: 'Settings', goto: 'settings' },
    ],
    'PNGCS Parole Clerk': [
      { icon: 'bi-file-earmark-plus', label: 'New Application', goto: 'applications', action: 'btn-new-app' },
      { icon: 'bi-person-plus', label: 'Register Prisoner', href: 'prisoner-edit.html' },
      { icon: 'bi-check-circle', label: 'Eligibility', goto: 'eligibility' },
      { icon: 'bi-files', label: 'Forms', goto: 'applications' },
      { icon: 'bi-bell', label: 'Notifications', goto: 'notifications' },
      { icon: 'bi-bar-chart', label: 'Reports', goto: 'reports' },
    ],
    'DJAG Parole Clerk': [
      { icon: 'bi-file-earmark-check', label: 'Review Applications', goto: 'applications' },
      { icon: 'bi-calendar-event', label: 'Hearings', goto: 'hearings' },
      { icon: 'bi-file-medical', label: 'Pre-Parole Reports', goto: 'reports' },
      { icon: 'bi-bell', label: 'Notifications', goto: 'notifications' },
    ],
    'Jail Commander': [
      { icon: 'bi-building', label: 'Institution', href: 'institutions.html' },
      { icon: 'bi-person-vcard', label: 'Prisoners', goto: 'prisoners' },
      { icon: 'bi-file-earmark-text', label: 'Applications', goto: 'applications' },
      { icon: 'bi-bell', label: 'Alerts', goto: 'notifications' },
    ],
    'Parole Board Member': [
      { icon: 'bi-calendar-event', label: 'Hearings', goto: 'hearings' },
      { icon: 'bi-hammer', label: 'Decisions', goto: 'decisions' },
      { icon: 'bi-file-earmark-text', label: 'Applications', goto: 'applications' },
    ],
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
    const initial = (user?.firstName || user?.username || 'U').charAt(0).toUpperCase();

    const actionsExtra = header.querySelector('.inst-topbar-actions');
    const actionsHtml = actionsExtra ? actionsExtra.outerHTML : '';

    header.className = 'workspace-header' + (header.classList.contains('inst-topbar') ? ' inst-topbar' : '');
    header.dataset.workspaceReady = 'true';
    header.innerHTML = `
      <div class="workspace-header__primary">
        <nav class="workspace-breadcrumb" aria-label="Breadcrumb">
          <span>PMS</span><i class="bi bi-chevron-right" aria-hidden="true"></i><span id="breadcrumb-leaf">${esc(title)}</span>
        </nav>
        <div class="workspace-header__titles">
          <h1 id="panel-title">${esc(title)}</h1>
          <p id="${subtitleEl?.id === 'page-subtitle' ? 'page-subtitle' : 'panel-subtitle'}">${esc(subtitle)}</p>
        </div>
      </div>
      <div class="workspace-header__tools">
        <time class="workspace-date" id="workspace-date"></time>
        <label class="workspace-search">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input type="search" id="workspace-search" placeholder="Search records…" aria-label="Search records">
        </label>
        <div class="workspace-notif-wrap">
          <button type="button" class="workspace-icon-btn" id="workspace-notif-btn" aria-label="Notifications" aria-expanded="false" aria-haspopup="true">
            <i class="bi bi-bell" aria-hidden="true"></i>
            <span class="workspace-notif-badge hidden" id="header-notif-badge">0</span>
          </button>
          <div class="workspace-notif-dropdown hidden" id="workspace-notif-dropdown" role="menu">
            <div class="workspace-notif-dropdown__header">
              <strong>Notifications</strong>
              <button type="button" class="btn-link btn-sm" data-mark-all-read-dropdown>Mark all read</button>
            </div>
            <div class="workspace-notif-dropdown__list" id="workspace-notif-dropdown-list"></div>
            <button type="button" class="workspace-notif-dropdown__footer" data-goto-notifications>View all notifications</button>
          </div>
        </div>
        <div class="workspace-avatar" id="header-user-avatar" title="${esc(`${user?.firstName || ''} ${user?.lastName || ''}`.trim())}">${esc(initial)}</div>
        ${actionsHtml}
      </div>`;

    tickDate();
    window.setInterval(tickDate, 60000);

    document.getElementById('workspace-notif-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNotifDropdown(user);
    });

    document.querySelector('[data-goto-notifications]')?.addEventListener('click', () => {
      closeNotifDropdown();
      document.querySelector('.sidebar-nav .nav-item[data-panel="notifications"], .sidebar-nav .nav-item[data-nav-id="notifications"]')?.click();
    });

    document.querySelector('[data-mark-all-read-dropdown]')?.addEventListener('click', () => {
      if (!user) return;
      PMSStorage.markAllNotificationsRead(user, user);
      renderNotifDropdown(user);
      PMSUI?.updateNotifBadge?.(user);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.workspace-notif-wrap')) closeNotifDropdown();
    });
  }

  function toggleNotifDropdown(user) {
    const dropdown = document.getElementById('workspace-notif-dropdown');
    const btn = document.getElementById('workspace-notif-btn');
    if (!dropdown || !btn) return;
    dropdown.classList.toggle('hidden');
    const visible = !dropdown.classList.contains('hidden');
    btn.setAttribute('aria-expanded', String(visible));
    if (visible) renderNotifDropdown(user);
  }

  function closeNotifDropdown() {
    document.getElementById('workspace-notif-dropdown')?.classList.add('hidden');
    document.getElementById('workspace-notif-btn')?.setAttribute('aria-expanded', 'false');
  }

  function renderNotifDropdown(user) {
    const listEl = document.getElementById('workspace-notif-dropdown-list');
    if (!listEl || !user) return;
    const list = PMSStorage.getNotificationsForUser(user)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 6);
    listEl.innerHTML = list.length
      ? list.map((n) => {
        const link = PMSUI?.resolveNotificationLink?.(n, user);
        return `<button type="button" class="workspace-notif-item${n.read ? '' : ' unread'}" data-notif-id="${esc(n.id)}" data-notif-link="${esc(link || '')}">
          <span class="workspace-notif-item__title">${esc(n.title)}</span>
          <span class="workspace-notif-item__meta">${esc(n.message.slice(0, 72))}${n.message.length > 72 ? '…' : ''}</span>
        </button>`;
      }).join('')
      : '<p class="empty-state">No notifications.</p>';

    listEl.querySelectorAll('.workspace-notif-item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.dataset.notifId;
        if (id) PMSStorage.markNotificationRead(id, user);
        closeNotifDropdown();
        PMSUI?.updateNotifBadge?.(user);
        const href = item.dataset.notifLink;
        if (href) window.location.href = href;
        else document.querySelector('.sidebar-nav .nav-item[data-panel="notifications"]')?.click();
      });
    });
  }

  function injectQuickActions(user) {
    if (document.getElementById('workspace-quick-actions')) return;
    const main = document.querySelector('.main-content');
    if (!main) return;
    if (document.querySelector('#panel-overview .quick-actions')) return;

    const actions = QUICK_ACTIONS[user?.role] || QUICK_ACTIONS['System Administrator'];
    const bar = document.createElement('nav');
    bar.id = 'workspace-quick-actions';
    bar.className = 'workspace-quick-actions no-print';
    bar.setAttribute('aria-label', 'Quick actions');
    bar.innerHTML = `
      <div class="workspace-quick-actions__label"><i class="bi bi-lightning-charge" aria-hidden="true"></i> Quick Actions</div>
      <div class="workspace-quick-actions__items">${actions.map((a) => {
        const attrs = [
          'type="button"',
          'class="workspace-quick-action"',
          a.goto ? `data-goto="${a.goto}"` : '',
          a.action ? `data-action="${a.action}"` : '',
          a.href ? `data-href="${a.href}"` : '',
        ].filter(Boolean).join(' ');
        return `<button ${attrs}><i class="bi ${a.icon}" aria-hidden="true"></i><span>${esc(a.label)}</span></button>`;
      }).join('')}</div>`;

    const header = main.querySelector('.workspace-header, .command-bar, .topbar');
    if (header) header.insertAdjacentElement('afterend', bar);
    else main.prepend(bar);

    bar.querySelectorAll('.workspace-quick-action').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.href) {
          window.location.href = btn.dataset.href;
          return;
        }
        if (btn.dataset.goto) {
          document.querySelector(`.sidebar-nav .nav-item[data-panel="${btn.dataset.goto}"]`)?.click()
            || document.querySelector(`[data-goto="${btn.dataset.goto}"]`)?.click();
          if (btn.dataset.action) document.getElementById(btn.dataset.action)?.click();
        }
      });
    });
  }

  function syncNotifBadge(count) {
    document.querySelectorAll('#header-notif-badge, .nav-notif-badge').forEach((el) => {
      el.textContent = count;
      el.classList.toggle('hidden', !count);
    });
    const dropdown = document.getElementById('workspace-notif-dropdown');
    if (currentUser && dropdown && !dropdown.classList.contains('hidden')) {
      renderNotifDropdown(currentUser);
    }
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
    injectQuickActions(user);
    bindGlobalSearch();
    PMSUI?.updateNotifBadge?.(user);
  }

  return { init, syncNotifBadge, updateBreadcrumb, applyRoleTheme, renderNotifDropdown };
})();
