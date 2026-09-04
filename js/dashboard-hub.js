/**
 * Routes authenticated users from dashboard.html to their role workspace.
 * Handles timeouts, redirect-loop detection, and friendly error UI.
 */
const PMSDashboardHub = (() => {
  const LOOP_KEY = 'pms_hub_redirect_count';
  const LOOP_WINDOW_MS = 15000;
  const MAX_REDIRECTS = 4;
  const LOAD_TIMEOUT_MS = 12000;

  function getEls() {
    return {
      status: document.getElementById('hub-status'),
      detail: document.getElementById('hub-detail'),
      actions: document.getElementById('hub-actions'),
      spinner: document.getElementById('hub-spinner'),
    };
  }

  function setStatus(message, detail = '') {
    const { status, detail: detailEl } = getEls();
    if (status) status.textContent = message;
    if (detailEl) detailEl.textContent = detail;
  }

  function showError(title, detail, actionsHtml = '') {
    const { status, detail: detailEl, actions, spinner } = getEls();
    if (spinner) spinner.hidden = true;
    if (status) status.textContent = title;
    if (detailEl) detailEl.textContent = detail;
    if (actions) {
      actions.hidden = false;
      actions.innerHTML = actionsHtml || (
        '<a href="index.html" class="hub-btn hub-btn--primary">Return to login</a>'
        + '<button type="button" class="hub-btn hub-btn--secondary" id="hub-retry">Try again</button>'
      );
      document.getElementById('hub-retry')?.addEventListener('click', () => {
        sessionStorage.removeItem(LOOP_KEY);
        window.location.reload();
      });
    }
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)} seconds.`)), ms);
      }),
    ]);
  }

  function trackRedirectLoop() {
    try {
      const raw = sessionStorage.getItem(LOOP_KEY);
      const now = Date.now();
      const state = raw ? JSON.parse(raw) : { count: 0, at: now };
      if (now - state.at > LOOP_WINDOW_MS) {
        state.count = 0;
        state.at = now;
      }
      state.count += 1;
      state.at = now;
      sessionStorage.setItem(LOOP_KEY, JSON.stringify(state));
      return state.count;
    } catch (_) {
      return 1;
    }
  }

  function clearRedirectLoop() {
    try { sessionStorage.removeItem(LOOP_KEY); } catch (_) { /* ignore */ }
  }

  function buildTargetUrl(target) {
    const qs = window.location.search;
    if (!qs) return target;
    const params = new URLSearchParams(qs);
    const sep = target.includes('?') ? '&' : '?';
    return `${target}${sep}${params.toString()}`;
  }

  async function route() {
    setStatus('Loading your workspace…', 'Preparing your dashboard');

    try {
      await withTimeout(PMSStorage.ensureLoaded(), LOAD_TIMEOUT_MS, 'Data load');

      const session = PMSStorage.getSession();
      if (!session) {
        window.location.replace('index.html');
        return;
      }

      PMSAuth.touchSession();

      const user = PMSStorage.getUserById(session.id) || session;
      const role = user?.role;
      const target = PMSAuth.getDashboardForRole(role);

      if (!target || target === 'index.html') {
        showError(
          'No workspace assigned',
          `Your account role (“${role || 'unknown'}”) is not linked to a dashboard. Contact your system administrator.`,
        );
        return;
      }

      const loopCount = trackRedirectLoop();
      if (loopCount > MAX_REDIRECTS) {
        showError(
          'Could not open your dashboard',
          'The app redirected repeatedly without loading a workspace. This usually means a role or permission mismatch. Try signing in again, or contact support.',
          '<a href="index.html" class="hub-btn hub-btn--primary">Sign in again</a>'
            + '<button type="button" class="hub-btn hub-btn--secondary" id="hub-force">Open workspace anyway</button>',
        );
        document.getElementById('hub-force')?.addEventListener('click', () => {
          clearRedirectLoop();
          window.location.replace(buildTargetUrl(target));
        });
        return;
      }

      setStatus('Opening your dashboard…', '');
      window.location.replace(buildTargetUrl(target));
    } catch (err) {
      console.error('Dashboard hub error:', err);
      const offline = /timed out|fetch|network|reach/i.test(err.message || '');
      showError(
        offline ? 'Connection is taking too long' : 'Something went wrong',
        offline
          ? 'The server may be starting up or MySQL is unavailable. You can retry or sign in offline using demo credentials on the login page.'
          : (err.message || 'An unexpected error occurred while loading your workspace.'),
      );
    }
  }

  return { route };
})();
