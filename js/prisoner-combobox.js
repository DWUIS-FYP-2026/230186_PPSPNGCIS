/**
 * PMS reusable prisoner search & selection combobox.
 */
const PMSPrisonerCombobox = (() => {
  let prisoners = [];
  let locked = false;
  let onSelect = null;

  function formatOption(p) {
    return {
      title: `${p.firstName} ${p.lastName}`,
      meta: `ID: ${p.prisonerNumber || p.id} · Status: ${p.status || '—'}`,
    };
  }

  function formatSelection(p) {
    return `${p.firstName} ${p.lastName} — ${p.prisonerNumber || p.id}`;
  }

  function filter(query) {
    const term = query.trim().toLowerCase();
    if (!term) return prisoners;
    return prisoners.filter((p) =>
      `${p.firstName} ${p.lastName} ${p.prisonerNumber} ${p.id}`.toLowerCase().includes(term));
  }

  function showList(open) {
    const list = document.getElementById('prisoner-combobox-listbox');
    const input = document.getElementById('prisoner-combobox-input');
    if (!list || !input) return;
    list.classList.toggle('hidden', !open);
    input.setAttribute('aria-expanded', String(open));
  }

  function renderResults(query = '') {
    const list = document.getElementById('prisoner-combobox-listbox');
    if (!list) return;
    const matches = filter(query);
    if (!matches.length) {
      list.innerHTML = '<li class="prisoner-combobox__empty">No matching prisoners found.</li>';
      return;
    }
    list.innerHTML = matches.map((p) => {
      const opt = formatOption(p);
      const esc = (s) => PMSUI?.esc?.(s) ?? String(s ?? '');
      return `<li class="prisoner-combobox__option" role="option" data-prisoner-id="${esc(p.id)}" tabindex="-1">
        <strong>${esc(opt.title)}</strong>
        <span class="prisoner-combobox__option-meta">${esc(opt.meta)}</span>
      </li>`;
    }).join('');
  }

  function select(prisonerId) {
    if (locked) return;
    const hidden = document.getElementById('prisoner-combobox-value');
    const input = document.getElementById('prisoner-combobox-input');
    const clearBtn = document.getElementById('prisoner-combobox-clear');
    const p = prisoners.find((x) => x.id === prisonerId);
    if (hidden) hidden.value = prisonerId || '';
    if (input) input.value = p ? formatSelection(p) : '';
    clearBtn?.classList.toggle('hidden', !prisonerId);
    showList(false);
    onSelect?.(prisonerId || null, p || null);
  }

  function mount({
    wrapId = 'prisoner-combobox',
    prisonerList = [],
    selectedId = '',
    locked: isLocked = false,
    onSelect: handler,
  }) {
    prisoners = prisonerList;
    locked = isLocked;
    onSelect = handler;

    const wrap = document.getElementById(wrapId);
    const hidden = document.getElementById('prisoner-combobox-value');
    const input = document.getElementById('prisoner-combobox-input');
    const clearBtn = document.getElementById('prisoner-combobox-clear');

    wrap?.classList.toggle('prisoner-combobox--locked', locked);
    if (hidden) hidden.value = selectedId || '';
    const selected = prisoners.find((p) => p.id === selectedId);
    if (input) {
      input.value = selected ? formatSelection(selected) : '';
      input.disabled = locked;
    }
    clearBtn?.classList.toggle('hidden', !selectedId || locked);
    renderResults('');

    if (!wrap?.dataset.bound) {
      wrap.dataset.bound = 'true';
      input?.addEventListener('input', () => {
        if (locked) return;
        renderResults(input.value);
        showList(true);
      });
      input?.addEventListener('focus', () => {
        if (locked) return;
        renderResults(input.value);
        showList(true);
      });
      clearBtn?.addEventListener('click', () => select(''));
      document.getElementById('prisoner-combobox-listbox')?.addEventListener('click', (e) => {
        const opt = e.target.closest('[data-prisoner-id]');
        if (opt) select(opt.dataset.prisonerId);
      });
      document.addEventListener('click', (e) => {
        if (!wrap?.contains(e.target)) showList(false);
      });
    }
  }

  return { mount, select, formatSelection, formatOption };
})();
