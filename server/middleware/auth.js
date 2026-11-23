/* Who is signing in, and who is making this request.
   The session lives in two httpOnly cookies the page's JavaScript cannot read:
     cf_access  short-lived Supabase access token (about 1 hour)
     cf_refresh long-lived token used to get a new access token when the old one expires
   The role and project assignments always come from our own tables, never from the token. */
const {isAuthRetryableFetchError} = require('@supabase/supabase-js');
const config = require('../config');
const db = require('../db');
const {authClient, adminClient} = require('../supabase');
const {httpError} = require('./errors');

const ACCESS = 'cf_access';
const REFRESH = 'cf_refresh';
const REFRESH_DAYS = 7;
const DEACTIVATED = 'This account is deactivated. Ask the Administrator to reactivate it.';

// cookieOptions(): httpOnly (no JavaScript access), SameSite=Strict (not sent from other sites), Secure on https.
function cookieOptions(maxAgeMs) {
  const options = {httpOnly: true, sameSite: 'strict', secure: config.isProduction, path: '/'};
  return maxAgeMs ? {...options, maxAge: maxAgeMs} : options;
}

// setSession(): stores a Supabase session in the two cookies.
function setSession(res, session) {
  res.cookie(ACCESS, session.access_token, cookieOptions(Math.max(60, Number(session.expires_in) || 3600) * 1000));
  res.cookie(REFRESH, session.refresh_token, cookieOptions(REFRESH_DAYS * 24 * 60 * 60 * 1000));
}

// clearSession(): removes both cookies (sign-out, expired or deactivated account).
function clearSession(res) {
  res.clearCookie(ACCESS, cookieOptions());
  res.clearCookie(REFRESH, cookieOptions());
}

// Supabase unreachable or failing is our problem (503), not a wrong password or a bad token.
function serviceDown(error) {
  return isAuthRetryableFetchError(error) || !error.status || error.status >= 500;
}

// loadUser(): the profile (name, role, active) and assigned project ids for a Supabase user id.
async function loadUser(userId) {
  const {rows} = await db.query('select id, name, email, role, active from profiles where id = $1', [userId]);
  if (!rows[0]) return null;
  const members = await db.query('select project_id from project_members where user_id = $1 order by project_id', [userId]);
  return {...rows[0], projects: members.rows.map(row => row.project_id)};
}

// publicUser(): the fields the browser may see about the signed-in user.
const publicUser = user => ({id: user.id, name: user.name, email: user.email, role: user.role, projects: user.projects});

/* Checks the access token, refreshing it once if it has expired, then loads the profile.
   Sets req.user, or answers 401 and clears the cookies. */
async function authenticate(req, res, next) {
  const access = req.cookies?.[ACCESS];
  const refresh = req.cookies?.[REFRESH];
  let authUser = null;
  let token = '';

  if (access) {
    const {data, error} = await adminClient.auth.getUser(access);
    if (error && serviceDown(error)) throw httpError(503);
    if (!error) {
      authUser = data.user;
      token = access;
    }
  }
  if (!authUser && refresh) {
    const {data, error} = await authClient().auth.refreshSession({refresh_token: refresh});
    if (error && serviceDown(error)) throw httpError(503);
    if (!error && data.session) {
      setSession(res, data.session);
      authUser = data.user;
      token = data.session.access_token;
    }
  }
  if (!authUser) {
    clearSession(res);
    throw httpError(401);
  }

  const user = await loadUser(authUser.id);
  if (!user || !user.active) {
    clearSession(res);
    throw httpError(401, DEACTIVATED);
  }
  req.user = user;
  req.accessToken = token;
  next();
}

module.exports = {authenticate, loadUser, publicUser, setSession, clearSession, serviceDown, cookieOptions, DEACTIVATED, ACCESS, REFRESH};
