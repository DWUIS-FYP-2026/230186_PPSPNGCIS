/**
 * PMS Role-Based Access Control — permissions matrix aligned with official workflow.
 */
const PMSRBAC = (() => {
  const PRISONER_MODIFY_ROLE = 'PNGCS Parole Clerk';
  const FORM_EDIT_ROLES = ['PNGCS Parole Clerk', 'CS Parole Officer'];

  const PERMISSIONS = {
    'System Administrator': {
      modules: ['overview', 'users', 'institutions', 'prisoners', 'applications', 'cases', 'eligibility', 'notifications', 'audit', 'settings', 'reports', 'analytics', 'forms', 'offenses', 'hearings', 'release', 'guarantors', 'documents', 'board_members'],
      prisoners: { create: false, read: true, update: false, delete: false, scope: 'all', export: true },
      applications: { create: true, read: true, update: true, delete: true, scope: 'all' },
      forms: { 1: 'view', 2: 'view', 3: 'view', 4: 'view', 5: 'view' },
      users: { create: true, read: true, update: true, delete: true },
      institutions: { create: true, read: true, update: true, delete: true },
      hearings: { create: true, read: true, update: true },
      decisions: { create: true, read: true },
      assessments: { create: true, read: true },
      reports: ['system', 'operational', 'audit', 'institutional', 'board'],
      notifications: ['all'],
    },
    'CS Parole Officer': {
      modules: ['overview', 'prisoners', 'eligibility', 'applications', 'cases', 'notifications', 'reports', 'forms', 'guarantors', 'documents'],
      prisoners: { create: false, read: true, update: false, delete: false, scope: 'institution', export: true },
      applications: { create: true, read: true, update: true, delete: false, scope: 'institution' },
      forms: { 1: 'edit', 2: 'view', 3: 'view', 4: 'view', 5: 'view' },
      users: { create: false, read: false, update: false, delete: false },
      institutions: { create: false, read: true, update: false, delete: false },
      hearings: { create: false, read: true, update: false },
      decisions: { create: false, read: true },
      assessments: { create: false, read: true },
      reports: ['operational', 'prisoner', 'application'],
      notifications: ['eligibility', 'application', 'returned'],
    },
    'PNGCS Parole Clerk': {
      modules: ['overview', 'prisoners', 'eligibility', 'applications', 'cases', 'notifications', 'reports', 'forms', 'guarantors', 'documents'],
      prisoners: { create: true, read: true, update: true, delete: false, scope: 'all', export: true },
      applications: { create: true, read: true, update: true, delete: false, scope: 'institution' },
      forms: { 1: 'edit', 2: 'edit', 3: 'view', 4: 'view', 5: 'view' },
      users: { create: false, read: false, update: false, delete: false },
      institutions: { create: false, read: true, update: false, delete: false },
      hearings: { create: false, read: true, update: false },
      decisions: { create: false, read: true },
      assessments: { create: false, read: true },
      reports: ['operational', 'prisoner', 'application'],
      notifications: ['eligibility', 'application', 'returned'],
    },
    'DJAG Parole Clerk': {
      modules: ['overview', 'prisoners', 'applications', 'cases', 'reports', 'hearings', 'notifications', 'forms', 'documents'],
      prisoners: { create: false, read: true, update: false, delete: false, scope: 'all', export: true },
      applications: { create: false, read: true, update: true, delete: false, scope: 'all' },
      forms: { 1: 'view', 2: 'view', 3: 'view', 4: 'edit', 5: 'view' },
      users: { create: false, read: false, update: false, delete: false },
      institutions: { create: false, read: true, update: false, delete: false },
      hearings: { create: true, read: true, update: true },
      decisions: { create: false, read: true },
      assessments: { create: false, read: true },
      reports: ['application', 'pre-parole', 'hearing'],
      notifications: ['application_submitted', 'hearing'],
    },
    'Jail Commander': {
      modules: ['overview', 'prisoners', 'applications', 'cases', 'officers', 'notifications', 'reports', 'forms', 'release', 'hearings'],
      prisoners: { create: false, read: true, update: false, delete: false, scope: 'institution', export: true },
      applications: { create: false, read: true, update: true, delete: false, scope: 'institution' },
      forms: { 1: 'view', 2: 'view', 3: 'edit', 4: 'view', 5: 'view' },
      users: { create: false, read: true, update: false, delete: false },
      institutions: { create: false, read: true, update: false, delete: false },
      hearings: { create: false, read: true, update: false },
      decisions: { create: false, read: true },
      assessments: { create: false, read: true },
      reports: ['institutional', 'approval'],
      notifications: ['eligibility', 'application', 'institutional'],
    },
    'DJAG Secretary': {
      modules: ['overview', 'applications', 'cases', 'hearings', 'decisions', 'notifications', 'reports', 'forms', 'analytics'],
      prisoners: { create: false, read: true, update: false, delete: false, scope: 'all', export: false },
      applications: { create: false, read: true, update: true, delete: false, scope: 'all' },
      forms: { 1: 'view', 2: 'view', 3: 'view', 4: 'view', 5: 'view' },
      users: { create: false, read: false, update: false, delete: false },
      institutions: { create: false, read: true, update: false, delete: false },
      hearings: { create: true, read: true, update: true },
      decisions: { create: false, read: true },
      assessments: { create: true, read: true },
      reports: ['hearing', 'application'],
      notifications: ['hearing', 'deadline'],
    },
    'Doctor': {
      modules: ['overview', 'prisoners', 'applications', 'decisions', 'notifications', 'forms'],
      prisoners: { create: false, read: true, update: false, delete: false, scope: 'all', export: false },
      applications: { create: false, read: true, update: false, delete: false, scope: 'all' },
      forms: { 1: 'view', 2: 'view', 3: 'view', 4: 'view', 5: 'view' },
      users: { create: false, read: false, update: false, delete: false },
      institutions: { create: false, read: true, update: false, delete: false },
      hearings: { create: false, read: true, update: false },
      decisions: { create: false, read: true },
      assessments: { create: true, read: true },
      reports: ['board'],
      notifications: ['board_review'],
    },
    'CS Commissioner': {
      modules: ['overview', 'prisoners', 'applications', 'decisions', 'notifications', 'reports', 'forms'],
      prisoners: { create: false, read: true, update: false, delete: false, scope: 'all', export: true },
      applications: { create: false, read: true, update: false, delete: false, scope: 'all' },
      forms: { 1: 'view', 2: 'view', 3: 'view', 4: 'view', 5: 'view' },
      users: { create: false, read: false, update: false, delete: false },
      institutions: { create: false, read: true, update: false, delete: false },
      hearings: { create: false, read: true, update: false },
      decisions: { create: false, read: true },
      assessments: { create: true, read: true },
      reports: ['board', 'institutional'],
      notifications: ['board_review'],
    },
    'Parole Board Member': {
      modules: ['overview', 'prisoners', 'applications', 'cases', 'hearings', 'decisions', 'history', 'reports', 'notifications', 'forms', 'analytics'],
      prisoners: { create: false, read: true, update: false, delete: false, scope: 'all', export: true },
      applications: { create: false, read: true, update: true, delete: false, scope: 'all' },
      forms: { 1: 'view', 2: 'view', 3: 'view', 4: 'view', 5: 'edit' },
      users: { create: false, read: false, update: false, delete: false },
      institutions: { create: false, read: true, update: false, delete: false },
      hearings: { create: false, read: true, update: false },
      decisions: { create: true, read: true },
      assessments: { create: false, read: true },
      reports: ['board', 'decision', 'meeting'],
      notifications: ['board_review', 'hearing'],
    },
  };

  function normalizeRole(role) {
    const map = {
      Admin: 'System Administrator',
      'CS Parole Clerk': 'PNGCS Parole Clerk',
      'Board Member': 'Parole Board Member',
      Secretariat: 'DJAG Parole Clerk',
    };
    return map[role] || role;
  }

  function getPermissions(user) {
    if (!user) return null;
    return PERMISSIONS[normalizeRole(user.role)] || null;
  }

  function can(user, resource, action) {
    const p = getPermissions(user);
    if (!p) return false;
    if (resource === 'prisoners' && ['create', 'update', 'delete'].includes(action)) {
      return canModifyPrisoner(user);
    }
    if (user.role === 'System Administrator' || normalizeRole(user.role) === 'System Administrator') {
      return true;
    }
    const r = p[resource];
    if (!r) return false;
    return r[action] === true;
  }

  function canModifyPrisoner(user) {
    return normalizeRole(user?.role) === PRISONER_MODIFY_ROLE;
  }

  function canReadPrisoner(user) {
    return getPermissions(user)?.prisoners?.read === true;
  }

  function canExportPrisonerReports(user) {
    return getPermissions(user)?.prisoners?.export === true;
  }

  function getPrisonerScope(user) {
    return getPermissions(user)?.prisoners?.scope || 'none';
  }

  function canAccessPrisonerRecord(user, prisoner) {
    if (!canReadPrisoner(user) || !prisoner) return false;
    const scope = getPrisonerScope(user);
    if (scope === 'all') return true;
    if (scope === 'institution' && user.institutionId) {
      return prisoner.institutionId === user.institutionId;
    }
    return scope === 'all';
  }

  function filterPrisonersForUser(user, prisoners) {
    if (!canReadPrisoner(user)) return [];
    const scope = getPrisonerScope(user);
    if (scope === 'all') return [...prisoners];
    if (scope === 'institution' && user.institutionId) {
      return prisoners.filter((p) => p.institutionId === user.institutionId);
    }
    return [];
  }

  function prisonerProfileUrl(prisonerId) {
    return `prisoner-profile.html?id=${encodeURIComponent(prisonerId)}`;
  }

  function prisonerEditUrl(prisonerId) {
    return prisonerId
      ? `prisoner-edit.html?id=${encodeURIComponent(prisonerId)}`
      : 'prisoner-edit.html';
  }

  function requirePrisonerView(user, prisonerId) {
    if (!user || !canReadPrisoner(user)) {
      PMSAuth.redirectAccessDenied('You do not have permission to view prisoner records.');
      return false;
    }
    const prisoner = typeof PMSStorage !== 'undefined' ? PMSStorage.getPrisonerById(prisonerId) : null;
    if (!prisoner) {
      PMSAuth.redirectAccessDenied('Prisoner record not found.');
      return false;
    }
    if (!canAccessPrisonerRecord(user, prisoner)) {
      PMSAuth.redirectAccessDenied('You do not have access to this prisoner record.');
      return false;
    }
    return prisoner;
  }

  function requirePrisonerModify(user, prisonerId = null) {
    if (!user || !canModifyPrisoner(user)) {
      PMSAuth.redirectAccessDenied('Only PNGCS Parole Clerks may create or modify prisoner records.');
      return false;
    }
    if (prisonerId) {
      const prisoner = typeof PMSStorage !== 'undefined' ? PMSStorage.getPrisonerById(prisonerId) : null;
      if (!prisoner) {
        PMSAuth.redirectAccessDenied('Prisoner record not found.');
        return false;
      }
      if (!canAccessPrisonerRecord(user, prisoner)) {
        PMSAuth.redirectAccessDenied('You do not have access to modify this prisoner record.');
        return false;
      }
      return prisoner;
    }
    return true;
  }

  function canEditForms(user) {
    return FORM_EDIT_ROLES.includes(normalizeRole(user?.role));
  }

  function canSubmitAssessment(user) {
    return ['Doctor', 'CS Commissioner', 'DJAG Secretary'].includes(normalizeRole(user?.role));
  }

  function canAccessForm(user, formNumber, mode = 'view') {
    const p = getPermissions(user);
    if (!p || !p.forms) return false;
    const access = p.forms[formNumber];
    if (mode === 'edit') {
      if (formNumber === 1) return canEditForms(user);
      if (formNumber === 3) return normalizeRole(user?.role) === 'Jail Commander';
      if (formNumber === 4) return normalizeRole(user?.role) === 'DJAG Parole Clerk';
      if (formNumber === 5) return normalizeRole(user?.role) === 'Parole Board Member';
      return access === 'edit';
    }
    return access === 'view' || access === 'edit';
  }

  function canAccessModule(user, module) {
    const p = getPermissions(user);
    return p?.modules?.includes(module) ?? false;
  }

  function scopeFilter(items, user, institutionKey = 'institutionId') {
    if (!canReadPrisoner(user)) return [];
    const scope = getPrisonerScope(user);
    if (scope === 'all') return [...items];
    if (scope === 'institution' && user.institutionId) {
      return items.filter((i) => i[institutionKey] === user.institutionId);
    }
    return [];
  }

  function requireFormAccess(user, formNumber, mode = 'view') {
    if (!canAccessForm(user, formNumber, mode)) {
      window.location.replace(PMSAuth.getDashboardForRole(user.role));
      return false;
    }
    return true;
  }

  return {
    PERMISSIONS,
    PRISONER_MODIFY_ROLE,
    FORM_EDIT_ROLES,
    normalizeRole,
    getPermissions,
    can,
    canModifyPrisoner,
    canReadPrisoner,
    canExportPrisonerReports,
    getPrisonerScope,
    canAccessPrisonerRecord,
    filterPrisonersForUser,
    prisonerProfileUrl,
    prisonerEditUrl,
    requirePrisonerView,
    requirePrisonerModify,
    canEditForms,
    canSubmitAssessment,
    canAccessForm,
    canAccessModule,
    scopeFilter,
    requireFormAccess,
  };
})();
