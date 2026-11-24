/* User accounts and project assignments.
   The Administrator creates, edits, deactivates and resets accounts ("accounts" permission).
   The Administrator and the MD assign staff to projects ("assign" permission). */
const express = require('express');
const {roles, scopedRoles} = require('../../core/store.js');
const db = require('../db');
const {adminClient} = require('../supabase');
const {httpError} = require('../middleware/errors');
const {authenticate} = require('../middleware/auth');
const {need} = require('../middleware/access');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_ID = /^[A-Za-z0-9_-]{1,100}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BANNED_FOREVER = '876000h'; // About 100 years: Supabase refuses sign-in and token refresh.

// text(): a trimmed string from the request body, or a 400 with a message saying what is missing.
function text(value, label, max = 100) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result) throw httpError(400, label + ' is required.');
  if (result.length > max) throw httpError(400, `${label} must be ${max} characters or fewer.`);
  return result;
}

// password(): 8 to 72 characters (72 is the most Supabase's password hashing uses).
function password(value) {
  if (typeof value !== 'string' || value.length < 8) throw httpError(400, 'The password must be at least 8 characters.');
  if (value.length > 72) throw httpError(400, 'The password must be 72 characters or fewer.');
  return value;
}

// role(): one of the six role keys.
function role(value) {
  if (!roles.includes(value)) throw httpError(400, 'Select a valid role.');
  return value;
}

// userId(): a route :id that is not a Supabase user id cannot exist, so it is a 404.
function userId(value) {
  if (!UUID.test(value)) throw httpError(404, 'Account not found.');
  // Lower case, as the database returns it, so "is this my own account?" cannot be dodged with capitals.
  return value.toLowerCase();
}

// authFailed(): turns a Supabase account-admin error into a plain message, or a 503 when Supabase is down.
function authFailed(error) {
  if (error.code === 'email_exists' || /already (been )?registered/i.test(error.message)) return httpError(400, 'An account with this email already exists.');
  if (error.code === 'weak_password') return httpError(400, 'The password is too weak. Use at least 8 characters with letters and numbers.');
  if (error.status && error.status < 500) return httpError(400, 'Supabase refused the change: ' + error.message);
  return httpError(503);
}

// listUsers(): every profile with its assigned project ids, active accounts first.
async function listUsers(client = db) {
  const {rows} = await client.query(`
    select p.id, p.name, p.email, p.role, p.active, p.created_at as "createdAt",
           coalesce(array_agg(m.project_id order by m.project_id) filter (where m.project_id is not null), '{}') as projects
      from profiles p
      left join project_members m on m.user_id = p.id
     group by p.id
     order by p.active desc, p.name`);
  return rows;
}

function userRoutes() {
  const router = express.Router();
  router.use(authenticate);

  // GET /api/users: the Administrator sees every account; the MD sees the staff who can be assigned.
  router.get('/', need('accounts', 'assign'), async (req, res) => {
    const users = await listUsers();
    const isAdministrator = req.user.role === 'administrator';
    res.json({users: isAdministrator ? users : users.filter(user => scopedRoles.includes(user.role))});
  });

  // POST /api/users {name, email, role, password}: creates the sign-in account and its profile together.
  router.post('/', need('accounts'), async (req, res) => {
    const body = req.body || {};
    const name = text(body.name, 'Name');
    const email = text(body.email, 'Email', 254).toLowerCase();
    if (!EMAIL.test(email)) throw httpError(400, 'Enter a valid email address.');
    const newRole = role(body.role);
    const newPassword = password(body.password);

    const {data, error} = await adminClient.auth.admin.createUser({email, password: newPassword, email_confirm: true});
    if (error) throw authFailed(error);
    try {
      await db.query('insert into profiles (id, name, email, role) values ($1, $2, $3, $4)', [data.user.id, name, email, newRole]);
    } catch (insertError) {
      // Without a profile the account could never be used, so the sign-in account is removed again.
      await adminClient.auth.admin.deleteUser(data.user.id).catch(() => {});
      throw insertError;
    }
    res.status(201).json({user: {id: data.user.id, name, email, role: newRole, active: true, projects: []}});
  });

  // PATCH /api/users/:id {name, role, active}: edits an account. Deactivating also blocks it at Supabase.
  router.patch('/:id', need('accounts'), async (req, res) => {
    const id = userId(req.params.id);
    const body = req.body || {};
    const name = text(body.name, 'Name');
    const newRole = role(body.role);
    if (typeof body.active !== 'boolean') throw httpError(400, 'Choose whether the account is active.');
    if (id === req.user.id && (newRole !== 'administrator' || !body.active)) {
      throw httpError(400, 'You cannot remove your own Administrator access. Ask another Administrator to do it.');
    }

    await db.tx(async client => {
      const before = await client.query('select active from profiles where id = $1 for update', [id]);
      if (!before.rows[0]) throw httpError(404, 'Account not found.');
      await client.query('update profiles set name = $2, role = $3, active = $4, updated_at = now() where id = $1', [id, name, newRole, body.active]);
      // The MD and Administrator see every project, so assignments only matter for the other roles.
      if (!scopedRoles.includes(newRole)) await client.query('delete from project_members where user_id = $1', [id]);
      if (before.rows[0].active !== body.active) {
        const {error} = await adminClient.auth.admin.updateUserById(id, {ban_duration: body.active ? 'none' : BANNED_FOREVER});
        if (error) throw authFailed(error); // Rolls back the profile change too.
      }
    });
    res.json({ok: true});
  });

  // POST /api/users/:id/password {password}: the Administrator sets a new password for someone.
  router.post('/:id/password', need('accounts'), async (req, res) => {
    const id = userId(req.params.id);
    const newPassword = password(req.body?.password);
    const {rows} = await db.query('select 1 from profiles where id = $1', [id]);
    if (!rows[0]) throw httpError(404, 'Account not found.');
    const {error} = await adminClient.auth.admin.updateUserById(id, {password: newPassword});
    if (error) throw authFailed(error);
    res.json({ok: true});
  });

  // PUT /api/users/:id/projects {projects: [...ids]}: replaces the list of projects this person works on.
  router.put('/:id/projects', need('assign'), async (req, res) => {
    const id = userId(req.params.id);
    const list = req.body?.projects;
    if (!Array.isArray(list) || list.length > 200 || !list.every(item => typeof item === 'string' && PROJECT_ID.test(item))) {
      throw httpError(400, 'Choose the projects from the list.');
    }
    const projects = [...new Set(list)];
    await db.tx(async client => {
      const {rows} = await client.query('select role from profiles where id = $1 for update', [id]);
      if (!rows[0]) throw httpError(404, 'Account not found.');
      if (!scopedRoles.includes(rows[0].role)) throw httpError(400, 'The Managing Director and the Administrator already see every project.');
      // Every id must be a project that exists in the records.
      const known = await client.query(`select array(select p->>'id' from app_state, jsonb_array_elements(data->'projects') p where app_state.id = 1) as ids`);
      const ids = new Set(known.rows[0].ids);
      if (!projects.every(project => ids.has(project))) throw httpError(400, 'Choose the projects from the list.');
      await client.query('delete from project_members where user_id = $1', [id]);
      if (projects.length) {
        await client.query('insert into project_members (project_id, user_id, added_by) select unnest($1::text[]), $2, $3', [projects, id, req.user.id]);
      }
    });
    res.json({ok: true, projects});
  });

  return router;
}

module.exports = {userRoutes, listUsers};
