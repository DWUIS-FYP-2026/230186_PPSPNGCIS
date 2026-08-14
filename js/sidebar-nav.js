/**
 * PMS — Shared collapsible sidebar navigation (RBAC-aware).
 */
const PMSSidebar = (() => {
  const BREAKPOINT = 1024;
  const STORAGE_KEY = 'pms_sidebar_collapsed';
  const SECTIONS_KEY = 'pms_sidebar_sections';

  const QUICK_ACCESS = {
    'System Administrator': ['overview', 'prisoners', 'reports'],
    'PNGCS Parole Clerk': ['overview', 'prisoners', 'applications'],
    'DJAG Parole Clerk': ['overview', 'applications', 'hearings'],
    'Jail Commander': ['overview', 'prisoners', 'notifications'],
    'Parole Board Member': ['overview', 'hearings', 'decisions'],
  };

  const ROLE_BRAND = {
    'System Administrator': { logo: 'images/PNG CS Logo.jpg', subtitle: 'System Administrator', wide: false },
    'PNGCS Parole Clerk': { logo: 'images/PNG CS Logo.jpg', subtitle: 'PNGCS Parole Clerk', wide: false },
    'DJAG Parole Clerk': { logo: 'images/djag.png', subtitle: 'DJAG Parole Clerk', wide: true },
    'Jail Commander': { logo: 'images/PNG CS Logo.jpg', subtitle: 'Jail Commander', wide: false },
    'Parole Board Member': { logo: 'images/djag.png', subtitle: 'Parole Board', wide: true },
  };

  /** Menu sections for grouped navigation */
  const NAV_SECTIONS = {
    'System Administrator': [
      { label: 'Main', ids: ['overview'] },
      { label: 'Case Management', ids: ['prisoners', 'notifications'] },
      { label: 'Reports', ids: ['reports', 'audit'] },
      { label: 'Administration', ids: ['users', 'officers', 'institutions'] },
      { label: 'System', ids: ['settings', 'profile'] },
    ],
    'PNGCS Parole Clerk': [
      { label: 'Main', ids: ['overview'] },
      { label: 'Case Management', ids: ['prisoners', 'applications', 'eligibility', 'forms'] },
      { label: 'Reports', ids: ['reports', 'notifications', 'profile'] },
    ],
    'DJAG Parole Clerk': [
      { label: 'Main', ids: ['overview'] },
      { label: 'Case Management', ids: ['prisoners', 'applications', 'pre-parole', 'hearings', 'forms'] },
      { label: 'Reports', ids: ['reports', 'notifications', 'profile'] },
    ],
    'Jail Commander': [
      { label: 'Main', ids: ['overview', 'institution'] },
      { label: 'Operations', ids: ['prisoners', 'officers', 'notifications'] },
      { label: 'Reports', ids: ['reports', 'profile'] },
    ],
    'Parole Board Member': [
      { label: 'Main', ids: ['overview'] },
      { label: 'Board', ids: ['prisoners', 'hearings', 'applications', 'decisions', 'history'] },
      { label: 'Reports', ids: ['reports', 'profile'] },
    ],
  };

  /** Menu definitions — filtered by PMSRBAC.canAccessModule */
  const MENUS = {
    'System Administrator': [
      { id: 'overview', module: 'overview', panel: 'overview', label: 'Dashboard', icon: 'bi-speedometer2' },
      { id: 'users', module: 'users', panel: 'users', label: 'User Management', icon: 'bi-people' },
      { id: 'officers', module: 'users', panel: 'officers', label: 'Officer Management', icon: 'bi-person-badge' },
      { id: 'institutions', module: 'institutions', href: 'institutions.html', label: 'Correctional Institutions', icon: 'bi-building' },
      { id: 'prisoners', module: 'prisoners', panel: 'prisoners', label: 'Prisoner Records', icon: 'bi-person-lock' },
      { id: 'notifications', module: 'notifications', panel: 'notifications', label: 'Notifications', icon: 'bi-bell', badge: true },
      { id: 'reports', module: 'reports', panel: 'reports', label: 'Reports', icon: 'bi-bar-chart-line' },
      { id: 'audit', module: 'audit', panel: 'audit', label: 'Audit Logs', icon: 'bi-journal-text' },
      { id: 'settings', module: 'settings', panel: 'settings', label: 'System Settings', icon: 'bi-gear' },
      { id: 'profile', panel: 'profile', label: 'Profile', icon: 'bi-person-circle' },
    ],
    'PNGCS Parole Clerk': [
      { id: 'overview', module: 'overview', panel: 'overview', label: 'Dashboard', icon: 'bi-speedometer2' },
      { id: 'prisoners', module: 'prisoners', panel: 'prisoners', label: 'Prisoner Records', icon: 'bi-person-vcard' },
      { id: 'applications', module: 'applications', panel: 'applications', label: 'Parole Applications', icon: 'bi-file-earmark-text' },
      { id: 'eligibility', module: 'eligibility', panel: 'eligibility', label: 'Eligibility Verification', icon: 'bi-check-circle' },
      { id: 'forms', module: 'forms', panel: 'applications', label: 'Forms 1–5', icon: 'bi-files' },
      { id: 'notifications', module: 'notifications', panel: 'notifications', label: 'Notifications', icon: 'bi-bell', badge: true },
      { id: 'reports', module: 'reports', panel: 'reports', label: 'Reports', icon: 'bi-bar-chart-line' },
      { id: 'profile', panel: 'profile', label: 'Profile', icon: 'bi-person-circle' },
    ],
    'DJAG Parole Clerk': [
      { id: 'overview', module: 'overview', panel: 'overview', label: 'Dashboard', icon: 'bi-speedometer2' },
      { id: 'prisoners', module: 'prisoners', panel: 'prisoners', label: 'Prisoner Search', icon: 'bi-search' },
      { id: 'applications', module: 'applications', panel: 'applications', label: 'Application Review', icon: 'bi-file-earmark-check' },
      { id: 'pre-parole', module: 'reports', panel: 'reports', label: 'Pre-Parole Reports', icon: 'bi-file-medical' },
      { id: 'hearings', module: 'hearings', panel: 'hearings', label: 'Hearing Schedule', icon: 'bi-calendar-event' },
      { id: 'forms', module: 'forms', panel: 'applications', label: 'Forms', icon: 'bi-files' },
      { id: 'notifications', module: 'notifications', panel: 'notifications', label: 'Notifications', icon: 'bi-bell', badge: true },
      { id: 'reports', module: 'reports', panel: 'reports', label: 'Reports', icon: 'bi-bar-chart-line' },
      { id: 'profile', panel: 'profile', label: 'Profile', icon: 'bi-person-circle' },
    ],
    'Jail Commander': [
      { id: 'overview', module: 'overview', panel: 'overview', label: 'Dashboard', icon: 'bi-speedometer2' },
      { id: 'institution', module: 'institutions', href: 'institutions.html', label: 'Institution Overview', icon: 'bi-building' },
      { id: 'prisoners', module: 'prisoners', panel: 'prisoners', label: 'Prisoner Records', icon: 'bi-person-vcard' },
      { id: 'officers', module: 'officers', panel: 'officers', label: 'Officer Management', icon: 'bi-person-badge' },
      { id: 'reports', module: 'reports', panel: 'reports', label: 'Institutional Reports', icon: 'bi-bar-chart-line' },
      { id: 'notifications', module: 'notifications', panel: 'notifications', label: 'Eligibility Notifications', icon: 'bi-bell', badge: true },
      { id: 'profile', panel: 'profile', label: 'Profile', icon: 'bi-person-circle' },
    ],
    'Parole Board Member': [
      { id: 'overview', module: 'overview', panel: 'overview', label: 'Dashboard', icon: 'bi-speedometer2' },
      { id: 'prisoners', module: 'prisoners', panel: 'prisoners', label: 'Prisoner Records', icon: 'bi-person-vcard' },
      { id: 'hearings', module: 'hearings', panel: 'hearings', label: 'Hearing Schedule', icon: 'bi-calendar-event' },
      { id: 'applications', module: 'applications', panel: 'applications', label: 'Parole Applications', icon: 'bi-file-earmark-text' },
      { id: 'decisions', module: 'decisions', panel: 'decisions', label: 'Board Decisions', icon: 'bi-hammer' },
      { id: 'history', module: 'history', panel: 'history', label: 'Decision History', icon: 'bi-clock-history' },
      { id: 'reports', module: 'reports', panel: 'reports', label: 'Reports', icon: 'bi-bar-chart-line' },
      { id: 'profile', panel: 'profile', label: 'Profile', icon: 'bi-person-circle' },
    ],
  };

  let activeNavId = 'overview';
  let onNavigateCb = null;
  let linkPanels = false;
  let dashboardBase = '';

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }

  function getMenuItems(user) {
    const items = MENUS[user.role] || [];
    return items.filter((item) => {
      if (item.hidden) return false;
      if (!item.module) return true;
      return PMSRBAC.canAccessModule(user, item.module);
    });
  }

  function profileHref(user) {
    if (user.role === 'Jail Commander') {
      return `commander-details.html?id=${encodeURIComponent(user.id)}`;
    }
    return null;
  }

  function panelLink(item, user) {
    if (item.id === 'profile') {
      return profileHref(user) || `${dashboardBase}?panel=profile`;
    }
    let url = `${dashboardBase}?panel=${encodeURIComponent(item.panel)}`;
    if (item.id && item.id !== item.panel) url += `&navId=${encodeURIComponent(item.id)}`;
    return url;
  }

  function renderNavItem(item, user) {
    const active = item.id === activeNavId ? ' active' : '';
    const badge = item.badge ? '<span class="nav-badge nav-notif-badge hidden">0</span>' : '';
    const icon = `<i class="bi ${item.icon} nav-icon" aria-hidden="true"></i>`;
    const label = `<span class="nav-label">${esc(item.label)}</span>`;

    if (linkPanels && item.panel && !item.href) {
      return `<a href="${panelLink(item, user)}" class="nav-item nav-item--link${active}" data-nav-id="${item.id}">${icon}${label}${badge}</a>`;
    }

    if (item.id === 'profile') {
      const href = profileHref(user);
      if (href) {
        return `<a href="${href}" class="nav-item nav-item--link${active}" data-nav-id="${item.id}">${icon}${label}</a>`;
      }
      return `<button type="button" class="nav-item${active}" data-nav-id="${item.id}" data-panel="profile">${icon}${label}</button>`;
    }

    if (item.href) {
      return `<a href="${item.href}" class="nav-item nav-item--link${active}" data-nav-id="${item.id}">${icon}${label}</a>`;
    }

    return `<button type="button" class="nav-item${active}" data-nav-id="${item.id}" data-panel="${item.panel}">${icon}${label}${badge}</button>`;
  }

  function getCollapsedSections() {
    try {
      return JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function setSectionCollapsed(sectionKey, collapsed) {
    const state = getCollapsedSections();
    state[sectionKey] = collapsed;
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(state));
  }

  function renderQuickAccess(user) {
    const ids = QUICK_ACCESS[user.role] || ['overview'];
    const items = getMenuItems(user).filter((i) => ids.includes(i.id));
    if (!items.length) return '';
    return `<div class="nav-quick-access">
      <div class="nav-section-label">Quick Access</div>
      <div class="nav-quick-grid">${items.map((item) => {
        const icon = `<i class="bi ${item.icon}" aria-hidden="true"></i>`;
        if (linkPanels && item.panel && !item.href) {
          return `<a href="${panelLink(item, user)}" class="nav-quick-item" data-nav-id="${item.id}">${icon}<span>${esc(item.label)}</span></a>`;
        }
        if (item.href) return `<a href="${item.href}" class="nav-quick-item">${icon}<span>${esc(item.label)}</span></a>`;
        return `<button type="button" class="nav-quick-item" data-nav-id="${item.id}" data-panel="${item.panel}">${icon}<span>${esc(item.label)}</span></button>`;
      }).join('')}</div>
    </div>`;
  }

  function renderGroupedNav(user) {
    const items = getMenuItems(user);
    const sections = NAV_SECTIONS[user.role] || [{ label: 'Navigation', ids: items.map((i) => i.id) }];
    const collapsedSections = getCollapsedSections();
    return renderQuickAccess(user) + sections.map((section, idx) => {
      const sectionKey = `${user.role}-${idx}-${section.label}`;
      const sectionItems = items.filter((i) => section.ids.includes(i.id));
      if (!sectionItems.length) return '';
      const collapsed = collapsedSections[sectionKey] === true;
      return `<div class="nav-section${collapsed ? ' nav-section--collapsed' : ''}" data-section-key="${esc(sectionKey)}">
        ${section.label ? `<button type="button" class="nav-section-toggle" aria-expanded="${!collapsed}"><span class="nav-section-label">${esc(section.label)}</span><i class="bi bi-chevron-down nav-section-chevron" aria-hidden="true"></i></button>` : ''}
        <div class="nav-section-items">${sectionItems.map((item) => renderNavItem(item, user)).join('')}</div>
      </div>`;
    }).join('');
  }

  function renderSidebar(user, roleLabel) {
    const brand = ROLE_BRAND[user.role] || { logo: 'images/PNG CS Logo.jpg', subtitle: user.role, wide: false };
    const subtitle = roleLabel || brand.subtitle;
    const logoClass = brand.wide ? 'sidebar-logo sidebar-logo--wide' : 'sidebar-logo';
    const inst = user.institutionId && PMSStorage.getInstitutionById(user.institutionId);
    const initial = (user.firstName || user.username || '?').charAt(0).toUpperCase();

    const navHtml = renderGroupedNav(user);

    return `
      <div class="sidebar-header">
        <button type="button" class="sidebar-collapse-btn" id="sidebar-collapse-btn" aria-label="Toggle sidebar">
          <i class="bi bi-list" aria-hidden="true"></i>
        </button>
        <div class="sidebar-brand">
          <img src="${brand.logo}" alt="PMS" class="${logoClass}">
          <div class="sidebar-brand-text">
            <strong>PMS</strong>
            <span>${esc(subtitle)}</span>
          </div>
        </div>
      </div>
      <nav class="sidebar-nav" aria-label="Main navigation">${navHtml}</nav>
      <div class="sidebar-footer">
        <div class="user-info">
          <span class="user-avatar" id="user-avatar">${esc(initial)}</span>
          <div class="user-details">
            <strong id="user-name">${esc(`${user.firstName} ${user.lastName}`)}</strong>
            <span id="user-role">${esc(subtitle)}</span>
            <span class="role-badge">${esc(user.role)}</span>
            ${inst ? `<span class="user-inst" id="user-institution">${esc(inst.name)}</span>` : '<span class="user-inst hidden" id="user-institution"></span>'}
            ${user.boardPosition ? `<span class="user-inst board-position" id="board-position">${esc(user.boardPosition)}</span>` : '<span class="user-inst board-position hidden" id="board-position"></span>'}
          </div>
        </div>
        <button type="button" class="btn-logout" id="logout-btn"><i class="bi bi-box-arrow-right" aria-hidden="true"></i><span class="nav-label">Logout</span></button>
      </div>`;
  }

  function ensureBackdrop() {
    let backdrop = document.getElementById('sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'sidebar-backdrop';
      backdrop.className = 'sidebar-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', closeMobile);
    }
    return backdrop;
  }

  function ensureTopbarToggle() {
    const topbar = document.querySelector('.topbar');
    if (!topbar || document.getElementById('sidebar-mobile-toggle')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'sidebar-mobile-toggle';
    btn.className = 'sidebar-mobile-toggle';
    btn.setAttribute('aria-label', 'Open navigation menu');
    btn.innerHTML = '<i class="bi bi-list" aria-hidden="true"></i>';
    topbar.prepend(btn);
    btn.addEventListener('click', () => toggleMobile(true));
  }

  function ensureProfilePanel(user) {
    if (document.getElementById('panel-profile')) return;
    const main = document.querySelector('.main-content');
    if (!main) return;

    const inst = user.institutionId ? PMSStorage.getInstitutionById(user.institutionId) : null;
    const section = document.createElement('section');
    section.className = 'panel';
    section.id = 'panel-profile';
    section.innerHTML = `
      <div class="card profile-card">
        <div class="profile-card-header">
          <span class="user-avatar user-avatar--lg">${esc((user.firstName || '?').charAt(0))}</span>
          <div>
            <h2>${esc(`${user.firstName} ${user.lastName}`)}</h2>
            <p class="text-muted">${esc(user.role)}</p>
          </div>
        </div>
        <div class="card-body profile-details">
          <dl class="detail-list">
            <dt>Username</dt><dd>${esc(user.username)}</dd>
            <dt>Email</dt><dd>${esc(user.email || '—')}</dd>
            <dt>Contact</dt><dd>${esc(user.phone || user.contactNumber || '—')}</dd>
            ${inst ? `<dt>Institution</dt><dd>${esc(inst.name)}</dd>` : ''}
            ${user.boardPosition ? `<dt>Board Position</dt><dd>${esc(user.boardPosition)}</dd>` : ''}
            <dt>Status</dt><dd>${esc(user.status || 'Active')}</dd>
          </dl>
        </div>
      </div>`;
    main.appendChild(section);
  }

  function isDesktop() {
    return window.innerWidth >= BREAKPOINT;
  }

  function applyLayout() {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar) return;

    const collapsed = isDesktop() && localStorage.getItem(STORAGE_KEY) === '1';
    sidebar.classList.toggle('collapsed', collapsed && isDesktop());
    sidebar.classList.toggle('mobile-open', !isDesktop() && sidebar.classList.contains('mobile-open'));

    document.body.classList.toggle('sidebar-collapsed', collapsed && isDesktop());
    document.body.classList.toggle('sidebar-mobile-open', sidebar.classList.contains('mobile-open'));

    if (backdrop) {
      backdrop.classList.toggle('visible', sidebar.classList.contains('mobile-open'));
    }
  }

  function toggleCollapse() {
    if (!isDesktop()) {
      toggleMobile();
      return;
    }
    const collapsed = localStorage.getItem(STORAGE_KEY) === '1';
    localStorage.setItem(STORAGE_KEY, collapsed ? '0' : '1');
    applyLayout();
  }

  function toggleMobile(forceOpen) {
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar || isDesktop()) return;
    const open = forceOpen === true ? true : forceOpen === false ? false : !sidebar.classList.contains('mobile-open');
    sidebar.classList.toggle('mobile-open', open);
    applyLayout();
  }

  function closeMobile() {
    toggleMobile(false);
  }

  function setActive(navId, panelId) {
    if (navId) activeNavId = navId;
    document.querySelectorAll('.sidebar-nav .nav-item').forEach((el) => {
      if (navId) {
        el.classList.toggle('active', el.dataset.navId === navId);
      } else if (panelId) {
        el.classList.toggle('active', el.dataset.panel === panelId);
      }
    });
  }

  function bindNavigation(sidebar, user, onNavigate) {
    sidebar.querySelectorAll('.sidebar-nav .nav-item[data-panel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const panel = btn.dataset.panel;
        const navId = btn.dataset.navId;
        setActive(navId, panel);
        onNavigate?.(panel, { navId });
        if (!isDesktop()) closeMobile();
      });
    });

    sidebar.querySelectorAll('.sidebar-nav .nav-quick-item[data-panel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setActive(btn.dataset.navId, btn.dataset.panel);
        onNavigate?.(btn.dataset.panel, { navId: btn.dataset.navId });
        if (!isDesktop()) closeMobile();
      });
    });

    sidebar.querySelectorAll('.nav-section-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const section = btn.closest('.nav-section');
        const key = section?.dataset.sectionKey;
        if (!key) return;
        const collapsed = !section.classList.contains('nav-section--collapsed');
        section.classList.toggle('nav-section--collapsed', collapsed);
        btn.setAttribute('aria-expanded', String(!collapsed));
        setSectionCollapsed(key, collapsed);
      });
    });

    sidebar.querySelectorAll('.sidebar-nav .nav-item--link').forEach((link) => {
      link.addEventListener('click', () => {
        if (link.dataset.navId) setActive(link.dataset.navId);
        if (!isDesktop()) closeMobile();
      });
    });
  }

  function init(options = {}) {
    const { user, roleLabel, activePanel = 'overview', activeNavId: navId, onNavigate, linkPanels: usePanelLinks, dashboardUrl } = options;
    if (!user) return;

    activeNavId = navId || activePanel;
    onNavigateCb = onNavigate;
    linkPanels = usePanelLinks === true;
    dashboardBase = dashboardUrl || (typeof PMSAuth !== 'undefined' ? PMSAuth.getDashboardForRole(user.role) : '');

    const sidebar = document.getElementById('app-sidebar') || document.querySelector('.sidebar');
    if (!sidebar) return;

    sidebar.id = 'app-sidebar';
    sidebar.innerHTML = renderSidebar(user, roleLabel);

    if (isDesktop()) {
      localStorage.setItem(STORAGE_KEY, localStorage.getItem(STORAGE_KEY) ?? '0');
    }

    ensureBackdrop();
    ensureTopbarToggle();
    if (!linkPanels) ensureProfilePanel(user);
    bindNavigation(sidebar, user, onNavigate);
    applyLayout();

    document.getElementById('sidebar-collapse-btn')?.addEventListener('click', toggleCollapse);
    document.getElementById('sidebar-mobile-toggle')?.addEventListener('click', () => toggleMobile(true));

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      if (typeof PMSApi !== 'undefined') await PMSApi.logout().catch(() => {});
      PMSStorage.clearSession();
      window.location.href = 'index.html';
    });

    window.addEventListener('resize', () => {
      const sidebarEl = document.getElementById('app-sidebar');
      if (!isDesktop() && sidebarEl) sidebarEl.classList.remove('collapsed');
      applyLayout();
    });

    setActive(activeNavId, activePanel);
    if (typeof PMSWorkspace !== 'undefined') PMSWorkspace.init(user);
  }

  return { init, setActive, closeMobile, toggleCollapse };
})();
