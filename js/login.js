const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const emailError = document.getElementById('email-error');
const passwordError = document.getElementById('password-error');
const submitBtn = document.getElementById('submit-btn');
const togglePasswordBtn = document.querySelector('.toggle-password');
const loginFloater = document.getElementById('home-login-floater');
const loginOpenBtn = document.getElementById('home-login-open');
const loginCloseBtn = document.getElementById('home-login-close');
const loginBackdrop = document.getElementById('home-login-backdrop');

const supportsMaskedText = typeof CSS !== 'undefined' && CSS.supports('-webkit-text-security', 'disc');

function setPasswordHidden(hidden) {
  if (!passwordInput) return;
  if (supportsMaskedText) {
    passwordInput.type = 'text';
    passwordInput.classList.toggle('password-masked', hidden);
  } else {
    passwordInput.classList.remove('password-masked');
    passwordInput.type = hidden ? 'password' : 'text';
  }
}

function isPasswordHidden() {
  if (!passwordInput) return true;
  return supportsMaskedText
    ? passwordInput.classList.contains('password-masked')
    : passwordInput.type === 'password';
}

function updatePasswordToggleIcon() {
  const hidden = isPasswordHidden();
  const icon = togglePasswordBtn?.querySelector('.toggle-password-icon');
  if (icon) {
    icon.classList.toggle('fi-rr-eye', hidden);
    icon.classList.toggle('fi-rr-eye-crossed', !hidden);
  }
  togglePasswordBtn?.setAttribute('aria-label', hidden ? 'Show password' : 'Hide password');
}

setPasswordHidden(true);
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

loginOpenBtn?.addEventListener('click', openLoginFloater);
loginCloseBtn?.addEventListener('click', closeLoginFloater);
loginBackdrop?.addEventListener('click', closeLoginFloater);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && loginFloater && !loginFloater.classList.contains('hidden')) {
    closeLoginFloater();
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



}







togglePasswordBtn?.addEventListener('click', () => {
  setPasswordHidden(!isPasswordHidden());
  updatePasswordToggleIcon();
});



[emailInput, passwordInput].forEach((input) => {



  input.addEventListener('input', () => {



    const errorEl = input === emailInput ? emailError : passwordError;



    setFieldError(input, errorEl, '');



  });



});







form.addEventListener('submit', async (e) => {



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

        await PMSStorage.reloadAll();

        PMSAuth.redirectAfterLogin(user);

        return;

      } catch (apiErr) {
        const canUseLocalAuth = !apiErr.status || apiErr.status === 401 || apiErr.status >= 500;
        if (!canUseLocalAuth) {
          setFieldError(passwordInput, passwordError, apiErr.message || 'Login failed.');
          return;
        }
      }

    }



    await PMSStorage.ensureLoaded();

    const user = PMSStorage.authenticate(identifier, password);



    if (!user) {

      setFieldError(passwordInput, passwordError, 'Invalid credentials or inactive account');

      return;

    }



    PMSAuth.redirectAfterLogin(user);

  } catch (err) {

    setFieldError(passwordInput, passwordError, err.message || 'Login failed.');

  } finally {

    setLoading(false);

  }



});


