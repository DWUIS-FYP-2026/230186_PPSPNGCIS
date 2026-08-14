/**
 * PMS Command Bar — live date/time ticker for dashboard headers.
 */
(() => {
  function updateDateTime() {
    const el = document.getElementById('command-datetime');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleString('en-PG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    el.setAttribute('datetime', now.toISOString());
  }

  function init() {
    updateDateTime();
    window.setInterval(updateDateTime, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
