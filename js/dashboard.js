(async () => {
  await PMSStorage.ensureLoaded();
  const actor = PMSAuth.requireRole(['System Administrator']);
  if (!actor) return;

  let pendingDocs = [];
  let prisonerDocsExisting = [];

  const panelTitles = {
    overview: ['Dashboard Overview', 'Central administration panel for the Parole Management System'],
    users: ['User Management', 'Create and manage user accounts and officer roles'],
    institutions: ['Correctional Institutions', 'Manage institutions and officer assignments'],
    prisoners: ['Prisoner Records', 'View prisoner records (read-only — maintained by PNGCS)'],
    notifications: ['Eligibility Notifications', 'Automated parole eligibility alerts'],
    audit: ['System Activity', 'Administrative audit log — user actions, modules, and access outcomes'],
    settings: ['System Settings', 'Configure parole eligibility rules and system preferences'],
    profile: ['Profile', 'Your account information'],
    reports: ['System Reports', 'Operational and administrative reports'],
    officers: ['Officer Management', 'Manage correctional officers and role assignments'],
  };

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-PG', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtDateTime(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-PG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function statusClass(s) {
    return {
      Active: 'active', 'In Custody': 'in-custody', 'Eligible for Parole': 'eligible',
      'Parole Application Pending': 'pending', 'On Parole': 'parole', Released: 'released', Inactive: 'inactive',
    }[s] || 'inactive';
  }

  function instName(id) {
    return PMSStorage.getInstitutionById(id)?.name || '—';
  }

  function switchPanel(id, navId) {
    const panelId = id === 'officers' ? 'users' : id;
    document.querySelectorAll('.sidebar-nav .nav-item').forEach((b) => {
      const matchNav = navId && b.dataset.navId === navId;
      const matchPanel = !navId && b.dataset.panel === id;
      b.classList.toggle('active', matchNav || matchPanel);
    });
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${panelId}`));
    const titles = panelTitles[id] || panelTitles[panelId];
    if (titles) {
      const titleEl = document.getElementById('panel-title');
      const subtitleEl = document.getElementById('panel-subtitle');
      if (titleEl) titleEl.textContent = titles[0];
      if (subtitleEl) subtitleEl.textContent = titles[1];
      PMSWorkspace?.updateBreadcrumb?.(titles[0]);
    }
    PMSSidebar?.setActive?.(navId || id, panelId);
    refreshPanel(id);
  }

  function updateBadge() {
    const c = PMSStorage.getUnreadCountForUser(actor);
    document.querySelectorAll('.nav-notif-badge, #nav-notif-badge, #header-notif-badge').forEach((b) => {
      b.textContent = c;
      b.classList.toggle('hidden', c === 0);
    });
    PMSWorkspace?.syncNotifBadge?.(c);
  }

  function renderInboxItem(priority, title, sub, due) {
    return `<div class="inbox-item">
      <span class="inbox-item__priority inbox-item__priority--${priority}"></span>
      <div><div class="inbox-item__title">${title}</div><div class="inbox-item__sub">${sub}</div></div>
      <span class="inbox-item__due">${due}</span>
    </div>`;
  }

  function renderActivityItem(icon, title, meta, time) {
    return `<div class="activity-item">
      <span class="activity-item__icon"><i class="bi ${icon}" aria-hidden="true"></i></span>
      <div class="activity-item__body">
        <div class="activity-item__title">${title}</div>
        <div class="activity-item__meta">${meta}</div>
      </div>
      <span class="activity-item__time">${time}</span>
    </div>`;
  }

  function renderBarChart(containerId, data, color = 'var(--color-navy)') {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!data.length) { el.innerHTML = '<p class="empty-state">No data available.</p>'; return; }
    const max = Math.max(...data.map((d) => d.value), 1);
    el.innerHTML = data.map((d) => `
      <div class="bar-chart-row">
        <span class="bar-chart-label">${esc(d.label)}</span>
        <div class="bar-chart-track"><div class="bar-chart-fill" style="width:${(d.value / max) * 100}%;background:${color}"></div></div>
        <span class="bar-chart-value">${d.value}</span>
      </div>`).join('');
  }

  function populateSelect(sel, options, selected = '') {
    sel.innerHTML = options.map(([v, l]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`).join('');
  }

  function populateInstitutionSelects() {
    const insts = PMSStorage.getInstitutions(true);
    const opts = [['', '— None —'], ...insts.map((i) => [i.id, `${i.name} (${i.province || i.location})`])];
    ['user-institution', 'prisoner-institution', 'prisoner-institution-filter'].forEach((id) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const cur = sel.value;
      if (id === 'prisoner-institution-filter') {
        sel.innerHTML = '<option value="">All Institutions</option>' + insts.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
      } else {
        populateSelect(sel, opts, cur);
      }
    });
  }

  function populateRoleSelects() {
    const roles = PMSStorage.USER_ROLES;
    const userRoleSelect = document.getElementById('user-role-select');
    if (userRoleSelect) populateSelect(userRoleSelect, roles.map((r) => [r, r]));
    const filter = document.getElementById('user-role-filter');
    if (filter) filter.innerHTML = '<option value="">All Roles</option>' + roles.map((r) => `<option value="${r}">${esc(r)}</option>`).join('');
    const ps = document.getElementById('prisoner-status');
    if (ps) ps.innerHTML = PMSStorage.PRISONER_STATUSES.map((s) => `<option value="${s}">${esc(s)}</option>`).join('');
    const psf = document.getElementById('prisoner-status-filter');
    if (psf) psf.innerHTML = '<option value="">All Statuses</option>' + PMSStorage.PRISONER_STATUSES.map((s) => `<option value="${s}">${esc(s)}</option>`).join('');
  }

  function updatePrisonerCalcFields() {
    const ssd = document.getElementById('prisoner-ssd')?.value;
    const sed = document.getElementById('prisoner-sed')?.value;
    const el = document.getElementById('prisoner-calc-fields');
    if (!el) return;
    if (!ssd || !sed) { el.textContent = 'Enter SSD and SED to calculate duration and eligibility date.'; return; }
    const temp = { sentenceStartDate: ssd, sentenceEndDate: sed };
    const months = PMSStorage.getSentenceDurationMonths(temp);
    const years = Math.floor(months / 12);
    const rem = months % 12;
    const elig = PMSStorage.getParoleEligibilityDate(temp);
    const settings = PMSStorage.getSettings();
    el.innerHTML = `<strong>Total Duration:</strong> ${years}y ${rem}m (${months} months)<br>
      <strong>Parole Eligibility Date:</strong> ${fmtDate(elig)}<br>
      <strong>Rule:</strong> ${esc(settings.paroleEligibilityLabel)}`;
  }

  /* ---- Overview ---- */
  function renderOverview() {
    const stats = PMSStorage.getDashboardStats();
    const apps = PMSStorage.getParoleApplications();
    const hearings = PMSStorage.getHearings();
    const prisoners = PMSStorage.getPrisoners();
    const today = new Date().toISOString().split('T')[0];

    const setStat = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setStat('stat-users', stats.totalUsers);
    setStat('stat-officers', stats.totalOfficers);
    setStat('stat-prisoners', stats.totalPrisoners);
    setStat('stat-institutions', stats.totalInstitutions);
    setStat('stat-applications', stats.activeParoleApplications);
    setStat('stat-eligible', stats.eligiblePrisoners);
    setStat('stat-notifications', stats.pendingNotifications);

    const statHearings = document.getElementById('stat-hearings');
    if (statHearings) statHearings.textContent = hearings.filter((h) => h.status === 'Scheduled').length;

    const statPending = document.getElementById('stat-pending-decisions');
    if (statPending) statPending.textContent = apps.filter((a) => a.status === 'Pending Board Review').length;

    const insts = PMSStorage.getInstitutions();
    renderBarChart('chart-institutions', insts.map((i) => ({
      label: i.name, value: prisoners.filter((p) => p.institutionId === i.id).length,
    })).filter((d) => d.value > 0));

    const statusGroups = [
      { label: 'Submitted', value: apps.filter((a) => a.status === 'Submitted').length },
      { label: 'Under Review', value: apps.filter((a) => ['Under DJAG Review', 'Pending Board Review', 'Hearing Scheduled'].includes(a.status)).length },
      { label: 'Approved', value: apps.filter((a) => a.status === 'Approved').length },
      { label: 'Refused / Deferred', value: apps.filter((a) => ['Refused', 'Deferred'].includes(a.status)).length },
    ];
    renderBarChart('chart-applications', statusGroups, 'var(--pngcs-navy)');

    renderBarChart('chart-prisoner-status', PMSStorage.PRISONER_STATUSES.map((s) => ({
      label: s, value: prisoners.filter((p) => p.status === s).length,
    })), 'var(--color-success)');

    if (typeof PMSCharts !== 'undefined') {
      PMSCharts.renderDonut('chart-donut-applications', statusGroups.map((s) => s.label), statusGroups.map((s) => s.value));
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthly = months.map((_, i) => apps.filter((a) => {
        const d = a.submittedAt || a.createdAt;
        return d && new Date(d).getMonth() === i;
      }).length);
      PMSCharts.renderLine('chart-line-monthly', months, monthly, 'Submissions');
    }

    const logs = PMSStorage.getAuditLogs().slice(0, 12);
    const feedEl = document.getElementById('live-activity-feed');
    if (feedEl) PMSUI.renderAuditFeed('live-activity-feed', logs, 12);

    const reviewApps = apps.filter((a) => ['Submitted', 'Under DJAG Review'].includes(a.status));
    const reviewEl = document.getElementById('inbox-review');
    if (reviewEl) {
      document.getElementById('inbox-review-count').textContent = reviewApps.length;
      reviewEl.innerHTML = reviewApps.length === 0 ? '<p class="empty-state">No applications waiting.</p>' :
        reviewApps.slice(0, 6).map((a) => {
          const p = PMSStorage.getPrisonerById(a.prisonerId);
          return renderInboxItem('high', `${esc(p?.firstName || '')} ${esc(p?.lastName || '')}`.trim() || 'Application',
            `${esc(a.status)} · ${esc(instName(a.institutionId))}`, fmtDate(a.submittedAt));
        }).join('');
    }

    const todayHearings = hearings.filter((h) => h.scheduledDate?.startsWith(today));
    const hearingsEl = document.getElementById('inbox-hearings');
    if (hearingsEl) {
      document.getElementById('inbox-hearings-count').textContent = todayHearings.length;
      hearingsEl.innerHTML = todayHearings.length === 0 ? '<p class="empty-state">No hearings today.</p>' :
        todayHearings.map((h) => {
          const p = PMSStorage.getPrisonerById(h.prisonerId);
          return renderInboxItem('medium', `${esc(p?.firstName || '')} ${esc(p?.lastName || '')}`.trim(),
            esc(h.location || 'Hearing room'), h.scheduledTime || fmtDate(h.scheduledDate));
        }).join('');
    }

    const eligible = prisoners.filter((p) => PMSStorage.getPrisonerProgress(p).eligible);
    const eligibleEl = document.getElementById('inbox-eligible');
    if (eligibleEl) {
      document.getElementById('inbox-eligible-count').textContent = eligible.length;
      eligibleEl.innerHTML = eligible.length === 0 ? '<p class="empty-state">No eligible prisoners.</p>' :
        eligible.slice(0, 6).map((p) => {
          const prog = PMSStorage.getPrisonerProgress(p);
          return renderInboxItem('low', `${esc(p.firstName)} ${esc(p.lastName)}`,
            esc(p.prisonerNumber), fmtDate(prog.eligibilityDate));
        }).join('');
    }

    const decisions = apps.filter((a) => ['Approved', 'Refused', 'Deferred'].includes(a.status));
    const decisionsEl = document.getElementById('inbox-decisions');
    if (decisionsEl) {
      document.getElementById('inbox-decisions-count').textContent = decisions.length;
      decisionsEl.innerHTML = decisions.length === 0 ? '<p class="empty-state">No decisions recorded.</p>' :
        decisions.slice(0, 6).map((a) => {
          const p = PMSStorage.getPrisonerById(a.prisonerId);
          return renderInboxItem(a.status === 'Approved' ? 'low' : 'medium',
            `${esc(p?.firstName || '')} ${esc(p?.lastName || '')}`.trim(),
            esc(a.status), fmtDate(a.updatedAt || a.submittedAt));
        }).join('');
    }

    updateBadge();
  }

  /* ---- Users ---- */
  function renderUsers(officersOnly = false) {
    let users = PMSStorage.getUsers();
    if (officersOnly) users = users.filter((u) => u.role !== 'System Administrator');
    const roleF = document.getElementById('user-role-filter').value;
    const statusF = document.getElementById('user-status-filter').value;
    const q = document.getElementById('user-search').value.trim().toLowerCase();
    if (roleF) users = users.filter((u) => u.role === roleF);
    if (statusF) users = users.filter((u) => u.status === statusF);
    if (q) users = users.filter((u) =>
      `${u.firstName} ${u.lastName} ${u.username} ${u.email}`.toLowerCase().includes(q));

    document.getElementById('users-count').textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;
    const tbody = document.getElementById('users-table-body');
    const empty = document.getElementById('users-empty');
    if (!users.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    tbody.innerHTML = users.map((u) => `<tr>
      <td><strong>${esc(u.username)}</strong></td>
      <td>${esc(u.firstName)} ${esc(u.lastName)}</td>
      <td>${esc(u.role)}</td>
      <td>${esc(instName(u.institutionId))}</td>
      <td>${esc(u.position || '—')}</td>
      <td>${esc(u.email)}${u.phone ? `<br><span class="meta">${esc(u.phone)}</span>` : ''}</td>
      <td><span class="status-pill status-pill--${statusClass(u.status)}">${esc(u.status)}</span></td>
      <td class="actions-cell">
        <button type="button" class="btn-icon" data-edit-user="${u.id}">Edit</button>
        <button type="button" class="btn-icon" data-reset-pw="${u.id}">Reset PW</button>
        <button type="button" class="btn-icon" data-toggle-user="${u.id}">${u.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
        ${u.role !== 'System Administrator' ? `<button type="button" class="btn-icon btn-icon--danger" data-delete-user="${u.id}">Delete</button>` : ''}
      </td>
    </tr>`).join('');
  }

  function openUserModal(user = null) {
    document.getElementById('user-modal-title').textContent = user ? 'Edit User' : 'Create User';
    document.getElementById('user-id').value = user?.id || '';
    document.getElementById('user-display-id').value = user?.id || '';
    document.getElementById('user-display-id').placeholder = user ? '' : 'Automatically Generated';
    document.getElementById('user-username').value = user?.username || '';
    document.getElementById('user-username').disabled = !!user;
    document.getElementById('user-email').value = user?.email || '';
    document.getElementById('user-first-name').value = user?.firstName || '';
    document.getElementById('user-last-name').value = user?.lastName || '';
    document.getElementById('user-role-select').value = user?.role || PMSStorage.OFFICER_ROLES[0];
    document.getElementById('user-institution').value = user?.institutionId || '';
    document.getElementById('user-position').value = user?.position || '';
    document.getElementById('user-phone').value = user?.phone || '';
    document.getElementById('user-status').value = user?.status || 'Active';
    document.getElementById('user-password').value = '';
    document.getElementById('user-password').required = !user;
    const pwLabel = document.getElementById('password-group').querySelector('label');
    pwLabel.innerHTML = user
      ? 'Password <span class="label-optional">(leave blank to keep)</span>'
      : 'Password <span class="label-required">*</span>';
    const submitBtn = document.getElementById('user-submit-btn');
    if (submitBtn) {
      submitBtn.innerHTML = user
        ? '<i class="bi bi-check-lg" aria-hidden="true"></i><span>Save Changes</span>'
        : '<i class="bi bi-person-plus" aria-hidden="true"></i><span>Create User</span>';
    }
    populateInstitutionSelects();
    if (user) document.getElementById('user-role-select').value = user.role;
    document.getElementById('user-modal').showModal();
  }

  /* ---- Institutions (summary) ---- */
  function renderInstitutions() {
    const insts = PMSStorage.getInstitutions();
    document.getElementById('inst-summary-count').textContent = `${insts.length} facilities`;
    const list = document.getElementById('inst-summary-list');
    list.innerHTML = insts.slice(0, 8).map((i) => {
      const stats = PMSStorage.getInstitutionStats(i.id);
      const commander = stats?.commander;
      return `<div class="overview-row">
        <strong>${esc(i.name)}</strong> <span class="inst-id-badge">${esc(i.code)}</span>
        <span class="meta">${esc(i.province)} · ${esc(i.address)} · ${stats?.prisonerCount ?? 0} prisoners · ${stats?.officerCount ?? 0} officers
        ${commander ? ` · Commander: ${esc(commander.firstName)} ${esc(commander.lastName)}` : ''}</span>
      </div>`;
    }).join('') + (insts.length > 8 ? `<p class="meta" style="margin-top:0.75rem">+ ${insts.length - 8} more — <a href="institutions.html">view all</a></p>` : '');
  }

  /* ---- Prisoners ---- */
  function renderPrisoners() {
    let prisoners = PMSStorage.getPrisoners();
    PMSStorage.syncParoleNotifications(actor);
    const instF = document.getElementById('prisoner-institution-filter').value;
    const statusF = document.getElementById('prisoner-status-filter').value;
    const q = document.getElementById('prisoner-search').value.trim().toLowerCase();
    if (instF) prisoners = prisoners.filter((p) => p.institutionId === instF);
    if (statusF) prisoners = prisoners.filter((p) => p.status === statusF);
    if (q) prisoners = prisoners.filter((p) =>
      `${p.firstName} ${p.lastName} ${p.prisonerNumber}`.toLowerCase().includes(q));

    document.getElementById('prisoners-count').textContent = `${prisoners.length} record${prisoners.length !== 1 ? 's' : ''}`;
    const tbody = document.getElementById('prisoners-table-body');
    const empty = document.getElementById('prisoners-empty');
    if (!prisoners.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    tbody.innerHTML = prisoners.map((p) => {
      const prog = PMSStorage.getPrisonerProgress(p);
      const months = PMSStorage.getSentenceDurationMonths(p);
      const rowClass = prog.eligible ? 'row-eligible' : '';
      return `<tr class="${rowClass}">
        <td><strong>${esc(p.prisonerNumber)}</strong></td>
        <td>${esc(p.firstName)} ${esc(p.lastName)}</td>
        <td>${esc(instName(p.institutionId))}</td>
        <td>${fmtDate(p.sentenceStartDate)}</td>
        <td>${fmtDate(p.sentenceEndDate)}</td>
        <td>${Math.floor(months / 12)}y ${months % 12}m</td>
        <td class="progress-cell">
          <div class="progress-bar"><div class="progress-fill${prog.eligible ? ' eligible' : ''}" style="width:${prog.percent.toFixed(0)}%"></div></div>
          <span class="progress-label">${prog.percent.toFixed(0)}% served</span>
        </td>
        <td>${fmtDate(prog.eligibilityDate)}${prog.eligible ? ' <span class="eligible-tag">ELIGIBLE</span>' : ''}</td>
        <td><span class="status-pill status-pill--${statusClass(p.status)}">${esc(p.status)}</span></td>
        <td class="actions-cell">
          <a href="${PMSRBAC.prisonerProfileUrl(p.id)}" class="btn-icon">View Case File</a>
        </td>
      </tr>`;
    }).join('');
    updateBadge();
  }

  function renderDocList() {
    const list = document.getElementById('prisoner-doc-list');
    if (!list) return;
    const all = [...prisonerDocsExisting, ...pendingDocs.map((d) => ({ ...d, pending: true }))];
    list.innerHTML = all.length === 0 ? '<li class="meta">No documents attached.</li>' :
      all.map((d) => `<li>${esc(d.name)} (${Math.round(d.size / 1024)} KB) ${d.pending ? '<em>pending</em>' : ''}
        <button type="button" class="btn-icon btn-icon--danger" data-remove-doc="${d.id}" data-pending="${d.pending ? '1' : '0'}">Remove</button></li>`).join('');
  }

  function openPrisonerModal(prisoner = null) {
    const modal = document.getElementById('prisoner-modal');
    if (!modal) return;
    pendingDocs = [];
    prisonerDocsExisting = prisoner?.documents ? [...prisoner.documents] : [];
    document.getElementById('prisoner-modal-title').textContent = prisoner ? 'Edit Prisoner Record' : 'Register Prisoner';
    document.getElementById('prisoner-id').value = prisoner?.id || '';
    document.getElementById('prisoner-number').value = prisoner?.prisonerNumber || prisoner?.id || '';
    document.getElementById('prisoner-number').placeholder = prisoner ? '' : 'Automatically Generated';
    populateInstitutionSelects();
    document.getElementById('prisoner-institution').value = prisoner?.institutionId || '';
    document.getElementById('prisoner-first-name').value = prisoner?.firstName || '';
    document.getElementById('prisoner-last-name').value = prisoner?.lastName || '';
    document.getElementById('prisoner-dob').value = prisoner?.dateOfBirth || '';
    document.getElementById('prisoner-gender').value = prisoner?.gender || '';
    document.getElementById('prisoner-offense').value = prisoner?.offense || '';
    document.getElementById('prisoner-ssd').value = prisoner?.sentenceStartDate || '';
    document.getElementById('prisoner-sed').value = prisoner?.sentenceEndDate || '';
    const statusEl = document.getElementById('prisoner-status');
    if (statusEl) statusEl.value = prisoner?.status || 'Awaiting Eligibility';
    document.getElementById('prisoner-doc-upload').value = '';
    updatePrisonerCalcFields();
    renderDocList();
    modal.showModal();
  }

  /* ---- Notifications ---- */
  function renderNotifications() {
    const settings = PMSStorage.getSettings();
    const ruleNote = document.getElementById('eligibility-rule-note');
    if (ruleNote) {
      ruleNote.textContent =
        `Eligibility rule: ${settings.paroleEligibilityLabel}. Notifications are sent to System Administrator, PNGCS Parole Clerk, and Jail Commander.`;
    }

    const notifs = PMSStorage.getNotificationsForUser(actor);
    const pending = notifs.filter((n) => !n.resolved && !n.read).length;
    const countEl = document.getElementById('notifications-count');
    if (countEl) countEl.textContent = pending ? `${pending} pending` : 'Up to date';

    const listEl = document.getElementById('notification-list');
    const empty = document.getElementById('notifications-empty');
    if (!listEl) return;
    if (!notifs.length) {
      listEl.innerHTML = '';
      empty?.classList.remove('hidden');
      updateBadge();
      return;
    }
    empty?.classList.add('hidden');
    PMSUI.renderNotificationPanel('notification-list', actor, { showMarkAll: false, allowResolve: true });
    updateBadge();
  }

  /* ---- Audit ---- */
  function renderAudit() {
    let logs = PMSStorage.getAuditLogs();
    const entityF = document.getElementById('audit-entity-filter').value;
    if (entityF) logs = logs.filter((l) => l.entity === entityF);
    const tbody = document.getElementById('audit-table-body');
    const empty = document.getElementById('audit-empty');
    if (!logs.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    tbody.innerHTML = logs.map((l) => `<tr class="${l.denied ? 'row-denied' : ''}">
      <td>${fmtDateTime(l.timestamp)}</td>
      <td>${esc(l.userName)}</td>
      <td>${esc(l.role)}</td>
      <td><span class="audit-action audit-action--${l.action.toLowerCase().replace(/_/g, '-')}">${esc(l.action)}</span></td>
      <td>${esc(l.entity)}${l.entityId ? `<br><span class="meta">${esc(l.entityId)}</span>` : ''}</td>
      <td>${esc(l.ipAddress || '—')}</td>
      <td><span class="audit-status ${PMSUI.auditStatusClass(l)}">${esc(PMSUI.auditStatusLabel(l))}</span></td>
      <td>${esc(l.details)}</td>
    </tr>`).join('');
  }

  /* ---- Settings ---- */
  function renderSettings() {
    const s = PMSStorage.getSettings();
    document.getElementById('eligibility-fraction').value = String(s.paroleEligibilityFraction);
    document.getElementById('system-name').value = s.systemName;
  }

  function renderReports() {
    if (typeof PMSReports !== 'undefined') {
      PMSReports.mount('admin-reports-body', 'reports-filter-bar', actor);
      return;
    }
    const stats = PMSStorage.getDashboardStats();
    const body = document.getElementById('admin-reports-body');
    if (!body) return;
    body.innerHTML = `
      <div class="stats-grid stats-grid--4">
        <article class="stat-card"><span class="stat-label">Total Users</span><strong class="stat-value">${stats.totalUsers}</strong></article>
        <article class="stat-card"><span class="stat-label">Total Prisoners</span><strong class="stat-value">${stats.totalPrisoners}</strong></article>
        <article class="stat-card"><span class="stat-label">Active Applications</span><strong class="stat-value">${stats.activeParoleApplications}</strong></article>
        <article class="stat-card"><span class="stat-label">Eligible Prisoners</span><strong class="stat-value">${stats.eligiblePrisoners}</strong></article>
      </div>
      <p class="toolbar-note" style="margin-top:1rem;">System-wide operational summaries. Detailed institutional reports are available via Correctional Institutions.</p>`;
  }

  function refreshPanel(id) {
    populateInstitutionSelects();
    populateRoleSelects();
    const panelId = id === 'officers' ? 'users' : id;
    if (id === 'officers') renderUsers(true);
    else if (panelId === 'users') renderUsers(false);
    ({ overview: renderOverview, institutions: renderInstitutions,
       prisoners: renderPrisoners, notifications: renderNotifications, audit: renderAudit,
       settings: renderSettings, reports: renderReports })[panelId]?.();
  }

  function refreshAll() {
    const active = document.querySelector('.sidebar-nav .nav-item.active');
    const panel = active?.dataset.panel || active?.dataset.navId || 'overview';
    refreshPanel(panel);
  }

  PMSSidebar.init({
    user: actor,
    activePanel: 'overview',
    onNavigate: (panel, meta) => switchPanel(panel, meta?.navId),
  });
  PMSUI.bindNotificationPanel('notification-list', actor, () => refreshAll());

  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.goto === 'institutions') { window.location.href = 'institutions.html'; return; }
    switchPanel(b.dataset.goto);
    if (b.dataset.action === 'add-user') openUserModal();
    if (b.dataset.action === 'add-prisoner') switchPanel('prisoners');
  }));

  // Modal close
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => document.getElementById(b.dataset.close)?.close()));

  // Filters
  ['user-role-filter', 'user-status-filter', 'user-search'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', renderUsers);
  });
  ['prisoner-institution-filter', 'prisoner-status-filter', 'prisoner-search'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', renderPrisoners);
  });
  document.getElementById('audit-entity-filter')?.addEventListener('change', renderAudit);

  // Buttons
  document.getElementById('add-user-btn')?.addEventListener('click', () => openUserModal());
  document.getElementById('add-prisoner-btn')?.remove();
  document.getElementById('mark-all-read-btn')?.addEventListener('click', () => { PMSStorage.markAllNotificationsRead(actor, actor); refreshAll(); });
  document.getElementById('logout-btn')?.addEventListener('click', async () => { await PMSStorage.clearSession(); window.location.href = 'index.html'; });

  // SSD/SED calc — prisoner modal removed (PNGCS-only edit page)

  // User form
  document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const id = document.getElementById('user-id').value;
      const pw = document.getElementById('user-password').value;
      await PMSStorage.saveUser({
        id: id || undefined,
        username: document.getElementById('user-username').value.trim(),
        email: document.getElementById('user-email').value.trim(),
        firstName: document.getElementById('user-first-name').value.trim(),
        lastName: document.getElementById('user-last-name').value.trim(),
        role: document.getElementById('user-role-select').value,
        institutionId: document.getElementById('user-institution').value || null,
        position: document.getElementById('user-position').value.trim(),
        phone: document.getElementById('user-phone').value.trim(),
        status: document.getElementById('user-status').value,
        password: pw || undefined,
      }, actor);
      document.getElementById('user-modal').close();
      refreshAll();
      if (!id) {
        const created = PMSStorage.getUsers().at(-1);
        if (created) alert(`User created successfully.\nUser ID: ${created.id}${created.officerId ? `\nOfficer ID: ${created.officerId}` : ''}`);
      }
    } catch (err) { alert(err.message); }
  });

  // Reset password
  document.getElementById('reset-password-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      PMSStorage.resetPassword(document.getElementById('reset-user-id').value, document.getElementById('reset-password').value, actor);
      document.getElementById('reset-password-modal').close();
      alert('Password reset successfully.');
    } catch (err) { alert(err.message); }
  });

  // Institution management moved to institutions.html
  // Prisoner CRUD is restricted to PNGCS Parole Clerks via prisoner-edit.html

  // Settings form
  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fraction = parseFloat(document.getElementById('eligibility-fraction').value);
    const labels = { 0.333333: 'One-third (1/3) of total sentence', 0.5: 'One-half (1/2) of total sentence', 0.666667: 'Two-thirds (2/3) of total sentence' };
    await PMSStorage.saveSettings({
      paroleEligibilityFraction: fraction,
      paroleEligibilityLabel: labels[fraction] || `${fraction * 100}% of total sentence`,
      systemName: document.getElementById('system-name').value.trim(),
    }, actor);
    alert('Settings saved. Eligibility notifications will use the updated rule.');
    refreshAll();
  });

  // Delegated actions
  document.addEventListener('click', (e) => {
    const editUser = e.target.closest('[data-edit-user]');
    if (editUser) { openUserModal(PMSStorage.getUserById(editUser.dataset.editUser)); return; }

    const resetPw = e.target.closest('[data-reset-pw]');
    if (resetPw) {
      const u = PMSStorage.getUserById(resetPw.dataset.resetPw);
      document.getElementById('reset-user-id').value = u.id;
      document.getElementById('reset-user-label').textContent = `Reset password for ${u.username}`;
      document.getElementById('reset-password').value = '';
      document.getElementById('reset-password-modal').showModal();
      return;
    }

    const toggleUser = e.target.closest('[data-toggle-user]');
    if (toggleUser) {
      const u = PMSStorage.getUserById(toggleUser.dataset.toggleUser);
      PMSStorage.saveUser({ ...u, status: u.status === 'Active' ? 'Inactive' : 'Active' }, actor);
      refreshAll();
      return;
    }

    const deleteUser = e.target.closest('[data-delete-user]');
    if (deleteUser && confirm('Delete this user account?')) {
      try { PMSStorage.deleteUser(deleteUser.dataset.deleteUser, actor); refreshAll(); }
      catch (err) { alert(err.message); }
      return;
    }

    const editInst = e.target.closest('[data-edit-institution]');
    if (editInst) { window.location.href = `institutions.html?view=${editInst.dataset.editInstitution}`; return; }

    const deleteInst = e.target.closest('[data-delete-institution]');
    if (deleteInst) { window.location.href = 'institutions.html'; return; }
  });

  populateRoleSelects();
  populateInstitutionSelects();
  if (!PMSUI.applyDeepLinkNav((panel, navId) => switchPanel(panel, navId))) switchPanel('overview');
})();
