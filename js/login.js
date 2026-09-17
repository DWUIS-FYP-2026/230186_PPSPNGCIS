const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const emailError = document.getElementById('email-error');
const passwordError = document.getElementById('password-error');
const submitBtn = document.getElementById('submit-btn');
const togglePasswordBtn = document.getElementById('password-toggle-btn');
const togglePasswordIcon = document.getElementById('password-toggle-icon');
const loginFloater = document.getElementById('home-login-floater');
const loginOpenBtns = document.querySelectorAll('[data-login-open], #home-login-open');
const loginCloseBtn = document.getElementById('home-login-close');
const loginBackdrop = document.getElementById('home-login-backdrop');

/** Default: masked password, eye icon visible */
let showPassword = false;

function renderPasswordToggleIcon() {
  if (!togglePasswordBtn || !togglePasswordIcon) return;
  const iconName = showPassword ? 'eye-off' : 'eye';
  togglePasswordIcon.replaceChildren();
  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', iconName);
  icon.className = 'toggle-password-icon';
  icon.setAttribute('aria-hidden', 'true');
  togglePasswordIcon.appendChild(icon);
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: togglePasswordIcon });
  togglePasswordBtn.setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password');
  togglePasswordBtn.setAttribute('aria-pressed', showPassword ? 'true' : 'false');
}

function syncPasswordVisibility() {
  if (passwordInput) passwordInput.type = showPassword ? 'text' : 'password';
  renderPasswordToggleIcon();
}

togglePasswordBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  showPassword = !showPassword;
  syncPasswordVisibility();
  passwordInput?.focus({ preventScroll: true });
});

syncPasswordVisibility();

function openLoginFloater() {
  loginFloater?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => emailInput?.focus(), 100);
}

function closeLoginFloater() {
  if (document.body.classList.contains('pms-signing-in')) return;
  loginFloater?.classList.add('hidden');
  document.body.style.overflow = '';
}

loginOpenBtns.forEach((btn) => btn.addEventListener('click', openLoginFloater));
loginCloseBtn?.addEventListener('click', closeLoginFloater);
loginBackdrop?.addEventListener('click', closeLoginFloater);

document.getElementById('forgot-password-btn')?.addEventListener('click', () => {
  form?.classList.add('hidden');
  document.getElementById('forgot-form')?.classList.remove('hidden');
  document.getElementById('forgot-identifier').value = emailInput?.value.trim() || '';
  document.getElementById('forgot-identifier')?.focus();
});

document.getElementById('forgot-back-btn')?.addEventListener('click', () => {
  document.getElementById('forgot-form')?.classList.add('hidden');
  form?.classList.remove('hidden');
  emailInput?.focus();
});

document.getElementById('forgot-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const identifier = document.getElementById('forgot-identifier')?.value.trim();
  const errEl = document.getElementById('forgot-error');
  const btn = document.getElementById('forgot-submit-btn');
  if (!identifier) {
    if (errEl) errEl.textContent = 'Enter your username to continue.';
    return;
  }
  if (errEl) errEl.textContent = '';
  if (btn) btn.disabled = true;
  try {
    if (typeof PMSApi !== 'undefined' && PMSApi.requestPasswordReset) {
      try {
        await PMSApi.requestPasswordReset(identifier);
      } catch (_) { /* still record locally so the admin inbox is updated */ }
    }
    if (typeof PMSStorage !== 'undefined') {
      await PMSStorage.ensureLoaded();
      PMSStorage.requestPasswordReset(identifier);
    }
    if (typeof window.showLandingToast === 'function') {
      window.showLandingToast('If that account exists, the system administrator has been notified.', 'success');
    }
    document.getElementById('forgot-form')?.classList.add('hidden');
    form?.classList.remove('hidden');
  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'Could not submit the request.';
  } finally {
    if (btn) btn.disabled = false;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && loginFloater && !loginFloater.classList.contains('hidden')) {
    closeLoginFloater();
  }
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    openLoginFloater();
  }
});

function setFieldError(input, errorEl, message) {
  if (message) {
    input.classList.add('error');
    errorEl.textContent = message;
  } else {
    input.classList.remove('error');
    errorEl.textContent = '';
  }
}

function validateForm() {
  let valid = true;
  const identifier = emailInput.value.trim();
  if (!identifier) {
    setFieldError(emailInput, emailError, 'Email or username is required');
    valid = false;
  } else setFieldError(emailInput, emailError, '');

  const password = passwordInput.value;
  if (!password) {
    setFieldError(passwordInput, passwordError, 'Password is required');
    valid = false;
  } else if (password.length < 6) {
    setFieldError(passwordInput, passwordError, 'Password must be at least 6 characters');
    valid = false;
  } else setFieldError(passwordInput, passwordError, '');

  return valid;
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.querySelector('.btn-text').classList.toggle('hidden', loading);
  submitBtn.querySelector('.btn-spinner').classList.toggle('hidden', !loading);
  submitBtn.querySelector('.btn-text').textContent = loading ? 'Signing in…' : 'Sign In';
}

function showSignInTransition(user) {
  const veil = document.getElementById('pms-signin-veil');
  const title = document.getElementById('pms-signin-veil-title');
  const detail = document.getElementById('pms-signin-veil-detail');
  const name = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
  const label = typeof PMSAuth !== 'undefined'
    ? PMSAuth.getDashboardLabelForRole(user?.role)
    : 'Dashboard';
  if (title) title.textContent = 'Opening your workspace';
  if (detail) detail.textContent = name ? `${name} · ${label}` : label;
  if (veil) {
    veil.hidden = false;
    veil.classList.remove('hidden');
    veil.classList.add('is-open');
    veil.setAttribute('aria-hidden', 'false');
  }
  document.body.classList.add('pms-signing-in');
  loginFloater?.setAttribute('aria-busy', 'true');
}

function handleLoginSuccess(user) {
  showSignInTransition(user);
  window.setTimeout(() => PMSAuth.redirectAfterLogin(user), 180);
}

[emailInput, passwordInput].forEach((input) => {
  input.addEventListener('input', () => {
    const errorEl = input === emailInput ? emailError : passwordError;
    setFieldError(input, errorEl, '');
  });
});

(async function showExistingSessionWelcome() {
  try {
    if (typeof PMSStorage === 'undefined') return;
    await PMSStorage.ensureLoaded();
    const session = PMSStorage.getSession();
    if (!session) return;
    const user = PMSStorage.getUserById(session.id) || session;
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.email;
    const banner = document.getElementById('login-welcome-banner');
    if (!banner) return;
    banner.classList.remove('hidden');
    banner.replaceChildren();
    const msg = document.createElement('span');
    msg.textContent = name ? `Signed in as ${name}` : 'You have an active session.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lp-welcome-continue';
    btn.textContent = 'Continue to dashboard';
    btn.addEventListener('click', () => handleLoginSuccess(user));
    banner.append(msg, btn);
  } catch (_) { /* ignore */ }
})();

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  setLoading(true);
  const identifier = emailInput.value.trim();
  const password = passwordInput.value;
  let redirecting = false;

  try {
    if (typeof PMSApi !== 'undefined') {
      try {
        const { token, user } = await PMSApi.login(identifier, password);
        PMSStorage.setSession(user, token);
        PMSStorage.reloadAll?.().catch(() => {});
        redirecting = true;
        handleLoginSuccess(user);
        return;
      } catch (apiErr) {
        const canUseLocalAuth = !apiErr.status || apiErr.status === 401 || apiErr.status >= 500;
        if (!canUseLocalAuth) {
          setFieldError(passwordInput, passwordError, apiErr.message || 'Sign-in could not be completed. Please try again.');
          if (typeof window.showLandingToast === 'function') {
            window.showLandingToast(apiErr.message || 'Sign-in could not be completed. Please try again.', 'error');
          }
          return;
        }
      }
    }

    await PMSStorage.ensureLoaded();
    const user = PMSStorage.authenticate(identifier, password);
    if (!user) {
      setFieldError(passwordInput, passwordError, 'Sign-in unsuccessful. Check your username and password, or contact the system administrator if the account is inactive.');
      if (typeof window.showLandingToast === 'function') {
        window.showLandingToast('Sign-in unsuccessful. Check your username and password, or contact the system administrator if the account is inactive.', 'error');
      }
      return;
    }

    redirecting = true;
    handleLoginSuccess(user);
  } catch (err) {
    setFieldError(passwordInput, passwordError, err.message || 'Sign-in could not be completed. Please try again.');
    if (typeof window.showLandingToast === 'function') {
      window.showLandingToast(err.message || 'Sign-in could not be completed. Please try again.', 'error');
    }
  } finally {
    if (!redirecting) setLoading(false);
  }
});
