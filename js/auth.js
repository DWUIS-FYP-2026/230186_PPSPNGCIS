const PMSAuth = (() => {
  const ROLE_DASHBOARDS = {
    'System Administrator': 'admin-dashboard.html',
    'PNGCS Parole Clerk': 'dashboard-pngcs.html',
    'DJAG Parole Clerk': 'dashboard-djag.html',
    'Jail Commander': 'dashboard-commander.html',
    'Parole Board Member': 'dashboard-board.html',
    // MySQL PMSDB role names (mapped server-side; fallback if unmapped)
    'Admin': 'admin-dashboard.html',
    'CS Parole Clerk': 'dashboard-pngcs.html',
    'Board Member': 'dashboard-board.html',
  };

  function normalizeRole(role) {
    const map = {
      'Admin': 'System Administrator',
      'CS Parole Clerk': 'PNGCS Parole Clerk',
      'Board Member': 'Parole Board Member',
      'Secretariat': 'DJAG Parole Clerk',
    };
    return map[role] || role;
  }

  function getDashboardForRole(role) {
    const normalized = normalizeRole(role);
    return ROLE_DASHBOARDS[normalized] || ROLE_DASHBOARDS[role] || 'index.html';
  }

  function requireRole(allowedRoles) {
    const session = PMSStorage.getSession();
    if (!session) {
      window.location.replace('index.html');
      return null;
    }
    const role = normalizeRole(session.role);
    const allowed = allowedRoles.map((r) => normalizeRole(r));
    if (!allowed.includes(role)) {
      window.location.replace(getDashboardForRole(session.role));
      return null;
    }
    const user = PMSStorage.getUserById(session.id) || session;
    return { ...user, role };
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
    window.location.href = getDashboardForRole(user.role);
  }

  function canAccessInstitution(user, institutionId) {
    if (user.role === 'System Administrator') return true;
    if (['PNGCS Parole Clerk', 'DJAG Parole Clerk', 'Parole Board Member'].includes(user.role)) return true;
    return user.institutionId === institutionId;
  }

  function filterByInstitution(items, user, institutionKey = 'institutionId') {
    if (!user.institutionId || ['System Administrator', 'PNGCS Parole Clerk', 'DJAG Parole Clerk', 'Parole Board Member'].includes(user.role)) {
      if (user.role === 'Jail Commander' && user.institutionId) {
        return items.filter((i) => i[institutionKey] === user.institutionId);
      }
      return items;
    }
    return items.filter((i) => i[institutionKey] === user.institutionId);
  }

  return {
    ROLE_DASHBOARDS,
    normalizeRole,
    getDashboardForRole,
    requireRole,
    redirectAccessDenied,
    showPermissionError,
    redirectAfterLogin,
    canAccessInstitution,
    filterByInstitution,
  };
})();
