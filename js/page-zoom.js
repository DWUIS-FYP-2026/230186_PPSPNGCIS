/**
 * PMS — Page zoom (in / out / reset) for dashboards and forms.
 * Persists in localStorage. Ctrl/Cmd + plus, minus, 0, and mouse wheel also work.
 */
(() => {
  const STORAGE_KEY = 'pms_page_zoom';
  const MIN = 0.7;
  const MAX = 2;
  const STEP = 0.1;
  const DEFAULT = 1;

  let level = DEFAULT;

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
        gap: 0.125rem;
        padding: 0.25rem;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        box-shadow: 0 8px 24px rgb(15 23 42 / 0.14);
        font-family: Inter, "Segoe UI", sans-serif;
      }
      #page-zoom-controls button {
        min-width: 2rem;
        height: 2rem;
        padding: 0 0.4rem;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: #0f172a;
        font-size: 1rem;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
      }
      #page-zoom-controls button:hover:not(:disabled) {
        background: #f1f5f9;
      }
      #page-zoom-controls button:disabled {
        opacity: 0.35;
        cursor: default;
      }
      #page-zoom-label {
        min-width: 3.25rem;
        height: 2rem;
        padding: 0 0.35rem;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: #334155;
        font-size: 0.75rem;
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

  function renderControls() {
    if (document.getElementById('page-zoom-controls')) return;
    const wrap = document.createElement('div');
    wrap.id = 'page-zoom-controls';
    wrap.className = 'no-print';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Page zoom');
    wrap.innerHTML = `
      <button type="button" id="page-zoom-out" title="Zoom out" aria-label="Zoom out">−</button>
      <button type="button" id="page-zoom-label" title="Reset zoom">100%</button>
      <button type="button" id="page-zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
    `;
    document.body.appendChild(wrap);
    document.getElementById('page-zoom-out').addEventListener('click', zoomOut);
    document.getElementById('page-zoom-in').addEventListener('click', zoomIn);
    document.getElementById('page-zoom-label').addEventListener('click', reset);
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
