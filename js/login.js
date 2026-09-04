const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const emailError = document.getElementById('email-error');
const passwordError = document.getElementById('password-error');
const submitBtn = document.getElementById('submit-btn');
const togglePasswordBtn = document.querySelector('.toggle-password');
const loginFloater = document.getElementById('home-login-floater');
const loginOpenBtns = document.querySelectorAll('[data-login-open], #home-login-open');
const loginCloseBtn = document.getElementById('home-login-close');
const loginBackdrop = document.getElementById('home-login-backdrop');

function isPasswordHidden() {
  return !passwordInput || passwordInput.type === 'password';
}

function updatePasswordToggleIcon() {
  if (!togglePasswordBtn) return;
  const hidden = isPasswordHidden();
  const iconName = hidden ? 'eye' : 'eye-off';
  togglePasswordBtn.innerHTML = `<i data-lucide="${iconName}" class="toggle-password-icon" aria-hidden="true"></i>`;
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: togglePasswordBtn });
  togglePasswordBtn.setAttribute('aria-label', hidden ? 'Show password' : 'Hide password');
  togglePasswordBtn.setAttribute('aria-pressed', hidden ? 'false' : 'true');
}

togglePasswordBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  if (!passwordInput) return;
  passwordInput.type = isPasswordHidden() ? 'text' : 'password';
  updatePasswordToggleIcon();
  passwordInput.focus({ preventScroll: true });
});

updatePasswordToggleIcon();

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
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'User';
  if (typeof window.showLandingToast === 'function') {
    window.showLandingToast(`Signed in as ${name} (${user.role})`, 'success');
  }
  if (typeof window.showLoginWelcome === 'function') {
    window.showLoginWelcome(user);
  }
  setTimeout(() => PMSAuth.redirectAfterLogin(user), 1400);
}

[emailInput, passwordInput].forEach((input) => {
  input.addEventListener('input', () => {
    const errorEl = input === emailInput ? emailError : passwordError;
    setFieldError(input, errorEl, '');
  });
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  setLoading(true);
  const identifier = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    if (typeof PMSApi !== 'undefined') {
      try {
        const { token, user } = await PMSApi.login(identifier, password);
        PMSStorage.setSession(user, token);
        await withTimeout(PMSStorage.reloadAll(), 12000, 'Syncing data');
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

    handleLoginSuccess(user);
  } catch (err) {
    setFieldError(passwordInput, passwordError, err.message || 'Login failed.');
    if (typeof window.showLandingToast === 'function') {
      window.showLandingToast(err.message || 'Login failed.', 'error');
    }
  } finally {
    setLoading(false);
  }
});
