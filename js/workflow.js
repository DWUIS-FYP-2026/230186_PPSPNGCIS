/**
 * Official PMS Parole Workflow — steps, roles, and valid transitions.
 */
const PMSWorkflow = (() => {
  const STEPS = [
    { id: 1, name: 'Prisoner Registration', status: null, role: 'PNGCS Parole Clerk', action: 'Register prisoner record with SSD, SED, and institution' },
    { id: 2, name: 'Eligibility Calculation', status: 'Eligible for Parole', role: 'System (Automated)', action: 'Calculate eligibility at one-third (1/3) of sentence served' },
    { id: 3, name: 'Eligibility Notification', status: null, role: 'System (Automated)', action: 'Notify PNGCS Clerk, Jail Commander, and System Administrator' },
    { id: 4, name: 'Forms 1 & 2 Preparation', status: 'Draft', role: 'PNGCS Parole Clerk', action: 'Complete Form 1 (Eligibility Assessment) and Form 2 (Personal Particulars)' },
    { id: 5, name: 'Form 3 — Institutional Report', status: 'Draft', role: 'Jail Commander / PNGCS', action: 'Complete and approve Form 3 (Institutional Report)' },
    { id: 6, name: 'Submit to DJAG', status: 'Submitted', role: 'PNGCS Parole Clerk', action: 'Submit complete application package to DJAG' },
    { id: 7, name: 'DJAG Review', status: 'Under DJAG Review', role: 'DJAG Parole Clerk', action: 'Verify documentation and review application' },
    { id: 8, name: 'Return for Correction', status: 'Returned for Correction', role: 'DJAG Parole Clerk', action: 'Return application to PNGCS for correction if required' },
    { id: 9, name: 'Pre-Parole Report', status: 'Pre-Parole Report Prepared', role: 'DJAG Parole Clerk', action: 'Complete Form 4 (Pre-Parole Investigation Report)' },
    { id: 10, name: 'Schedule Hearing', status: 'Hearing Scheduled', role: 'DJAG Parole Clerk', action: 'Schedule parole hearing and notify Parole Board' },
    { id: 11, name: 'Board Review', status: 'Pending Board Review', role: 'Parole Board', action: 'Review application, reports, and hearing schedule' },
    { id: 12, name: 'Board Deliberation', status: 'Pending Board Review', role: 'Parole Board', action: 'Conduct hearing deliberations' },
    { id: 13, name: 'Record Decision', status: 'Approved|Deferred|Refused', role: 'Parole Board', action: 'Complete Form 5 and record final decision' },
    { id: 14, name: 'Audit & Notification', status: null, role: 'System (Automated)', action: 'Log all actions and notify stakeholders' },
  ];

  const TRANSITIONS = {
    Draft: ['Submitted'],
    Submitted: ['Under DJAG Review', 'Returned for Correction'],
    'Under DJAG Review': ['Pre-Parole Report Prepared', 'Returned for Correction'],
    'Returned for Correction': ['Draft', 'Submitted'],
    'Pre-Parole Report Prepared': ['Hearing Scheduled', 'Pending Board Review'],
    'Hearing Scheduled': ['Pending Board Review'],
    'Pending Board Review': ['Approved', 'Deferred', 'Refused'],
  };

  const TRANSITION_ROLES = {
    'Draft→Submitted': ['PNGCS Parole Clerk', 'System Administrator'],
    'Submitted→Under DJAG Review': ['DJAG Parole Clerk', 'System Administrator'],
    'Submitted→Returned for Correction': ['DJAG Parole Clerk', 'System Administrator'],
    'Under DJAG Review→Pre-Parole Report Prepared': ['DJAG Parole Clerk', 'System Administrator'],
    'Under DJAG Review→Returned for Correction': ['DJAG Parole Clerk', 'System Administrator'],
    'Returned for Correction→Draft': ['PNGCS Parole Clerk', 'System Administrator'],
    'Returned for Correction→Submitted': ['PNGCS Parole Clerk', 'System Administrator'],
    'Pre-Parole Report Prepared→Hearing Scheduled': ['DJAG Parole Clerk', 'System Administrator'],
    'Pre-Parole Report Prepared→Pending Board Review': ['DJAG Parole Clerk', 'System Administrator'],
    'Hearing Scheduled→Pending Board Review': ['DJAG Parole Clerk', 'System Administrator'],
    'Pending Board Review→Approved': ['Parole Board Member', 'System Administrator'],
    'Pending Board Review→Deferred': ['Parole Board Member', 'System Administrator'],
    'Pending Board Review→Refused': ['Parole Board Member', 'System Administrator'],
  };

  function canTransition(user, fromStatus, toStatus) {
    const allowed = TRANSITIONS[fromStatus];
    if (!allowed || !allowed.includes(toStatus)) return false;
    const key = `${fromStatus}→${toStatus}`;
    const roles = TRANSITION_ROLES[key] || ['System Administrator'];
    return roles.includes(user.role);
  }

  function getFormOwner(formNumber) {
    return { 1: 'PNGCS Parole Clerk', 2: 'PNGCS Parole Clerk', 3: 'Jail Commander', 4: 'DJAG Parole Clerk', 5: 'Parole Board Member' }[formNumber];
  }

  function getFormWorkflowStep(formNumber) {
    return { 1: 4, 2: 4, 3: 5, 4: 9, 5: 13 }[formNumber];
  }

  return { STEPS, TRANSITIONS, TRANSITION_ROLES, canTransition, getFormOwner, getFormWorkflowStep };
})();
