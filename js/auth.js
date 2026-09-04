const PMSAuth = (() => {
  const HUB_DASHBOARD = 'dashboard.html';

  const ROLE_DASHBOARDS = {
    'System Administrator': 'admin-dashboard.html',
    'CS Parole Officer': 'dashboard-pngcs.html',
    'PNGCS Parole Clerk': 'dashboard-pngcs.html',
    'Jail Commander': 'dashboard-commander.html',
    'DJAG Parole Clerk': 'dashboard-djag.html',
    'DJAG Secretary': 'dashboard-board.html',
    'Doctor': 'dashboard-doctor.html',
    'CS Commissioner': 'dashboard-board.html',
    'Parole Board Member': 'dashboard-board.html',
    Admin: 'admin-dashboard.html',
    'CS Parole Clerk': 'dashboard-pngcs.html',
    'Board Member': 'dashboard-board.html',
    Secretariat: 'dashboard-djag.html',
  };

  const ROLE_DASHBOARD_LABELS = {
    'System Administrator': 'Admin Dashboard',
    'CS Parole Officer': 'PNGCS Dashboard',
    'PNGCS Parole Clerk': 'PNGCS Dashboard',
    'Jail Commander': 'Jail Commander Dashboard',
    'DJAG Parole Clerk': 'DJAG Dashboard',
    'DJAG Secretary': 'Board Dashboard',
    'Doctor': 'Medical Board Dashboard',
    'CS Commissioner': 'Board Dashboard',
    'Parole Board Member': 'Board Dashboard',
    Admin: 'Admin Dashboard',
    'CS Parole Clerk': 'PNGCS Dashboard',
    'Board Member': 'Board Dashboard',
    Secretariat: 'DJAG Dashboard',
  };

  const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;

  function normalizeRole(role) {
    const map = {
      Admin: 'System Administrator',
      'CS Parole Clerk': 'PNGCS Parole Clerk',
      'Board Member': 'Parole Board Member',
      Secretariat: 'DJAG Parole Clerk',
    };
    return map[role] || role;
  }

  function getDashboardHub() {
    return HUB_DASHBOARD;
  }

  function getDashboardForRole(role) {
    const normalized = normalizeRole(role);
    return ROLE_DASHBOARDS[normalized] || ROLE_DASHBOARDS[role] || 'index.html';
  }

  function getDashboardForUser(user) {
    return getDashboardForRole(user?.role);
  }

  function getDashboardLabelForRole(role) {
    const normalized = normalizeRole(role);
    return ROLE_DASHBOARD_LABELS[normalized] || ROLE_DASHBOARD_LABELS[role] || 'Dashboard';
  }

  function buildDashboardRoles() {
    const map = {};
    Object.entries(ROLE_DASHBOARDS).forEach(([role, dashboard]) => {
      if (!dashboard || dashboard === 'index.html') return;
      if (!map[dashboard]) map[dashboard] = new Set();
      map[dashboard].add(normalizeRole(role));
    });
    return Object.fromEntries(
      Object.entries(map).map(([dashboard, roles]) => [dashboard, [...roles]])
    );
  }

  const DASHBOARD_ROLES = buildDashboardRoles();

  function getRolesForDashboard(dashboardFile) {
    const file = (dashboardFile || '').split('/').pop()?.toLowerCase() || '';
    return DASHBOARD_ROLES[file] || [];
  }

  function requireDashboardRole(dashboardFile) {
    const file = (dashboardFile || location.pathname.split('/').pop() || '').toLowerCase();
    const allowed = getRolesForDashboard(file);
    if (!allowed.length) return requireRole(['System Administrator']);
    return requireRole(allowed);
  }

  function prepareSessionUser(user) {
    if (!user) return user;
    return { ...user, role: normalizeRole(user.role) };
  }

  function redirectToRoleDashboard(userOrRole) {
    const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
    window.location.replace(getDashboardForRole(role));
  }

  function isSessionExpired() {
    try {
      const raw = sessionStorage.getItem('pms_session_meta');
      if (!raw) return false;
      const meta = JSON.parse(raw);
      return meta.expiresAt && Date.now() > meta.expiresAt;
    } catch (_) {
      return false;
    }
  }

  function touchSession() {
    try {
      sessionStorage.setItem('pms_session_meta', JSON.stringify({
        expiresAt: Date.now() + SESSION_TIMEOUT_MS,
        lastActivity: Date.now(),
      }));
    } catch (_) { /* ignore */ }
  }

  function requireRole(allowedRoles) {
    if (isSessionExpired()) {
      PMSStorage?.clearSession?.();
      window.location.replace('index.html');
      return null;
    }
    touchSession();
    try { sessionStorage.removeItem('pms_hub_redirect_count'); } catch (_) { /* ignore */ }
    const session = PMSStorage.getSession();
    if (!session) {
      window.location.replace('index.html');
      return null;
    }
    const role = normalizeRole(session.role);
    const allowed = allowedRoles.map((r) => normalizeRole(r));
    if (!allowed.includes(role)) {
      const correctDash = getDashboardForRole(session.role);
      const currentPage = (location.pathname.split('/').pop() || '').toLowerCase();
      if (correctDash && correctDash !== 'index.html' && correctDash.toLowerCase() !== currentPage) {
        window.location.replace(correctDash);
      } else {
        redirectAccessDenied('You do not have access to this workspace.');
      }
      return null;
    }
    const user = PMSStorage.getUserById(session.id) || session;
    return { ...prepareSessionUser(user), role: normalizeRole(user.role) };
  }

  function redirectAccessDenied(message, code = 403) {
    const params = new URLSearchParams();
    if (message) params.set('msg', message);
    params.set('code', String(code));
    params.set('return', getDashboardForRole(PMSStorage.getSession()?.role || ''));
    window.location.replace(`access-denied.html?${params}`);
  }

  function showPermissionError(err) {
    const msg = err?.message || 'You do not have permission to perform this action.';
    if (err?.code === 403) {
      alert(`${msg}\n\nThis incident has been recorded in the audit log.`);
    } else {
      alert(msg);
    }
  }

  function redirectAfterLogin(user) {
    touchSession();
    const target = getDashboardForRole(user?.role);
    window.location.replace(target && target !== 'index.html' ? target : getDashboardHub());
  }

  function canAccessInstitution(user, institutionId) {
    if (user.role === 'System Administrator') return true;
    if (['PNGCS Parole Clerk', 'DJAG Parole Clerk', 'Parole Board Member', 'Doctor', 'CS Commissioner', 'DJAG Secretary'].includes(user.role)) return true;
    return user.institutionId === institutionId;
  }

  function filterByInstitution(items, user, institutionKey = 'institutionId') {
    if (!user.institutionId || ['System Administrator', 'PNGCS Parole Clerk', 'DJAG Parole Clerk', 'Parole Board Member', 'Doctor', 'CS Commissioner', 'DJAG Secretary'].includes(user.role)) {
      if (user.role === 'CS Parole Officer' && user.institutionId) {
        return items.filter((i) => i[institutionKey] === user.institutionId);
      }
      return items;
    }
    return items.filter((i) => i[institutionKey] === user.institutionId);
  }

  return {
    HUB_DASHBOARD,
    ROLE_DASHBOARDS,
    DASHBOARD_ROLES,
    SESSION_TIMEOUT_MS,
    normalizeRole,
    prepareSessionUser,
    getDashboardHub,
    getDashboardForRole,
    getDashboardForUser,
    getDashboardLabelForRole,
    getRolesForDashboard,
    requireDashboardRole,
    redirectToRoleDashboard,
    requireRole,
    redirectAccessDenied,
    showPermissionError,
    redirectAfterLogin,
    canAccessInstitution,
    filterByInstitution,
    touchSession,
    isSessionExpired,
  };
})();
