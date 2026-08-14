/**
 * Correctional Institution Management module
 */
(async () => {
  await PMSStorage.ensureLoaded();

  const actor = PMSAuth.requireRole(['System Administrator', 'Jail Commander']);
  if (!actor) return;

  const isAdmin = actor.role === 'System Administrator';
  const isCommander = actor.role === 'Jail Commander';

  let sortKey = 'name';
  let sortDir = 1;

  const viewModal = new bootstrap.Modal(document.getElementById('viewModal'));
  const editModal = new bootstrap.Modal(document.getElementById('editModal'));

  PMSSidebar.init({
    user: actor,
    activeNavId: isAdmin ? 'institutions' : 'institution',
    linkPanels: true,
    dashboardUrl: PMSAuth.getDashboardForRole(actor.role),
  });
  PMSUI.updateNotifBadge(actor);

  if (isAdmin) {
    document.getElementById('btn-add-institution').classList.remove('d-none');
  } else {
    document.getElementById('commander-note').classList.remove('d-none');
    document.getElementById('page-subtitle').textContent =
      `Assigned facility: ${PMSStorage.getInstitutionById(actor.institutionId)?.name || '—'}`;
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-PG', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function commanderCell(commander) {
    if (!commander) return '<span class="text-muted">— Unassigned —</span>';
    return `<a href="commander-details.html?id=${esc(commander.id)}" class="commander-link">${esc(commander.firstName)} ${esc(commander.lastName)}</a>
      <div class="text-muted small">${esc(commander.officerId || '')}</div>`;
  }

  function commanderProfileHtml(commander, inst) {
    if (!commander) return '<p class="text-muted">No Jail Commander assigned to this institution.</p>';
    const initials = `${commander.firstName[0]}${commander.lastName[0]}`.toUpperCase();
    return `
      <div class="d-flex flex-wrap gap-3 align-items-start mb-3 p-3" style="background:#f8f9fa;border-radius:8px;border-left:4px solid var(--color-gold)">
        <div class="commander-avatar" style="width:64px;height:64px;font-size:1.25rem;margin:0">${initials}</div>
        <div class="flex-grow-1">
          <h6 class="mb-1"><a href="commander-details.html?id=${commander.id}" class="commander-link">${esc(commander.firstName)} ${esc(commander.lastName)}</a></h6>
          <div class="text-muted small">${esc(commander.rank || 'Jail Commander')} · ${esc(commander.officerId)} · ${esc(commander.employeeNumber)}</div>
        </div>
        <a href="commander-details.html?id=${commander.id}" class="btn btn-sm btn-pms-outline">Full Profile</a>
      </div>
      <div class="row g-2 small">
        <div class="col-md-6"><strong>Username:</strong> ${esc(commander.username)}</div>
        <div class="col-md-6"><strong>Email:</strong> ${esc(commander.email)}</div>
        <div class="col-md-6"><strong>Contact:</strong> ${esc(commander.phone)}</div>
        <div class="col-md-6"><strong>Province:</strong> ${esc(commander.province || inst?.province)}</div>
        <div class="col-md-6"><strong>Date Appointed:</strong> ${fmtDate(commander.dateAppointed)}</div>
        <div class="col-md-6"><strong>Last Login:</strong> ${commander.lastLogin ? new Date(commander.lastLogin).toLocaleString('en-PG') : '—'}</div>
        <div class="col-md-6"><strong>Employment:</strong> <span class="status-badge status-badge--${commander.employmentStatus === 'Active' ? 'active' : 'inactive'}">${esc(commander.employmentStatus)}</span></div>
        <div class="col-md-6"><strong>Account:</strong> ${esc(commander.accountStatus)}</div>
      </div>`;
  }

  function canManageInstitution(instId) {
    if (isAdmin) return true;
    return isCommander && actor.institutionId === instId;
  }

  function getScopedInstitutions() {
    let list = PMSStorage.getInstitutions();
    if (isCommander && actor.institutionId) {
      list = list.filter((i) => i.id === actor.institutionId);
    }
    return list;
  }

  function enrichRow(inst) {
    const stats = PMSStorage.getInstitutionStats(inst.id);
    const commander = stats?.commander;
    return {
      ...inst,
      commander,
      commanderName: commander ? `${commander.firstName} ${commander.lastName}` : '— Unassigned —',
      commanderPhone: commander?.phone || '—',
      commanderEmail: commander?.email || '—',
      prisonerCount: stats?.prisonerCount ?? 0,
      officerCount: stats?.officerCount ?? 0,
    };
  }

  function getFilteredRows() {
    const q = document.getElementById('search-input').value.trim().toLowerCase();
    const provinceF = document.getElementById('filter-province').value;
    const statusF = document.getElementById('filter-status').value;

    return getScopedInstitutions()
      .map(enrichRow)
      .filter((row) => {
        if (provinceF && row.province !== provinceF) return false;
        if (statusF && row.status !== statusF) return false;
        if (!q) return true;
        const hay = `${row.code} ${row.name} ${row.province} ${row.address} ${row.commanderName} ${row.commanderEmail} ${row.commanderPhone}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        let av = a[sortKey];
        let bv = b[sortKey];
        if (sortKey === 'commander') { av = a.commanderName; bv = b.commanderName; }
        if (sortKey === 'phone') { av = a.commanderPhone; bv = b.commanderPhone; }
        if (sortKey === 'email') { av = a.commanderEmail; bv = b.commanderEmail; }
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sortDir;
        return String(av || '').localeCompare(String(bv || '')) * sortDir;
      });
  }

  function updateStats() {
    const scoped = getScopedInstitutions();
    const allPrisoners = PMSStorage.getPrisoners();
    const allUsers = PMSStorage.getUsers().filter((u) => u.status === 'Active' && u.role !== 'System Administrator');
    const instIds = new Set(scoped.map((i) => i.id));
    document.getElementById('stat-total').textContent = scoped.length;
    document.getElementById('stat-active').textContent = scoped.filter((i) => i.status === 'Active').length;
    document.getElementById('stat-prisoners').textContent = allPrisoners.filter((p) => instIds.has(p.institutionId)).length;
    document.getElementById('stat-officers').textContent = allUsers.filter((u) => instIds.has(u.institutionId)).length;
  }

  function populateProvinceFilter() {
    const sel = document.getElementById('filter-province');
    const current = sel.value;
    const provinces = [...new Set(getScopedInstitutions().map((i) => i.province).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">All Provinces</option>' +
      provinces.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    sel.value = current;
  }

  function populateCommanderSelect(selectedId = '') {
    const sel = document.getElementById('edit-commander');
    const commanders = PMSStorage.getJailCommanders();
    sel.innerHTML = '<option value="">— Unassigned —</option>' +
      commanders.map((u) => `<option value="${u.id}">${esc(u.firstName)} ${esc(u.lastName)} (${esc(u.officerId || u.id)})</option>`).join('');
    sel.value = selectedId || '';
  }

  function renderTable() {
    const rows = getFilteredRows();
    const tbody = document.getElementById('institutions-tbody');
    const empty = document.getElementById('empty-msg');

    document.getElementById('result-count').textContent =
      `${rows.length} institution${rows.length !== 1 ? 's' : ''}`;

    if (!rows.length) {
      tbody.innerHTML = '';
      empty.classList.remove('d-none');
      updateStats();
      return;
    }
    empty.classList.add('d-none');

    tbody.innerHTML = rows.map((row) => {
      const statusCls = row.status === 'Active' ? 'status-badge--active' : 'status-badge--inactive';
      const actions = [
        `<button type="button" class="btn btn-sm btn-pms-outline" data-view="${row.id}">View</button>`,
      ];
      if (row.commander) {
        actions.push(`<a href="commander-details.html?id=${row.commander.id}" class="btn btn-sm btn-outline-secondary">Commander</a>`);
      }
      if (isAdmin) {
        actions.push(`<button type="button" class="btn btn-sm btn-pms-gold" data-edit="${row.id}">Edit</button>`);
        actions.push(`<button type="button" class="btn btn-sm btn-outline-secondary" data-toggle="${row.id}">${row.status === 'Active' ? 'Deactivate' : 'Activate'}</button>`);
        if (!row.prisonerCount && !row.officerCount) {
          actions.push(`<button type="button" class="btn btn-sm btn-pms-danger" data-delete="${row.id}">Delete</button>`);
        }
      }

      return `<tr>
        <td><strong>${esc(row.name)}</strong><div class="text-muted small">${esc(row.code)}</div></td>
        <td>${esc(row.province)}</td>
        <td>${esc(row.address)}</td>
        <td>${commanderCell(row.commander)}</td>
        <td>${esc(row.commanderPhone)}</td>
        <td>${esc(row.commanderEmail)}</td>
        <td class="text-center">${row.officerCount}</td>
        <td class="text-center">${row.prisonerCount}</td>
        <td><span class="status-badge ${statusCls}">${esc(row.status)}</span></td>
        <td><div class="action-btn-group d-flex flex-wrap gap-1">${actions.join('')}</div></td>
      </tr>`;
    }).join('');

    document.querySelectorAll('#institutions-table thead th[data-sort]').forEach((th) => {
      th.classList.toggle('sorted', th.dataset.sort === sortKey);
    });

    updateStats();
  }

  function openViewModal(instId) {
    if (!PMSAuth.canAccessInstitution(actor, instId)) {
      alert('You do not have access to this institution.');
      return;
    }
    const stats = PMSStorage.getInstitutionStats(instId);
    if (!stats) return;
    const inst = stats.institution;
    const commander = stats.commander;

    document.getElementById('viewModalTitle').textContent = inst.name;
    document.getElementById('viewModalBody').innerHTML = `
      <div class="commander-banner mb-3">
        <div class="row g-2">
          <div class="col-md-6"><strong>Institution ID:</strong> ${esc(inst.code || inst.id)}</div>
          <div class="col-md-6"><strong>Status:</strong> ${esc(inst.status)}</div>
          <div class="col-md-6"><strong>Province:</strong> ${esc(inst.province)}</div>
          <div class="col-md-6"><strong>Location:</strong> ${esc(inst.address)}</div>
        </div>
      </div>

      <div class="view-section-title">Jail Commander</div>
      ${commanderProfileHtml(commander, inst)}

      <div class="view-section-title">Assigned Officers (${stats.officerCount})</div>
      ${stats.officers.length ? `<div class="table-responsive mb-4"><table class="table table-sm table-bordered">
        <thead class="table-light"><tr><th>Name</th><th>Role</th><th>Employee No.</th><th>Contact</th></tr></thead>
        <tbody>${stats.officers.map((o) => `<tr><td>${esc(o.firstName)} ${esc(o.lastName)}</td><td>${esc(o.role)}</td><td>${esc(o.employeeNumber || '—')}</td><td>${esc(o.email)}${o.phone ? `<br><small>${esc(o.phone)}</small>` : ''}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="text-muted mb-4">No officers assigned to this institution.</p>'}

      <div class="view-section-title">Prisoners (${stats.prisonerCount})</div>
      ${stats.prisoners.length ? `<div class="table-responsive"><table class="table table-sm table-bordered">
        <thead class="table-light"><tr><th>No.</th><th>Name</th><th>Offense</th><th>Status</th><th>SSD</th><th>SED</th></tr></thead>
        <tbody>${stats.prisoners.map((p) => `<tr><td>${esc(p.prisonerNumber)}</td><td>${esc(p.firstName)} ${esc(p.lastName)}</td><td>${esc(p.offense)}</td><td>${esc(p.status)}</td><td>${esc(p.sentenceStartDate)}</td><td>${esc(p.sentenceEndDate)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="text-muted">No prisoner records at this institution.</p>'}`;

    viewModal.show();
  }

  function openEditModal(inst = null) {
    if (inst && !canManageInstitution(inst.id) && !isAdmin) {
      alert('You can only edit your assigned institution.');
      return;
    }
    document.getElementById('editModalTitle').textContent = inst ? 'Edit Institution' : 'Add Institution';
    document.getElementById('edit-id').value = inst?.id || '';
    const codeField = document.getElementById('edit-code');
    codeField.value = inst?.code || inst?.id || '';
    codeField.placeholder = inst ? '' : 'Automatically Generated';
    codeField.readOnly = true;
    document.getElementById('edit-name').value = inst?.name || '';
    document.getElementById('edit-province').value = inst?.province || '';
    document.getElementById('edit-address').value = inst?.address || inst?.location || '';
    document.getElementById('edit-status').value = inst?.status || 'Active';
    document.getElementById('edit-phone').value = inst?.phone || '';
    document.getElementById('edit-email').value = inst?.email || '';
    document.getElementById('edit-capacity').value = inst?.capacity || '';
    populateCommanderSelect(inst?.commanderId || PMSStorage.getJailCommanderForInstitution(inst?.id)?.id || '');
    document.getElementById('commander-field-wrap').classList.toggle('d-none', !isAdmin);
    editModal.show();
  }

  document.getElementById('btn-add-institution').addEventListener('click', () => openEditModal(null));

  document.getElementById('edit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const id = document.getElementById('edit-id').value;
      if (id && !canManageInstitution(id) && !isAdmin) throw new Error('Access denied');
      PMSStorage.saveInstitution({
        id: id || undefined,
        name: document.getElementById('edit-name').value.trim(),
        province: document.getElementById('edit-province').value.trim(),
        address: document.getElementById('edit-address').value.trim(),
        status: document.getElementById('edit-status').value,
        phone: document.getElementById('edit-phone').value.trim(),
        email: document.getElementById('edit-email').value.trim(),
        capacity: parseInt(document.getElementById('edit-capacity').value, 10) || null,
        commanderId: isAdmin ? (document.getElementById('edit-commander').value || null) : undefined,
      }, actor);
      editModal.hide();
      populateProvinceFilter();
      renderTable();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('institutions-tbody').addEventListener('click', (e) => {
    const viewBtn = e.target.closest('[data-view]');
    if (viewBtn) { openViewModal(viewBtn.dataset.view); return; }

    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      openEditModal(PMSStorage.getInstitutionById(editBtn.dataset.edit));
      return;
    }

    const toggleBtn = e.target.closest('[data-toggle]');
    if (toggleBtn && isAdmin) {
      const inst = PMSStorage.getInstitutionById(toggleBtn.dataset.toggle);
      if (!inst) return;
      const newStatus = inst.status === 'Active' ? 'Inactive' : 'Active';
      if (newStatus === 'Inactive' && !confirm(`Deactivate ${inst.name}? It will be removed from registration dropdowns.`)) return;
      PMSStorage.saveInstitution({ ...inst, status: newStatus }, actor);
      renderTable();
      return;
    }

    const deleteBtn = e.target.closest('[data-delete]');
    if (deleteBtn && isAdmin) {
      const inst = PMSStorage.getInstitutionById(deleteBtn.dataset.delete);
      if (!inst) return;
      if (!confirm(`Delete ${inst.name}? This cannot be undone.`)) return;
      try {
        PMSStorage.deleteInstitution(inst.id, actor);
        populateProvinceFilter();
        renderTable();
      } catch (err) {
        alert(err.message);
      }
    }
  });

  document.querySelectorAll('#institutions-table thead th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1;
      else { sortKey = key; sortDir = 1; }
      renderTable();
    });
  });

  ['search-input', 'filter-province', 'filter-status'].forEach((id) => {
    document.getElementById(id).addEventListener('input', renderTable);
    document.getElementById(id).addEventListener('change', renderTable);
  });

  populateProvinceFilter();
  renderTable();

  const params = new URLSearchParams(window.location.search);
  const viewId = params.get('view');
  if (viewId && PMSAuth.canAccessInstitution(actor, viewId)) {
    openViewModal(viewId);
  } else if (isCommander && actor.institutionId) {
    openViewModal(actor.institutionId);
  }
})();
