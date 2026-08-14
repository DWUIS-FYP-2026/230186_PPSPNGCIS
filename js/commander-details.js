/**
 * Jail Commander Details page
 */
(async () => {
  await PMSStorage.ensureLoaded();

  const actor = PMSAuth.requireRole(['System Administrator', 'Jail Commander']);
  if (!actor) return;

  const isAdmin = actor.role === 'System Administrator';
  const params = new URLSearchParams(window.location.search);
  let commanderId = params.get('id');

  if (!commanderId && actor.role === 'Jail Commander') {
    commanderId = actor.id;
  }

  if (!commanderId) {
    document.getElementById('main-content').innerHTML = '<p class="text-danger">Commander ID required.</p>';
    return;
  }

  const bundle = PMSStorage.getCommanderDetailBundle(commanderId);
  if (!bundle) {
    document.getElementById('main-content').innerHTML = '<p class="text-danger">Jail Commander not found.</p>';
    return;
  }

  if (!isAdmin && actor.id !== commanderId && actor.institutionId !== bundle.commander.institutionId) {
    alert('You do not have access to this commander profile.');
    window.location.href = PMSAuth.getDashboardForRole(actor.role);
    return;
  }

  document.getElementById('back-dashboard').href = PMSAuth.getDashboardForRole(actor.role);
  const editModal = new bootstrap.Modal(document.getElementById('editCommanderModal'));

  if (isAdmin) {
    document.getElementById('btn-edit-commander').classList.remove('d-none');
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
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

  function avatarHtml(c) {
    const initials = `${(c.firstName || '?')[0]}${(c.lastName || '?')[0]}`.toUpperCase();
    return `<div class="commander-avatar" aria-hidden="true">${initials}</div>`;
  }

  function render() {
    const { commander: c, institution: inst, stats, officers, prisoners, applications, eligible, notifications, auditLogs } = bundle;

    document.getElementById('page-subtitle').textContent =
      `${c.fullName} · ${inst?.name || 'Unassigned'} · ${c.province}`;

    document.getElementById('main-content').innerHTML = `
      <div class="row g-4">
        <div class="col-lg-4">
          <div class="commander-profile-card">
            ${avatarHtml(c)}
            <h2 class="h4 mt-3 mb-1">${esc(c.fullName)}</h2>
            <p class="text-muted mb-3">${esc(c.rank || 'Jail Commander')}</p>
            <dl class="commander-dl">
              <dt>Officer ID</dt><dd>${esc(c.officerId)}</dd>
              <dt>Employee No.</dt><dd>${esc(c.employeeNumber)}</dd>
              <dt>Username</dt><dd>${esc(c.username)}</dd>
              <dt>Email</dt><dd>${esc(c.email)}</dd>
              <dt>Contact</dt><dd>${esc(c.phone)}</dd>
              <dt>Date Appointed</dt><dd>${fmtDate(c.dateAppointed)}</dd>
              <dt>Employment</dt><dd><span class="status-badge status-badge--${c.employmentStatus === 'Active' ? 'active' : 'inactive'}">${esc(c.employmentStatus)}</span></dd>
              <dt>Account Status</dt><dd>${esc(c.accountStatus)}</dd>
              <dt>Last Login</dt><dd>${fmtDateTime(c.lastLogin)}</dd>
            </dl>
          </div>
          <div class="commander-profile-card mt-3">
            <div class="view-section-title">Assigned Institution</div>
            ${inst ? `<p class="mb-1"><strong>${esc(inst.name)}</strong></p>
              <p class="text-muted small mb-2">${esc(inst.code)} · ${esc(inst.province)} · ${esc(inst.address)}</p>
              <a href="institutions.html?view=${inst.id}" class="btn btn-sm btn-pms-outline">View Institution</a>` : '<p class="text-muted">No institution assigned.</p>'}
          </div>
        </div>

        <div class="col-lg-8">
          <div class="inst-stats-row mb-4" style="margin-bottom:0">
            <div class="inst-stat-card"><span class="label">Officers</span><strong>${stats.officerCount}</strong></div>
            <div class="inst-stat-card inst-stat-card--gold"><span class="label">Prisoners</span><strong>${stats.prisonerCount}</strong></div>
            <div class="inst-stat-card inst-stat-card--green"><span class="label">Active Applications</span><strong>${stats.activeApplications}</strong></div>
            <div class="inst-stat-card inst-stat-card--red"><span class="label">Eligible</span><strong>${stats.eligibleCount}</strong></div>
          </div>

          <div class="commander-profile-card mb-4">
            <div class="view-section-title">Assigned Officers</div>
            ${officers.length ? `<div class="table-responsive"><table class="table table-sm table-bordered mb-0">
              <thead class="table-light"><tr><th>Name</th><th>Role</th><th>Employee No.</th><th>Contact</th><th>Status</th></tr></thead>
              <tbody>${officers.map((o) => `<tr><td>${esc(o.firstName)} ${esc(o.lastName)}</td><td>${esc(o.role)}</td><td>${esc(o.employeeNumber || '—')}</td><td>${esc(o.phone || o.email)}</td><td>${esc(o.status)}</td></tr>`).join('')}</tbody>
            </table></div>` : '<p class="text-muted mb-0">No officers assigned.</p>'}
          </div>

          <div class="row g-4">
            <div class="col-md-6">
              <div class="commander-profile-card h-100">
                <div class="view-section-title">Eligible Prisoners (${eligible.length})</div>
                ${eligible.length ? eligible.map((p) => `<div class="mini-row"><strong>${esc(p.firstName)} ${esc(p.lastName)}</strong><span class="text-muted small">${esc(p.prisonerNumber)}</span></div>`).join('') : '<p class="text-muted mb-0">None currently eligible.</p>'}
              </div>
            </div>
            <div class="col-md-6">
              <div class="commander-profile-card h-100">
                <div class="view-section-title">Active Parole Applications (${applications.length})</div>
                ${applications.length ? applications.map((a) => {
                  const p = PMSStorage.getPrisonerById(a.prisonerId);
                  return `<div class="mini-row"><strong>${esc(p ? `${p.firstName} ${p.lastName}` : a.id)}</strong><span class="status-badge status-badge--active">${esc(a.status)}</span></div>`;
                }).join('') : '<p class="text-muted mb-0">No active applications.</p>'}
              </div>
            </div>
          </div>

          <div class="commander-profile-card mt-4">
            <div class="view-section-title">Notifications & Alerts (${notifications.length})</div>
            ${notifications.length ? notifications.slice(0, 6).map((n) => `<div class="mini-row ${n.read ? '' : 'mini-row--alert'}"><strong>${esc(n.title)}</strong><span class="text-muted small">${esc(n.message.slice(0, 70))}…</span></div>`).join('') : '<p class="text-muted mb-0">No notifications.</p>'}
          </div>

          <div class="commander-profile-card mt-4">
            <div class="view-section-title">Recent Institutional Activities</div>
            ${auditLogs.length ? `<div class="table-responsive"><table class="table table-sm table-bordered mb-0">
              <thead class="table-light"><tr><th>When</th><th>Action</th><th>Details</th></tr></thead>
              <tbody>${auditLogs.map((l) => `<tr><td>${fmtDateTime(l.timestamp)}</td><td>${esc(l.action)}</td><td>${esc(l.details)}</td></tr>`).join('')}</tbody>
            </table></div>` : '<p class="text-muted mb-0">No recent activity recorded.</p>'}
          </div>
        </div>
      </div>`;
  }

  function openEditModal() {
    const c = bundle.commander;
    document.getElementById('cmd-id').value = c.id;
    document.getElementById('cmd-officer-id').value = c.officerId || '';
    document.getElementById('cmd-employee-no').value = c.employeeNumber || '';
    document.getElementById('cmd-first').value = c.firstName;
    document.getElementById('cmd-last').value = c.lastName;
    document.getElementById('cmd-username').value = c.username;
    document.getElementById('cmd-email').value = c.email;
    document.getElementById('cmd-phone').value = c.phone || '';
    document.getElementById('cmd-appointed').value = c.dateAppointed || '';
    document.getElementById('cmd-employment').value = c.employmentStatus || 'Active';
    document.getElementById('cmd-account').value = c.accountStatus || 'Active';
    document.getElementById('cmd-status').value = c.status || 'Active';
    const instSel = document.getElementById('cmd-institution');
    instSel.innerHTML = PMSStorage.getInstitutions().map((i) =>
      `<option value="${i.id}">${esc(i.name)}</option>`).join('');
    instSel.value = c.institutionId || '';
    document.getElementById('cmd-province').value = PMSStorage.getInstitutionById(instSel.value)?.province || '';
    instSel.onchange = () => {
      document.getElementById('cmd-province').value = PMSStorage.getInstitutionById(instSel.value)?.province || '';
    };
    editModal.show();
  }

  document.getElementById('btn-edit-commander')?.addEventListener('click', openEditModal);

  document.getElementById('edit-commander-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const id = document.getElementById('cmd-id').value;
      const instId = document.getElementById('cmd-institution').value;
      PMSStorage.saveCommanderProfile({
        id,
        firstName: document.getElementById('cmd-first').value.trim(),
        lastName: document.getElementById('cmd-last').value.trim(),
        username: document.getElementById('cmd-username').value.trim(),
        email: document.getElementById('cmd-email').value.trim(),
        phone: document.getElementById('cmd-phone').value.trim(),
        dateAppointed: document.getElementById('cmd-appointed').value,
        institutionId: instId,
        province: document.getElementById('cmd-province').value,
        employmentStatus: document.getElementById('cmd-employment').value,
        accountStatus: document.getElementById('cmd-account').value,
        status: document.getElementById('cmd-status').value,
      }, actor);
      PMSStorage.assignJailCommander(instId, id, actor);
      const updated = PMSStorage.getCommanderDetailBundle(id);
      Object.assign(bundle, updated);
      editModal.hide();
      render();
    } catch (err) {
      alert(err.message);
    }
  });

  render();
})();
