/**
 * PMS Form Autosave — debounced persistence while users type (real-time case tracking).
 */
const PMSFormAutosave = (() => {
  const DEFAULT_DEBOUNCE_MS = 1200;

  function ensureIndicator() {
    let el = document.getElementById('pms-autosave-indicator');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pms-autosave-indicator';
    el.className = 'pms-autosave-indicator';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  }

  function setIndicator(state, message) {
    const el = ensureIndicator();
    el.hidden = false;
    el.dataset.state = state;
    el.textContent = message;
    if (state === 'saved') {
      clearTimeout(el._hideTimer);
      el._hideTimer = setTimeout(() => { el.hidden = true; }, 2500);
    }
  }

  function isField(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'SELECT') return true;
    if (tag === 'INPUT') {
      const type = (el.type || 'text').toLowerCase();
      return !['button', 'submit', 'reset', 'image', 'hidden'].includes(type);
    }
    return false;
  }

  function create(options = {}) {
    const {
      root,
      debounceMs = DEFAULT_DEBOUNCE_MS,
      onSave,
      enabled = () => true,
      shouldHandleEvent = null,
      showIndicator = true,
    } = options;

    const rootEl = typeof root === 'string' ? document.querySelector(root) : root;
    if (!rootEl || typeof onSave !== 'function') return { destroy() {} };

    let timer = null;
    let saving = false;
    let pending = false;
    let destroyed = false;

    async function runSave({ silent = true, force = false } = {}) {
      if (destroyed) return;
      if (!force && !enabled()) return;
      if (saving) {
        pending = true;
        return;
      }
      saving = true;
      if (showIndicator) setIndicator('saving', 'Saving…');
      try {
        await onSave({ silent, force });
        if (showIndicator) setIndicator('saved', 'Saved');
      } catch (err) {
        if (showIndicator) setIndicator('error', 'Save failed');
        console.warn('Autosave failed:', err);
      } finally {
        saving = false;
        if (pending) {
          pending = false;
          schedule();
        }
      }
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => runSave({ silent: true }), debounceMs);
    }

    function onInputEvent(e) {
      if (destroyed || !enabled()) return;
      if (shouldHandleEvent && !shouldHandleEvent(e)) return;
      if (!shouldHandleEvent && !isField(e.target)) return;
      schedule();
    }

    function flush() {
      clearTimeout(timer);
      return runSave({ silent: true, force: true });
    }

    rootEl.addEventListener('input', onInputEvent, true);
    rootEl.addEventListener('change', onInputEvent, true);

    const beforeUnload = () => {
      if (!enabled()) return;
      clearTimeout(timer);
      try {
        onSave({ silent: true, force: true, sync: true });
      } catch (_) { /* best effort */ }
    };
    window.addEventListener('pagehide', beforeUnload);
    window.addEventListener('beforeunload', beforeUnload);

    return {
      schedule,
      flush,
      destroy() {
        destroyed = true;
        clearTimeout(timer);
        rootEl.removeEventListener('input', onInputEvent, true);
        rootEl.removeEventListener('change', onInputEvent, true);
        window.removeEventListener('pagehide', beforeUnload);
        window.removeEventListener('beforeunload', beforeUnload);
      },
    };
  }

  return { create, DEFAULT_DEBOUNCE_MS };
})();
