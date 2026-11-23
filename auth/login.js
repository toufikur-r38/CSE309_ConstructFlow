/* Sign-in page: sends the email and password to the server, which sets the session cookies.
   On success the user returns to the page they wanted (?from=), checked by safeFrom() so it stays on this site. */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const {safeFrom} = globalThis.ConstructFlowErrors;
  const from = safeFrom(new URLSearchParams(location.search).get('from'), location.origin) || '/';
  const form = document.getElementById('login-form');
  const message = document.getElementById('login-message');
  const submit = form.querySelector('button[type="submit"]');

  try {
    if (localStorage.getItem('constructflow.theme') === 'dark') document.documentElement.dataset.theme = 'dark';
  } catch (_) { /* The light theme is fine. */ }

  // show(): an error above the form, read out by screen readers.
  function show(text) {
    message.textContent = text;
    message.hidden = false;
    message.focus();
  }

  // Already signed in (for example after pressing Back): go straight on.
  fetch('/api/auth/me', {credentials: 'same-origin'}).then(response => {
    if (response.ok) location.replace(from);
  }).catch(() => { /* Signing in below reports any connection problem. */ });

  // Submit: one attempt at a time; a wrong password keeps the email and clears the password.
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'same-origin',
        headers: {'content-type': 'application/json', accept: 'application/json'},
        body: JSON.stringify({email: form.elements.email.value, password: form.elements.password.value})
      });
      if (response.ok) {
        location.replace(from);
        return;
      }
      if (response.status === 429) {
        location.href = '/error.html?code=429&from=' + encodeURIComponent(from);
        return;
      }
      const data = await response.json().catch(() => ({}));
      show(data.error || 'Sign-in failed. Try again in a minute.');
      form.elements.password.value = '';
      form.elements.password.focus();
    } catch (_) {
      show("Can't reach ConstructFlow. Check your internet connection, or wait about 30 seconds if the server is starting up, then try again.");
    } finally {
      submit.disabled = false;
      submit.textContent = 'Sign in';
    }
  });
});
