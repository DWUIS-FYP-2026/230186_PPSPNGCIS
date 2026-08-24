const PMSAuth = (() => {
  const ROLE_DASHBOARDS = {
    'System Administrator': 'admin-dashboard.html',
    'CS Parole Officer': 'dashboard-pngcs.html',
    'PNGCS Parole Clerk': 'dashboard-pngcs.html',
    'DJAG Parole Clerk': 'dashboard-djag.html',
    'Jail Commander': 'dashboard-commander.html',
    'DJAG Secretary': 'dashboard-djag.html',
    'Doctor': 'dashboard-board.html',
    'CS Commissioner': 'dashboard-board.html',
    'Parole Board Member': 'dashboard-board.html',
    Admin: 'admin-dashboard.html',
    'CS Parole Clerk': 'dashboard-pngcs.html',
    'Board Member': 'dashboard-board.html',
    Secretariat: 'dashboard-djag.html',
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

  function getDashboardForRole(role) {
    const normalized = normalizeRole(role);
    return ROLE_DASHBOARDS[normalized] || ROLE_DASHBOARDS[role] || 'index.html';
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
    touchSession();
    window.location.href = getDashboardForRole(user.role);
  }

  function canAccessInstitution(user, institutionId) {
    if (user.role === 'System Administrator') return true;
    if (['PNGCS Parole Clerk', 'DJAG Parole Clerk', 'Parole Board Member', 'Doctor', 'CS Commissioner', 'DJAG Secretary'].includes(user.role)) return true;
    return user.institutionId === institutionId;
  }

  function filterByInstitution(items, user, institutionKey = 'institutionId') {
    if (!user.institutionId || ['System Administrator', 'PNGCS Parole Clerk', 'DJAG Parole Clerk', 'Parole Board Member', 'Doctor', 'CS Commissioner', 'DJAG Secretary'].includes(user.role)) {
      if (user.role === 'Jail Commander' && user.institutionId) {
        return items.filter((i) => i[institutionKey] === user.institutionId);
      }
      if (user.role === 'CS Parole Officer' && user.institutionId) {
        return items.filter((i) => i[institutionKey] === user.institutionId);
      }
      return items;
    }
    return items.filter((i) => i[institutionKey] === user.institutionId);
  }

  return {
    ROLE_DASHBOARDS,
    SESSION_TIMEOUT_MS,
    normalizeRole,
    getDashboardForRole,
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
