/**
 * Parole Act 1991 — business logic orchestration.
 */
const { PAROLE_STATUSES, ROLES, WORKFLOW_VERSION } = require('./constants');
const { recalculateEligibility, calculateCooldownUntil, toDateString } = require('./eligibility');
const { validateTransition } = require('./state-machine');
const {
  mapSeatForRole,
  recordVotePatch,
  computeFinalDecision,
  calculateCommunitySafetyScore,
  getVotes,
  hasQuorum,
} = require('./board-engine');
const {
  assertRole,
  assertCanEditDetaineeReport,
  assertCanEditPreParoleReport,
  ACTION_ROLES,
} = require('./rbac');
const repo = require('./repository');
const { generateForm1Document, generateParoleOrder, generateRefusalNotice, renderForm1Html } = require('./documents');
const { buildForm1Payload } = require('./form1-builder');

const NOTIFICATION_TYPE_PRE_ELIGIBILITY = 'pre_eligibility_6_month';

async function ensureAct1991Application(prisonerId, actor = null) {
  const prisoner = await repo.getPrisonerById(prisonerId);
  if (!prisoner) throw new Error('Prisoner not found.');

  let application = await repo.findAct1991ApplicationForPrisoner(prisonerId);
  if (application) return application;

  return repo.createAct1991Application(prisoner, actor?.id || null);
}

async function recalculateApplicationEligibility(applicationId, actor = null) {
  const bundle = await repo.getApplicationWithPrisoner(applicationId);
  if (!bundle) throw new Error('Application not found.');
  if (bundle.application.workflowVersion !== WORKFLOW_VERSION) {
    throw new Error('Application is not on the Act 1991 workflow.');
  }

  const calc = recalculateEligibility(bundle.prisoner);
  await repo.updatePrisonerEligibilityFields(bundle.prisoner.id, calc);
  await repo.updateApplicationStatus(applicationId, bundle.application.status, {
    eligibilityDate: calc.eligibilityDate,
    notificationDate: calc.notificationDate,
  });

  await repo.insertAudit(actor, 'RECALCULATE', 'ParoleApplication', applicationId,
    `Eligibility recalculated: ${calc.eligibilityDate}`);

  return { ...bundle.application, ...calc };
}

async function transition(applicationId, toStatus, actor, notes = '', extraFields = {}) {
  const bundle = await repo.getApplicationWithPrisoner(applicationId);
  if (!bundle) throw new Error('Application not found.');

  const { application, prisoner } = bundle;
  const fromStatus = application.status;

  const detaineeReport = await repo.getDetaineeReport(applicationId);
  const preParoleReport = await repo.getPreParoleReport(applicationId);

  validateTransition(fromStatus, toStatus, {
    prisonerConsent: extraFields.prisonerConsent ?? application.prisonerConsent,
    detaineeReportSubmitted: !!detaineeReport,
    preParoleReportSubmitted: !!preParoleReport,
    riskLevel: detaineeReport?.risk_level || prisoner.risk_classification,
    riskClassification: prisoner.risk_classification,
  }, actor?.role || 'system');

  await repo.updateApplicationStatus(applicationId, toStatus, extraFields);
  await repo.logTransition(applicationId, fromStatus, toStatus, actor?.id || null, actor?.role || 'system', notes);
  await repo.insertAudit(actor, 'TRANSITION', 'ParoleApplication', applicationId, `${fromStatus} → ${toStatus}. ${notes}`);

  return repo.getApplicationById(applicationId);
}

async function runDailyEligibilityCheck(asOf = new Date()) {
  const asOfDate = toDateString(asOf);
  const pending = await repo.getPendingEligibilityApplications(asOfDate);
  const results = [];

  for (const { application, prisoner } of pending) {
    const alreadySent = await repo.hasNotificationLog(application.id, NOTIFICATION_TYPE_PRE_ELIGIBILITY);
    if (alreadySent) continue;

    const calc = recalculateEligibility(prisoner, asOf);
    await repo.updatePrisonerEligibilityFields(prisoner.id, calc);

    if (!calc.isNotificationDue) continue;

    await transition(application.id, PAROLE_STATUSES.ELIGIBLE, null,
      'Automatic transition: 6-month pre-eligibility notification threshold reached', {
        notificationSentAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        eligibilityDate: calc.eligibilityDate,
        notificationDate: calc.notificationDate,
      });

    await repo.logParoleNotification(
      application.id,
      prisoner.id,
      NOTIFICATION_TYPE_PRE_ELIGIBILITY,
      calc.notificationDate,
      ROLES.CS_PAROLE_CLERK
    );

    await repo.createSystemNotification({
      title: 'Parole Pre-Eligibility Alert (6 months)',
      message: `${prisoner.first_name} ${prisoner.last_name} (${prisoner.prisoner_number}) reaches parole eligibility on ${calc.eligibilityDate}. Begin Form 1 preparation.`,
      recipientRole: ROLES.CS_PAROLE_CLERK,
      prisonerId: prisoner.id,
      institutionId: prisoner.institution_id,
      applicationId: application.id,
      type: 'eligibility',
    });

    results.push({ applicationId: application.id, prisonerId: prisoner.id, eligibilityDate: calc.eligibilityDate });
  }

  return results;
}

async function getEligibleList(user) {
  assertRole(user, ACTION_ROLES.viewEligibleList, 'view the eligible list');
  return repo.getEligibleList();
}

async function generateForm1ForPrisoner(prisonerId, user, sectionDInput = {}) {
  assertRole(user, ACTION_ROLES.submitConsent, 'generate Form 1');

  const prisoner = await repo.getPrisonerById(prisonerId);
  if (!prisoner) throw new Error('Prisoner not found.');

  let application = await repo.findAct1991ApplicationForPrisoner(prisonerId);
  if (!application) {
    application = await repo.createAct1991Application(prisoner, user.id);
  }

  if (![PAROLE_STATUSES.ELIGIBLE, PAROLE_STATUSES.AWAITING_PRISONER_CONSENT].includes(application.status)) {
    if (application.status === PAROLE_STATUSES.PENDING_ELIGIBILITY) {
      throw new Error('Prisoner is not yet on the eligible list. Wait for the 6-month pre-eligibility notification.');
    }
    throw new Error(`Form 1 cannot be generated while application status is ${application.status}.`);
  }

  const bundle = await repo.getApplicationWithPrisoner(application.id);
  const form1Payload = generateForm1Document(bundle, null, { sectionD: sectionDInput });

  await repo.upsertForm1Data(application.id, {
    sponsorName: sectionDInput.sponsor_name || sectionDInput.sponsorName,
    sponsorRelationship: sectionDInput.sponsor_relationship || sectionDInput.sponsorRelationship,
    sponsorContact: sectionDInput.sponsor_contact || sectionDInput.sponsorContact,
    sponsorAddress: sectionDInput.sponsor_address || sectionDInput.sponsorAddress,
    proposedResidence: sectionDInput.proposed_residence || sectionDInput.proposedResidence,
    proposedResidenceProvince: sectionDInput.proposed_residence_province || sectionDInput.proposedResidenceProvince,
    employmentPlans: sectionDInput.employment_plans || sectionDInput.employmentPlans,
    communityServicePlans: sectionDInput.community_service_plans || sectionDInput.communityServicePlans,
    sectionSnapshot: form1Payload,
  }, user.id);

  await repo.insertAudit(user, 'GENERATE', 'Form1', application.id, 'Form 1 generated — Sections A–E');

  if (application.status === PAROLE_STATUSES.ELIGIBLE) {
    await transition(application.id, PAROLE_STATUSES.AWAITING_PRISONER_CONSENT, user,
      'Form 1 generated — awaiting prisoner consent', {
        formData: { ...(application.formData || {}), form1: form1Payload },
      });
  } else {
    await repo.updateApplicationStatus(application.id, application.status, {
      formData: { ...(application.formData || {}), form1: form1Payload },
    });
  }

  return {
    application: await repo.getApplicationById(application.id),
    form1: form1Payload,
    form1Record: await repo.getForm1Data(application.id),
  };
}

async function downloadForm1(applicationId, user, { markPrinted = true } = {}) {
  assertRole(user, ACTION_ROLES.viewEligibleList, 'download Form 1');
  const bundle = await repo.getApplicationWithPrisoner(applicationId);
  if (!bundle) throw new Error('Application not found.');

  const form1Row = await repo.getForm1Data(applicationId);
  let form1 = form1Row?.sectionSnapshot;
  if (!form1) {
    form1 = generateForm1Document(bundle, form1Row);
  } else {
    form1.printableHtml = renderForm1Html(form1);
  }

  if (markPrinted && form1Row) await repo.markForm1Printed(applicationId);

  return {
    html: form1.printableHtml || renderForm1Html(form1),
    form1,
    filename: `Form1-${bundle.application.caseNumber || applicationId}.html`,
  };
}

async function initiateConsentPhase(applicationId, user, sectionDInput = {}) {
  const bundle = await repo.getApplicationWithPrisoner(applicationId);
  if (!bundle) throw new Error('Application not found.');
  return generateForm1ForPrisoner(bundle.prisoner.id, user, sectionDInput);
}

async function recordConsent(applicationId, user, payload = {}) {
  const { consent, notes = '', signature = '', consentDate = null } = payload;
  if (typeof consent !== 'boolean') throw new Error('consent must be true or false.');

  assertRole(user, ACTION_ROLES.submitConsent, 'record prisoner consent');

  const app = await repo.getApplicationById(applicationId);
  if (!app) throw new Error('Application not found.');
  if (app.status !== PAROLE_STATUSES.AWAITING_PRISONER_CONSENT) {
    throw new Error('Application is not awaiting prisoner consent.');
  }

  const consentDateStr = consentDate || new Date().toISOString().slice(0, 10);
  const form1Row = await repo.getForm1Data(applicationId);
  const bundle = await repo.getApplicationWithPrisoner(applicationId);

  const form1Payload = buildForm1Payload({
    prisoner: bundle.prisoner,
    application: bundle.application,
    institution: bundle.institution,
    form1Row: form1Row || {},
    sectionEOverrides: {
      prisoner_consent: consent,
      consent_date: consentDateStr,
      signature: signature || 'Acknowledged electronically',
    },
  });
  form1Payload.printableHtml = renderForm1Html(form1Payload);

  await repo.upsertForm1Data(applicationId, {
    sponsorName: form1Row?.sponsorName,
    sponsorRelationship: form1Row?.sponsorRelationship,
    sponsorContact: form1Row?.sponsorContact,
    sponsorAddress: form1Row?.sponsorAddress,
    proposedResidence: form1Row?.proposedResidence,
    proposedResidenceProvince: form1Row?.proposedResidenceProvince,
    employmentPlans: form1Row?.employmentPlans,
    communityServicePlans: form1Row?.communityServicePlans,
    prisonerConsent: consent,
    consentDate: consentDateStr,
    signature: signature || 'Acknowledged electronically',
    sectionSnapshot: form1Payload,
  }, user.id);

  const fields = {
    prisonerConsent: consent ? 1 : 0,
    consentRecordedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    consentRecordedBy: user.id,
  };

  if (consent) {
    await repo.updateApplicationStatus(applicationId, app.status, fields);
    return transition(applicationId, PAROLE_STATUSES.REPORT_PREPARATION, user,
      notes || 'Prisoner consented to parole application (Form 1 Section E)', { prisonerConsent: true });
  }

  fields.declinedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await repo.updateApplicationStatus(applicationId, app.status, fields);
  return transition(applicationId, PAROLE_STATUSES.DECLINED, user,
    notes || 'Prisoner declined parole application', { prisonerConsent: false });
}

async function submitDetaineeReport(applicationId, user, payload) {
  assertCanEditDetaineeReport(user);
  const bundle = await repo.getApplicationWithPrisoner(applicationId);
  if (!bundle) throw new Error('Application not found.');
  if (bundle.application.status !== PAROLE_STATUSES.REPORT_PREPARATION) {
    throw new Error('Detainee Assessment Report can only be submitted during REPORT_PREPARATION.');
  }
  if (!payload.reportContent?.trim()) throw new Error('reportContent is required.');
  if (!payload.riskLevel) throw new Error('riskLevel is required.');

  await repo.upsertDetaineeReport(applicationId, user.id, payload);
  await repo.insertAudit(user, 'SUBMIT', 'DetaineeAssessmentReport', applicationId,
    `Risk level: ${payload.riskLevel}`);

  return tryAdvanceToBoardHearing(applicationId, user);
}

async function submitPreParoleReport(applicationId, user, payload) {
  assertCanEditPreParoleReport(user);
  const bundle = await repo.getApplicationWithPrisoner(applicationId);
  if (!bundle) throw new Error('Application not found.');
  if (bundle.application.status !== PAROLE_STATUSES.REPORT_PREPARATION) {
    throw new Error('Pre-Parole Report can only be submitted during REPORT_PREPARATION.');
  }

  await repo.upsertPreParoleReport(applicationId, user.id, payload);

  const detaineeReport = await repo.getDetaineeReport(applicationId);
  const preParoleReport = await repo.getPreParoleReport(applicationId);
  const safetyScore = calculateCommunitySafetyScore(preParoleReport, detaineeReport);
  await repo.updateApplicationStatus(applicationId, bundle.application.status, {
    communitySafetyScore: safetyScore,
  });

  await repo.insertAudit(user, 'SUBMIT', 'PreParoleReport', applicationId, 'Pre-Parole Report submitted');
  return tryAdvanceToBoardHearing(applicationId, user);
}

async function tryAdvanceToBoardHearing(applicationId, user) {
  const bundle = await repo.getApplicationWithPrisoner(applicationId);
  const detaineeReport = await repo.getDetaineeReport(applicationId);
  const preParoleReport = await repo.getPreParoleReport(applicationId);

  if (!detaineeReport || !preParoleReport) {
    return {
      application: bundle.application,
      advanced: false,
      message: 'Waiting for both Detainee Assessment and Pre-Parole reports.',
    };
  }

  try {
    validateTransition(PAROLE_STATUSES.REPORT_PREPARATION, PAROLE_STATUSES.AWAITING_BOARD_HEARING, {
      detaineeReportSubmitted: true,
      preParoleReportSubmitted: true,
      riskLevel: detaineeReport.risk_level,
    }, user?.role || 'system');

    const updated = await transition(applicationId, PAROLE_STATUSES.AWAITING_BOARD_HEARING, user,
      'All reports submitted and verified — ready for board hearing');

    await repo.createSystemNotification({
      title: 'Parole Case Ready for Board Hearing',
      message: `Case ${updated.caseNumber} is ready for hearing scheduling.`,
      recipientRole: ROLES.CHAIRMAN,
      prisonerId: bundle.prisoner.id,
      institutionId: bundle.prisoner.institution_id,
      applicationId,
      type: 'hearing',
    });

    return { application: updated, advanced: true };
  } catch (err) {
    return {
      application: bundle.application,
      advanced: false,
      blocked: true,
      error: err.message,
    };
  }
}

async function scheduleHearing(applicationId, user, payload) {
  assertRole(user, ACTION_ROLES.scheduleHearing, 'schedule a board hearing');
  const bundle = await repo.getApplicationWithPrisoner(applicationId);
  if (!bundle) throw new Error('Application not found.');
  if (bundle.application.status !== PAROLE_STATUSES.AWAITING_BOARD_HEARING) {
    throw new Error('Application must be in AWAITING_BOARD_HEARING status.');
  }
  if (!payload.hearingDate) throw new Error('hearingDate is required.');

  const hearingId = await repo.createBoardHearing(applicationId, payload, user.id);
  await repo.updateApplicationStatus(applicationId, PAROLE_STATUSES.BOARD_DELIBERATION, {
    hearingDate: payload.hearingDate,
  });

  await repo.logTransition(applicationId, PAROLE_STATUSES.AWAITING_BOARD_HEARING,
    PAROLE_STATUSES.BOARD_DELIBERATION, user.id, user.role,
    `Hearing scheduled for ${payload.hearingDate}`);

  await repo.getOrCreateBoardDecision(hearingId, applicationId);

  return {
    application: await repo.getApplicationById(applicationId),
    hearingId,
  };
}

async function recordVote(applicationId, user, { vote, observations = '' }) {
  assertRole(user, ACTION_ROLES.recordVote, 'record a board vote');
  const bundle = await repo.getApplicationWithPrisoner(applicationId);
  if (!bundle) throw new Error('Application not found.');
  if (bundle.application.status !== PAROLE_STATUSES.BOARD_DELIBERATION) {
    throw new Error('Application must be in BOARD_DELIBERATION status.');
  }

  const hearing = await repo.getBoardHearingByApplication(applicationId);
  if (!hearing) throw new Error('Board hearing not found.');

  const seat = mapSeatForRole(user.role);
  if (!seat && user.role !== ROLES.ADMIN) {
    throw new Error('Only board members may record votes.');
  }

  const decision = await repo.getOrCreateBoardDecision(hearing.id, applicationId);
  const patch = recordVotePatch(seat, vote);

  const obsColumn = {
    chairman: 'chairman_observations',
    doctor: 'doctor_behavioral_observations',
    commissioner: 'commissioner_correctional_review',
  }[seat];
  if (obsColumn && observations) patch[obsColumn] = observations;

  await repo.updateBoardDecision(decision.id, patch);
  await repo.insertAudit(user, 'VOTE', 'BoardDecision', decision.id, `${seat}: ${vote}`);

  const updated = await repo.getBoardDecisionByApplication(applicationId);
  return {
    decision: updated,
    votes: getVotes(updated),
    quorumMet: hasQuorum(updated),
  };
}

async function finalizeDecision(applicationId, user, { conditions = [], decisionReason = '', assignedParoleOfficerId = null }) {
  assertRole(user, ACTION_ROLES.finalizeDecision, 'finalize board decision');
  const bundle = await repo.getApplicationWithPrisoner(applicationId);
  if (!bundle) throw new Error('Application not found.');
  if (bundle.application.status !== PAROLE_STATUSES.BOARD_DELIBERATION) {
    throw new Error('Application must be in BOARD_DELIBERATION status.');
  }

  const hearing = await repo.getBoardHearingByApplication(applicationId);
  const decision = await repo.getBoardDecisionByApplication(applicationId);
  if (!hearing || !decision) throw new Error('Board hearing/decision record not found.');

  const outcome = computeFinalDecision(decision, {
    communitySafetyScore: bundle.application.communitySafetyScore,
  });

  const patch = {
    final_decision: outcome.finalDecision,
    decision_reason: decisionReason || outcome.reason,
    community_safety_primary: 1,
    finalized_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    finalized_by: user.id,
  };

  if (outcome.finalDecision === 'Grant') {
    patch.conditions = JSON.stringify(conditions);
    await repo.updateBoardDecision(decision.id, patch);

    const orderDoc = generateParoleOrder(bundle, conditions);
    if (assignedParoleOfficerId) {
      await repo.createParoleSupervision(applicationId, assignedParoleOfficerId, {
        supervisionStartDate: toDateString(new Date()),
      }, orderDoc);
    }

    await transition(applicationId, PAROLE_STATUSES.PAROLE_GRANTED, user, outcome.reason, {
      formData: { ...(bundle.application.formData || {}), paroleOrder: orderDoc },
    });

    return {
      application: await repo.getApplicationById(applicationId),
      decision: await repo.getBoardDecisionByApplication(applicationId),
      document: orderDoc,
    };
  }

  const cooldownMonths = require('./eligibility').calculateCooldownMonths(bundle.prisoner);
  const cooldownUntil = calculateCooldownUntil(bundle.prisoner);
  patch.cooldown_period_months = cooldownMonths;
  await repo.updateBoardDecision(decision.id, patch);

  const refusalDoc = generateRefusalNotice(bundle, outcome.reason, cooldownUntil);
  await transition(applicationId, PAROLE_STATUSES.PAROLE_DENIED, user, outcome.reason, {
    cooldownUntil,
    formData: { ...(bundle.application.formData || {}), refusalNotice: refusalDoc },
  });

  return {
    application: await repo.getApplicationById(applicationId),
    decision: await repo.getBoardDecisionByApplication(applicationId),
    document: refusalDoc,
    cooldownUntil,
  };
}

async function recordVoteByHearing(hearingId, user, votePayload) {
  const hearing = await repo.getBoardHearingById(hearingId);
  if (!hearing) throw new Error('Hearing not found.');
  return recordVote(hearing.application_id, user, votePayload);
}

async function getApplicationDetail(applicationId) {
  const bundle = await repo.getApplicationWithPrisoner(applicationId);
  if (!bundle) throw new Error('Application not found.');

  const [detaineeReport, preParoleReport, hearing, decision, form1Record] = await Promise.all([
    repo.getDetaineeReport(applicationId),
    repo.getPreParoleReport(applicationId),
    repo.getBoardHearingByApplication(applicationId),
    repo.getBoardDecisionByApplication(applicationId),
    repo.getForm1Data(applicationId),
  ]);

  const form1 = form1Record?.sectionSnapshot
    || generateForm1Document(bundle, form1Record);

  return {
    application: bundle.application,
    prisoner: bundle.prisoner,
    institution: bundle.institution,
    form1,
    form1Record,
    detaineeReport,
    preParoleReport,
    hearing,
    decision,
    votes: decision ? getVotes(decision) : null,
    quorumMet: decision ? hasQuorum(decision) : false,
  };
}

async function getDocument(applicationId, docType) {
  const detail = await getApplicationDetail(applicationId);
  switch (docType) {
    case 'form1':
      return detail.form1;
    case 'parole-order':
      return detail.application.formData?.paroleOrder
        || generateParoleOrder(detail, jsonParseConditions(detail.decision));
    case 'refusal-notice':
      return detail.application.formData?.refusalNotice
        || generateRefusalNotice(detail, detail.decision?.decision_reason, detail.application.cooldownUntil);
    default:
      throw new Error(`Unknown document type: ${docType}`);
  }
}

function jsonParseConditions(decision) {
  if (!decision?.conditions) return [];
  if (typeof decision.conditions === 'string') {
    try { return JSON.parse(decision.conditions); } catch { return []; }
  }
  return decision.conditions;
}

module.exports = {
  ensureAct1991Application,
  recalculateApplicationEligibility,
  runDailyEligibilityCheck,
  getEligibleList,
  generateForm1ForPrisoner,
  downloadForm1,
  initiateConsentPhase,
  submitConsent: recordConsent,
  recordConsent,
  submitDetaineeReport,
  submitPreParoleReport,
  scheduleHearing,
  recordVote,
  recordVoteByHearing,
  finalizeDecision,
  getApplicationDetail,
  getDocument,
  NOTIFICATION_TYPE_PRE_ELIGIBILITY,
};
