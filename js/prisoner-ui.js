/**
 * PMS — Prisoner case file UI (read-only official record view).
 */
const PMSPrisonerUI = (() => {
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-PG', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function getParoleHistory(prisonerId) {
    return PMSStorage.getParoleApplications()
      .filter((a) => a.prisonerId === prisonerId)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  function fieldRow(label, value) {
    return `<div class="case-field"><span class="case-field__label">${esc(label)}</span><span class="case-field__value">${value ?? '—'}</span></div>`;
  }

  function renderCaseFile(prisoner, options = {}) {
    const { showEditLink = false, actor = null } = options;
    const prog = PMSStorage.getPrisonerProgress(prisoner);
    const months = PMSStorage.getSentenceDurationMonths(prisoner);
    const inst = PMSStorage.getInstitutionById(prisoner.institutionId);
    const apps = getParoleHistory(prisoner.id);
    const activeApp = apps.find((a) => !['Approved', 'Refused', 'Released'].includes(a.status)) || apps[0];
    const timeline = activeApp ? PMSStorage.getCaseTimeline(activeApp.id) : [];
    const offenses = PMSStorage.getOffenses(prisoner.id);
    const extra = prisoner.extraAttributes || {};
    const settings = PMSStorage.getSettings();
    const canExport = actor && PMSRBAC.canExportPrisonerReports(actor);

    const docs = (prisoner.documents || []).map((d) =>
      `<li class="case-doc"><i class="fi fi-rr-document" aria-hidden="true"></i><span>${esc(d.name)}</span><span class="meta">${esc(d.category || 'Document')} · ${fmtDate(d.uploadedAt)} · ${esc(d.uploadedBy || '—')}</span>${d.dataUrl ? `<a href="${esc(d.dataUrl)}" download="${esc(d.name)}" class="btn-link btn-sm">Download</a>` : '<span class="meta">On file</span>'}</li>`
    ).join('') || '<li class="case-doc case-doc--empty">No documents attached.</li>';

    const trackerHtml = activeApp ? PMSUI.renderCaseTracker(activeApp.id) : '';
    const releaseInfo = activeApp?.releaseInfo;
    const releaseHtml = releaseInfo ? `<section class="case-section case-section--wide case-section--highlight">
        <h2><i class="fi fi-rr-door-open"></i> Release Management</h2>
        <div class="case-fields">
          ${fieldRow('Final Status', '<span class="status-pill status-pill--released">RELEASED ON PAROLE</span>')}
          ${fieldRow('Release Date', fmtDate(releaseInfo.releaseDate))}
          ${fieldRow('Releasing Officer', esc(releaseInfo.authorizedByName))}
          ${fieldRow('Authorization Role', esc(releaseInfo.authorizedByRole || 'PNGCS Parole Clerk'))}
          ${fieldRow('Institution', esc(releaseInfo.institutionName))}
          ${fieldRow('Case Number', esc(releaseInfo.caseNumber))}
          ${fieldRow('Final Approval Verified', releaseInfo.finalApprovalVerified ? 'Yes' : 'No')}
          ${fieldRow('Notes', esc(releaseInfo.notes || '—'))}
        </div>
        ${releaseInfo.requirements?.length ? `<h3 class="case-subheading">Release Requirements</h3><ul class="release-req-list">${releaseInfo.requirements.map((r) =>
          `<li class="release-req${r.met ? ' release-req--met' : ''}">${r.met ? '✓' : '○'} ${esc(r.label)}</li>`
        ).join('')}</ul>` : ''}
      </section>` : (activeApp && ['Approved', 'Pending Approval', 'Parole Granted'].includes(activeApp.status) ? `<section class="case-section case-section--wide">
        <h2><i class="fi fi-rr-door-open"></i> Release Requirements</h2>
        <ul class="release-req-list">${PMSStorage.getReleaseRequirements(activeApp).map((r) =>
          `<li class="release-req${r.met ? ' release-req--met' : ''}">${r.met ? '✓' : '○'} ${esc(r.label)}</li>`
        ).join('')}</ul>
      </section>` : '');

    const historyHtml = apps.length ? apps.map((a) => {
      const dec = a.boardDecision;
      return `<tr>
        <td>${esc(a.caseNumber || a.id)}</td>
        <td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${esc(a.status)}</span></td>
        <td>${fmtDate(a.submittedAt)}</td>
        <td>${dec ? esc(dec.outcome || a.status) : '—'}</td>
        <td>${fmtDate(dec?.decidedAt || a.createdAt)}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" class="empty-state">No parole applications on record.</td></tr>';

    const hearings = PMSStorage.getHearings().filter((h) => h.prisonerId === prisoner.id);

    const hearingHtml = hearings.length ? hearings.map((h) =>
      `<tr><td>${fmtDate(h.scheduledDate)} ${esc(h.scheduledTime || '')}</td><td>${esc(h.location)}</td><td>${esc(h.status)}</td></tr>`
    ).join('') : '<tr><td colspan="3" class="empty-state">No hearings scheduled.</td></tr>';

    return `
      <header class="case-file-header">
        <div class="case-file-header__main">
          <p class="case-file-header__agency">PNG Correctional Services · Official Case Record</p>
          <h1>${esc(prisoner.firstName)} ${esc(prisoner.lastName)}</h1>
          <p class="case-file-header__id">Prisoner ID: <strong>${esc(prisoner.prisonerNumber || prisoner.id)}</strong>
            · <span class="status-pill status-pill--${PMSUI.statusClass(prisoner.status)}">${esc(prisoner.status)}</span></p>
        </div>
        <div class="case-file-header__actions">
          ${showEditLink ? `<a href="${PMSRBAC.prisonerEditUrl(prisoner.id)}" class="btn-primary"><i class="fi fi-rr-pencil"></i> Edit Record</a>` : ''}
          ${canExport ? `<button type="button" class="btn-secondary" id="btn-print-case"><i class="fi fi-rr-print"></i> Print Report</button>` : ''}
          <a href="#" class="btn-secondary" id="btn-back-dash"><i class="fi fi-rr-arrow-left"></i> Back</a>
        </div>
      </header>

      <div class="case-file-grid">
        <section class="case-section">
          <h2><i class="fi fi-rr-id-card"></i> Personal Information</h2>
          <div class="case-fields">
            ${fieldRow('Full Name', `<strong>${esc(prisoner.firstName)} ${esc(prisoner.middleName || '')} ${esc(prisoner.lastName)}</strong>`)}
            ${fieldRow('Date of Birth', fmtDate(prisoner.dateOfBirth))}
            ${fieldRow('Gender', esc(prisoner.gender))}
            ${fieldRow('Nationality', esc(prisoner.nationality || extra.nationality || '—'))}
            ${fieldRow('Identification', esc(prisoner.identificationNumber || extra.identificationNumber || '—'))}
            ${fieldRow('Classification', esc(prisoner.classification || extra.classification || '—'))}
            ${fieldRow('Offense (primary)', esc(prisoner.offense))}
          </div>
        </section>

        <section class="case-section">
          <h2><i class="fi fi-rr-calendar"></i> Sentence Details</h2>
          <div class="case-fields">
            ${fieldRow('Sentence Start Date (SSD)', fmtDate(prisoner.sentenceStartDate))}
            ${fieldRow('Sentence End Date (SED)', fmtDate(prisoner.sentenceEndDate))}
            ${fieldRow('Total Duration', months ? `${Math.floor(months / 12)} years ${months % 12} months` : '—')}
            ${fieldRow('Time Served', `${prog.percent.toFixed(1)}% (${prog.servedMonths} months)`)}
          </div>
        </section>

        <section class="case-section">
          <h2><i class="fi fi-rr-building"></i> Institution Information</h2>
          <div class="case-fields">
            ${fieldRow('Correctional Institution', esc(inst?.name))}
            ${fieldRow('Province', esc(inst?.province))}
            ${fieldRow('Location', esc(inst?.address || inst?.location))}
            ${fieldRow('Institution Code', esc(inst?.code || inst?.id))}
          </div>
        </section>

        <section class="case-section case-section--highlight">
          <h2><i class="fi fi-rr-check-circle"></i> Eligibility Status</h2>
          <div class="case-fields">
            ${fieldRow('Parole Rule', esc(settings.paroleEligibilityLabel))}
            ${fieldRow('Eligibility Date', fmtDate(prog.eligibilityDate))}
            ${fieldRow('Eligible for Parole', prog.eligible ? '<span class="eligible-tag">YES — ELIGIBLE</span>' : 'Not yet eligible')}
            ${fieldRow('Current Status', `<span class="status-pill status-pill--${PMSUI.statusClass(prisoner.status)}">${esc(prisoner.status)}</span>`)}
          </div>
          <div class="case-progress">${PMSUI.progressBar(prisoner)}</div>
        </section>
      </div>

      ${activeApp ? `<section class="case-section case-section--wide">
        <h2><i class="fi fi-rr-route"></i> Case Workflow — ${esc(activeApp.caseNumber || activeApp.id)}</h2>
        ${trackerHtml}
      </section>
      <section class="case-section case-section--wide">
        <h2><i class="fi fi-rr-time-past"></i> Case Timeline</h2>
        <ol class="case-timeline">${timeline.length ? timeline.map((ev) =>
          `<li class="case-timeline__item"><span class="case-timeline__stage">${esc(ev.stage)}</span>
          <span class="case-timeline__meta">${fmtDate(ev.at)} · ${esc(ev.status)}${ev.notes ? ` — ${esc(ev.notes)}` : ''}</span></li>`
        ).join('') : '<li class="case-timeline__item">No workflow events recorded yet.</li>'}</ol>
      </section>` : ''}

      ${releaseHtml}

      <section class="case-section case-section--wide">
        <h2><i class="fi fi-rr-time-past"></i> Parole History</h2>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Case No.</th><th>Status</th><th>Submitted</th><th>Decision</th><th>Date</th></tr></thead><tbody>${historyHtml}</tbody></table></div>
      </section>

      <section class="case-section case-section--wide">
        <h2><i class="fi fi-rr-calendar"></i> Hearings</h2>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Location</th><th>Status</th></tr></thead><tbody>${hearingHtml}</tbody></table></div>
      </section>

      <section class="case-section case-section--wide">
        <h2><i class="fi fi-rr-gavel"></i> Offense Records</h2>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Offense</th><th>Category</th><th>Court</th><th>Sentence</th></tr></thead><tbody>${
          offenses.length ? offenses.map((o) =>
            `<tr><td>${esc(o.offenseName || o.offense)}</td><td>${esc(o.category || '—')}</td><td>${esc(o.courtName || '—')}</td><td>${esc(o.sentenceLength || '—')}</td></tr>`
          ).join('') : `<tr><td colspan="4">${esc(prisoner.offense || 'No structured offense records — primary offense shown above.')}</td></tr>`
        }</tbody></table></div>
      <section class="case-section case-section--wide">
        <h2><i class="fi fi-rr-folder"></i> Documents</h2>
        <ul class="case-doc-list">${docs}</ul>
        <p class="case-readonly-notice"><i class="fi fi-rr-shield"></i> Document access is restricted by role. Upload via prisoner edit or case forms.</p>
      </section>
    `;
  }

  return { renderCaseFile, getParoleHistory, fmtDate, esc };
})();
