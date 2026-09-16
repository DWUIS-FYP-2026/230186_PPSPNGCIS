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
  loginFloater?.classList.add('hidden');
  document.body.style.overflow = '';
}

loginOpenBtns.forEach((btn) => btn.addEventListener('click', openLoginFloater));
loginCloseBtn?.addEventListener('click', closeLoginFloater);
loginBackdrop?.addEventListener('click', closeLoginFloater);

document.getElementById('forgot-password-btn')?.addEventListener('click', () => {
  if (typeof window.showLandingToast === 'function') {
    window.showLandingToast('Contact your system administrator to reset your password.', 'error');
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

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out. The server may be unavailable.`)), ms);
    }),
  ]);
}

function handleLoginSuccess(user) {
  closeLoginFloater();
  PMSAuth.redirectAfterLogin(user);
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
    if (!session || typeof window.showLoginWelcome !== 'function') return;
    const user = PMSStorage.getUserById(session.id) || session;
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.email;
    window.showLoginWelcome(name);
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
        await withTimeout(PMSStorage.reloadAll(), 12000, 'Syncing data');
        redirecting = true;
        handleLoginSuccess(user);
        return;
      } catch (apiErr) {
        const canUseLocalAuth = !apiErr.status || apiErr.status === 401 || apiErr.status >= 500;
        if (!canUseLocalAuth) {
          setFieldError(passwordInput, passwordError, apiErr.message || 'Login failed.');
          if (typeof window.showLandingToast === 'function') {
            window.showLandingToast(apiErr.message || 'Login failed.', 'error');
          }
          return;
        }
      }
    }

    await PMSStorage.ensureLoaded();
    const user = PMSStorage.authenticate(identifier, password);
    if (!user) {
      setFieldError(passwordInput, passwordError, 'Invalid credentials or inactive account');
      if (typeof window.showLandingToast === 'function') {
        window.showLandingToast('Invalid credentials or inactive account', 'error');
      }
      return;
    }

    redirecting = true;
    handleLoginSuccess(user);
  } catch (err) {
    setFieldError(passwordInput, passwordError, err.message || 'Login failed.');
    if (typeof window.showLandingToast === 'function') {
      window.showLandingToast(err.message || 'Login failed.', 'error');
    }
  } finally {
    if (!redirecting) setLoading(false);
  }
});
