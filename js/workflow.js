/**
 * Official PMS Parole Workflow — steps, roles, and valid transitions.
 * This is the single active workflow (legacy client path). A partial Act 1991 server
 * implementation exists but is unmounted; see ARCHITECTURE_DECISIONS.md (ADR-001, 2026-09-14).
 */
const PMSWorkflow = (() => {
  const STEPS = [
    { id: 1, name: 'Prisoner Registration', status: null, role: 'CS Parole Clerk', action: 'Register prisoner record with SSD, SED, and institution' },
    { id: 2, name: 'Eligibility Calculation', status: 'Eligible for Parole Application', role: 'System (Automated)', action: 'Calculate eligibility at one-half (1/2) of sentence served' },
    { id: 3, name: 'Eligibility Notification', status: null, role: 'System (Automated)', action: 'Notify CS Parole Clerk, CS Parole Officer, and System Administrator' },
    { id: 4, name: 'Forms 1 & 2 Preparation', status: 'Draft', role: 'CS Parole Officer / PNGCS & DJAG Clerks', action: 'Complete Form 1 and Form 2 (DDR by CS, PPR by DJAG)' },
    { id: 5, name: 'Institutional Verification', status: 'Pending Commander Review', role: 'Jail Commander', action: 'Verify Forms 1–2 and record institutional decision' },
    { id: 6, name: 'Submit to DJAG', status: 'Submitted', role: 'CS Parole Clerk', action: 'Submit complete application package to DJAG' },
    { id: 7, name: 'DJAG Review', status: 'Under DJAG Review', role: 'DJAG Parole Clerk', action: 'Verify documentation and review application' },
    { id: 8, name: 'Return for Correction', status: 'Returned for Correction', role: 'DJAG Parole Clerk', action: 'Return application to PNGCS for correction if required' },
    { id: 9, name: 'Schedule Hearing', status: 'Hearing Scheduled', role: 'DJAG Secretary', action: 'Schedule parole hearing within 14 days of commander verification' },
    { id: 10, name: 'Parole Hearing Process', status: 'Hearing Scheduled', role: 'Board / CS Parole Clerk', action: 'Conduct hearing, record proceedings, and capture board votes in the hearing portal' },
    { id: 11, name: 'Board Assessments', status: 'Pending Board Review', role: 'Psychiatrist / PNGCS Commissioner / DJAG Secretary', action: 'Submit individual board assessments' },
    { id: 12, name: 'Score Calculation', status: 'Pending Board Review', role: 'System (Automated)', action: 'Calculate final parole score (simple majority of 3 board members)' },
    { id: 13, name: 'Form 4 or 5 Outcome', status: 'Parole Granted|Parole Refused', role: 'DJAG Secretary', action: 'Record Form 4 (Granted) or Form 5 (Refused) based on board vote' },
    { id: 14, name: 'Approval Workflow', status: 'Pending Approval', role: 'DJAG Secretary / CS Parole Clerk', action: 'Complete required approvals before release' },
    { id: 15, name: 'Release Authorization', status: 'Approved', role: 'Jail Commander', action: 'Authorize release from institution after board interviews' },
    { id: 16, name: 'Audit & Notification', status: null, role: 'System (Automated)', action: 'Log all actions and notify stakeholders' },
  ];

  const TRANSITIONS = {
    Draft: ['Submitted', 'Pending Commander Review'],
    Submitted: ['Under DJAG Review', 'Returned for Correction', 'Pending Commander Review'],
    'Pending Commander Review': ['Pre-Parole Report Prepared', 'Returned for Correction', 'Refused'],
    'Under DJAG Review': ['Pre-Parole Report Prepared', 'Returned for Correction'],
    'Returned for Correction': ['Draft', 'Submitted', 'Pending Commander Review'],
    'Pre-Parole Report Prepared': ['Hearing Scheduled', 'Pending Board Review', 'Under DJAG Review'],
    'Hearing Scheduled': ['Hearing In Progress', 'Pending Board Review', 'Parole Granted', 'Parole Refused', 'Deferred'],
    'Hearing In Progress': ['Pending Board Review', 'Parole Granted', 'Parole Refused', 'Deferred'],
    'Pending Board Review': ['Parole Granted', 'Parole Refused', 'Pending Approval', 'Deferred'],
    'Parole Granted': ['Pending Approval', 'Approved'],
    'Parole Refused': ['Refused'],
    'Pending Approval': ['Approved', 'Returned for Correction', 'Refused', 'Released'],
    Approved: ['Released'],
  };

  const TRANSITION_ROLES = {
    'Draft→Submitted': ['CS Parole Clerk', 'CS Parole Officer'],
    'Draft→Pending Commander Review': ['CS Parole Clerk', 'CS Parole Officer'],
    'Submitted→Under DJAG Review': ['DJAG Parole Clerk'],
    'Submitted→Returned for Correction': ['DJAG Parole Clerk', 'CS Parole Clerk'],
    'Submitted→Pending Commander Review': ['CS Parole Clerk', 'CS Parole Officer'],
    'Pending Commander Review→Pre-Parole Report Prepared': ['Jail Commander', 'CS Parole Clerk'],
    'Pending Commander Review→Returned for Correction': ['Jail Commander', 'CS Parole Clerk'],
    'Pending Commander Review→Refused': ['Jail Commander', 'CS Parole Clerk'],
    'Under DJAG Review→Pre-Parole Report Prepared': ['DJAG Parole Clerk'],
    'Under DJAG Review→Returned for Correction': ['DJAG Parole Clerk'],
    'Returned for Correction→Draft': ['CS Parole Clerk', 'CS Parole Officer'],
    'Returned for Correction→Submitted': ['CS Parole Clerk', 'CS Parole Officer'],
    'Returned for Correction→Pending Commander Review': ['CS Parole Clerk', 'CS Parole Officer'],
    'Pre-Parole Report Prepared→Under DJAG Review': ['CS Parole Clerk', 'CS Parole Officer'],
    'Pre-Parole Report Prepared→Hearing Scheduled': ['DJAG Secretary', 'DJAG Parole Clerk'],
    'Pre-Parole Report Prepared→Pending Board Review': ['DJAG Secretary', 'DJAG Parole Clerk'],
    'Hearing Scheduled→Hearing In Progress': ['DJAG Secretary', 'Doctor', 'CS Commissioner', 'System Administrator'],
    'Hearing Scheduled→Pending Board Review': ['DJAG Secretary', 'Doctor', 'CS Commissioner', 'System Administrator'],
    'Hearing Scheduled→Parole Granted': ['DJAG Secretary', 'Doctor', 'CS Commissioner', 'System Administrator'],
    'Hearing Scheduled→Parole Refused': ['DJAG Secretary', 'Doctor', 'CS Commissioner', 'System Administrator'],
    'Hearing Scheduled→Deferred': ['DJAG Secretary', 'Doctor', 'CS Commissioner', 'System Administrator'],
    'Hearing In Progress→Pending Board Review': ['DJAG Secretary', 'Doctor', 'CS Commissioner', 'System Administrator'],
    'Hearing In Progress→Parole Granted': ['DJAG Secretary', 'Doctor', 'CS Commissioner', 'System Administrator'],
    'Hearing In Progress→Parole Refused': ['DJAG Secretary', 'Doctor', 'CS Commissioner', 'System Administrator'],
    'Hearing In Progress→Deferred': ['DJAG Secretary', 'Doctor', 'CS Commissioner', 'System Administrator'],
    'Pending Board Review→Pending Approval': ['DJAG Secretary'],
    'Pending Board Review→Parole Granted': ['DJAG Secretary', 'Doctor', 'CS Commissioner', 'System Administrator'],
    'Pending Board Review→Parole Refused': ['DJAG Secretary', 'Doctor', 'CS Commissioner', 'System Administrator'],
    'Pending Board Review→Deferred': ['DJAG Secretary', 'Doctor', 'CS Commissioner', 'System Administrator'],
    'Parole Granted→Pending Approval': ['DJAG Secretary'],
    'Parole Granted→Approved': ['DJAG Secretary', 'CS Parole Clerk'],
    'Parole Refused→Refused': ['DJAG Secretary'],
    'Parole Granted→Released': ['Jail Commander', 'CS Parole Clerk'],
    'Pending Approval→Approved': ['DJAG Secretary', 'CS Parole Clerk'],
    'Pending Approval→Returned for Correction': ['DJAG Secretary', 'CS Parole Clerk'],
    'Pending Approval→Refused': ['DJAG Secretary'],
    'Pending Approval→Released': ['Jail Commander', 'CS Parole Clerk'],
    'Approved→Released': ['Jail Commander', 'CS Parole Clerk'],
  };

  const FORM_OWNERS = {
    1: 'CS Parole Officer',
    2: 'CS Parole Clerk / DJAG Parole Clerk',
    3: 'CS Parole Clerk',
    4: 'DJAG Secretary',
    5: 'DJAG Secretary',
  };

  function canTransition(user, fromStatus, toStatus) {
    const allowed = TRANSITIONS[fromStatus];
    if (!allowed || !allowed.includes(toStatus)) return false;
    const key = `${fromStatus}→${toStatus}`;
    const roles = TRANSITION_ROLES[key] || [];
    const role = user?.role || '';
    if (role === 'System Administrator') return true;
    if (roles.includes(role)) return true;
    if (role === 'CS Parole Clerk' && roles.includes('CS Parole Officer')) return true;
    return false;
  }

  function getFormOwner(formNumber) {
    return FORM_OWNERS[formNumber] || 'CS Parole Clerk';
  }

  function getFormWorkflowStep(formNumber) {
    return { 1: 4, 2: 4, 3: 10, 4: 13, 5: 13 }[formNumber];
  }

  function getAdvanceBlockers(app, toStatus) {
    if (!app || typeof PMSStorage === 'undefined') return [];
    const blockers = [];
    const summary = PMSStorage.getFormCompletionSummary(app);
    const checks = {
      form1: summary.checks.form1,
      form2: summary.checks.form2,
      form3: summary.checks.form3,
      hearing: summary.checks.hearing || summary.checks.form3,
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
      need('commanderVerified', 'Institutional verification must be completed.');
    }
    if (toStatus === 'Pending Commander Review') {
      need('form1', 'Form 1 must be completed.');
      need('form2', 'Form 2 must be completed.');
    }
    if (toStatus === 'Pre-Parole Report Prepared') {
      need('form2', 'Form 2 must be completed.');
      need('commanderVerified', 'Institutional verification must be completed.');
    }
    if (toStatus === 'Hearing Scheduled') { need('commanderVerified', 'Institutional verification is required.'); }
    if (toStatus === 'Hearing In Progress') {
      need('hearingScheduled', 'A hearing must be scheduled before the session can start.');
      need('commanderVerified', 'Institutional verification is required.');
    }
    if (toStatus === 'Pending Board Review') need('hearingScheduled', 'A hearing must be scheduled before board review.');
    if (['Parole Granted', 'Parole Refused', 'Pending Approval'].includes(toStatus)) {
      need('assessmentsComplete', 'All board assessments must be submitted.');
      need('scoreCalculated', 'Final parole score must be calculated.');
      need('hearing', 'Parole hearing process must be completed.');
    }
    if (toStatus === 'Approved') need('approvalsComplete', 'Required approval workflow must be completed.');
    if (toStatus === 'Released') {
      if (!PMSStorage.isForm4Issued(app) && !PMSStorage.requiredApprovalsComplete(app)) {
        need('assessmentsComplete', 'All board interview assessments must be completed before release.');
      }
      const grantReady = PMSStorage.isForm4Issued(app)
        || ['Approved', 'Pending Approval', 'Parole Granted', 'Released'].includes(app.status);
      if (!grantReady) {
        blockers.push('Case must be approved or parole granted before release authorization.');
      }
    }
    return blockers;
  }

  function canAdvanceApplication(app, toStatus) {
    const blockers = getAdvanceBlockers(app, toStatus);
    return { allowed: blockers.length === 0, blockers };
  }

  function getReturnTarget(fromStatus) {
    if (fromStatus === 'Returned for Correction') return { role: 'CS Parole Clerk', stage: 'Form 1 / Form 2 correction' };
    if (fromStatus === 'Under DJAG Review') return { role: 'DJAG Parole Clerk', stage: 'DJAG review' };
    return { role: 'CS Parole Clerk', stage: 'Case preparation' };
  }

  return { STEPS, TRANSITIONS, TRANSITION_ROLES, FORM_OWNERS, canTransition, getFormOwner, getFormWorkflowStep, getAdvanceBlockers, canAdvanceApplication, getReturnTarget };
})();
