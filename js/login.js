const form = document.getElementById('login-form');



const emailInput = document.getElementById('email');



const passwordInput = document.getElementById('password');



const emailError = document.getElementById('email-error');



const passwordError = document.getElementById('password-error');



const submitBtn = document.getElementById('submit-btn');



const togglePasswordBtn = document.querySelector('.toggle-password');







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







togglePasswordBtn.addEventListener('click', () => {

  const isPassword = passwordInput.type === 'password';

  passwordInput.type = isPassword ? 'text' : 'password';

  togglePasswordBtn.querySelector('.icon-eye').classList.toggle('hidden', isPassword);

  togglePasswordBtn.querySelector('.icon-eye-off').classList.toggle('hidden', !isPassword);

  togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');

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

        if (apiErr.status && apiErr.status !== 401) {

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


