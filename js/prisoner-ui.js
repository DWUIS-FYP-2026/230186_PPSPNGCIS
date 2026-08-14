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
    const hearings = PMSStorage.getHearings().filter((h) => h.prisonerId === prisoner.id);
    const settings = PMSStorage.getSettings();
    const canExport = actor && PMSRBAC.canExportPrisonerReports(actor);

    const docs = (prisoner.documents || []).map((d) =>
      `<li class="case-doc"><i class="bi bi-file-earmark-text" aria-hidden="true"></i><span>${esc(d.name)}</span>${d.dataUrl ? `<a href="${esc(d.dataUrl)}" download="${esc(d.name)}" class="btn-link btn-sm">Download</a>` : '<span class="meta">On file</span>'}</li>`
    ).join('') || '<li class="case-doc case-doc--empty">No documents attached.</li>';

    const historyHtml = apps.length ? apps.map((a) => {
      const dec = a.boardDecision;
      return `<tr>
        <td>${esc(a.id)}</td>
        <td><span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${esc(a.status)}</span></td>
        <td>${fmtDate(a.submittedAt)}</td>
        <td>${dec ? esc(dec.outcome || a.status) : '—'}</td>
        <td>${fmtDate(dec?.decidedAt || a.createdAt)}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" class="empty-state">No parole applications on record.</td></tr>';

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
          ${showEditLink ? `<a href="${PMSRBAC.prisonerEditUrl(prisoner.id)}" class="btn-primary"><i class="bi bi-pencil"></i> Edit Record</a>` : ''}
          ${canExport ? `<button type="button" class="btn-secondary" id="btn-print-case"><i class="bi bi-printer"></i> Print Report</button>` : ''}
          <a href="#" class="btn-secondary" id="btn-back-dash"><i class="bi bi-arrow-left"></i> Back</a>
        </div>
      </header>

      <div class="case-file-grid">
        <section class="case-section">
          <h2><i class="bi bi-person-vcard"></i> Personal Information</h2>
          <div class="case-fields">
            ${fieldRow('Full Name', `<strong>${esc(prisoner.firstName)} ${esc(prisoner.lastName)}</strong>`)}
            ${fieldRow('Date of Birth', fmtDate(prisoner.dateOfBirth))}
            ${fieldRow('Gender', esc(prisoner.gender))}
            ${fieldRow('Offense', esc(prisoner.offense))}
          </div>
        </section>

        <section class="case-section">
          <h2><i class="bi bi-calendar-range"></i> Sentence Details</h2>
          <div class="case-fields">
            ${fieldRow('Sentence Start Date (SSD)', fmtDate(prisoner.sentenceStartDate))}
            ${fieldRow('Sentence End Date (SED)', fmtDate(prisoner.sentenceEndDate))}
            ${fieldRow('Total Duration', months ? `${Math.floor(months / 12)} years ${months % 12} months` : '—')}
            ${fieldRow('Time Served', `${prog.percent.toFixed(1)}% (${prog.servedMonths} months)`)}
          </div>
        </section>

        <section class="case-section">
          <h2><i class="bi bi-building"></i> Institution Information</h2>
          <div class="case-fields">
            ${fieldRow('Correctional Institution', esc(inst?.name))}
            ${fieldRow('Province', esc(inst?.province))}
            ${fieldRow('Location', esc(inst?.address || inst?.location))}
            ${fieldRow('Institution Code', esc(inst?.code || inst?.id))}
          </div>
        </section>

        <section class="case-section case-section--highlight">
          <h2><i class="bi bi-check-circle"></i> Eligibility Status</h2>
          <div class="case-fields">
            ${fieldRow('Parole Rule', esc(settings.paroleEligibilityLabel))}
            ${fieldRow('Eligibility Date', fmtDate(prog.eligibilityDate))}
            ${fieldRow('Eligible for Parole', prog.eligible ? '<span class="eligible-tag">YES — ELIGIBLE</span>' : 'Not yet eligible')}
            ${fieldRow('Current Status', `<span class="status-pill status-pill--${PMSUI.statusClass(prisoner.status)}">${esc(prisoner.status)}</span>`)}
          </div>
          <div class="case-progress">${PMSUI.progressBar(prisoner)}</div>
        </section>
      </div>

      <section class="case-section case-section--wide">
        <h2><i class="bi bi-clock-history"></i> Parole History</h2>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Application</th><th>Status</th><th>Submitted</th><th>Decision</th><th>Date</th></tr></thead><tbody>${historyHtml}</tbody></table></div>
      </section>

      <section class="case-section case-section--wide">
        <h2><i class="bi bi-calendar-event"></i> Hearings</h2>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Location</th><th>Status</th></tr></thead><tbody>${hearingHtml}</tbody></table></div>
      </section>

      <section class="case-section case-section--wide">
        <h2><i class="bi bi-paperclip"></i> Attached Documents</h2>
        <ul class="case-doc-list">${docs}</ul>
        <p class="case-readonly-notice"><i class="bi bi-shield-lock"></i> Prisoner records are maintained by PNG Correctional Services. This view is read-only.</p>
      </section>
    `;
  }

  return { renderCaseFile, getParoleHistory, fmtDate, esc };
})();
