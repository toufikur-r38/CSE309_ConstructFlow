# ConstructFlow backend plan: Express REST API + Supabase, secure roles

## Context

ConstructFlow is a frontend-only app today. All records and business rules live in [core/store.js](core/store.js) and are saved in the browser's localStorage. Roles are a "View as" dropdown, so permissions are cosmetic and easy to bypass. The goal is a lightweight, easy-to-follow backend: an Express REST API in plain JS, Supabase as the database, a `.env` file for secrets, real login, and server-enforced, project-scoped roles. The vanilla DOM frontend stays. It also gets an error page and a usability pass.

**The deadline is one week, with 1 to 2 hours a day of testing time.** The grade depends mainly on working features, then login and security. So the plan has two tracks:
- **Track A, this week:** the whole app runs on the server with real login and roles. Records are stored as JSON in Supabase.
- **Track B, after the deadline:** the JSON is replaced with proper tables, module by module.

## Decisions

| Topic | Decision |
|---|---|
| Audience | CSE309 course demo, deployed to a free online host |
| Backend | Express, plain CommonJS JS |
| Database, Track A | Supabase Postgres. All business records sit in one JSON row, locked during every write, and accessed with `pg` |
| Database, Track B | Proper tables, one module at a time, after the deadline |
| Login | Supabase Auth with email and password. supabase-js is used only for auth and account admin |
| Session | httpOnly cookies, SameSite=Strict, Secure in production |
| Accounts | No public sign-up. The Administrator creates accounts |
| Roles | Six roles, one per user: Administrator, Managing Director, Project Manager, Sales Executive, Accounts Officer, Viewer |
| Administrator | System only: accounts, roles, assignments, settings. No business actions and no business data |
| Scope | Administrator and MD see all projects. Everyone else sees only assigned projects |
| Assigning | Administrator and MD assign staff to projects |
| Customers | Sales sees all customers. Other roles see only customers with a sale in their assigned projects |
| External users | None |
| Seed data | The five sample projects and one demo account per role |
| Error handling | A standalone `error.html` plus in-app messages, with no reference codes |
| Usability | Built-in network states, plus one dedicated polish day |

## Track A architecture (this week)

```
Browser (existing pages + DOM JS)
   │  fetch /api/... (same origin, cookie, JSON)
   ▼
Express (server/)
   ├─ static files: the existing pages, plus error.html and auth/login.html
   ├─ middleware: helmet, JSON size limit, origin check, auth (cookie → user, role, projects)
   ├─ routes: one REST table maps each endpoint to an existing store method
   ├─ core/store.js: the SAME business rules, now run on the server
   ├─ pg ─────────► Supabase Postgres: profiles, project_members, app_state (one JSON row)
   └─ supabase-js ► Supabase Auth: login, refresh, createUser
```

**How a write works.** For example, `POST /api/projects/:projectId/sales` books a flat:
1. The middleware checks that the user is signed in, has the `sales` permission, and is assigned to the project.
2. A transaction runs `SELECT data FROM app_state WHERE id = 1 FOR UPDATE`. The lock means two writes never overwrite each other.
3. The server calls `createStore(memoryStorage(data), actor).bookUnit(projectId, body)`. These are the existing rules, unchanged: stage checks, validation and the 25% discount cap.
4. It runs `UPDATE app_state SET data = $1` and commits. On any error it rolls back, so nothing is half-saved.

**One shared route table, `core/routes.js`.** It has about 40 lines, one per store method, for example `bookUnit: ['POST', '/api/projects/:projectId/sales', ['projectId', 'body']]`. The server uses it to register routes. The client uses it to build the request for the same method name. You can read the whole API in one file.

**Reading.** `GET /api/records` returns the records object the pages already render, filtered on the server per user:
- **MD:** everything.
- **PM, Sales, Accounts, Viewer:** only assigned projects, and only those projects' sales, receipts, expenses and activity. Customers follow the customer rule.
- **Administrator:** project names only, plus users, settings and the activity log.

**Client store.** The browser builds a local read-only store from the fetched records, so `summary`, `statement`, `finance` and `gateChecks` work unchanged. Its write methods are replaced by API calls generated from `core/routes.js`. After each write the client re-fetches the records and re-renders. Module handlers only gain `async` and `await`.

**Changes inside [core/store.js](core/store.js):**
- The role list becomes the six roles. Today's `admin` key, which meant the MD, is renamed to `md`.
- `team` and settings permissions move to `administrator`.
- `createStore` takes an actor (user id, name and role) so audit entries record who did what.
- `saveUser` is removed, because accounts now live in Supabase Auth and `profiles`.

## Folder layout (new files only)

```
package.json  .env.example  .gitignore (.env, node_modules)
server/
  index.js        Express app: helmet, static, API, 404 and 500 handlers, listen
  config.js       loads .env via dotenv and fails fast if a variable is missing
  db.js           pg Pool + tx(fn)
  supabase.js     authClient (publishable key) + adminClient (secret key)
  state.js        withState(fn): lock, run store, save · readState()
  scope.js        filterRecords(records, user): per-role read filtering
  middleware/     auth.js · access.js (need, needProject) · errors.js
  routes/         auth.js · users.js (accounts + assignments) · api.js (from core/routes.js)
db/
  migrations/001_init.sql   profiles, project_members, app_state; RLS on all tables
  migrate.js · seed.js      seed: demo accounts + sampleRecords() into app_state
core/
  routes.js · api.js (fetch wrapper) · error.js   (store.js, app.js, context.js edited)
auth/login.html · auth/login.js
error.html
tests/  store.test.cjs · ui.test.cjs (fake fetch) · api/access.test.cjs
```

There are seven dependencies: `express`, `helmet`, `cookie-parser`, `express-rate-limit`, `pg`, `@supabase/supabase-js` and `dotenv`. Tests use the built-in `node --test` runner. Node 26 is installed.

## Environment variables (`.env.example`)

```
PORT=3000
NODE_ENV=development
APP_ORIGIN=http://localhost:3000
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable/anon key, server-side sign-in only>
SUPABASE_SECRET_KEY=<secret/service_role key, server only, never sent to the browser>
DATABASE_URL=postgresql://...pooler.supabase.com:5432/postgres   # session pooler, works over IPv4 on Render
```

## Roles and permissions

| Permission | Roles | Covers |
|---|---|---|
| project | md | Create and edit project, landowners, JV, advance stage |
| decide | md | Permit decisions, drawing and revision approval, cancellations, voids, occupancy, handover, association |
| permit | md, pm | Submit permits |
| units | md, sales | Building and flats, landowner allocation, price list |
| site | md, pm | Milestones, drawings, site logs, RFIs, budget revision requests, defects |
| procurement | md, pm | Material requests, purchase orders, deliveries |
| costs | md, accounts | Expenses |
| sales | md, sales | Customers, bookings, agreements |
| receipts | md, accounts | Money receipts |
| accounts | administrator | Create users, change role, deactivate, reset password |
| assign | administrator, md | Add and remove project members |
| settings | administrator | Expense categories, material units |
| activity | administrator, md | Read the activity log |

## Security model

1. **The browser never sees a Supabase key.** The secret key and `DATABASE_URL` exist only in `.env` and in the host's environment variables.
2. **RLS is on for every table, with no policies,** so the public Data API cannot read anything. In the Supabase dashboard, public sign-ups are turned off and the minimum password length is 8.
3. **Login:** the server calls `signInWithPassword` and sets the `cf_access` and `cf_refresh` cookies. They are httpOnly and SameSite=Strict, with Secure in production. Login is rate-limited to about 10 tries per 15 minutes per IP.
4. **Every request:** the server verifies the token with `supabase.auth.getUser(token)` and refreshes it when it has expired. It loads the role and assignments from `profiles` and `project_members`, never from the token's metadata. An inactive profile gets a 401.
5. **Authorization on the server, on every route:** the permission comes from the route table and is checked against the user's role. The project assignment is checked for any route with a project. For routes that only carry a sale or expense id, the server first looks up its project. The UI's `can()` only hides buttons.
6. **CSRF:** SameSite=Strict, writes must be `application/json`, and the `Origin` header must equal `APP_ORIGIN`.
7. **Injection and XSS:** only parameterized SQL. Body size is capped at 100kb. The existing `escape()` stays. Helmet sets a strict CSP, `default-src 'self'`. This works because the pages have no inline scripts, styles or handlers, which was checked.
8. **No lost writes:** every write locks the state row, runs the rules, saves and commits in one transaction.
9. **Errors:** business-rule errors return their message as a 400. Anything else returns a generic 500, and details go only to the server log.

## Error handling pages

**1. Standalone `error.html`.** It uses `core/error.js` and app.css. It needs no login and no API, so it works even when the server or login is broken. The address chooses the case, for example `error.html?code=404&from=/sales/index.html`.

| Code | Title | What the page tells the user | Buttons |
|---|---|---|---|
| 400 | Request could not be processed | A link or form sent incomplete data. Go back and try again. | Go back, Dashboard |
| 401 | You are signed out | The session expired or the account was deactivated. Sign in again. If it keeps happening, ask the Administrator to check the account. | Sign in, which returns to `from` |
| 403 | You don't have access to this page | The role or project assignment doesn't allow it. Ask the MD to add you to the project, or the Administrator to change your role. | Dashboard, Go back |
| 404 | Page not found | The link is wrong, old or mistyped. Check the address, or start from the dashboard. | Dashboard, Go back |
| 429 | Too many attempts | Sign-in is paused for about 15 minutes to protect the account. | Sign in |
| 500 | Something went wrong on our side | No data was saved. Try again in a minute. If it repeats, tell the Administrator what you were doing. | Retry, Dashboard |
| 503 / offline | Can't reach ConstructFlow | Either the internet is down or the server is starting up after being idle, which takes about 30 seconds on the free host. | Retry |
| other | Unexpected problem | Reload the page. If it continues, tell the Administrator. | Retry, Dashboard |

Express serves `error.html` with a real 404 status for unknown pages. Unknown `/api/...` addresses get JSON. `core/api.js` redirects to this page on a 401, and when the first records load fails with a 500, a 503 or no network.

**2. In-app messages,** used when the app works but one action fails:
- **403:** the `unavailable()` card in [core/ui.js](core/ui.js) gets the same reason and steps.
- **400 rule errors:** shown next to the form, with the input kept.
- **Unknown record id:** a "Not found" card with a link to the list.
- **500 or network failure on save:** an error message with Retry, with the input kept.

## Usability

**Built in, because the app now uses the network:**
- A loading state while records load.
- A "Saving…" button that stays disabled until the save finishes, so a double click can't book a flat twice.
- Form input kept when a save fails.
- After sign-in, the user returns to the page they wanted.
- Nav links and buttons show only what the role and assignments allow.

**Polish day (day 5).** One pass, because a polish step after every module no longer fits in a week. Before day 5, write down the concrete problems you want fixed, such as confusing screens, too many clicks or mobile layout. Shared fixes go in [core/ui.js](core/ui.js) and [core/app.css](core/app.css) first, then page-specific ones.

## Track A schedule: one phase a day

Each day is one branch and one commit, and ends with a working app.

**Progress**

- [ ] Day 0: plan in repo, two Supabase projects, sign-ups off, dev keys in `.env`
- [ ] Day 1: foundation and error page
- [ ] Day 2: login and accounts
- [ ] Day 3: server store, REST routes and scope
- [ ] Day 4: frontend cut-over
- [ ] Day 5: usability polish
- [ ] Day 6: deploy to Render
- [ ] Day 7: buffer and rehearsal

**Day 0, done by you.** Copy this plan to `docs/BACKEND-PLAN.md` with a checkbox per day. Create two free Supabase projects: **dev** to build and re-seed freely, and **demo** for the deployed site. In both, turn off sign-ups, set the minimum password length to 8, and put the dev keys in `.env`. Never paste keys into chat or commits.

**Day 1, foundation and error page.**
- Add `package.json`, `.gitignore`, `.env.example`, `server/index.js`, `config.js`, `db.js`, `errors.js`, helmet and static serving.
- Add `GET /api/health`, which runs `select 1` against Supabase.
- Add `error.html` and `core/error.js`, with the 404 and 500 handlers.
- Remove the `file://` logic from [core/context.js](core/context.js).
- The app still runs on localStorage. Done when `npm start` serves it, the health check passes, and the old tests pass.

**Day 2, login and accounts.**
- Migration `001_init.sql`, `db/migrate.js`, and the auth routes: login, logout and me.
- The login page with the 401 and 429 flows. The "View as" select is removed and Sign out added.
- Six roles in the store. The Administrator's Team page creates, edits and deactivates real accounts, and assigns projects. The MD can assign projects too.
- `db/seed.js` creates the demo accounts. Records are still local today.

**Day 3, server store, REST routes and scope.**
- `core/routes.js`, `server/state.js`, `server/scope.js`, `GET /api/records`, and every write route.
- The seed writes `sampleRecords()` to `app_state`.
- Done when `tests/api/access.test.cjs` passes. It covers each role against each route, a PM reading an unassigned project gets 403, Accounts can't see outside customers, and the Administrator gets 403 on business writes.

**Day 4, frontend cut-over.**
- `core/api.js`, the client store built from the fetched records, and async handlers in each module.
- Loading and saving states, in-app error messages, and the ui tests switched to a fake fetch.
- localStorage is no longer used for records.
- Done when every screen works for every demo role in the browser.

**Day 5, usability polish.** Your list, shared fixes first.

**Day 6, deploy to Render.**
- Run migrations and seed on the **demo** Supabase project.
- Set `NODE_ENV=production`, `trust proxy`, Secure cookies, `APP_ORIGIN` and the env vars in Render. Add the health check path.
- Smoke test every demo account on the live URL.

**Day 7, buffer and rehearsal.** Fix bugs. Update [docs/HANDOVER-USE-CASE.md](docs/HANDOVER-USE-CASE.md) with sign-in, roles and the demo accounts. Run `/security-review`. Rehearse the demo, and open the site 5 minutes early so the free host is awake.

**If a day overruns,** drop or shorten day 5 first. Never drop day 6 or day 7.

## How to develop it, each day

1. Create a branch from `main`, for example `day-3-server-store`.
2. Start a **fresh Claude session** and say "Implement Day N from docs/BACKEND-PLAN.md". This keeps the context small.
3. Claude builds and runs `npm test`.
4. **You test** with `npm run migrate && npm run seed && npm run dev`. Sign in as each demo role and try what the role should be refused, not only what it should do.
5. Run `/code-review`. On days 2 and 3, also run `/security-review`.
6. Ask Claude to explain anything in the diff you can't explain yourself. You may be asked about it in the viva.
7. Commit, merge to `main`, and tick the box.

## Track B, after the deadline (re-plan before starting)

Replace the JSON row with proper tables in workflow order:
1. Projects, land and assignments.
2. Approvals and flats.
3. Customers and sales.
4. Collections.
5. Construction.
6. Procurement.
7. Expenses.
8. Handover.

Each module gets its own migration, SQL endpoints behind the same REST paths, and a polish step. The REST paths and the frontend stay the same, so only the server changes. The idea is to split [core/store.js](core/store.js) into pure rules shared by the browser and server, with a `loadProject()` that builds the same nested shape from the tables. This needs a fresh plan once the deadline is over.

## Risks

- **Weak database design until Track B.** Track A stores records as one JSON row. If the teacher asks about the schema, explain this as the deliberate first step and show the Track B plan.
- **All writes run one at a time,** because of the single locked row. That is fine for a demo, but not for many users.
- **Free Supabase projects pause after a week of inactivity, and free Render services sleep.** Open the app before the demo.
- **Day 3 and day 4 are the heaviest.** If day 3 runs over, day 5 absorbs it.
- **The seed script replaces all records.** It refuses to run when `NODE_ENV=production` unless `--force` is passed.

## Verification

1. `npm test` runs the store rule tests, the UI render tests with a fake fetch, and the API access matrix against a local server and the seeded dev database.
2. In the browser, sign in as each of the six demo roles. Check what each one can see and do, and that refused actions show the right message.
3. Security spot checks:
   - `/api/records` with no cookie returns 401.
   - A write sent as `text/plain`, or from a foreign `Origin`, returns 403.
   - The Supabase Data API returns nothing when called with the publishable key.
   - The `cf_access` cookie is httpOnly in DevTools.
4. Error page: `/nope` shows the 404 page with a 404 status. Stopping the server mid-session shows the offline page with Retry.
