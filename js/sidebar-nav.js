/**
 * PMS — Shared collapsible sidebar navigation (RBAC-aware).
 */
const PMSSidebar = (() => {
  const BREAKPOINT = 768;
  const STORAGE_KEY = 'pms_sidebar_collapsed';

  const ROLE_BRAND = {
    'System Administrator': { logo: 'images/PNG CS Logo.jpg', subtitle: 'System Administrator', wide: false },
    'CS Parole Officer': { logo: 'images/PNG CS Logo.jpg', subtitle: 'CS Parole Officer', wide: false },
    'CS Parole Clerk': { logo: 'images/PNG CS Logo.jpg', subtitle: 'CS Parole Clerk', wide: false },
    'Jail Commander': { logo: 'images/PNG CS Logo.jpg', subtitle: 'Jail Commander', wide: false },
    'DJAG Parole Clerk': { logo: 'images/djag.png', subtitle: 'DJAG Parole Clerk', wide: true },
    'DJAG Secretary': { logo: 'images/djag.png', subtitle: 'DJAG Secretary · Parole Board', wide: true },
    'Doctor': { logo: 'images/djag.png', subtitle: 'Psychiatrist · Parole Board', wide: true },
    'CS Commissioner': { logo: 'images/PNG CS Logo.jpg', subtitle: 'CS Commissioner · Board Member', wide: false },
  };

  /** Menu sections for grouped navigation */
  const NAV_SECTIONS = {
    'System Administrator': [
      { label: 'Dashboard', ids: ['overview'] },
      { label: 'Parole Tracking', ids: ['cases', 'eligibility'] },
      { label: 'Prisoners', ids: ['prisoners'] },
      { label: 'Administration', ids: ['users'] },
      { label: 'Reports & Analytics', ids: ['reports', 'analytics', 'audit'] },
      { label: 'Account', ids: ['profile'] },
    ],
    'CS Parole Clerk': [
      { label: 'Dashboard', ids: ['overview'] },
      { label: 'Parole Management', ids: ['applications', 'eligibility', 'form1', 'form2', 'board-hearing'] },
      { label: 'Release', ids: ['approvals', 'archive'] },
      { label: 'Prisoners', ids: ['prisoners'] },
      { label: 'Reports', ids: ['reports', 'profile'] },
    ],
    'Jail Commander': [
      { label: 'Dashboard', ids: ['overview'] },
      { label: 'Institution', ids: ['verification', 'release', 'applications', 'prisoners', 'archive'] },
      { label: 'Account', ids: ['profile'] },
    ],
    'CS Parole Officer': [
      { label: 'Dashboard', ids: ['overview'] },
      { label: 'Parole Management', ids: ['applications', 'eligibility', 'form1'] },
      { label: 'Prisoners', ids: ['prisoners'] },
      { label: 'Reports', ids: ['reports', 'profile'] },
    ],
    'DJAG Parole Clerk': [
      { label: 'Dashboard', ids: ['overview'] },
      { label: 'Parole Management', ids: ['applications', 'eligibility', 'form2', 'form4'] },
      { label: 'Prisoners', ids: ['prisoners'] },
      { label: 'Hearings', ids: ['hearing-schedule', 'hearings'] },
      { label: 'Reports', ids: ['reports', 'archive', 'profile'] },
    ],
    'DJAG Secretary': [
      { label: 'Dashboard', ids: ['overview'] },
      {
        label: 'Hearing Scheduling',
        hint: 'Set parole hearing dates after commander verification',
        ids: ['hearing-schedule', 'applications', 'hearings'],
      },
      {
        label: 'Parole Board',
        hint: 'Vote, decisions, and outcome forms',
        ids: ['board-decisions', 'decisions', 'approvals', 'form4', 'form5', 'history'],
      },
      { label: 'Account', ids: ['profile'] },
    ],
    'Doctor': [
      { label: 'Dashboard', ids: ['overview'] },
      { label: 'Parole Management', ids: ['applications', 'prisoners'] },
      { label: 'Hearings', ids: ['hearing-schedule', 'hearings'] },
      { label: 'Parole Board', ids: ['board-decisions', 'decisions'] },
      { label: 'Account', ids: ['profile'] },
    ],
    'CS Commissioner': [
      { label: 'Dashboard', ids: ['overview'] },
      { label: 'Board', ids: ['board-decisions', 'decisions'] },
      { label: 'Reports', ids: ['reports', 'profile'] },
    ],
  };

  /** Menu definitions — filtered by PMSRBAC.canAccessModule */
  const MENUS = {
    'System Administrator': [
      { id: 'overview', module: 'overview', panel: 'overview', label: 'Dashboard', icon: 'fi fi-rr-dashboard' },
      { id: 'cases', module: 'cases', panel: 'prisoners', label: 'Parole Process Track', icon: 'fi fi-rr-route' },
      { id: 'eligibility', module: 'eligibility', panel: 'prisoners', label: 'Eligibility', icon: 'fi fi-rr-check-circle' },
      { id: 'prisoners', module: 'prisoners', panel: 'prisoners', label: 'Prisoner Records', icon: 'fi fi-rr-user-lock' },
      { id: 'users', module: 'users', panel: 'users', label: 'User Accounts', icon: 'fi fi-rr-users' },
      { id: 'reports', module: 'reports', panel: 'reports', label: 'Reports', icon: 'fi fi-rr-chart-line-up' },
      { id: 'analytics', module: 'analytics', panel: 'reports', label: 'Analytics', icon: 'fi fi-rr-chart-pie' },
      { id: 'audit', module: 'audit', panel: 'audit', label: 'Audit Trail', icon: 'fi fi-rr-journal' },
      { id: 'profile', panel: 'profile', label: 'Profile', icon: 'fi fi-rr-user' },
    ],
    'CS Parole Clerk': [
      { id: 'overview', module: 'overview', panel: 'overview', label: 'Dashboard', icon: 'fi fi-rr-dashboard' },
      { id: 'applications', module: 'cases', panel: 'applications', label: 'Parole Applications', icon: 'fi fi-rr-folder' },
      { id: 'eligibility', module: 'eligibility', panel: 'eligibility', label: 'Eligibility', icon: 'fi fi-rr-check-circle' },
      { id: 'form1', module: 'forms', href: 'forms/form1.html', label: 'Form 1', icon: 'fi fi-rr-document' },
      { id: 'form2', module: 'forms', href: 'forms/form2.html', label: 'Form 2', icon: 'fi fi-rr-document' },
      { id: 'board-hearing', module: 'hearings', href: 'forms/board-decisions.html', label: 'Parole Hearing', icon: 'fi fi-rr-gavel' },
      { id: 'approvals', module: 'release', panel: 'approvals', label: 'Grant Approvals', icon: 'fi fi-rr-badge-check' },
      { id: 'archive', module: 'archive', panel: 'archive', label: 'Archived Cases', icon: 'fi fi-rr-box' },
      { id: 'prisoners', module: 'prisoners', panel: 'prisoners', label: 'Prisoner Records', icon: 'fi fi-rr-id-card' },
      { id: 'reports', module: 'reports', panel: 'reports', label: 'Reports', icon: 'fi fi-rr-chart-line-up' },
      { id: 'profile', panel: 'profile', label: 'Profile', icon: 'fi fi-rr-user' },
    ],
    'DJAG Parole Clerk': [
      { id: 'overview', module: 'overview', panel: 'overview', label: 'Dashboard', icon: 'fi fi-rr-dashboard' },
      { id: 'applications', module: 'cases', panel: 'applications', label: 'Parole Applications', icon: 'fi fi-rr-folder' },
      { id: 'eligibility', module: 'eligibility', panel: 'eligibility', label: 'Eligibility', icon: 'fi fi-rr-check-circle' },
      { id: 'form2', module: 'forms', href: 'forms/form2.html', label: 'Form 2', icon: 'fi fi-rr-document' },
      { id: 'form4', module: 'forms', href: 'forms/form4.html', label: 'Form 4', icon: 'fi fi-rr-document' },
      { id: 'prisoners', module: 'prisoners', panel: 'prisoners', label: 'Prisoner Records', icon: 'fi fi-rr-id-card' },
      { id: 'board-decisions', module: 'hearings', href: 'forms/board-decisions.html', label: 'Board Vote', icon: 'fi fi-rr-gavel' },
      { id: 'hearings', module: 'hearings', panel: 'hearings', label: 'Hearing Calendar', icon: 'fi fi-rr-calendar' },
      { id: 'archive', module: 'archive', panel: 'archive', label: 'Archived Cases', icon: 'fi fi-rr-box' },
      { id: 'reports', module: 'reports', panel: 'reports', label: 'Reports', icon: 'fi fi-rr-chart-line-up' },
      { id: 'profile', panel: 'profile', label: 'Profile', icon: 'fi fi-rr-user' },
    ],
    'CS Parole Officer': [
      { id: 'overview', module: 'overview', panel: 'overview', label: 'Dashboard', icon: 'fi fi-rr-dashboard' },
      { id: 'applications', module: 'cases', panel: 'applications', label: 'Parole Applications', icon: 'fi fi-rr-folder' },
      { id: 'eligibility', module: 'eligibility', panel: 'eligibility', label: 'Eligibility', icon: 'fi fi-rr-check-circle' },
      { id: 'form1', module: 'forms', href: 'forms/form1.html', label: 'Form 1', icon: 'fi fi-rr-document' },
      { id: 'prisoners', module: 'prisoners', panel: 'prisoners', label: 'Prisoner Records', icon: 'fi fi-rr-id-card' },
      { id: 'reports', module: 'reports', panel: 'reports', label: 'Reports', icon: 'fi fi-rr-chart-line-up' },
      { id: 'profile', panel: 'profile', label: 'Profile', icon: 'fi fi-rr-user' },
    ],
    'DJAG Secretary': [
      { id: 'overview', module: 'overview', panel: 'overview', label: 'Dashboard', icon: 'fi fi-rr-dashboard' },
      { id: 'hearing-schedule', module: 'hearings', href: 'forms/hearing-schedule.html', label: 'Schedule Hearing Dates', icon: 'fi fi-rr-calendar-clock' },
      { id: 'applications', module: 'applications', panel: 'applications', label: 'Cases Awaiting Schedule', icon: 'fi fi-rr-hourglass-end' },
      { id: 'hearings', module: 'hearings', panel: 'hearings', label: 'Hearing Calendar', icon: 'fi fi-rr-calendar' },
      { id: 'board-decisions', module: 'decisions', href: 'forms/board-decisions.html', label: 'Board Vote Portal', icon: 'fi fi-rr-gavel' },
      { id: 'decisions', module: 'decisions', panel: 'decisions', label: 'Cases Awaiting Vote', icon: 'fi fi-rr-list-check' },
      { id: 'approvals', module: 'decisions', panel: 'approvals', label: 'Grant Approvals', icon: 'fi fi-rr-badge-check' },
      { id: 'form4', module: 'forms', href: 'forms/form4.html', label: 'Form 4 — Parole Grant', icon: 'fi fi-rr-document' },
      { id: 'form5', module: 'forms', href: 'forms/form5.html', label: 'Form 5 — Parole Refusal', icon: 'fi fi-rr-document' },
      { id: 'history', module: 'archive', panel: 'history', label: 'Archived Cases', icon: 'fi fi-rr-box' },
      { id: 'profile', panel: 'profile', label: 'Profile', icon: 'fi fi-rr-user' },
    ],
    'Doctor': [
      { id: 'overview', module: 'overview', panel: 'overview', label: 'Dashboard', icon: 'fi fi-rr-dashboard' },
      { id: 'applications', module: 'cases', panel: 'applications', label: 'Parole Cases', icon: 'fi fi-rr-folder' },
      { id: 'prisoners', module: 'prisoners', panel: 'prisoners', label: 'Prisoner Records', icon: 'fi fi-rr-id-card' },
      { id: 'board-decisions', module: 'decisions', href: 'forms/board-decisions.html', label: 'Board Vote Portal', icon: 'fi fi-rr-gavel' },
      { id: 'hearings', module: 'hearings', panel: 'hearings', label: 'Hearing Calendar', icon: 'fi fi-rr-calendar' },
      { id: 'decisions', module: 'decisions', panel: 'decisions', label: 'Cases Awaiting Vote', icon: 'fi fi-rr-list-check' },
      { id: 'profile', panel: 'profile', label: 'Profile', icon: 'fi fi-rr-user' },
    ],
    'CS Commissioner': [
      { id: 'overview', module: 'overview', panel: 'overview', label: 'Dashboard', icon: 'fi fi-rr-dashboard' },
      { id: 'board-decisions', module: 'hearings', href: 'forms/board-decisions.html', label: 'Board Vote', icon: 'fi fi-rr-gavel' },
      { id: 'decisions', module: 'decisions', panel: 'decisions', label: 'Commissioner Assessments', icon: 'fi fi-rr-gavel' },
      { id: 'profile', panel: 'profile', label: 'Profile', icon: 'fi fi-rr-user' },
    ],
    'Jail Commander': [
      { id: 'overview', module: 'overview', panel: 'overview', label: 'Dashboard', icon: 'fi fi-rr-dashboard' },
      { id: 'verification', module: 'verification', panel: 'verification', label: 'Case Verification', icon: 'fi fi-rr-shield-check' },
      { id: 'release', module: 'release', panel: 'release', label: 'Authorize Release', icon: 'fi fi-rr-door-open' },
      { id: 'archive', module: 'archive', panel: 'archive', label: 'Archived Cases', icon: 'fi fi-rr-box' },
      { id: 'applications', module: 'applications', panel: 'applications', label: 'Parole Applications', icon: 'fi fi-rr-folder' },
      { id: 'prisoners', module: 'prisoners', panel: 'prisoners', label: 'Prisoner Records', icon: 'fi fi-rr-id-card' },
      { id: 'profile', panel: 'profile', label: 'Profile', icon: 'fi fi-rr-user' },
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
    const icon = item.icon ? `<i class="${item.icon} nav-icon" aria-hidden="true"></i>` : '';
    const label = `<span class="nav-label">${esc(item.label)}</span>`;
    const title = ` title="${esc(item.label)}"`;

    if (linkPanels && item.panel && !item.href) {
      return `<a href="${panelLink(item, user)}" class="nav-item nav-item--link${active}" data-nav-id="${item.id}"${title}>${icon}${label}${badge}</a>`;
    }

    if (item.id === 'profile') {
      const href = profileHref(user);
      if (href) {
        return `<a href="${href}" class="nav-item nav-item--link${active}" data-nav-id="${item.id}"${title}>${icon}${label}</a>`;
      }
      return `<button type="button" class="nav-item${active}" data-nav-id="${item.id}" data-panel="profile"${title}>${icon}${label}</button>`;
    }

    if (item.href) {
      return `<a href="${item.href}" class="nav-item nav-item--link${active}" data-nav-id="${item.id}"${title}>${icon}${label}</a>`;
    }

    return `<button type="button" class="nav-item${active}" data-nav-id="${item.id}" data-panel="${item.panel}"${title}>${icon}${label}${badge}</button>`;
  }

  function renderGroupedNav(user) {
    const items = getMenuItems(user);
    const sections = NAV_SECTIONS[user.role] || [{ label: 'Navigation', ids: items.map((i) => i.id) }];
    return sections.map((section) => {
      const sectionItems = items.filter((i) => section.ids.includes(i.id));
      if (!sectionItems.length) return '';
      return `<div class="nav-section">
        ${section.label ? `<div class="nav-section-label">${esc(section.label)}</div>` : ''}
        ${section.hint ? `<div class="nav-section-hint">${esc(section.hint)}</div>` : ''}
        <ul class="nav-list">${sectionItems.map((item) => `<li>${renderNavItem(item, user)}</li>`).join('')}</ul>
      </div>`;
    }).join('');
  }

  function renderSidebar(user, roleLabel) {
    const brand = ROLE_BRAND[user.role] || { subtitle: user.role };
    const subtitle = roleLabel || brand.subtitle;
    const inst = user.institutionId && PMSStorage.getInstitutionById(user.institutionId);
    const initial = (user.firstName || user.username || '?').charAt(0).toUpperCase();
    const logosHtml = typeof PMSBrand !== 'undefined'
      ? PMSBrand.logoBadgesHtml('', true).replace('pms-brand-logos', 'pms-brand-logos sidebar-brand-logos')
      : `<div class="pms-brand-logos pms-brand-logos--compact sidebar-brand-logos" aria-hidden="true">
          <span class="pms-logo-badge pms-logo-badge--pngcs"><img src="images/PNG CS Logo.jpg" alt="PNGCS"></span>
          <span class="pms-logo-divider"></span>
          <span class="pms-logo-badge pms-logo-badge--djag"><img src="images/djag_logo.jpg" alt="DJAG"></span>
        </div>`;

    const navHtml = renderGroupedNav(user);

    return `
      <div class="sidebar-header sidebar-logo-area">
        <div class="sidebar-brand">
          <div class="sidebar-logo-mark" aria-hidden="true">
            <img src="images/NationalEmblem.jpg" alt="" class="sidebar-logo-icon">
          </div>
          <div class="sidebar-brand-text">
            <strong>Parole Management</strong>
            <span>${esc(subtitle)}</span>
          </div>
        </div>
        <button type="button" class="sidebar-collapse-btn" id="sidebar-collapse-btn" aria-label="Collapse sidebar">
          <span class="sidebar-collapse-btn__bars" aria-hidden="true"><span></span><span></span><span></span></span>
        </button>
      </div>
      <nav class="sidebar-nav" aria-label="Main navigation">${navHtml}</nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="sidebar-user__avatar user-avatar" id="user-avatar" aria-hidden="true">${esc(initial)}</div>
          <div class="sidebar-user__meta user-details">
            <p class="sidebar-user__name" id="user-name">${esc(`${user.firstName} ${user.lastName}`)}</p>
            <p class="sidebar-user__role" id="user-role">${esc(user.role)}</p>
            ${inst ? `<p class="sidebar-user__inst user-inst" id="user-institution">${esc(inst.name)}</p>` : '<p class="sidebar-user__inst user-inst hidden" id="user-institution"></p>'}
            ${(() => {
              const boardLabel = typeof PMSBoardVote !== 'undefined' ? PMSBoardVote.formatBoardPosition(user) : (user.boardPosition || '');
              return boardLabel && boardLabel !== '—'
                ? `<p class="sidebar-user__inst sidebar-user__board user-inst board-position" id="board-position">${esc(boardLabel)}</p>`
                : '<p class="sidebar-user__inst sidebar-user__board user-inst board-position hidden" id="board-position"></p>';
            })()}
          </div>
        </div>
        <button type="button" class="sidebar-signout btn-logout" id="logout-btn">Sign out</button>
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

  function bindMobileToggle() {
    const btn = document.getElementById('sidebar-mobile-toggle');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => toggleMobile(true));
  }

  function ensureTopbarToggle() {
    /* Mobile menu lives in workspace-header — do not inject a second toggle. */
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
            ${(() => {
              const boardLabel = typeof PMSBoardVote !== 'undefined' ? PMSBoardVote.formatBoardPosition(user) : (user.boardPosition || '');
              return boardLabel && boardLabel !== '—' ? `<dt>Board Position</dt><dd>${esc(boardLabel)}</dd>` : '';
            })()}
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
    if (!linkPanels) ensureProfilePanel(user);
    bindNavigation(sidebar, user, onNavigate);
    applyLayout();

    document.getElementById('sidebar-collapse-btn')?.addEventListener('click', toggleCollapse);

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      await PMSStorage.clearSession();
      if (typeof PMSApi !== 'undefined') await PMSApi.logout().catch(() => {});
      window.location.href = 'index.html';
    });

    window.addEventListener('resize', () => {
      const sidebarEl = document.getElementById('app-sidebar');
      if (!isDesktop() && sidebarEl) sidebarEl.classList.remove('collapsed');
      applyLayout();
    });

    setActive(activeNavId, activePanel);
    if (typeof PMSWorkspace !== 'undefined') PMSWorkspace.init(user);
    bindMobileToggle();
  }

  return { init, setActive, closeMobile, toggleCollapse, toggleMobile, bindMobileToggle };
})();
