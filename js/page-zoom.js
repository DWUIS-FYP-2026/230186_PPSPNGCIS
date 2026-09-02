/**
 * PMS — Page zoom (in / out / reset) for dashboards and forms.
 * Collapsed launcher by default; click to expand controls.
 * Persists in localStorage. Ctrl/Cmd + plus, minus, 0, and mouse wheel also work.
 */
(() => {
  const STORAGE_KEY = 'pms_page_zoom';
  const MIN = 0.7;
  const MAX = 2;
  const STEP = 0.1;
  const DEFAULT = 1;

  let level = DEFAULT;
  let open = false;

  function round(value) {
    return Math.round(value * 10) / 10;
  }

  function readStored() {
    const raw = Number(localStorage.getItem(STORAGE_KEY));
    if (!Number.isFinite(raw)) return DEFAULT;
    return Math.min(MAX, Math.max(MIN, round(raw)));
  }

  function apply(next) {
    level = Math.min(MAX, Math.max(MIN, round(next)));
    document.documentElement.style.zoom = String(level);
    document.documentElement.style.setProperty('--page-zoom', String(level));
    try {
      localStorage.setItem(STORAGE_KEY, String(level));
    } catch (_) { /* ignore quota / private mode */ }

    const label = document.getElementById('page-zoom-label');
    if (label) label.textContent = `${Math.round(level * 100)}%`;

    const outBtn = document.getElementById('page-zoom-out');
    const inBtn = document.getElementById('page-zoom-in');
    if (outBtn) outBtn.disabled = level <= MIN;
    if (inBtn) inBtn.disabled = level >= MAX;

    const controls = document.getElementById('page-zoom-controls');
    if (controls) controls.style.zoom = String(1 / level);

    const toggle = document.getElementById('page-zoom-toggle');
    if (toggle && level !== DEFAULT) {
      toggle.setAttribute('data-zoom-active', 'true');
    } else if (toggle) {
      toggle.removeAttribute('data-zoom-active');
    }
  }

  function zoomIn() {
    apply(level + STEP);
  }

  function zoomOut() {
    apply(level - STEP);
  }

  function reset() {
    apply(DEFAULT);
  }

  function setOpen(next) {
    open = next;
    const root = document.getElementById('page-zoom-controls');
    const toggle = document.getElementById('page-zoom-toggle');
    const panel = document.getElementById('page-zoom-panel');
    if (!root || !toggle || !panel) return;

    root.classList.toggle('page-zoom--open', open);
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  }

  function toggleOpen() {
    setOpen(!open);
  }

  function closeIfOutside(e) {
    const root = document.getElementById('page-zoom-controls');
    if (!open || !root || root.contains(e.target)) return;
    setOpen(false);
  }

  function injectStyles() {
    if (document.getElementById('page-zoom-styles')) return;
    const style = document.createElement('style');
    style.id = 'page-zoom-styles';
    style.textContent = `
      #page-zoom-controls {
        position: fixed;
        right: 1rem;
        bottom: 1rem;
        z-index: 4000;
        display: flex;
        align-items: center;
        flex-direction: row-reverse;
        gap: 0.375rem;
        font-family: Inter, "Segoe UI", sans-serif;
      }

      /* Home page — keep away from top/bottom-right login button */
      body.pms-home #page-zoom-controls {
        left: 1rem;
        right: auto;
        flex-direction: row;
      }

      body.pms-home #page-zoom-panel {
        transform: translateX(-0.35rem) scale(0.96);
      }

      body.pms-home #page-zoom-controls.page-zoom--open #page-zoom-panel {
        transform: translateX(0) scale(1);
      }

      @media (max-width: 768px) {
        body.pms-home #page-zoom-controls {
          left: 1rem;
          bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));
        }
      }

      #page-zoom-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        padding: 0;
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        background: #ffffff;
        color: #334155;
        box-shadow: 0 4px 12px rgb(15 23 42 / 0.12);
        cursor: pointer;
        transition: background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
      }

      #page-zoom-toggle:hover {
        background: #f8fafc;
        color: #0f172a;
        border-color: #94a3b8;
      }

      #page-zoom-toggle:focus-visible {
        outline: 2px solid #3b82f6;
        outline-offset: 2px;
      }

      #page-zoom-toggle svg {
        width: 0.9375rem;
        height: 0.9375rem;
        display: block;
      }

      #page-zoom-toggle[data-zoom-active="true"] {
        border-color: #0e2a47;
        color: #0e2a47;
        background: #f0f4f8;
      }

      #page-zoom-panel {
        display: flex;
        align-items: center;
        gap: 0.0625rem;
        padding: 0.125rem;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 5px;
        box-shadow: 0 4px 12px rgb(15 23 42 / 0.12);
        opacity: 0;
        transform: translateX(0.35rem) scale(0.96);
        pointer-events: none;
        transition: opacity 0.18s ease, transform 0.18s ease;
      }

      #page-zoom-controls.page-zoom--open #page-zoom-panel {
        opacity: 1;
        transform: translateX(0) scale(1);
        pointer-events: auto;
      }

      #page-zoom-panel button {
        min-width: 1.5rem;
        height: 1.5rem;
        padding: 0 0.25rem;
        border: none;
        border-radius: 3px;
        background: transparent;
        color: #0f172a;
        font-size: 0.8125rem;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
      }

      #page-zoom-panel button:hover:not(:disabled) {
        background: #f1f5f9;
      }

      #page-zoom-panel button:disabled {
        opacity: 0.35;
        cursor: default;
      }

      #page-zoom-label {
        min-width: 2.5rem;
        height: 1.5rem;
        padding: 0 0.2rem;
        border: none;
        border-radius: 3px;
        background: transparent;
        color: #334155;
        font-size: 0.6875rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        cursor: pointer;
      }

      #page-zoom-label:hover {
        background: #f1f5f9;
        color: #0f172a;
      }

      @media print {
        #page-zoom-controls { display: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  const ZOOM_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>`;

  function renderControls() {
    if (document.getElementById('page-zoom-controls')) return;
    const wrap = document.createElement('div');
    wrap.id = 'page-zoom-controls';
    wrap.className = 'no-print';
    wrap.innerHTML = `
      <button type="button" id="page-zoom-toggle" title="Zoom options" aria-label="Zoom options" aria-expanded="false" aria-controls="page-zoom-panel">${ZOOM_ICON}</button>
      <div id="page-zoom-panel" role="group" aria-label="Page zoom" hidden>
        <button type="button" id="page-zoom-out" title="Zoom out" aria-label="Zoom out">−</button>
        <button type="button" id="page-zoom-label" title="Reset zoom">100%</button>
        <button type="button" id="page-zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
      </div>
    `;
    document.body.appendChild(wrap);

    document.getElementById('page-zoom-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleOpen();
    });
    document.getElementById('page-zoom-out').addEventListener('click', zoomOut);
    document.getElementById('page-zoom-in').addEventListener('click', zoomIn);
    document.getElementById('page-zoom-label').addEventListener('click', reset);

    document.addEventListener('click', closeIfOutside);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) setOpen(false);
    });
  }

  function isTypingTarget(el) {
    if (!el || el === document.body) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function bindShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (isTypingTarget(e.target) && (e.key === '0' || e.code === 'Digit0')) return;
      if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
        e.preventDefault();
        reset();
      }
    }, { capture: true });

    document.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else if (e.deltaY > 0) zoomOut();
    }, { passive: false });
  }

  function init() {
    injectStyles();
    if (document.body) renderControls();
    apply(level);
  }

  level = readStored();
  apply(level);
  bindShortcuts();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
