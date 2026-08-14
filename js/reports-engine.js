/**
 * PMS Reports & Analytics — operational and executive reporting engine.
 */
const PMSReports = (() => {
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-PG', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function parseFilterDate(v) {
    if (!v) return null;
    const d = new Date(v);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function inDateRange(iso, from, to) {
    if (!iso) return !from && !to;
    const d = new Date(iso);
    d.setHours(0, 0, 0, 0);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  function prisonerAge(dob) {
    if (!dob) return null;
    const b = new Date(dob);
    const t = new Date();
    let age = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age -= 1;
    return age;
  }

  function ageGroup(dob) {
    const age = prisonerAge(dob);
    if (age == null) return 'Unknown';
    if (age < 25) return 'Under 25';
    if (age < 35) return '25–34';
    if (age < 45) return '35–44';
    if (age < 55) return '45–54';
    return '55+';
  }

  function sentenceLengthBand(months) {
    if (!months) return 'Unknown';
    if (months < 12) return 'Under 1 year';
    if (months < 36) return '1–3 years';
    if (months < 60) return '3–5 years';
    if (months < 120) return '5–10 years';
    return '10+ years';
  }

  function defaultFilters(user) {
    const year = new Date().getFullYear();
    return {
      dateFrom: `${year}-01-01`,
      dateTo: `${year}-12-31`,
      institutionId: user?.institutionId || '',
      province: '',
      prisonerStatus: '',
      applicationStatus: '',
      role: '',
    };
  }

  function scopeData(user, filters) {
    if (typeof PMSEligibility !== 'undefined') PMSEligibility.syncAllPrisoners(user, PMSStorage.getParoleApplications());
    let prisoners = PMSRBAC.filterPrisonersForUser(user, PMSStorage.getPrisoners());
    let applications = PMSStorage.getParoleApplications();
    const institutions = PMSStorage.getInstitutions();
    const hearings = PMSStorage.getHearings();
    const auditLogs = PMSStorage.getAuditLogs();
    const users = PMSStorage.getUsers();

    if (filters.institutionId) {
      prisoners = prisoners.filter((p) => p.institutionId === filters.institutionId);
      applications = applications.filter((a) => a.institutionId === filters.institutionId);
    }
    if (filters.province) {
      const instIds = new Set(institutions.filter((i) => i.province === filters.province).map((i) => i.id));
      prisoners = prisoners.filter((p) => instIds.has(p.institutionId));
      applications = applications.filter((a) => instIds.has(a.institutionId));
    }
    if (filters.prisonerStatus) prisoners = prisoners.filter((p) => p.status === filters.prisonerStatus);
    if (filters.applicationStatus) applications = applications.filter((a) => a.status === filters.applicationStatus);

    const from = parseFilterDate(filters.dateFrom);
    const to = parseFilterDate(filters.dateTo);
    if (to) to.setHours(23, 59, 59, 999);

    applications = applications.filter((a) => inDateRange(a.submittedAt || a.createdAt, from, to));
    const filteredAudit = auditLogs.filter((l) => inDateRange(l.timestamp, from, to));

    return { prisoners, applications, institutions, hearings, auditLogs: filteredAudit, users, from, to };
  }

  function countBy(items, keyFn) {
    const map = {};
    items.forEach((item) => {
      const k = keyFn(item) || 'Unknown';
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }

  function avgProcessingDays(applications) {
    const completed = applications.filter((a) => a.submittedAt && ['Approved', 'Refused', 'Deferred'].includes(a.status));
    if (!completed.length) return 0;
    const total = completed.reduce((sum, a) => {
      const start = new Date(a.submittedAt);
      const end = new Date(a.boardDecision?.decidedAt || a.submittedAt);
      return sum + Math.max(0, (end - start) / 86400000);
    }, 0);
    return Math.round(total / completed.length);
  }

  function buildAnalytics(user, filters) {
    const data = scopeData(user, filters);
    const { prisoners, applications, institutions, hearings, auditLogs, users } = data;
    const activeStatuses = ['Awaiting Eligibility', 'Eligible for Parole Application', 'Assessment in Progress', 'Hearing Scheduled'];
    const terminalPrisoner = ['Released', 'Sentence Completed', 'Approved'];

    const kpis = [
      { label: 'Total Prisoners', value: prisoners.length, icon: 'bi-person-lock' },
      { label: 'Active in Custody', value: prisoners.filter((p) => activeStatuses.includes(p.status)).length, icon: 'bi-building' },
      { label: 'Eligible / In Pipeline', value: prisoners.filter((p) => ['Eligible for Parole Application', 'Assessment in Progress', 'Hearing Scheduled'].includes(p.status)).length, icon: 'bi-check-circle' },
      { label: 'Applications (period)', value: applications.length, icon: 'bi-file-earmark-text' },
      { label: 'Approved', value: applications.filter((a) => a.status === 'Approved').length, icon: 'bi-hand-thumbs-up' },
      { label: 'Pending Review', value: applications.filter((a) => ['Submitted', 'Under DJAG Review', 'Pending Board Review'].includes(a.status)).length, icon: 'bi-hourglass-split' },
      { label: 'Avg Processing (days)', value: avgProcessingDays(applications), icon: 'bi-clock-history' },
      { label: 'Hearings Scheduled', value: hearings.filter((h) => h.status === 'Scheduled').length, icon: 'bi-calendar-event' },
    ];

    if (user.role === 'System Administrator') {
      kpis.push({ label: 'Audit Events', value: auditLogs.length, icon: 'bi-journal-text' });
      kpis.push({ label: 'System Users', value: users.filter((u) => u.status === 'Active').length, icon: 'bi-people' });
    }

    return {
      kpis,
      prisonerByInstitution: countBy(prisoners, (p) => PMSStorage.getInstitutionById(p.institutionId)?.name),
      prisonerByProvince: countBy(prisoners, (p) => PMSStorage.getInstitutionById(p.institutionId)?.province),
      prisonerByGender: countBy(prisoners, (p) => p.gender || 'Unknown'),
      prisonerByAge: countBy(prisoners, (p) => ageGroup(p.dateOfBirth)),
      prisonerByStatus: countBy(prisoners, (p) => p.status),
      sentenceLength: countBy(prisoners, (p) => sentenceLengthBand(PMSStorage.getSentenceDurationMonths(p))),
      appsByStatus: countBy(applications, (a) => a.status),
      appsByMonth: monthSeries(applications, 'submittedAt'),
      appsByInstitution: countBy(applications, (a) => PMSStorage.getInstitutionById(a.institutionId)?.name),
      hearingOutcomes: countBy(applications.filter((a) => ['Approved', 'Refused', 'Deferred'].includes(a.status)), (a) => a.status),
      rejectReasons: countBy(applications.filter((a) => a.status === 'Refused'), (a) => (a.boardDecision?.deliberationNotes || 'Not specified').slice(0, 40)),
      auditByModule: countBy(auditLogs, (l) => l.entity),
      auditByUser: countBy(auditLogs, (l) => l.userName).slice(0, 10),
      auditByAction: countBy(auditLogs, (l) => l.action),
      releasedCount: prisoners.filter((p) => p.status === 'Released').length,
      sentenceCompleted: prisoners.filter((p) => p.status === 'Sentence Completed').length,
      raw: data,
    };
  }

  function monthSeries(apps, field) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.map((label, i) => ({
      label,
      value: apps.filter((a) => {
        const d = a[field] || a.createdAt;
        return d && new Date(d).getMonth() === i;
      }).length,
    }));
  }

  function renderFilterBar(containerId, user, filters, onChange) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const institutions = PMSStorage.getInstitutions();
    const provinces = [...new Set(institutions.map((i) => i.province).filter(Boolean))].sort();
    el.innerHTML = `
      <div class="reports-filter-bar">
        <div class="reports-filter-grid">
          <label>From<input type="date" id="report-date-from" value="${esc(filters.dateFrom)}"></label>
          <label>To<input type="date" id="report-date-to" value="${esc(filters.dateTo)}"></label>
          <label>Institution<select id="report-institution"><option value="">All</option>${institutions.map((i) => `<option value="${esc(i.id)}"${filters.institutionId === i.id ? ' selected' : ''}>${esc(i.name)}</option>`).join('')}</select></label>
          <label>Province<select id="report-province"><option value="">All</option>${provinces.map((p) => `<option value="${esc(p)}"${filters.province === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
          <label>Prisoner Status<select id="report-prisoner-status"><option value="">All</option>${PMSStorage.PRISONER_STATUSES.map((s) => `<option value="${esc(s)}"${filters.prisonerStatus === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
          <label>Application Status<select id="report-app-status"><option value="">All</option>${PMSStorage.APPLICATION_STATUSES.map((s) => `<option value="${esc(s)}"${filters.applicationStatus === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        </div>
        <div class="reports-filter-actions">
          <button type="button" class="btn-primary btn-sm" id="report-apply-filters">Apply Filters</button>
          <button type="button" class="btn-secondary btn-sm" id="report-reset-filters">Reset</button>
          <button type="button" class="btn-secondary btn-sm" id="report-export-csv"><i class="bi bi-filetype-csv"></i> Export CSV</button>
          <button type="button" class="btn-secondary btn-sm" id="report-export-excel"><i class="bi bi-file-earmark-spreadsheet"></i> Export Excel</button>
          <button type="button" class="btn-secondary btn-sm" id="report-print"><i class="bi bi-printer"></i> Print</button>
        </div>
      </div>`;

    const readFilters = () => ({
      dateFrom: document.getElementById('report-date-from')?.value || '',
      dateTo: document.getElementById('report-date-to')?.value || '',
      institutionId: document.getElementById('report-institution')?.value || '',
      province: document.getElementById('report-province')?.value || '',
      prisonerStatus: document.getElementById('report-prisoner-status')?.value || '',
      applicationStatus: document.getElementById('report-app-status')?.value || '',
      role: '',
    });

    document.getElementById('report-apply-filters')?.addEventListener('click', () => onChange?.(readFilters()));
    document.getElementById('report-reset-filters')?.addEventListener('click', () => onChange?.(defaultFilters(user)));
    document.getElementById('report-export-csv')?.addEventListener('click', () => exportCSV(user, readFilters()));
    document.getElementById('report-export-excel')?.addEventListener('click', () => exportExcel(user, readFilters()));
    document.getElementById('report-print')?.addEventListener('click', () => window.print());
  }

  function renderPanel(containerId, user, filters) {
    const el = document.getElementById(containerId);
    if (!el || !user) return;
    const a = buildAnalytics(user, filters);
    const isAdmin = user.role === 'System Administrator';

    el.innerHTML = `
      <div class="reports-kpi-grid">${a.kpis.map((k) => `
        <article class="reports-kpi"><i class="bi ${k.icon}" aria-hidden="true"></i><strong>${k.value}</strong><span>${esc(k.label)}</span></article>`).join('')}</div>
      <div class="reports-grid">
        <div class="card"><div class="card-header"><h2>Prisoners by Institution</h2></div><div class="card-body chart-body" id="report-chart-inst"></div></div>
        <div class="card"><div class="card-header"><h2>Prisoners by Status</h2></div><div class="card-body chart-body" id="report-chart-pstatus"></div></div>
        <div class="card"><div class="card-header"><h2>Applications by Status</h2></div><div class="card-body chart-body" id="report-chart-astatus"></div></div>
        <div class="card"><div class="card-header"><h2>Monthly Applications</h2></div><div class="card-body chart-body" id="report-chart-monthly"></div></div>
        <div class="card"><div class="card-header"><h2>Prisoners by Province</h2></div><div class="card-body chart-body" id="report-chart-province"></div></div>
        <div class="card"><div class="card-header"><h2>Gender Distribution</h2></div><div class="card-body chart-body" id="report-chart-gender"></div></div>
        <div class="card"><div class="card-header"><h2>Age Groups</h2></div><div class="card-body chart-body" id="report-chart-age"></div></div>
        <div class="card"><div class="card-header"><h2>Sentence Length Distribution</h2></div><div class="card-body chart-body" id="report-chart-sentence"></div></div>
        ${isAdmin ? `<div class="card"><div class="card-header"><h2>Audit Activity by Module</h2></div><div class="card-body chart-body" id="report-chart-audit"></div></div>` : ''}
        ${isAdmin ? `<div class="card"><div class="card-header"><h2>Top Users by Activity</h2></div><div class="card-body chart-body" id="report-chart-users"></div></div>` : ''}
        <div class="card card--wide"><div class="card-header"><h2>Management Summary</h2></div><div class="card-body"><div class="reports-summary-text">${buildSummaryText(a, user)}</div></div></div>
      </div>`;

    PMSUI.renderBarChart('report-chart-inst', a.prisonerByInstitution.slice(0, 10));
    PMSUI.renderBarChart('report-chart-pstatus', a.prisonerByStatus, 'var(--color-navy)');
    PMSUI.renderBarChart('report-chart-astatus', a.appsByStatus, 'var(--djag-purple)');
    PMSUI.renderBarChart('report-chart-monthly', a.appsByMonth, 'var(--color-success)');
    PMSUI.renderBarChart('report-chart-province', a.prisonerByProvince.slice(0, 10));
    PMSUI.renderBarChart('report-chart-gender', a.prisonerByGender);
    PMSUI.renderBarChart('report-chart-age', a.prisonerByAge);
    PMSUI.renderBarChart('report-chart-sentence', a.sentenceLength);
    if (isAdmin) {
      PMSUI.renderBarChart('report-chart-audit', a.auditByModule, 'var(--color-warning)');
      PMSUI.renderBarChart('report-chart-users', a.auditByUser);
    }

    if (typeof PMSCharts !== 'undefined') {
      const donutEl = document.getElementById('report-donut-hearings');
      if (donutEl && a.hearingOutcomes.length) {
        PMSCharts.renderDonut('report-donut-hearings', a.hearingOutcomes.map((x) => x.label), a.hearingOutcomes.map((x) => x.value));
      }
    }
  }

  function buildSummaryText(a, user) {
    const pending = a.appsByStatus.find((x) => x.label === 'Submitted')?.value || 0;
    const approved = a.appsByStatus.find((x) => x.label === 'Approved')?.value || 0;
    const refused = a.appsByStatus.find((x) => x.label === 'Refused')?.value || 0;
    return `<p>Reporting view for <strong>${esc(user.role)}</strong>. The custodial population in scope is <strong>${a.kpis[0]?.value || 0}</strong> prisoners, with <strong>${a.kpis[2]?.value || 0}</strong> eligible or in the parole pipeline.</p>
      <p>During the selected period, <strong>${a.kpis[3]?.value || 0}</strong> parole applications were recorded. <strong>${approved}</strong> were approved, <strong>${refused}</strong> refused, and <strong>${pending}</strong> remain at submitted stage. Average processing time is <strong>${a.kpis[6]?.value || 0}</strong> days.</p>
      <p>Sentence completion: <strong>${a.sentenceCompleted}</strong> prisoners reached sentence end date; <strong>${a.releasedCount}</strong> are recorded as released.</p>`;
  }

  function exportCSV(user, filters) {
    const a = buildAnalytics(user, filters);
    const rows = [
      ['PMS Management Report'],
      ['Generated', new Date().toISOString()],
      ['Role', user.role],
      [],
      ['KPI', 'Value'],
      ...a.kpis.map((k) => [k.label, k.value]),
      [],
      ['Prisoners by Institution', 'Count'],
      ...a.prisonerByInstitution.map((x) => [x.label, x.value]),
      [],
      ['Applications by Status', 'Count'],
      ...a.appsByStatus.map((x) => [x.label, x.value]),
    ];
    downloadFile('pms-report.csv', rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }

  function exportExcel(user, filters) {
    const a = buildAnalytics(user, filters);
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>
      <h2>PMS Management Report</h2><p>Generated: ${new Date().toLocaleString('en-PG')}</p>
      <table border="1"><tr><th>KPI</th><th>Value</th></tr>${a.kpis.map((k) => `<tr><td>${esc(k.label)}</td><td>${k.value}</td></tr>`).join('')}</table>
      <h3>Prisoners by Institution</h3><table border="1"><tr><th>Institution</th><th>Count</th></tr>${a.prisonerByInstitution.map((x) => `<tr><td>${esc(x.label)}</td><td>${x.value}</td></tr>`).join('')}</table>
      <h3>Applications by Status</h3><table border="1"><tr><th>Status</th><th>Count</th></tr>${a.appsByStatus.map((x) => `<tr><td>${esc(x.label)}</td><td>${x.value}</td></tr>`).join('')}</table>
    </body></html>`;
    downloadFile('pms-report.xls', html, 'application/vnd.ms-excel');
  }

  function downloadFile(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function mount(containerId, filterBarId, user) {
    const bodyEl = document.getElementById(containerId);
    const filterEl = document.getElementById(filterBarId);
    if (!bodyEl || !filterEl) return;
    let filters = defaultFilters(user);
    renderFilterBar(filterBarId, user, filters, (next) => {
      filters = next;
      renderPanel(containerId, user, filters);
    });
    renderPanel(containerId, user, filters);
  }

  return { mount, buildAnalytics, defaultFilters, exportCSV, exportExcel };
})();
