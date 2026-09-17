const PMSUI = (() => {
  let panelNavigator = null;

  const NOTIF_ICONS = {
    application: 'fi fi-rr-document',
    hearing: 'fi fi-rr-calendar',
    document: 'fi fi-rr-paperclip',
    user: 'fi fi-rr-user',
    eligibility: 'fi fi-rr-check-circle',
    verification: 'fi fi-rr-shield-check',
    form1: 'fi fi-rr-document',
    form2: 'fi fi-rr-document',
    form3: 'fi fi-rr-building',
    returned: 'fi fi-rr-undo',
    deadline: 'fi fi-rr-hourglass-end',
    escalation: 'fi fi-rr-triangle-warning',
    approval: 'fi fi-rr-badge-check',
    board_review: 'fi fi-rr-gavel',
    contract: 'fi fi-rr-id-badge',
    system: 'fi fi-rr-bell',
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
    return new Date(d).toLocaleString('en-PG', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function fmtTime(t) {
    if (!t) return '—';
    if (/^\d{1,2}:\d{2}/.test(String(t))) {
      const [h, m] = String(t).split(':');
      const d = new Date();
      d.setHours(Number(h), Number(m), 0, 0);
      return d.toLocaleTimeString('en-PG', { hour: '2-digit', minute: '2-digit' });
    }
    return fmtDateTime(t);
  }

  function form4Href(applicationId) {
    return `forms/form4.html?appId=${encodeURIComponent(applicationId)}`;
  }

  function grantedParoleArchiveRowsHtml(rows) {
    if (!rows.length) {
      return '<tr><td colspan="8" class="empty-state">No granted parole records yet. Cases appear here after Form 4 is issued. Release date, time, and the authorizing commander appear after the Jail Commander authorizes release.</td></tr>';
    }
    return rows.map((row) => {
      const released = !!row.released;
      return `<tr>
        <td><strong>${esc(row.prisonerName || '—')}</strong><span class="meta">${esc(row.prisonerNumber || '')}</span></td>
        <td>${esc(row.caseNumber || row.applicationId || '—')}</td>
        <td>${row.applicationId ? `<a href="${form4Href(row.applicationId)}" class="btn-icon">Form 4</a>` : '—'}</td>
        <td>${fmtDate(row.grantedAt)}</td>
        <td>${row.releaseDate ? fmtDate(row.releaseDate) : '—'}</td>
        <td>${row.releaseTime ? fmtTime(row.releaseTime) : '—'}</td>
        <td>${esc(row.authorizedBy || '—')}${row.authorizedByRole ? `<span class="meta">${esc(row.authorizedByRole)}</span>` : ''}</td>
        <td><span class="status-pill status-pill--${released ? 'released' : 'pending'}">${esc(row.status || (released ? 'Released on Parole' : 'Parole Granted'))}</span></td>
      </tr>`;
    }).join('');
  }

  function renderGrantedParoleArchive(tbodyId, opts = {}) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody || typeof PMSStorage === 'undefined') return;
    const rows = typeof PMSStorage.getGrantedParoleRegister === 'function'
      ? PMSStorage.getGrantedParoleRegister(opts)
      : [];
    tbody.innerHTML = grantedParoleArchiveRowsHtml(rows);
  }

  function renderReleaseReport(hostId, opts = {}) {
    const host = document.getElementById(hostId);
    if (!host || typeof PMSStorage === 'undefined') return;
    const released = (PMSStorage.getGrantedParoleRegister(opts) || []).filter((row) => row.released);
    if (!released.length) {
      host.innerHTML = '<p class="empty-state">No authorized releases recorded yet. After you authorize a release, the parolee appears here and in Granted Parole.</p>';
      return;
    }
    host.innerHTML = `<div class="release-report-grid">${released.map((row) => `
      <article class="release-report-card">
        <h3>${esc(row.prisonerName || '—')}</h3>
        <p class="meta">${esc(row.prisonerNumber || '')}${row.caseNumber ? ` · ${esc(row.caseNumber)}` : ''}</p>
        <dl class="release-report-dl">
          <dt>Date</dt><dd>${row.releaseDate ? fmtDate(row.releaseDate) : fmtDate(row.authorizedAt)}</dd>
          <dt>Time</dt><dd>${row.releaseTime ? fmtTime(row.releaseTime) : fmtDateTime(row.authorizedAt)}</dd>
          <dt>Prisoner</dt><dd>${esc(row.prisonerName || '—')}</dd>
          <dt>Authorized by</dt><dd>${esc(row.authorizedBy || '—')}${row.authorizedByRole ? ` <span class="meta">(${esc(row.authorizedByRole)})</span>` : ''}</dd>
        </dl>
        ${row.applicationId ? `<a href="${form4Href(row.applicationId)}" class="btn-icon">View Form 4</a>` : ''}
      </article>`).join('')}</div>`;
  }

  function formatStat(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '0';
    return n.toLocaleString('en-US');
  }

  function downloadDataUrl(dataUrl, fileName) {
    if (!dataUrl) throw new Error('No file content available to download.');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName || 'document';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function renderForm2AttachmentRow(file, appId) {
    if (!file) return '';
    const sizeKb = file.fileSize ? `${(file.fileSize / 1024).toFixed(1)} KB` : '';
    const meta = [file.sectionKey === 'ddr' ? 'DAR' : 'PPR', file.fieldLabel, file.uploadedByName, fmtDate(file.uploadedAt)].filter(Boolean).join(' · ');
    const downloadBtn = file.dataUrl
      ? `<button type="button" class="btn-link btn-sm dossier-download-btn" data-f2-download="${esc(file.id)}" data-f2-app="${esc(appId)}">Download</button>`
      : '<span class="meta">Metadata only</span>';
    return `<li class="dossier-file-row">
      <span class="dossier-file-row__name"><i class="fi fi-rr-document" aria-hidden="true"></i> ${esc(file.fileName)}${sizeKb ? ` <span class="meta">(${esc(sizeKb)})</span>` : ''}</span>
      <span class="dossier-file-row__meta">${esc(meta)}</span>
      ${downloadBtn}
    </li>`;
  }

  function setStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = formatStat(value);
  }

  function recentNotifications(actor, limit = 5) {
    if (typeof PMSStorage === 'undefined' || !actor) return [];
    return PMSStorage.getNotificationsForUser(actor)
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, limit);
  }

  function statusClass(s) {
    const map = {
      Active: 'active', 'Awaiting Eligibility': 'in-custody', 'In Custody': 'in-custody',
      'Eligible for Parole Application': 'eligible', 'Eligible for Parole': 'eligible',
      'Assessment in Progress': 'pending', 'Parole Application Pending': 'pending',
      'Hearing Scheduled': 'pending', 'Hearing In Progress': 'pending', Approved: 'active', 'On Parole': 'parole',
      Rejected: 'eligible', Refused: 'eligible', Released: 'released',
      'Sentence Completed': 'inactive', Deferred: 'leave',
      Draft: 'inactive', Submitted: 'pending', 'Returned for Correction': 'eligible',
      'Under DJAG Review': 'parole', 'Pre-Parole Report Prepared': 'parole',
      'Pending Board Review': 'pending',
      Scheduled: 'pending', Completed: 'active', Cancelled: 'inactive', Inactive: 'inactive',
    };
    return map[s] || 'inactive';
  }

  function instName(id) {
    return PMSStorage.getInstitutionById(id)?.name || '—';
  }

  function prisonerName(id) {
    const p = PMSStorage.getPrisonerById(id);
    return p ? `${p.firstName} ${p.lastName}` : '—';
  }

  function initShell(user, roleLabel) {
    const nameEl = document.getElementById('user-name');
    const roleEl = document.getElementById('user-role');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = `${user.firstName} ${user.lastName}`;
    if (roleEl) roleEl.textContent = roleLabel || user.role;
    if (avatarEl) avatarEl.textContent = user.firstName.charAt(0);
    const instEl = document.getElementById('user-institution');
    if (instEl && user.institutionId) {
      instEl.textContent = instName(user.institutionId);
      instEl.classList.remove('hidden');
    }
    const boardEl = document.getElementById('board-position');
    if (boardEl) {
      const boardLabel = typeof PMSBoardVote !== 'undefined'
        ? PMSBoardVote.formatBoardPosition(user)
        : (user.boardPosition || '');
      if (boardLabel && boardLabel !== '—') {
        boardEl.textContent = boardLabel;
        boardEl.classList.remove('hidden');
      }
    }
  }

  function getActionMessageCount(user) {
    const actionTypes = new Set(['board_review', 'escalation', 'eligibility', 'verification', 'hearing', 'deadline']);
    return PMSStorage.getNotificationsForUser(user)
      .filter((n) => !n.read && !n.resolved && actionTypes.has(n.type))
      .length;
  }

  function engageNotificationOnNavigate(n, user) {
    if (!n || !user) return;
    if (!n.read) PMSStorage.markNotificationRead(n.id, user);
    if (n.type === 'verification' && n.applicationId) {
      const app = PMSStorage.getApplicationById(n.applicationId);
      if (app && PMSStorage.isCommanderVerified(app)) {
        PMSStorage.resolveVerificationNotifications(n.applicationId);
      }
    }
    if (['hearing', 'escalation', 'deadline'].includes(n.type) && n.applicationId) {
      const app = PMSStorage.getApplicationById(n.applicationId);
      if (['Hearing Scheduled', 'Hearing In Progress'].includes(app?.status) || PMSStorage.getHearingsByApplication(n.applicationId).some((h) => !['Cancelled', 'Completed'].includes(h.status))) {
        PMSStorage.resolveHearingNotifications(n.applicationId);
      }
    }
  }

  function updateNotifBadge(user) {
    const count = PMSStorage.getUnreadCountForUser(user);
    document.querySelectorAll('.nav-notif-badge, #nav-notif-badge, #header-notif-badge').forEach((badge) => {
      badge.textContent = formatStat(count);
      badge.classList.toggle('hidden', count === 0);
      badge.classList.toggle('nav-notif-badge--active', count > 0);
      badge.setAttribute('aria-label', count ? `${count} unread notifications` : 'No unread notifications');
    });
    PMSWorkspace?.syncNotifBadge?.(count);
  }

  function setPanelNavigator(handler) {
    panelNavigator = typeof handler === 'function' ? handler : null;
  }

  function openNotificationsPanel() {
    if (document.getElementById('panel-notifications')) {
      if (typeof panelNavigator === 'function') {
        panelNavigator('notifications', 'notifications');
        PMSSidebar?.closeMobile?.();
        return;
      }
      document.dispatchEvent(new CustomEvent('pms:open-panel', {
        detail: { panel: 'notifications', navId: 'notifications' },
      }));
      PMSSidebar?.closeMobile?.();
      return;
    }
    const session = typeof PMSStorage !== 'undefined' ? PMSStorage.getSession?.() : null;
    const user = session?.user;
    const dash = user && typeof PMSAuth !== 'undefined' ? PMSAuth.getDashboardForRole(user.role) : null;
    if (dash) {
      window.location.href = `${dash}?panel=notifications&navId=notifications`;
    }
  }

  function bindNotificationBell(user, options = {}) {
    const bell = document.getElementById(options.toggleBtnId || 'workspace-notif-bell');
    if (!bell || bell.dataset.notifBellBound) return;
    bell.dataset.notifBellBound = 'true';
    bell.removeAttribute('aria-haspopup');
    bell.removeAttribute('aria-expanded');
    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      openNotificationsPanel();
      options.onOpen?.();
      if (user) updateNotifBadge(user);
    });
  }

  function renderNotificationDropdown(dropdownId, user, limit = 5) {
    const el = typeof dropdownId === 'string' ? document.getElementById(dropdownId) : dropdownId;
    if (!el || !user) return;
    const items = recentNotifications(user, limit);
    const unread = PMSStorage.getUnreadCountForUser(user);
    const head = `<div class="header-dropdown__head">
      <strong>Notifications</strong>
      ${unread ? `<span class="meta">${unread} unread</span>` : ''}
    </div>`;
    const body = items.length
      ? `<div class="header-dropdown__body">${items.map((n) => {
        const preview = n.message.length > 72 ? `${n.message.slice(0, 72)}…` : n.message;
        const unreadCls = !n.read && !n.resolved ? ' header-dropdown__item--unread' : '';
        return `<button type="button" class="header-dropdown__item${unreadCls}" data-notif-id="${esc(n.id)}" role="menuitem">
          <strong>${esc(n.title)}</strong>
          <span>${esc(preview)}</span>
        </button>`;
      }).join('')}</div>`
      : '<div class="header-dropdown__empty">No notifications yet.</div>';
    const foot = `<div class="header-dropdown__foot">
      <button type="button" data-view-all-notifications>View all notifications</button>
    </div>`;
    el.innerHTML = head + body + foot;
  }

  function bindNotificationDropdown(dropdownId, user, options = {}) {
    const dropdown = typeof dropdownId === 'string' ? document.getElementById(dropdownId) : dropdownId;
    const toggleBtn = document.getElementById(options.toggleBtnId || 'workspace-notif-bell');
    if (!dropdown || !toggleBtn || toggleBtn.dataset.notifDropdownBound) return;
    toggleBtn.dataset.notifDropdownBound = 'true';

    const close = () => {
      dropdown.hidden = true;
      toggleBtn.setAttribute('aria-expanded', 'false');
    };

    const open = () => {
      renderNotificationDropdown(dropdown, user, options.limit || 5);
      dropdown.hidden = false;
      toggleBtn.setAttribute('aria-expanded', 'true');
    };

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown.hidden) open();
      else close();
    });

    dropdown.addEventListener('click', (e) => {
      const viewAll = e.target.closest('[data-view-all-notifications]');
      if (viewAll) {
        e.preventDefault();
        close();
        openNotificationsPanel();
        return;
      }
      const item = e.target.closest('[data-notif-id]');
      if (!item) return;
      const n = PMSStorage.getNotifications().find((x) => x.id === item.dataset.notifId);
      if (!n) return;
      engageNotificationOnNavigate(n, user);
      const link = resolveNotificationLink(n, user);
      close();
      options.onUpdate?.();
      updateNotifBadge(user);
      if (link) window.location.href = link;
      else openNotificationsPanel();
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.hidden && !e.target.closest('#header-notif-dropdown, #workspace-notif-bell')) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dropdown.hidden) close();
    });
  }

  function notificationStatusBadge(n) {
    if (n.resolved) {
      return '<span class="notification-status-badge notification-status-badge--resolved">Resolved</span>';
    }
    if (!n.read) {
      return '<span class="notification-status-badge notification-status-badge--unread">Unread</span>';
    }
    return '<span class="notification-status-badge notification-status-badge--read">Read</span>';
  }

  function renderOverviewNotificationRow(n, user) {
    const state = n.resolved ? 'resolved' : n.read ? 'read' : 'unread';
    const preview = n.message.length > 80 ? `${n.message.slice(0, 80)}…` : n.message;
    const link = user ? resolveNotificationLink(n, user) : null;
    const clickable = link ? ' overview-row--clickable' : '';
    const attrs = link ? ` data-notif-nav="${esc(link)}" data-notif-id="${esc(n.id)}" role="button" tabindex="0"` : ' role="listitem"';
    return `<div class="overview-row overview-row--${state}${clickable}"${attrs}>
      <div class="overview-row__main">
        <strong>${esc(n.title)}</strong>
        ${!n.read && !n.resolved ? '<span class="overview-unread-dot" aria-hidden="true"></span>' : ''}
        <span class="meta">${esc(preview)}</span>
      </div>
      ${notificationStatusBadge(n)}
    </div>`;
  }

  function bindOverviewNotifications(containerId, user, onUpdate) {
    const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el || el.dataset.overviewNotifBound) return;
    el.dataset.overviewNotifBound = 'true';
    const navigate = (row) => {
      const id = row.dataset.notifId;
      const n = id ? PMSStorage.getNotifications().find((x) => x.id === id) : null;
      if (n) engageNotificationOnNavigate(n, user);
      onUpdate?.();
      window.location.href = row.dataset.notifNav;
    };
    el.addEventListener('click', (e) => {
      const row = e.target.closest('[data-notif-nav]');
      if (!row) return;
      e.preventDefault();
      navigate(row);
    });
    el.addEventListener('keydown', (e) => {
      const row = e.target.closest('[data-notif-nav]');
      if (!row || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      navigate(row);
    });
  }

  function syncOverviewNotifHeader(unreadCount) {
    const card = document.getElementById('overview-notifications')?.closest('.card');
    const header = card?.querySelector('.card-header');
    if (!header) return;
    let badge = header.querySelector('.overview-notif-count');
    if (unreadCount > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'overview-notif-count';
        header.appendChild(badge);
      }
      badge.textContent = `${unreadCount} unread`;
    } else if (badge) {
      badge.remove();
    }
  }

  function switchPanel(panelId, panelTitles, onSwitch, navId) {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach((b) => {
      const matchNav = navId && b.dataset.navId === navId;
      const matchPanel = b.dataset.panel === panelId;
      b.classList.toggle('active', matchNav || (!navId && matchPanel));
    });
    document.querySelectorAll('.panel').forEach((p) => {
      p.classList.toggle('active', p.id === `panel-${panelId}`);
    });
    const titleKey = (navId && panelTitles[navId]) ? navId : panelId;
    const titles = panelTitles[titleKey];
    if (titles) {
      const titleEl = document.getElementById('panel-title');
      const subtitleEl = document.getElementById('panel-subtitle');
      if (titleEl) titleEl.textContent = titles[0];
      if (subtitleEl) subtitleEl.textContent = titles[1];
      PMSWorkspace?.updateBreadcrumb?.(titles[0]);
    }
    PMSSidebar?.setActive?.(navId || panelId, panelId);
    onSwitch?.(panelId);
  }

  function bindNav(panelTitles, onSwitch) {
    document.querySelectorAll('.sidebar-nav .nav-item[data-panel]').forEach((btn) => {
      btn.addEventListener('click', () => switchPanel(btn.dataset.panel, panelTitles, onSwitch, btn.dataset.navId));
    });
    document.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchPanel(btn.dataset.panel || btn.dataset.goto, panelTitles, onSwitch);
        if (btn.dataset.action) document.getElementById(btn.dataset.action)?.click();
      });
    });
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

  function auditStatusLabel(log) {
    if (log.denied || log.success === false) return 'Failure';
    return 'Success';
  }

  function auditStatusClass(log) {
    return log.denied || log.success === false ? 'audit-status--failure' : 'audit-status--success';
  }

  function resolveNotificationLink(n, user) {
    if (!n || !user) return null;
    if (n.linkHref) {
      if (/^https?:\/\//i.test(n.linkHref) || n.linkHref.startsWith('/')) return n.linkHref;
      return n.linkHref;
    }
    const dash = (typeof PMSAuth !== 'undefined' ? PMSAuth.getDashboardForRole(user.role) : null)
      || window.location.pathname.split('/').pop();
    const canSchedule = typeof PMSRBAC !== 'undefined'
      ? PMSRBAC.canScheduleHearing(user)
      : user?.role === 'DJAG Secretary';
    if (n.linkPanel === 'approvals' && n.applicationId) {
      return `${dash}?panel=approvals&app=${encodeURIComponent(n.applicationId)}`;
    }
    if (n.linkPanel === 'users') {
      return `${dash}?panel=users`;
    }
    if (n.applicationId && canSchedule && (n.type === 'hearing' || n.type === 'escalation' || n.type === 'deadline' || n.linkPanel === 'hearings')) {
      return `forms/hearing-schedule.html?appId=${encodeURIComponent(n.applicationId)}`;
    }
    if (n.type === 'verification' && n.applicationId && ['Jail Commander', 'CS Parole Clerk'].includes(user?.role)) {
      return `${dash}?panel=verification&app=${encodeURIComponent(n.applicationId)}`;
    }
    if (n.type === 'board_review' && n.applicationId) {
      if (n.linkPanel === 'decisions') {
        return `${dash}?panel=decisions&navId=decisions`;
      }
      return `forms/board-decisions.html?appId=${encodeURIComponent(n.applicationId)}`;
    }
    if (n.applicationId) return `${dash}?panel=applications&app=${encodeURIComponent(n.applicationId)}`;
    if (n.hearingId) return `${dash}?panel=hearings&hearing=${encodeURIComponent(n.hearingId)}`;
    if (n.prisonerId && typeof PMSRBAC !== 'undefined') return PMSRBAC.prisonerProfileUrl(n.prisonerId);
    if (n.linkPanel) return `${dash}?panel=${encodeURIComponent(n.linkPanel)}`;
    return `${dash}?panel=notifications`;
  }

  function renderNotificationItem(n, user, options = {}) {
    const icon = NOTIF_ICONS[n.type] || NOTIF_ICONS.system;
    const link = resolveNotificationLink(n, user);
    const metaParts = [fmtDateTime(n.createdAt)];
    if (n.type === 'eligibility' && n.eligibleDate) metaParts.push(`Eligible ${fmtDate(n.eligibleDate)}`);
    if (n.institutionId) metaParts.push(instName(n.institutionId));
    const stateClass = n.resolved ? 'resolved' : n.read ? 'read' : 'unread';
    const cls = ` ${stateClass}`;
    const iconCls = n.resolved ? 'notification-icon--resolved' : n.read ? 'notification-icon--read' : 'notification-icon--unread';
    const ariaLabel = n.resolved
      ? `${n.title} — resolved notification`
      : n.read
        ? `${n.title} — read notification`
        : `${n.title} — unread notification`;
    return `<article class="notification-item${cls}" data-notif-id="${esc(n.id)}" aria-label="${esc(ariaLabel)}">
      <div class="notification-icon ${iconCls}"><i class="${icon}" aria-hidden="true"></i></div>
      <div class="notification-body">
        <div class="notification-item-header">
          <h3>${esc(n.title)}${!n.read && !n.resolved ? '<span class="notification-unread-dot" aria-hidden="true"></span>' : ''}</h3>
          ${notificationStatusBadge(n)}
        </div>
        <p>${esc(n.message)}</p>
        <div class="notification-meta">${esc(metaParts.join(' · '))}</div>
      </div>
      <div class="notification-actions">
        ${link ? `<a href="${esc(link)}" class="btn-icon" data-open-notif="${esc(n.id)}">Open record</a>` : ''}
        ${!n.read ? `<button type="button" class="btn-icon btn-icon--mark-read" data-read="${esc(n.id)}">Mark read</button>` : '<span class="notification-read-label"><i class="fi fi-rr-check" aria-hidden="true"></i> Read</span>'}
        ${options.allowResolve && n.type === 'eligibility' && !n.resolved ? `<button type="button" class="btn-icon" data-resolve-notif="${esc(n.id)}">Resolve</button>` : ''}
        ${options.allowResolve && n.type === 'eligibility' && n.resolved ? '<span class="meta">Resolved</span>' : ''}
      </div>
    </article>`;
  }

  function renderNotificationPanel(containerId, user, options = {}) {
    const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el || !user) return;
    const list = PMSStorage.getNotificationsForUser(user).sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    const unread = list.filter((n) => !n.read && !n.resolved).length;
    const readCount = list.filter((n) => n.read || n.resolved).length;
    const showToolbar = options.showMarkAll !== false;
    const summary = list.length
      ? `<div class="notification-summary" role="status" aria-live="polite">
          <div class="notification-summary__counts">
            ${unread ? `<span class="notification-count notification-count--unread">${unread} unread</span>` : '<span class="notification-count notification-count--clear">All caught up</span>'}
            ${readCount ? `<span class="notification-count notification-count--read">${readCount} read</span>` : ''}
          </div>
          ${unread ? '<span class="notification-summary__hint">Unread items appear first</span>' : ''}
        </div>`
      : '';
    const toolbar = showToolbar && unread
      ? `<div class="notification-toolbar"><button type="button" class="btn-secondary btn-sm" data-mark-all-read>Mark all as read</button></div>`
      : '';
    el.innerHTML = summary + toolbar + (list.length
      ? `<div class="notification-list-body">${list.map((n) => renderNotificationItem(n, user, options)).join('')}</div>`
      : '<p class="empty-state">No notifications.</p>');
    if (options.countEl) {
      const countEl = document.getElementById(options.countEl);
      if (countEl) countEl.textContent = unread ? `${unread} unread` : 'Up to date';
    }
  }

  function bindNotificationPanel(containerId, user, onUpdate) {
    const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el || el.dataset.notifBound) return;
    el.dataset.notifBound = 'true';
    el.addEventListener('click', (e) => {
      const readBtn = e.target.closest('[data-read]');
      if (readBtn) {
        e.preventDefault();
        PMSStorage.markNotificationRead(readBtn.dataset.read, user);
        onUpdate?.();
        return;
      }
      const openLink = e.target.closest('[data-open-notif]');
      if (openLink) {
        const n = PMSStorage.getNotifications().find((x) => x.id === openLink.dataset.openNotif);
        if (n) engageNotificationOnNavigate(n, user);
        onUpdate?.();
        return;
      }
      const row = e.target.closest('.notification-item[data-notif-id]');
      if (row && !e.target.closest('button, a')) {
        const n = PMSStorage.getNotifications().find((x) => x.id === row.dataset.notifId);
        if (n) {
          const link = resolveNotificationLink(n, user);
          if (link) {
            engageNotificationOnNavigate(n, user);
            onUpdate?.();
            window.location.href = link;
            return;
          }
          if (!n.read) {
            engageNotificationOnNavigate(n, user);
            onUpdate?.();
          }
        }
        return;
      }
      if (e.target.closest('[data-mark-all-read]')) {
        e.preventDefault();
        PMSStorage.markAllNotificationsRead(user, user);
        onUpdate?.();
        return;
      }
      const resolveBtn = e.target.closest('[data-resolve-notif]');
      if (resolveBtn) {
        e.preventDefault();
        PMSStorage.resolveNotification(resolveBtn.dataset.resolveNotif, user);
        onUpdate?.();
      }
    });
  }

  function renderAuditFeed(containerId, logs, limit = 12) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const items = logs.slice(0, limit);
    el.innerHTML = items.length === 0
      ? '<p class="empty-state">No system activity recorded.</p>'
      : items.map((l) => `<div class="activity-item activity-item--audit${l.denied ? ' activity-item--denied' : ''}">
        <span class="activity-item__icon"><i class="fi fi-rr-book" aria-hidden="true"></i></span>
        <div class="activity-item__body">
          <div class="activity-item__title">${esc(l.userName)} <span class="meta">(${esc(l.role)})</span></div>
          <div class="activity-item__meta">${esc(l.action)} · ${esc(l.entity)}${l.entityId ? ` · ${esc(l.entityId)}` : ''}</div>
          <div class="activity-item__meta">${esc(l.details || '')}${l.ipAddress ? ` · IP ${esc(l.ipAddress)}` : ''}</div>
        </div>
        <div class="activity-item__aside">
          <span class="audit-status ${auditStatusClass(l)}">${auditStatusLabel(l)}</span>
          <span class="activity-item__time">${fmtDateTime(l.timestamp)}</span>
        </div>
      </div>`).join('');
  }

  function bindModalClose() {
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => document.getElementById(btn.dataset.close)?.close());
    });
  }

  function showToast(message, type = 'success', durationMs = 4000) {
    let host = document.getElementById('pms-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'pms-toast-host';
      host.className = 'pms-toast-host';
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    const toast = document.createElement('div');
    toast.className = `pms-toast pms-toast--${type}`;
    const icons = {
      success: 'fi fi-rr-check-circle',
      error: 'fi fi-rr-cross-circle',
      warning: 'fi fi-rr-triangle-warning',
      info: 'fi fi-rr-info',
    };
    const titles = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Notice' };
    toast.innerHTML = `<div class="pms-toast__icon"><i class="${icons[type] || icons.info}" aria-hidden="true"></i></div>
      <div class="pms-toast__body"><strong class="pms-toast__title">${esc(titles[type] || 'Notice')}</strong><span class="pms-toast__message">${esc(message)}</span></div>
      <button type="button" class="pms-toast__close" aria-label="Dismiss">&times;</button>`;
    host.appendChild(toast);
    toast.querySelector('.pms-toast__close')?.addEventListener('click', () => {
      toast.classList.remove('pms-toast--visible');
      setTimeout(() => toast.remove(), 300);
    });
    requestAnimationFrame(() => toast.classList.add('pms-toast--visible'));
    setTimeout(() => {
      toast.classList.remove('pms-toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }

  function showAlertDialog(message, options = {}) {
    const { title = 'Notice', type = 'info', buttonLabel = 'OK' } = options;
    return new Promise((resolve) => {
      let overlay = document.getElementById('pms-alert-modal');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'pms-alert-modal';
        overlay.className = 'pms-alert-overlay hidden';
        overlay.innerHTML = `<div class="pms-alert-dialog" role="alertdialog" aria-modal="true" aria-labelledby="pms-alert-title">
          <div class="pms-alert-dialog__icon" id="pms-alert-icon"></div>
          <div class="pms-alert-dialog__content">
            <h2 class="pms-alert-dialog__title" id="pms-alert-title"></h2>
            <p class="pms-alert-dialog__message" id="pms-alert-message"></p>
          </div>
          <div class="pms-alert-dialog__actions">
            <button type="button" class="btn-primary" id="pms-alert-ok">OK</button>
          </div>
        </div>`;
        document.body.appendChild(overlay);
      }
      const icons = {
        error: 'fi fi-rr-cross-circle',
        success: 'fi fi-rr-check-circle',
        info: 'fi fi-rr-info',
        warning: 'fi fi-rr-triangle-warning',
      };
      overlay.className = `pms-alert-overlay pms-alert-overlay--${type}`;
      overlay.querySelector('#pms-alert-icon').innerHTML = `<i class="${icons[type] || icons.info}" aria-hidden="true"></i>`;
      overlay.querySelector('#pms-alert-title').textContent = title;
      overlay.querySelector('#pms-alert-message').textContent = message;
      overlay.querySelector('#pms-alert-ok').textContent = buttonLabel;
      overlay.classList.remove('hidden');
      const cleanup = () => {
        overlay.classList.add('hidden');
        overlay.querySelector('#pms-alert-ok').onclick = null;
        overlay.onclick = null;
        resolve();
      };
      overlay.querySelector('#pms-alert-ok').onclick = cleanup;
      overlay.onclick = (ev) => { if (ev.target === overlay) cleanup(); };
    });
  }

  function showError(message, title = 'Unable to complete action') {
    return showAlertDialog(message, { title, type: 'error', buttonLabel: 'Dismiss' });
  }

  function showSuccess(message, title = 'Success') {
    showToast(message, 'success');
    return Promise.resolve();
  }

  function hideStatDrilldown() {
    const panel = document.getElementById('stat-drilldown');
    if (panel) panel.hidden = true;
    document.querySelectorAll('.stat-card--active').forEach((c) => c.classList.remove('stat-card--active'));
  }

  function ensureStatDrilldown(anchorEl) {
    let panel = document.getElementById('stat-drilldown');
    if (!panel && anchorEl) {
      panel = document.createElement('section');
      panel.id = 'stat-drilldown';
      panel.className = 'stat-drilldown card';
      panel.hidden = true;
      panel.innerHTML = `<div class="card-header stat-drilldown__header">
          <div><h2 id="stat-drilldown-title">Category</h2><p class="stat-drilldown__subtitle" id="stat-drilldown-subtitle"></p></div>
          <button type="button" class="btn-icon stat-drilldown__close" id="stat-drilldown-close" aria-label="Close list">&times;</button>
        </div>
        <div class="card-body stat-drilldown__body">
          <div class="table-wrap"><table class="data-table"><thead id="stat-drilldown-head"></thead><tbody id="stat-drilldown-body"></tbody></table></div>
        </div>`;
      anchorEl.insertAdjacentElement('afterend', panel);
      document.getElementById('stat-drilldown-close')?.addEventListener('click', () => hideStatDrilldown());
    }
    return panel;
  }

  function showStatDrilldown(title, subtitle, columns, rows, activeStatId) {
    const grid = document.querySelector('#panel-overview .stats-grid');
    if (!grid) return;
    const panel = ensureStatDrilldown(grid);
    document.getElementById('stat-drilldown-title').textContent = title;
    const sub = document.getElementById('stat-drilldown-subtitle');
    if (sub) {
      sub.textContent = subtitle || '';
      sub.hidden = !subtitle;
    }
    document.getElementById('stat-drilldown-head').innerHTML = `<tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
    document.getElementById('stat-drilldown-body').innerHTML = rows.length
      ? rows.join('')
      : `<tr><td colspan="${columns.length}" class="empty-state">No records in this category.</td></tr>`;
    panel.hidden = false;
    document.querySelectorAll('.stat-card--active').forEach((c) => c.classList.remove('stat-card--active'));
    if (activeStatId) document.getElementById(activeStatId)?.closest('.stat-card')?.classList.add('stat-card--active');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function prisonerDrilldownRow(p, extraCells = '') {
    const profile = typeof PMSRBAC !== 'undefined' ? PMSRBAC.prisonerProfileUrl(p.id) : '#';
    return `<tr>
      <td>${esc(p.prisonerNumber || p.id)}</td>
      <td>${esc(p.firstName)} ${esc(p.lastName)}</td>
      <td>${instName(p.institutionId)}</td>
      ${extraCells}
      <td><a href="${profile}" class="btn-icon">View</a></td>
    </tr>`;
  }

  function appDrilldownRow(app, extraCells = '') {
    const p = typeof PMSStorage !== 'undefined' ? PMSStorage.getPrisonerById(app.prisonerId) : null;
    if (!p) return '';
    return prisonerDrilldownRow(p, `<td><span class="status-pill status-pill--${statusClass(app.status)}">${esc(app.status)}</span></td>${extraCells}`);
  }

  function bindStatCards(definitions, options = {}) {
    definitions.forEach(({ statId, title, subtitle, columns, getRows, onClick }) => {
      const valueEl = document.getElementById(statId);
      const card = valueEl?.closest('.stat-card');
      if (!card || card.dataset.statBound) return;
      card.dataset.statBound = 'true';
      card.classList.add('stat-card--clickable');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `View ${title} list`);
      const open = () => {
        if (onClick) { onClick(); return; }
        const rows = getRows?.() || [];
        showStatDrilldown(title, subtitle || `${formatStat(rows.length)} record(s)`, columns, rows, statId);
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
    if (options.notificationsStatId) {
      const notifCard = document.getElementById(options.notificationsStatId)?.closest('.stat-card');
      if (notifCard && !notifCard.dataset.statBound) {
        notifCard.dataset.statBound = 'true';
        notifCard.classList.add('stat-card--clickable');
        notifCard.setAttribute('role', 'button');
        notifCard.setAttribute('tabindex', '0');
        const openNotifs = () => options.onNotificationsClick?.();
        notifCard.addEventListener('click', openNotifs);
        notifCard.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNotifs(); }
        });
      }
    }
  }

  function progressBar(prisoner) {
    const prog = PMSStorage.getPrisonerProgress(prisoner);
    return `<div class="progress-bar"><div class="progress-fill${prog.eligible ? ' eligible' : ''}" style="width:${prog.percent.toFixed(0)}%"></div></div>
      <span class="progress-label">${prog.percent.toFixed(0)}% · Eligible ${fmtDate(prog.eligibilityDate)}</span>`;
  }

  function applyDeepLinkNav(switchFn) {
    const params = new URLSearchParams(window.location.search);
    const panel = params.get('panel');
    if (!panel) return false;
    switchFn(panel, params.get('navId') || undefined);
    return true;
  }

  function highlightDeepLinkRow(selector) {
    requestAnimationFrame(() => {
      const row = document.querySelector(selector);
      if (!row) return;
      row.classList.add('row-highlight');
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function confirmDialog(message, title = 'Confirm') {
    return new Promise((resolve) => {
      let overlay = document.getElementById('pms-confirm-modal');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'pms-confirm-modal';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `<div class="modal-card" role="alertdialog"><div class="modal-header"><h2 id="pms-confirm-title"></h2></div><div class="modal-body"><p id="pms-confirm-message"></p></div><div class="modal-footer"><button type="button" class="btn-secondary" data-confirm-cancel>Cancel</button><button type="button" class="btn-primary" data-confirm-ok>Confirm</button></div></div>`;
        document.body.appendChild(overlay);
      }
      overlay.querySelector('#pms-confirm-title').textContent = title;
      overlay.querySelector('#pms-confirm-message').textContent = message;
      overlay.classList.remove('hidden');
      const cleanup = (val) => {
        overlay.classList.add('hidden');
        overlay.querySelector('[data-confirm-ok]').onclick = null;
        overlay.querySelector('[data-confirm-cancel]').onclick = null;
        resolve(val);
      };
      overlay.querySelector('[data-confirm-ok]').onclick = () => cleanup(true);
      overlay.querySelector('[data-confirm-cancel]').onclick = () => cleanup(false);
    });
  }

  function showLoading(container, message = 'Loading…') {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;
    el.dataset.prevHtml = el.innerHTML;
    el.innerHTML = `<p class="loading-state"><span class="loading-spinner" aria-hidden="true"></span> ${esc(message)}</p>`;
  }

  function hideLoading(container) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el || el.dataset.prevHtml == null) return;
    el.innerHTML = el.dataset.prevHtml;
    delete el.dataset.prevHtml;
  }

  function createPaginator(options = {}) {
    const { pageSize = 10, onPageChange } = options;
    let page = 1;
    let rows = [];

    function renderControls(containerId, total) {
      const el = document.getElementById(containerId);
      if (!el) return;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      if (page > pages) page = pages;
      el.innerHTML = `<div class="pagination-bar">
        <span class="pagination-info">${total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : '0 records'}</span>
        <div class="pagination-controls">
          <button type="button" class="btn-secondary btn-sm" data-page="prev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
          <span class="pagination-page">Page ${page} / ${pages}</span>
          <button type="button" class="btn-secondary btn-sm" data-page="next" ${page >= pages ? 'disabled' : ''}>Next</button>
        </div>
      </div>`;
      el.querySelector('[data-page="prev"]')?.addEventListener('click', () => { if (page > 1) { page -= 1; onPageChange?.(getPageSlice()); renderControls(containerId, total); } });
      el.querySelector('[data-page="next"]')?.addEventListener('click', () => { if (page < pages) { page += 1; onPageChange?.(getPageSlice()); renderControls(containerId, total); } });
    }

    function setRows(allRows) {
      rows = allRows || [];
      page = 1;
      return getPageSlice();
    }

    function getPageSlice() {
      const start = (page - 1) * pageSize;
      return rows.slice(start, start + pageSize);
    }

    return { setRows, getPageSlice, renderControls, get page() { return page; }, get total() { return rows.length; } };
  }

  function getDeepLinkParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  const TRACKER_ICONS = {
    completed: '✓',
    current: '●',
    pending: '○',
    overdue: '!',
    returned: '↩',
    rejected: '✕',
  };

  function renderCaseTracker(appId) {
    const stages = PMSStorage.getCaseTracker(appId);
    if (!stages.length) return '<p class="empty-state">No workflow stages available.</p>';
    return `<ol class="case-tracker">${stages.map((s, i) => {
      const next = i < stages.length - 1 ? '<span class="case-tracker__arrow" aria-hidden="true">↓</span>' : '';
      return `<li class="case-tracker__stage case-tracker__stage--${s.status}">
        <span class="case-tracker__icon" aria-hidden="true">${TRACKER_ICONS[s.status] || '○'}</span>
        <span class="case-tracker__label">${esc(s.label)}</span>
        <span class="case-tracker__status">${esc(s.status)}</span>
        ${next}
      </li>`;
    }).join('')}</ol>`;
  }

  function applicationRowAttributes(app, actor) {
    if (!app?.id) return '';
    const target = typeof PMSStorage !== 'undefined'
      ? PMSStorage.resolveApplicationEditTarget(app, actor)
      : null;
    const title = target?.label ? `Continue: ${target.label}` : 'Open application';
    return `class="app-row--clickable" data-application-row="${esc(app.id)}" title="${esc(title)}" tabindex="0" role="button"`;
  }

  function navigateToApplicationEdit(appId, actor) {
    const app = PMSStorage.getApplicationById(appId);
    if (!app) {
      showError('Application not found.');
      return;
    }
    const target = PMSStorage.resolveApplicationEditTarget(app, actor);
    if (!target?.href) {
      showError('Unable to open this application.');
      return;
    }
    window.location.href = target.href;
  }

  function renderApplicationActionButtons(app, actor) {
    if (!app || app.archived || !actor) return '';
    const parts = [];
    if (typeof PMSRBAC !== 'undefined' && PMSRBAC.can(actor, 'applications', 'update')) {
      const target = PMSStorage.resolveApplicationEditTarget(app, actor);
      parts.push(`<button type="button" class="btn-icon" data-edit-application="${esc(app.id)}" title="${esc(target?.label || 'Continue editing')}">Edit</button>`);
    }
    if (PMSStorage.canArchiveApplication?.(app, actor)) {
      parts.push(`<button type="button" class="btn-icon" data-archive-application="${esc(app.id)}" title="Archive closed case">Archive</button>`);
    }
    if (PMSStorage.canDeleteApplication?.(app, actor)) {
      parts.push(`<button type="button" class="btn-icon btn-icon--danger" data-delete-application="${esc(app.id)}" title="Delete draft application">Delete</button>`);
    }
    return parts.length ? `<span class="table-actions">${parts.join('')}</span>` : '—';
  }

  function bindApplicationActionHandlers(onChange) {
    if (typeof onChange === 'function') {
      document.addEventListener('pms:application-changed', onChange);
    }
    if (document.documentElement.dataset.appActionsBound) return;
    document.documentElement.dataset.appActionsBound = 'true';
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const appRow = e.target.closest('[data-application-row]');
      if (!appRow || appRow !== document.activeElement) return;
      e.preventDefault();
      const session = typeof PMSStorage !== 'undefined' ? PMSStorage.getSession() : null;
      const actor = session?.id && typeof PMSStorage !== 'undefined'
        ? (PMSStorage.getUserById(session.id) || session)
        : session;
      if (actor) navigateToApplicationEdit(appRow.dataset.applicationRow, actor);
    });
    document.addEventListener('click', async (e) => {
      const session = typeof PMSStorage !== 'undefined' ? PMSStorage.getSession() : null;
      const actor = session?.id && typeof PMSStorage !== 'undefined'
        ? (PMSStorage.getUserById(session.id) || session)
        : session;
      if (!actor) return;

      const notifyChange = () => document.dispatchEvent(new CustomEvent('pms:application-changed'));

      const editBtn = e.target.closest('[data-edit-application]');
      if (editBtn) {
        e.preventDefault();
        navigateToApplicationEdit(editBtn.dataset.editApplication, actor);
        return;
      }
      const appRow = e.target.closest('[data-application-row]');
      if (appRow && !e.target.closest('a, button, input, select, textarea, label')) {
        e.preventDefault();
        navigateToApplicationEdit(appRow.dataset.applicationRow, actor);
        return;
      }
      const deleteBtn = e.target.closest('[data-delete-application]');
      if (deleteBtn) {
        e.preventDefault();
        const appId = deleteBtn.dataset.deleteApplication;
        const ok = await confirmDialog('Permanently delete this parole application? This cannot be undone.', 'Delete Application');
        if (!ok) return;
        try {
          PMSStorage.deleteApplication(appId, actor);
          notifyChange();
          showSuccess('Application deleted.');
        } catch (err) {
          showError(err.message);
        }
        return;
      }
      const archiveBtn = e.target.closest('[data-archive-application]');
      if (archiveBtn) {
        e.preventDefault();
        const appId = archiveBtn.dataset.archiveApplication;
        const ok = await confirmDialog('Archive this case? It will be hidden from active lists but kept for records.', 'Archive Application');
        if (!ok) return;
        try {
          PMSStorage.archiveApplication(appId, actor);
          notifyChange();
          showSuccess('Application archived.');
        } catch (err) {
          showError(err.message);
        }
      }
    });
  }

  function bindLiveDataRefresh(onRefresh, { refreshOnFocus = true, pollMs = 4000 } = {}) {
    if (typeof onRefresh !== 'function' || typeof window === 'undefined') return () => {};
    let timer = null;
    let pollId = null;
    let pulling = false;

    const onVisibility = () => {
      if (document.visibilityState === 'visible') run(true);
    };
    const onStorage = (e) => {
      if (!e?.key) return;
      if (e.key === 'pms_mock_data_v5' || e.key === 'png_parole_workflow') run(true);
    };
    const onChanged = () => run(true);

    const run = (force = false) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (pulling) return;
        pulling = true;
        let changed = force;
        try {
          if (typeof PMSStorage?.pullRemoteCaseProgress === 'function') {
            changed = !!(await PMSStorage.pullRemoteCaseProgress()) || force;
          }
        } catch (_) { /* keep local view */ }
        pulling = false;
        if (typeof PMSFormWorkflow?.syncMirroredCompletions === 'function') {
          const appId = PMSFormWorkflow.getAppId?.();
          if (appId && appId !== '_default') PMSFormWorkflow.syncMirroredCompletions(appId);
        }
        if (changed) {
          try { onRefresh(); } catch (_) { /* ignore render errors */ }
        }
      }, 120);
    };

    window.addEventListener('pms:data-changed', onChanged);
    window.addEventListener('storage', onStorage);
    if (refreshOnFocus) {
      window.addEventListener('focus', onChanged);
      document.addEventListener('visibilitychange', onVisibility);
    }
    if (pollMs > 0) pollId = window.setInterval(() => run(false), pollMs);
    return () => {
      clearTimeout(timer);
      if (pollId) window.clearInterval(pollId);
      window.removeEventListener('pms:data-changed', onChanged);
      window.removeEventListener('storage', onStorage);
      if (refreshOnFocus) {
        window.removeEventListener('focus', onChanged);
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }

  return {
    esc, fmtDate, fmtDateTime, fmtTime, formatStat, setStat, recentNotifications, statusClass, instName, prisonerName,
    bindLiveDataRefresh,
    initShell, updateNotifBadge, switchPanel, setPanelNavigator, openNotificationsPanel,
    bindNav, renderBarChart,
    renderAuditFeed, auditStatusLabel, auditStatusClass,
    renderNotificationPanel, bindNotificationPanel, bindNotificationBell,
    bindNotificationDropdown, renderNotificationDropdown,
    getActionMessageCount, resolveNotificationLink,
    renderOverviewNotificationRow, syncOverviewNotifHeader, notificationStatusBadge, bindOverviewNotifications,
    bindModalClose, progressBar, applyDeepLinkNav, highlightDeepLinkRow, getDeepLinkParam, showToast,
    showAlertDialog, showError, showSuccess, bindStatCards, showStatDrilldown, hideStatDrilldown,
    prisonerDrilldownRow, appDrilldownRow,
    confirmDialog, showLoading, hideLoading, createPaginator,
    renderCaseTracker, renderApplicationActionButtons, applicationRowAttributes,
    bindApplicationActionHandlers, navigateToApplicationEdit,
    downloadDataUrl, renderForm2AttachmentRow,
    form4Href, renderGrantedParoleArchive, renderReleaseReport,
  };
})();
