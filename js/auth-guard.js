/**
 * Redirect unauthenticated visitors to the login page before protected UI renders.
 * Include in <head> on every page except index.html and access-denied.html.
 */
(function () {
  const file = (location.pathname.split('/').pop() || '').toLowerCase();
  if (file === 'index.html' || file === 'access-denied.html' || file === '') return;

  const loginUrl = location.pathname.includes('/forms/') ? '../index.html' : 'index.html';

  try {
    if (!sessionStorage.getItem('pms_session')) {
      location.replace(loginUrl);
    }
  } catch (_) {
    location.replace(loginUrl);
  }
})();
