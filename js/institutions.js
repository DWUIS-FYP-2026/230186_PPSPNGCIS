/**
 * Correctional Institution Management — nationwide registry (admin).
 */
(async () => {
  await PMSStorage.ensureLoaded();

  const actor = PMSAuth.requireRole(['System Administrator']);
  if (!actor) return;

  let sortKey = 'name';
  let sortDir = 1;

  const viewModal = new bootstrap.Modal(document.getElementById('viewModal'));
  const editModal = new bootstrap.Modal(document.getElementById('editModal'));

  PMSSidebar.init({
    user: actor,
    activeNavId: 'institutions',
    linkPanels: true,
    dashboardUrl: PMSAuth.getDashboardForRole(actor.role),
  });
  PMSUI.updateNotifBadge(actor);

  document.getElementById('btn-add-institution').classList.remove('d-none');
  document.getElementById('page-subtitle').textContent = 'PNG Correctional Service institutions across all provinces';

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }

  function enrichRow(inst) {
    const stats = PMSStorage.getInstitutionStats(inst.id);
    return {
      ...inst,
      prisonerCount: stats?.prisonerCount ?? 0,
      officerCount: stats?.officerCount ?? 0,
    };
  }

  function getFilteredRows() {
    const q = document.getElementById('search-input').value.trim().toLowerCase();
    const provinceF = document.getElementById('filter-province').value;
    const statusF = document.getElementById('filter-status').value;

    return PMSStorage.getInstitutions()
      .map(enrichRow)
      .filter((row) => {
        if (provinceF && row.province !== provinceF) return false;
        if (statusF && row.status !== statusF) return false;
        if (!q) return true;
        const hay = `${row.code} ${row.name} ${row.province} ${row.address}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        let av = a[sortKey];
        let bv = b[sortKey];
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sortDir;
        av = String(av ?? '').toLowerCase();
        bv = String(bv ?? '').toLowerCase();
        if (av < bv) return -1 * sortDir;
        if (av > bv) return 1 * sortDir;
        return 0;
      });
  }

  function populateFilters() {
    const provinces = [...new Set(PMSStorage.getInstitutions().map((i) => i.province).filter(Boolean))].sort();
    const sel = document.getElementById('filter-province');
    sel.innerHTML = '<option value="">All Provinces</option>' + provinces.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  }

  function renderTable() {
    const rows = getFilteredRows();
    const tbody = document.getElementById('institutions-tbody');
    const empty = document.getElementById('empty-msg');
    document.getElementById('result-count').textContent = `${rows.length} institution${rows.length === 1 ? '' : 's'}`;

    document.getElementById('stats-row').innerHTML = `
      <div class="inst-stat-card"><span class="label">Total Institutions</span><strong>${rows.length}</strong></div>
      <div class="inst-stat-card"><span class="label">Active</span><strong>${rows.filter((r) => r.status === 'Active').length}</strong></div>
      <div class="inst-stat-card"><span class="label">Prisoners</span><strong>${rows.reduce((n, r) => n + r.prisonerCount, 0)}</strong></div>
      <div class="inst-stat-card"><span class="label">Officers</span><strong>${rows.reduce((n, r) => n + r.officerCount, 0)}</strong></div>`;

    if (!rows.length) {
      tbody.innerHTML = '';
      empty.classList.remove('d-none');
      return;
    }
    empty.classList.add('d-none');
    tbody.innerHTML = rows.map((row) => {
      const actions = [
        `<button type="button" class="btn btn-sm btn-outline-secondary" data-view="${esc(row.id)}">View</button>`,
        `<button type="button" class="btn btn-sm btn-pms-outline" data-edit="${esc(row.id)}">Edit</button>`,
      ].join(' ');
      return `<tr>
        <td><strong>${esc(row.name)}</strong><div class="text-muted small">${esc(row.code)}</div></td>
        <td>${esc(row.province)}</td>
        <td>${esc(row.address)}</td>
        <td class="text-center">${row.officerCount}</td>
        <td class="text-center">${row.prisonerCount}</td>
        <td><span class="status-badge status-badge--${row.status === 'Active' ? 'active' : 'inactive'}">${esc(row.status)}</span></td>
        <td>${actions}</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => openView(btn.dataset.view)));
    tbody.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openEdit(btn.dataset.edit)));
  }

  function openView(id) {
    const inst = PMSStorage.getInstitutionById(id);
    if (!inst) return;
    const stats = PMSStorage.getInstitutionStats(id);
    document.getElementById('viewModalTitle').textContent = inst.name;
    document.getElementById('viewModalBody').innerHTML = `
      <dl class="row mb-0">
        <dt class="col-sm-4">Institution ID</dt><dd class="col-sm-8">${esc(inst.code)}</dd>
        <dt class="col-sm-4">Province</dt><dd class="col-sm-8">${esc(inst.province)}</dd>
        <dt class="col-sm-4">Address</dt><dd class="col-sm-8">${esc(inst.address)}</dd>
        <dt class="col-sm-4">Status</dt><dd class="col-sm-8">${esc(inst.status)}</dd>
        <dt class="col-sm-4">Contact</dt><dd class="col-sm-8">${esc(inst.phone || '—')} · ${esc(inst.email || '—')}</dd>
        <dt class="col-sm-4">Prisoners</dt><dd class="col-sm-8">${stats?.prisonerCount ?? 0}</dd>
        <dt class="col-sm-4">Officers</dt><dd class="col-sm-8">${stats?.officerCount ?? 0}</dd>
      </dl>`;
    viewModal.show();
  }

  function openEdit(id = null) {
    const inst = id ? PMSStorage.getInstitutionById(id) : null;
    document.getElementById('editModalTitle').textContent = inst ? 'Edit Institution' : 'Add Institution';
    document.getElementById('edit-id').value = inst?.id || '';
    document.getElementById('edit-code').value = inst?.code || '';
    document.getElementById('edit-name').value = inst?.name || '';
    document.getElementById('edit-province').value = inst?.province || 'National Capital District';
    document.getElementById('edit-address').value = inst?.address || '';
    document.getElementById('edit-status').value = inst?.status || 'Active';
    document.getElementById('edit-phone').value = inst?.phone || '';
    document.getElementById('edit-email').value = inst?.email || '';
    document.getElementById('edit-capacity').value = inst?.capacity ?? '';
    editModal.show();
  }

  document.getElementById('btn-add-institution').addEventListener('click', () => openEdit());
  document.getElementById('search-input').addEventListener('input', renderTable);
  document.getElementById('filter-province').addEventListener('change', renderTable);
  document.getElementById('filter-status').addEventListener('change', renderTable);

  document.querySelectorAll('#institutions-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1;
      else { sortKey = key; sortDir = 1; }
      renderTable();
    });
  });

  document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      PMSStorage.saveInstitution({
        id: document.getElementById('edit-id').value || undefined,
        name: document.getElementById('edit-name').value.trim(),
        province: document.getElementById('edit-province').value.trim(),
        address: document.getElementById('edit-address').value.trim(),
        status: document.getElementById('edit-status').value,
        phone: document.getElementById('edit-phone').value.trim(),
        email: document.getElementById('edit-email').value.trim(),
        capacity: document.getElementById('edit-capacity').value ? Number(document.getElementById('edit-capacity').value) : null,
      }, actor);
      editModal.hide();
      populateFilters();
      renderTable();
    } catch (err) {
      alert(err.message);
    }
  });

  populateFilters();
  renderTable();
})();
