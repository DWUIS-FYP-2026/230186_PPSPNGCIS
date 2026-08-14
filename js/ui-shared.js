const PMSUI = (() => {
  const DASHBOARD_URLS = {
    'System Administrator': 'admin-dashboard.html',
    'PNGCS Parole Clerk': 'dashboard-pngcs.html',
    'DJAG Parole Clerk': 'dashboard-djag.html',
    'Jail Commander': 'dashboard-commander.html',
    'Parole Board Member': 'dashboard-board.html',
  };

  const NOTIF_ICONS = {
    application: 'bi-file-earmark-text',
    hearing: 'bi-calendar-event',
    document: 'bi-paperclip',
    user: 'bi-person',
    eligibility: 'bi-check-circle',
    system: 'bi-bell',
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

  function statusClass(s) {
    const map = {
      Active: 'active', 'Awaiting Eligibility': 'in-custody', 'In Custody': 'in-custody',
      'Eligible for Parole Application': 'eligible', 'Eligible for Parole': 'eligible',
      'Assessment in Progress': 'pending', 'Parole Application Pending': 'pending',
      'Hearing Scheduled': 'pending', Approved: 'active', 'On Parole': 'parole',
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
    if (boardEl && user.boardPosition) {
      boardEl.textContent = user.boardPosition;
      boardEl.classList.remove('hidden');
    }
  }

  function updateNotifBadge(user) {
    const count = PMSStorage.getUnreadCountForUser(user);
    document.querySelectorAll('.nav-notif-badge, #nav-notif-badge, #header-notif-badge').forEach((badge) => {
      badge.textContent = count;
      badge.classList.toggle('hidden', count === 0);
    });
    PMSWorkspace?.syncNotifBadge?.(count);
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
    if (n.linkHref) return n.linkHref;
    const dash = DASHBOARD_URLS[user.role] || window.location.pathname.split('/').pop();
    if (n.applicationId) return `${dash}?panel=applications&app=${encodeURIComponent(n.applicationId)}`;
    if (n.hearingId) return `${dash}?panel=hearings&hearing=${encodeURIComponent(n.hearingId)}`;
    if (n.prisonerId && typeof PMSRBAC !== 'undefined') return PMSRBAC.prisonerProfileUrl(n.prisonerId);
    if (n.linkPanel) return `${dash}?panel=${encodeURIComponent(n.linkPanel)}`;
    return null;
  }

  function renderNotificationItem(n, user, options = {}) {
    const icon = NOTIF_ICONS[n.type] || NOTIF_ICONS.system;
    const link = resolveNotificationLink(n, user);
    const metaParts = [fmtDateTime(n.createdAt)];
    if (n.type === 'eligibility' && n.eligibleDate) metaParts.push(`Eligible ${fmtDate(n.eligibleDate)}`);
    if (n.institutionId) metaParts.push(instName(n.institutionId));
    const cls = n.resolved ? ' resolved' : n.read ? '' : ' unread';
    return `<article class="notification-item${cls}">
      <div class="notification-icon"><i class="bi ${icon}" aria-hidden="true"></i></div>
      <div class="notification-body">
        <h3>${esc(n.title)}</h3>
        <p>${esc(n.message)}</p>
        <div class="notification-meta">${esc(metaParts.join(' · '))}</div>
      </div>
      <div class="notification-actions">
        ${link ? `<a href="${esc(link)}" class="btn-icon" data-open-notif="${esc(n.id)}">Open record</a>` : ''}
        ${!n.read ? `<button type="button" class="btn-icon" data-read="${esc(n.id)}">Mark read</button>` : ''}
        ${options.allowResolve && n.type === 'eligibility' && !n.resolved ? `<button type="button" class="btn-icon" data-resolve-notif="${esc(n.id)}">Resolve</button>` : ''}
        ${options.allowResolve && n.type === 'eligibility' && n.resolved ? '<span class="meta">Resolved</span>' : ''}
      </div>
    </article>`;
  }

  function renderNotificationPanel(containerId, user, options = {}) {
    const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el || !user) return;
    const list = PMSStorage.getNotificationsForUser(user).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const unread = list.filter((n) => !n.read).length;
    const showToolbar = options.showMarkAll !== false;
    const toolbar = showToolbar && unread
      ? `<div class="notification-toolbar"><button type="button" class="btn-secondary btn-sm" data-mark-all-read>Mark all as read</button></div>`
      : '';
    el.innerHTML = toolbar + (list.length
      ? list.map((n) => renderNotificationItem(n, user, options)).join('')
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
        if (n && !n.read) PMSStorage.markNotificationRead(n.id, user);
        onUpdate?.();
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
        <span class="activity-item__icon"><i class="bi bi-journal-text" aria-hidden="true"></i></span>
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
    const icon = type === 'error' ? 'bi-exclamation-circle' : 'bi-check-circle';
    toast.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i><span>${esc(message)}</span>`;
    host.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('pms-toast--visible'));
    setTimeout(() => {
      toast.classList.remove('pms-toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, durationMs);
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

  return {
    esc, fmtDate, fmtDateTime, statusClass, instName, prisonerName,
    initShell, updateNotifBadge, switchPanel, bindNav, renderBarChart,
    renderAuditFeed, auditStatusLabel, auditStatusClass,
    renderNotificationPanel, bindNotificationPanel, resolveNotificationLink,
    bindModalClose, progressBar, applyDeepLinkNav, showToast,
  };
})();
