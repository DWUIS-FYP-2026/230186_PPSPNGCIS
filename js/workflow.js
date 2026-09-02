/**
 * Official PMS Parole Workflow — steps, roles, and valid transitions.
 */
const PMSWorkflow = (() => {
  const STEPS = [
    { id: 1, name: 'Prisoner Registration', status: null, role: 'PNGCS Parole Clerk', action: 'Register prisoner record with SSD, SED, and institution' },
    { id: 2, name: 'Eligibility Calculation', status: 'Eligible for Parole Application', role: 'System (Automated)', action: 'Calculate eligibility at one-third (1/3) of sentence served' },
    { id: 3, name: 'Eligibility Notification', status: null, role: 'System (Automated)', action: 'Notify PNGCS Parole Clerk, CS Parole Officer, and System Administrator' },
    { id: 4, name: 'Forms 1 & 2 Preparation', status: 'Draft', role: 'CS Parole Officer / PNGCS & DJAG Clerks', action: 'Complete Form 1 and Form 2 (DDR by CS, PPR by DJAG)' },
    { id: 5, name: 'Institutional Verification', status: 'Pending Commander Review', role: 'PNGCS Parole Clerk', action: 'Verify assessment information and institutional readiness' },
    { id: 6, name: 'Form 3 — Institutional Report', status: 'Draft', role: 'PNGCS Parole Clerk', action: 'Complete Form 3 (Institutional Report)' },
    { id: 7, name: 'Submit to DJAG', status: 'Submitted', role: 'PNGCS Parole Clerk', action: 'Submit complete application package to DJAG' },
    { id: 8, name: 'DJAG Review', status: 'Under DJAG Review', role: 'DJAG Parole Clerk', action: 'Verify documentation and review application' },
    { id: 9, name: 'Return for Correction', status: 'Returned for Correction', role: 'DJAG Parole Clerk', action: 'Return application to PNGCS for correction if required' },
    { id: 10, name: 'Schedule Hearing', status: 'Hearing Scheduled', role: 'DJAG Secretary', action: 'Schedule parole hearing within 2 weeks' },
    { id: 11, name: 'Board Assessments', status: 'Pending Board Review', role: 'Doctor / CS Commissioner / DJAG Secretary', action: 'Submit individual board assessments' },
    { id: 12, name: 'Score Calculation', status: 'Pending Board Review', role: 'System (Automated)', action: 'Calculate final parole score (80% threshold)' },
    { id: 13, name: 'Form 4 or 5 Outcome', status: 'Parole Granted|Parole Refused', role: 'Parole Board Member', action: 'Record Form 4 (Granted) or Form 5 (Refused) based on score' },
    { id: 14, name: 'Approval Workflow', status: 'Pending Approval', role: 'Board / PNGCS Parole Clerk', action: 'Complete required approvals before release' },
    { id: 15, name: 'Release Authorization', status: 'Approved', role: 'PNGCS Parole Clerk', action: 'Authorize release from institution' },
    { id: 16, name: 'Audit & Notification', status: null, role: 'System (Automated)', action: 'Log all actions and notify stakeholders' },
  ];

  const TRANSITIONS = {
    Draft: ['Submitted', 'Pending Commander Review'],
    Submitted: ['Under DJAG Review', 'Returned for Correction', 'Pending Commander Review'],
    'Pending Commander Review': ['Pre-Parole Report Prepared', 'Returned for Correction', 'Refused'],
    'Under DJAG Review': ['Pre-Parole Report Prepared', 'Returned for Correction'],
    'Returned for Correction': ['Draft', 'Submitted', 'Pending Commander Review'],
    'Pre-Parole Report Prepared': ['Hearing Scheduled', 'Pending Board Review'],
    'Hearing Scheduled': ['Pending Board Review', 'In Progress'],
    'Pending Board Review': ['Parole Granted', 'Parole Refused', 'Pending Approval', 'Deferred'],
    'Parole Granted': ['Pending Approval', 'Approved'],
    'Parole Refused': ['Refused'],
    'Pending Approval': ['Approved', 'Returned for Correction', 'Refused'],
    Approved: ['Released'],
  };

  const TRANSITION_ROLES = {
    'Draft→Submitted': ['PNGCS Parole Clerk', 'CS Parole Officer', 'System Administrator'],
    'Draft→Pending Commander Review': ['PNGCS Parole Clerk', 'CS Parole Officer', 'System Administrator'],
    'Submitted→Under DJAG Review': ['DJAG Parole Clerk', 'System Administrator'],
    'Submitted→Returned for Correction': ['DJAG Parole Clerk', 'PNGCS Parole Clerk', 'System Administrator'],
    'Submitted→Pending Commander Review': ['PNGCS Parole Clerk', 'CS Parole Officer', 'System Administrator'],
    'Pending Commander Review→Pre-Parole Report Prepared': ['PNGCS Parole Clerk', 'System Administrator'],
    'Pending Commander Review→Returned for Correction': ['PNGCS Parole Clerk', 'System Administrator'],
    'Pending Commander Review→Refused': ['PNGCS Parole Clerk', 'System Administrator'],
    'Under DJAG Review→Pre-Parole Report Prepared': ['DJAG Parole Clerk', 'System Administrator'],
    'Under DJAG Review→Returned for Correction': ['DJAG Parole Clerk', 'System Administrator'],
    'Returned for Correction→Draft': ['PNGCS Parole Clerk', 'CS Parole Officer', 'System Administrator'],
    'Returned for Correction→Submitted': ['PNGCS Parole Clerk', 'CS Parole Officer', 'System Administrator'],
    'Returned for Correction→Pending Commander Review': ['PNGCS Parole Clerk', 'CS Parole Officer', 'System Administrator'],
    'Pre-Parole Report Prepared→Hearing Scheduled': ['DJAG Secretary', 'DJAG Parole Clerk', 'System Administrator'],
    'Pre-Parole Report Prepared→Pending Board Review': ['DJAG Secretary', 'DJAG Parole Clerk', 'System Administrator'],
    'Hearing Scheduled→Pending Board Review': ['DJAG Secretary', 'DJAG Parole Clerk', 'Parole Board Member', 'System Administrator'],
    'Hearing Scheduled→In Progress': ['DJAG Secretary', 'Parole Board Member', 'System Administrator'],
    'Pending Board Review→Pending Approval': ['Parole Board Member', 'System Administrator'],
    'Pending Board Review→Parole Granted': ['Parole Board Member', 'System Administrator'],
    'Pending Board Review→Parole Refused': ['Parole Board Member', 'System Administrator'],
    'Pending Board Review→Deferred': ['Parole Board Member', 'System Administrator'],
    'Parole Granted→Pending Approval': ['Parole Board Member', 'System Administrator'],
    'Parole Granted→Approved': ['Parole Board Member', 'PNGCS Parole Clerk', 'System Administrator'],
    'Parole Refused→Refused': ['Parole Board Member', 'System Administrator'],
    'Pending Approval→Approved': ['Parole Board Member', 'PNGCS Parole Clerk', 'System Administrator'],
    'Pending Approval→Returned for Correction': ['Parole Board Member', 'PNGCS Parole Clerk', 'System Administrator'],
    'Pending Approval→Refused': ['Parole Board Member', 'System Administrator'],
    'Approved→Released': ['PNGCS Parole Clerk', 'System Administrator'],
  };

  const FORM_OWNERS = {
    1: 'CS Parole Officer',
    2: 'PNGCS Parole Clerk / DJAG Parole Clerk',
    3: 'PNGCS Parole Clerk',
    4: 'Parole Board Member',
    5: 'Parole Board Member',
  };

  function canTransition(user, fromStatus, toStatus) {
    const allowed = TRANSITIONS[fromStatus];
    if (!allowed || !allowed.includes(toStatus)) return false;
    const key = `${fromStatus}→${toStatus}`;
    const roles = TRANSITION_ROLES[key] || ['System Administrator'];
    const role = user?.role || '';
    if (roles.includes(role)) return true;
    if (role === 'PNGCS Parole Clerk' && roles.includes('CS Parole Officer')) return true;
    return false;
  }

  function getFormOwner(formNumber) {
    return FORM_OWNERS[formNumber] || 'PNGCS Parole Clerk';
  }

  function getFormWorkflowStep(formNumber) {
    return { 1: 4, 2: 4, 3: 6, 4: 13, 5: 13 }[formNumber];
  }

  function getAdvanceBlockers(app, toStatus) {
    if (!app || typeof PMSStorage === 'undefined') return [];
    const blockers = [];
    const summary = PMSStorage.getFormCompletionSummary(app);
    const checks = {
      form1: summary.checks.form1,
      form2: summary.checks.form2,
      form3: summary.checks.form3,
      commanderVerified: PMSStorage.isCommanderVerified(app),
      hearingScheduled: PMSStorage.getHearingsByApplication(app.id).some((h) => !['Cancelled', 'Pending'].includes(h.status)),
      assessmentsComplete: PMSStorage.requiredBoardAssessmentsComplete(app),
      scoreCalculated: (app.paroleScore || PMSStorage.calculateParoleScore(app)).complete,
      approvalsComplete: PMSStorage.requiredApprovalsComplete(app),
    };
    const need = (key, msg) => { if (!checks[key]) blockers.push(msg); };

    if (toStatus === 'Submitted') {
      need('form1', 'Form 1 must be completed and submitted.');
      need('form2', 'Form 2 (DDR and PPR) must be completed.');
      need('form3', 'Form 3 institutional report must be completed.');
      need('commanderVerified', 'Institutional verification must be completed.');
    }
    if (toStatus === 'Pending Commander Review') { need('form1', 'Form 1 must be completed.'); need('form2', 'Form 2 must be completed.'); }
    if (toStatus === 'Pre-Parole Report Prepared') { need('form2', 'Form 2 must be completed.'); need('form3', 'Form 3 must be completed.'); }
    if (toStatus === 'Hearing Scheduled') { need('commanderVerified', 'Institutional verification is required.'); need('form3', 'Form 3 must be completed.'); }
    if (toStatus === 'Pending Board Review') need('hearingScheduled', 'A hearing must be scheduled before board review.');
    if (['Parole Granted', 'Parole Refused', 'Pending Approval'].includes(toStatus)) {
      need('assessmentsComplete', 'All board assessments must be submitted.');
      need('scoreCalculated', 'Final parole score must be calculated.');
    }
    if (toStatus === 'Approved') need('approvalsComplete', 'Required approval workflow must be completed.');
    if (toStatus === 'Released') {
      need('approvalsComplete', 'Final approval must be completed before release.');
      if (!['Approved', 'Pending Approval', 'Parole Granted'].includes(app.status)) blockers.push('Case must be approved before release authorization.');
    }
    return blockers;
  }

  function canAdvanceApplication(app, toStatus) {
    const blockers = getAdvanceBlockers(app, toStatus);
    return { allowed: blockers.length === 0, blockers };
  }

  function getReturnTarget(fromStatus) {
    if (fromStatus === 'Returned for Correction') return { role: 'PNGCS Parole Clerk', stage: 'Form 1 / Form 2 correction' };
    if (fromStatus === 'Under DJAG Review') return { role: 'DJAG Parole Clerk', stage: 'DJAG review' };
    return { role: 'PNGCS Parole Clerk', stage: 'Case preparation' };
  }

  return { STEPS, TRANSITIONS, TRANSITION_ROLES, FORM_OWNERS, canTransition, getFormOwner, getFormWorkflowStep, getAdvanceBlockers, canAdvanceApplication, getReturnTarget };
})();
