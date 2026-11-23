/* Error page: shows a plain explanation and next steps for one problem.
   The problem is chosen by ?code= in the address, or by data-code set by the server.
   ?from= is the page the user was on; it is only used if it points back into this site. */
(function () {
  'use strict';

  const ADMIN = 'If it keeps happening, tell the Administrator what you were doing.';
  const MESSAGES = {
    400: {
      label: 'Error 400', title: 'Request could not be processed',
      reason: 'A link or form sent incomplete or invalid information.',
      steps: ['Go back to the previous page.', 'Check the form for empty or wrong fields, then try again.', ADMIN],
      actions: ['back', 'dashboard']
    },
    401: {
      label: 'Signed out', title: 'You are signed out',
      reason: 'Your session has expired, or your account has been deactivated.',
      steps: ['Sign in again. You will return to the page you were on.', 'If sign-in fails, ask the Administrator to check that your account is active.'],
      actions: ['signin']
    },
    403: {
      label: 'Error 403', title: "You don't have access to this page",
      reason: 'Your role or your project assignments do not allow this page or action.',
      steps: ['If you need this project, ask the Managing Director to add you to it.', 'If you need different rights, ask the Administrator to change your role.', 'Meanwhile, use the dashboard to reach the pages you can open.'],
      actions: ['dashboard', 'back']
    },
    404: {
      label: 'Error 404', title: 'Page not found',
      reason: 'The link is wrong, out of date, or was mistyped.',
      steps: ['Check the address for typing mistakes.', 'Start again from the dashboard and use the menu.', 'If a link inside ConstructFlow brought you here, tell the Administrator which one.'],
      actions: ['dashboard', 'back']
    },
    429: {
      label: 'Too many attempts', title: 'Too many attempts',
      reason: 'Sign-in is paused for about 15 minutes to protect the account from password guessing.',
      steps: ['Wait 15 minutes, then sign in again.', 'If you forgot your password, ask the Administrator to reset it.'],
      actions: ['signin']
    },
    500: {
      label: 'Error 500', title: 'Something went wrong on our side',
      reason: 'The server could not finish your request. Nothing was saved.',
      steps: ['Wait a minute, then press Retry.', ADMIN],
      actions: ['retry', 'dashboard']
    },
    503: {
      label: 'Connection problem', title: "Can't reach ConstructFlow",
      reason: 'Either your internet connection is down, or the server is starting up after being idle. Starting up takes about 30 seconds.',
      steps: ['Check that you are connected to the internet.', 'Wait about 30 seconds. This page tries again on its own.', ADMIN],
      actions: ['retry'], autoRetry: 30
    },
    other: {
      label: 'Problem', title: 'Unexpected problem',
      reason: 'Something stopped this page from working.',
      steps: ['Reload the page.', ADMIN],
      actions: ['retry', 'dashboard']
    }
  };
  MESSAGES.offline = MESSAGES[503];

  /* Picks the message for a code such as "404", 404, or "offline". Unknown codes get the general message. */
  function pick(code) {
    const key = String(code ?? '').trim().toLowerCase();
    return MESSAGES[key] || MESSAGES.other;
  }

  /* Returns a same-site path to go back to, or '' if the value is missing or points anywhere else.
     This stops the page being used to send people to another website (an open redirect). */
  function safeFrom(value, origin) {
    if (!value || typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '';
    try {
      const target = new URL(value, origin);
      // Never back to the error or sign-in page itself, which would go round in a loop.
      if (target.origin !== origin || ['/error.html', '/auth/login.html'].includes(target.pathname)) return '';
      return target.pathname + target.search + target.hash;
    } catch (_) {
      return '';
    }
  }

  /* Builds the button list: {kind: 'link', label, href} or {kind: 'back', label}. The first one is the main button. */
  function buttons(message, from) {
    const back = from || '/';
    const make = {
      back: () => ({kind: 'back', label: 'Go back'}),
      dashboard: () => ({kind: 'link', label: 'Dashboard', href: '/'}),
      retry: () => ({kind: 'link', label: 'Retry', href: back}),
      signin: () => ({kind: 'link', label: 'Sign in', href: '/auth/login.html?from=' + encodeURIComponent(back)})
    };
    return message.actions.map((action, index) => ({...make[action](), primary: index === 0}));
  }

  function render(document, location, history) {
    const params = new URLSearchParams(location.search);
    const message = pick(params.get('code') || document.body.dataset.code);
    const from = safeFrom(params.get('from'), location.origin);
    const byId = id => document.getElementById(id);

    try {
      if (localStorage.getItem('constructflow.theme') === 'dark') document.documentElement.dataset.theme = 'dark';
    } catch (_) { /* The light theme is fine. */ }

    document.title = message.title + ' - ConstructFlow';
    byId('error-code').textContent = message.label;
    byId('error-title').textContent = message.title;
    byId('error-reason').textContent = message.reason;

    // Text is set with textContent only, never as HTML.
    const steps = byId('error-steps');
    steps.replaceChildren(...message.steps.map(step => {
      const item = document.createElement('li');
      item.textContent = step;
      return item;
    }));

    const actions = byId('error-actions');
    actions.replaceChildren(...buttons(message, from).map(button => {
      const element = document.createElement(button.kind === 'back' ? 'button' : 'a');
      element.className = button.primary ? 'button' : 'button secondary';
      element.textContent = button.label;
      if (button.kind === 'back') {
        element.type = 'button';
        element.addEventListener('click', () => {
          if (history.length > 1) history.back();
          else location.href = '/';
        });
      } else element.href = button.href;
      return element;
    }));

    // Offline or starting up: count down, then try the page again automatically.
    if (message.autoRetry) {
      let seconds = message.autoRetry;
      const countdown = byId('error-countdown');
      const tick = () => {
        countdown.textContent = `Trying again in ${seconds} seconds…`;
        if (seconds-- <= 0) location.href = from || '/';
        else setTimeout(tick, 1000);
      };
      tick();
    }
  }

  const api = {MESSAGES, pick, safeFrom, buttons};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    // The sign-in page also loads this file, but only for safeFrom(); only the error page has #error-title.
    globalThis.ConstructFlowErrors = api;
    document.addEventListener('DOMContentLoaded', () => {
      if (document.getElementById('error-title')) render(document, location, history);
    });
  }
})();
