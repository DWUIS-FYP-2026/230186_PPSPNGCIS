/**
 * PMS Global Search — RBAC-scoped cross-entity search.
 */
const PMSGlobalSearch = (() => {
  let modalEl = null;
  let currentUser = null;

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-PG', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function normalize(q) {
    return (q || '').trim().toLowerCase();
  }

  function matchText(q, ...parts) {
    const hay = parts.filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }

  function canAccessApplication(user, app) {
    if (!app) return false;
    const prisoner = PMSStorage.getPrisonerById(app.prisonerId);
    if (!prisoner) return false;
    return PMSRBAC.canAccessPrisonerRecord(user, prisoner);
  }

  function searchPrisoners(user, q) {
    return PMSRBAC.filterPrisonersForUser(user, PMSStorage.getPrisoners()).filter((p) => {
      const inst = PMSStorage.getInstitutionById(p.institutionId);
      return matchText(q, p.prisonerNumber, p.id, p.firstName, p.lastName, p.status, inst?.name, inst?.code);
    }).slice(0, 25);
  }

  function searchApplications(user, q) {
    return PMSStorage.getParoleApplications().filter((a) => {
      if (!canAccessApplication(user, a)) return false;
      const p = PMSStorage.getPrisonerById(a.prisonerId);
      const inst = PMSStorage.getInstitutionById(a.institutionId);
      return matchText(q, a.caseNumber, a.id, a.status, p?.firstName, p?.lastName, p?.prisonerNumber, inst?.name);
    }).slice(0, 25);
  }

  function searchHearings(user, q) {
    return PMSStorage.getHearings().filter((h) => {
      const p = PMSStorage.getPrisonerById(h.prisonerId);
      if (!p || !PMSRBAC.canAccessPrisonerRecord(user, p)) return false;
      return matchText(q, h.scheduledDate, h.status, h.location, h.caseNumber, p.firstName, p.lastName, p.prisonerNumber);
    }).slice(0, 25);
  }

  function search(user, query, filters = {}) {
    const q = normalize(query);
    if (!q || q.length < 2) return { prisoners: [], applications: [], hearings: [], total: 0 };
    let prisoners = searchPrisoners(user, q);
    let applications = searchApplications(user, q);
    let hearings = searchHearings(user, q);

    if (filters.status) {
      prisoners = prisoners.filter((p) => p.status === filters.status);
      applications = applications.filter((a) => a.status === filters.status);
      hearings = hearings.filter((h) => h.status === filters.status);
    }
    if (filters.institutionId) {
      prisoners = prisoners.filter((p) => p.institutionId === filters.institutionId);
      applications = applications.filter((a) => a.institutionId === filters.institutionId);
      hearings = hearings.filter((h) => h.institutionId === filters.institutionId);
    }
    if (filters.hearingDate) {
      hearings = hearings.filter((h) => (h.scheduledDate || '').startsWith(filters.hearingDate));
    }

    return {
      prisoners,
      applications,
      hearings,
      total: prisoners.length + applications.length + hearings.length,
      query: q,
    };
  }

  function resultLink(type, item, user) {
    const dash = typeof PMSAuth !== 'undefined' ? PMSAuth.getDashboardForRole(user.role) : 'admin-dashboard.html';
    if (type === 'prisoner') return PMSRBAC.prisonerProfileUrl(item.id);
    if (type === 'application') return `${dash}?panel=applications&app=${encodeURIComponent(item.id)}`;
    if (type === 'hearing') return `${dash}?panel=hearings&hearing=${encodeURIComponent(item.id)}`;
    return '#';
  }

  function renderResults(user, results) {
    if (!results.query) {
      return '<p class="empty-state">Enter at least 2 characters to search prisoners, cases, and hearings.</p>';
    }
    if (!results.total) {
      return `<p class="empty-state">No authorized records found for "<strong>${esc(results.query)}</strong>".</p>`;
    }

    const sections = [];
    if (results.prisoners.length) {
      sections.push(`<section class="search-section"><h3>Prisoners (${results.prisoners.length})</h3><ul class="search-results">${results.prisoners.map((p) => {
        const inst = PMSStorage.getInstitutionById(p.institutionId);
        return `<li><a href="${esc(resultLink('prisoner', p, user))}" class="search-result"><strong>${esc(p.firstName)} ${esc(p.lastName)}</strong><span class="meta">${esc(p.prisonerNumber)} · ${esc(inst?.name || '—')} · <span class="status-pill status-pill--${PMSUI.statusClass(p.status)}">${esc(p.status)}</span></span></a></li>`;
      }).join('')}</ul></section>`);
    }
    if (results.applications.length) {
      sections.push(`<section class="search-section"><h3>Cases (${results.applications.length})</h3><ul class="search-results">${results.applications.map((a) => {
        const p = PMSStorage.getPrisonerById(a.prisonerId);
        return `<li><a href="${esc(resultLink('application', a, user))}" class="search-result"><strong>${esc(a.caseNumber || a.id)}</strong><span class="meta">${p ? esc(`${p.firstName} ${p.lastName}`) : '—'} · <span class="status-pill status-pill--${PMSUI.statusClass(a.status)}">${esc(a.status)}</span></span></a></li>`;
      }).join('')}</ul></section>`);
    }
    if (results.hearings.length) {
      sections.push(`<section class="search-section"><h3>Hearings (${results.hearings.length})</h3><ul class="search-results">${results.hearings.map((h) => {
        const p = PMSStorage.getPrisonerById(h.prisonerId);
        return `<li><a href="${esc(resultLink('hearing', h, user))}" class="search-result"><strong>${fmtDate(h.scheduledDate)}</strong><span class="meta">${p ? esc(`${p.firstName} ${p.lastName}`) : '—'} · ${esc(h.location || '—')} · ${esc(h.status)}</span></a></li>`;
      }).join('')}</ul></section>`);
    }
    return sections.join('');
  }

  function ensureModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement('div');
    modalEl.id = 'global-search-modal';
    modalEl.className = 'modal-overlay hidden';
    modalEl.innerHTML = `
      <div class="modal-card modal-card--wide global-search-modal" role="dialog" aria-labelledby="global-search-title">
        <div class="modal-header">
          <h2 id="global-search-title"><i class="fi fi-rr-search" aria-hidden="true"></i> Global Search</h2>
          <button type="button" class="modal-close" data-close-search aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="search-advanced-bar">
            <input type="search" id="global-search-input" class="form-control" placeholder="Prisoner ID, name, case number, institution, status…" autocomplete="off">
            <select id="global-search-status" class="form-control"><option value="">All statuses</option></select>
            <select id="global-search-institution" class="form-control"><option value="">All institutions</option></select>
            <input type="date" id="global-search-hearing-date" class="form-control" title="Filter by hearing date">
          </div>
          <div id="global-search-results" class="global-search-results"></div>
        </div>
      </div>`;
    document.body.appendChild(modalEl);

    const statusSel = modalEl.querySelector('#global-search-status');
    [...PMSStorage.PRISONER_STATUSES, ...PMSStorage.APPLICATION_STATUSES].filter((v, i, a) => a.indexOf(v) === i).sort().forEach((s) => {
      statusSel.innerHTML += `<option value="${esc(s)}">${esc(s)}</option>`;
    });
    const instSel = modalEl.querySelector('#global-search-institution');
    PMSStorage.getInstitutions().forEach((i) => {
      instSel.innerHTML += `<option value="${esc(i.id)}">${esc(i.name)}</option>`;
    });

    modalEl.querySelector('[data-close-search]').addEventListener('click', close);
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });
    return modalEl;
  }

  function runSearch() {
    if (!currentUser) return;
    const input = document.getElementById('global-search-input');
    const resultsEl = document.getElementById('global-search-results');
    if (!input || !resultsEl) return;
    resultsEl.innerHTML = '<p class="loading-state">Searching…</p>';
    window.requestAnimationFrame(() => {
      const filters = {
        status: document.getElementById('global-search-status')?.value || '',
        institutionId: document.getElementById('global-search-institution')?.value || '',
        hearingDate: document.getElementById('global-search-hearing-date')?.value || '',
      };
      const results = search(currentUser, input.value, filters);
      resultsEl.innerHTML = renderResults(currentUser, results);
    });
  }

  function open(initialQuery = '') {
    if (!currentUser) return;
    ensureModal();
    modalEl.classList.remove('hidden');
    const input = document.getElementById('global-search-input');
    if (input) {
      input.value = initialQuery;
      input.focus();
      if (initialQuery.trim().length >= 2) runSearch();
      else document.getElementById('global-search-results').innerHTML = '<p class="empty-state">Search by prisoner ID, name, case number, institution, status, or hearing date. Results are limited to records you are authorized to view.</p>';
    }
  }

  function close() {
    modalEl?.classList.add('hidden');
  }

  function bind(user) {
    currentUser = user;
    ensureModal();
    const input = document.getElementById('global-search-input');
    const statusSel = document.getElementById('global-search-status');
    const instSel = document.getElementById('global-search-institution');
    const dateInput = document.getElementById('global-search-hearing-date');
    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(runSearch, 250);
    };
    input?.addEventListener('input', schedule);
    statusSel?.addEventListener('change', runSearch);
    instSel?.addEventListener('change', runSearch);
    dateInput?.addEventListener('change', runSearch);

    const workspaceInput = document.getElementById('workspace-search');
    if (workspaceInput && !workspaceInput.dataset.globalBound) {
      workspaceInput.dataset.globalBound = '1';
      workspaceInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          open(workspaceInput.value);
        }
      });
      workspaceInput.addEventListener('focus', () => {
        workspaceInput.title = 'Press Enter to open global search';
      });
    }

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        open('');
      }
    });
  }

  return { search, bind, open, close };
})();
