(async () => {
  await PMSStorage.ensureLoaded();
  const actor = PMSAuth.requireDashboardRole('dashboard-commander.html');
  if (!actor) return;

  if (!actor.institutionId) {
    document.body.innerHTML = '<div class="access-denied"><h1>Access Denied</h1><p>No correctional institution assigned. Contact System Administrator.</p><a href="index.html">Return to login</a></div>';
    return;
  }

  const inst = PMSStorage.getInstitutionById(actor.institutionId);
  const panelTitles = {
    overview: ['Institutional Overview', `${inst?.name || 'Institution'} — Jail Commander Dashboard`],
    prisoners: ['Prisoners', 'Institutional prisoner records'],
    applications: ['Parole Applications', 'Verify Form 1, complete Form 3, and authorize release'],
    officers: ['Officers', 'Officers assigned to this institution'],
    notifications: ['Notifications', 'Eligibility and institutional alerts'],
    reports: ['Institution Reports', 'Statistics and report approval'],
    profile: ['Profile', 'Your account information'],
  };

  function instPrisoners() { return PMSStorage.getPrisoners().filter((p) => p.institutionId === actor.institutionId); }
  function instApps() { return PMSStorage.getParoleApplications().filter((a) => a.institutionId === actor.institutionId); }

  async function refresh(panel) {
    await PMSStorage.syncParoleNotifications(actor);
    PMSUI.updateNotifBadge(actor);
    ({ overview: renderOverview, prisoners: renderPrisoners, applications: renderApps,
       officers: renderOfficers, notifications: renderNotifications, reports: renderReports })[panel]?.();
  }

  function renderOverview() {
    document.getElementById('inst-banner').innerHTML = `<strong>${PMSUI.esc(inst.name)}</strong> · ${PMSUI.esc(inst.location)} · Code: ${PMSUI.esc(inst.code)}`;
    const prisoners = instPrisoners();
    const apps = instApps();
    document.getElementById('stat-prisoners').textContent = prisoners.length;
    document.getElementById('stat-approaching').textContent = prisoners.filter((p) => {
      const prog = PMSStorage.getPrisonerProgress(p);
      return prog.percent >= 25 && !prog.eligible;
    }).length;
    document.getElementById('stat-verify').textContent = apps.filter((a) => a.status === 'Pending Commander Review').length;
    document.getElementById('stat-release-pending').textContent = apps.filter((a) => ['Approved', 'Pending Approval', 'Parole Granted'].includes(a.status)).length;
    document.getElementById('stat-released').textContent = prisoners.filter((p) => p.status === 'Released on Parole').length;
    document.getElementById('stat-notifications').textContent = PMSStorage.getUnreadCountForUser(actor);

    const eligible = prisoners.filter((p) => PMSStorage.getPrisonerProgress(p).eligible);
    document.getElementById('overview-eligible').innerHTML = eligible.length
      ? eligible.map((p) => { const prog = PMSStorage.getPrisonerProgress(p); return `<div class="overview-row overview-row--highlight"><strong>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</strong><span class="meta">Eligible ${PMSUI.fmtDate(prog.eligibilityDate)} · ${prog.percent.toFixed(0)}% served</span></div>`; }).join('')
      : '<p class="empty-state">No eligible prisoners currently.</p>';

    const escalations = PMSStorage.getEscalations(actor.institutionId).slice(0, 6);
    document.getElementById('overview-escalations').innerHTML = escalations.length
      ? escalations.map((e) => `<div class="overview-row overview-row--warn"><strong>${PMSUI.esc(e.caseNumber || e.message)}</strong><span class="meta">${PMSUI.esc(e.message)}</span></div>`).join('')
      : '<p class="empty-state">No escalations at this institution.</p>';

    PMSUI.renderBarChart('chart-apps', PMSStorage.APPLICATION_STATUSES.filter((s) => s !== 'Draft').map((s) => ({
      label: s, value: apps.filter((a) => a.status === s).length,
    })).filter((d) => d.value > 0));
  }

  function renderPrisoners() {
    const q = document.getElementById('pr-search').value.toLowerCase();
    document.getElementById('prisoners-tbody').innerHTML = instPrisoners()
      .filter((p) => !q || `${p.firstName} ${p.lastName} ${p.prisonerNumber}`.toLowerCase().includes(q))
      .map((p) => {
        const prog = PMSStorage.getPrisonerProgress(p);
        return `<tr class="${prog.eligible ? 'row-eligible' : ''}"><td>${PMSUI.esc(p.prisonerNumber)}</td><td>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</td><td>${PMSUI.fmtDate(p.sentenceStartDate)}</td><td>${PMSUI.progressBar(p)}</td><td>${PMSUI.fmtDate(prog.eligibilityDate)}</td><td>${PMSUI.esc(p.status)}</td><td><a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">View Case File</a></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="empty-state">No prisoners.</td></tr>';
  }

  function renderApps() {
    document.getElementById('apps-tbody').innerHTML = instApps().map((a) => {
      const p = PMSStorage.getPrisonerById(a.prisonerId);
      const s = PMSStorage.getFormCompletionSummary(a);
      const f1Submitted = a.formData?.form1?.status === 'submitted' || a.formData?.form1?.status === 'verified';
      const verified = PMSStorage.isCommanderVerified(a);
      const needsReview = a.status === 'Pending Commander Review';
      const verifyCell = needsReview
        ? `<button type="button" class="btn-icon" data-commander-review="${a.id}">Review Case</button>`
        : verified
          ? '✓ Verified'
          : f1Submitted
            ? `<button type="button" class="btn-icon" data-verify-f1="${a.id}">Verify Form 1</button>`
            : 'Pending Form 1';
      const f3 = s.checks.form3
        ? '✓ Form 3 complete'
        : `<button type="button" class="btn-icon" data-open-form="3" data-app="${a.id}">Complete Form 3</button>`;
      const releaseCell = a.status === 'Released' || p?.status === 'Released on Parole'
        ? 'Released on Parole'
        : ['Approved', 'Pending Approval', 'Parole Granted'].includes(a.status)
          ? `<button type="button" class="btn-icon" data-release="${a.id}">Authorize Release</button>`
          : '—';
      return `<tr><td>${p ? `<a href="${PMSRBAC.prisonerProfileUrl(p.id)}">${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</a>` : '—'}<br><span class="meta">${PMSUI.esc(a.caseNumber || a.id)}</span></td><td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${PMSUI.esc(a.status)}</span></td><td>${PMSUI.fmtDate(a.submittedAt)}</td><td>${verifyCell}</td><td>${f3}</td><td>${releaseCell}</td><td>${s.completed}/5 forms</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="empty-state">No applications.</td></tr>';
  }

  function renderOfficers() {
    document.getElementById('officers-tbody').innerHTML = PMSStorage.getOfficersByInstitution(actor.institutionId)
      .map((o) => `<tr><td>${PMSUI.esc(o.firstName)} ${PMSUI.esc(o.lastName)}</td><td>${PMSUI.esc(o.role)}</td><td>${PMSUI.esc(o.position || '—')}</td><td>${PMSUI.esc(o.email)}</td></tr>`)
      .join('') || '<tr><td colspan="4" class="empty-state">No officers assigned.</td></tr>';
  }

  function renderNotifications() {
    PMSUI.renderNotificationPanel('notification-list', actor);
  }

  function renderReports() {
    if (typeof PMSReports !== 'undefined') {
      PMSReports.mount('reports-body', 'reports-filter-bar', actor);
    }
  }

  PMSSidebar.init({
    user: actor,
    activePanel: 'overview',
    onNavigate: (panel, meta) => PMSUI.switchPanel(panel, panelTitles, refresh, meta?.navId),
  });
  PMSUI.initShell(actor);
  PMSUI.bindNotificationPanel('notification-list', actor, () => refresh('notifications'));
  PMSUI.bindModalClose();
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => document.getElementById(btn.dataset.closeModal)?.classList.add('hidden'));
  });

  let pendingReleaseAppId = null;

  function openReleaseModal(appId) {
    const app = PMSStorage.getApplicationById(appId);
    const p = PMSStorage.getPrisonerById(app?.prisonerId);
    const inst = PMSStorage.getInstitutionById(app?.institutionId);
    if (!app || !p) return;
    pendingReleaseAppId = appId;
    const reqs = PMSStorage.getReleaseRequirements(app);
    document.getElementById('release-modal-body').innerHTML = `
      <div class="case-fields">
        <div class="case-field"><span class="case-field__label">Prisoner</span><span class="case-field__value"><strong>${PMSUI.esc(p.firstName)} ${PMSUI.esc(p.lastName)}</strong> (${PMSUI.esc(p.prisonerNumber)})</span></div>
        <div class="case-field"><span class="case-field__label">Case</span><span class="case-field__value">${PMSUI.esc(app.caseNumber || app.id)}</span></div>
        <div class="case-field"><span class="case-field__label">Institution</span><span class="case-field__value">${PMSUI.esc(inst?.name)}</span></div>
        <div class="case-field"><span class="case-field__label">Final Approval</span><span class="case-field__value">${PMSStorage.requiredApprovalsComplete(app) || app.status === 'Approved' ? '✓ Verified' : 'Pending'}</span></div>
      </div>
      <h3 class="case-subheading">Release Requirements</h3>
      <ul class="release-req-list">${reqs.map((r) => `<li class="release-req${r.met ? ' release-req--met' : ''}">${r.met ? '✓' : '○'} ${PMSUI.esc(r.label)}</li>`).join('')}</ul>
      <label class="form-field" style="margin-top:1rem;display:block">Release Date<input type="date" id="release-date-input" value="${new Date().toISOString().slice(0, 10)}" class="form-control"></label>
      <label class="form-field" style="margin-top:0.75rem;display:block">Authorization Notes<textarea id="release-notes-input" class="form-control" rows="3" placeholder="Release authorization notes"></textarea></label>
      <p class="meta">Final status will be recorded as <strong>RELEASED ON PAROLE</strong>. Case history is preserved.</p>`;
    document.getElementById('release-modal').classList.remove('hidden');
  }

  document.getElementById('btn-confirm-release').addEventListener('click', () => {
    if (!pendingReleaseAppId) return;
    const releaseDate = document.getElementById('release-date-input')?.value;
    const notes = document.getElementById('release-notes-input')?.value || '';
    try {
      PMSStorage.authorizeRelease(pendingReleaseAppId, { releaseDate, notes }, actor);
      document.getElementById('release-modal').classList.add('hidden');
      pendingReleaseAppId = null;
      refresh('applications');
      alert('Prisoner release on parole authorized.');
    } catch (err) { alert(err.message); }
  });

  document.getElementById('pr-search').addEventListener('input', renderPrisoners);
  document.getElementById('btn-approve-report').addEventListener('click', () => {
    PMSStorage.createReport({
      institutionId: actor.institutionId,
      type: 'institutional',
      title: `Institutional Report — ${inst.name}`,
      status: 'Approved',
    }, actor);
    alert('Institutional report approved and recorded in audit log.');
  });

  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-open-form]')) {
      const btn = e.target.closest('[data-open-form]');
      PMSForms.openForm(parseInt(btn.dataset.openForm, 10), btn.dataset.app);
      return;
    }
    if (e.target.closest('[data-commander-review]')) {
      const appId = e.target.closest('[data-commander-review]').dataset.commanderReview;
      const comments = prompt('Commander comments (optional):', '') || '';
      const decision = prompt('Decision: Verified, Returned for Correction, or Rejected', 'Verified');
      if (!decision) return;
      try {
        PMSStorage.saveCommanderCaseReview(appId, { decision, comments }, actor);
        refresh('applications');
        alert(`Case review recorded: ${decision}`);
      } catch (err) { alert(err.message); }
      return;
    }
    if (e.target.closest('[data-verify-f1]')) {
      const appId = e.target.closest('[data-verify-f1]').dataset.verifyF1;
      const app = PMSStorage.getApplicationById(appId);
      if (!app) return;
      try {
        await PMSStorage.saveForm1Screening(appId, {
          ...(app.formData?.form1 || {}),
          supervisorReview: {
            decision: 'Verified',
            reviewComments: 'Jail Commander verified Form 1 eligibility screening.',
            supervisorName: `${actor.firstName} ${actor.lastName}`,
          },
        }, actor, { supervisorReview: true });
        refresh('applications');
        alert('Form 1 verified. Application may proceed to DJAG submission.');
      } catch (err) { alert(err.message); }
      return;
    }
    if (e.target.closest('[data-release]')) {
      openReleaseModal(e.target.closest('[data-release]').dataset.release);
    }
  });

  if (!PMSUI.applyDeepLinkNav((p, n) => PMSUI.switchPanel(p, panelTitles, refresh, n))) refresh('overview');
})();
