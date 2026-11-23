/* Sign-in, sign-out, and "who am I". There is no public sign-up: the Administrator creates accounts. */
const express = require('express');
const {rateLimit} = require('express-rate-limit');
const {authClient, adminClient} = require('../supabase');
const {httpError} = require('../middleware/errors');
const {authenticate, loadUser, publicUser, setSession, clearSession, serviceDown, DEACTIVATED, ACCESS} = require('../middleware/auth');

const WRONG = 'Email or password is incorrect.';

// authRoutes(): a new router each time, so every app (and every test) gets its own attempt counter.
function authRoutes() {
  const router = express.Router();

  // About 10 failed sign-ins per 15 minutes per address. Successful sign-ins do not count.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) => next(httpError(429, 'Too many sign-in attempts. Wait about 15 minutes and try again.'))
  });

  // POST /api/auth/login {email, password}: checks the password with Supabase and sets the session cookies.
  router.post('/login', loginLimiter, async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password || email.length > 254 || password.length > 128) throw httpError(400, 'Enter your email and password.');

    const {data, error} = await authClient().auth.signInWithPassword({email, password});
    if (error) {
      if (error.status === 429) throw httpError(429, 'Too many sign-in attempts. Wait about 15 minutes and try again.');
      if (serviceDown(error)) throw httpError(503);
      // The same message for an unknown email and a wrong password, so accounts cannot be discovered.
      throw httpError(401, WRONG);
    }
    const user = await loadUser(data.user.id);
    if (!user || !user.active) {
      await adminClient.auth.admin.signOut(data.session.access_token, 'local');
      throw httpError(401, user ? DEACTIVATED : WRONG);
    }
    setSession(res, data.session);
    res.json({user: publicUser(user)});
  });

  // POST /api/auth/logout: ends the session at Supabase (when it is still valid) and clears the cookies.
  router.post('/logout', async (req, res) => {
    const access = req.cookies?.[ACCESS];
    if (access) await adminClient.auth.admin.signOut(access, 'local').catch(() => {});
    clearSession(res);
    res.json({ok: true});
  });

  // GET /api/auth/me: the signed-in user, or 401. Pages call this first to know who is using them.
  router.get('/me', authenticate, (req, res) => {
    res.json({user: publicUser(req.user)});
  });

  return router;
}

module.exports = {authRoutes};
