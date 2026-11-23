-- 001: accounts, project assignments, and the records row.
-- Run with: npm run migrate. Each migration runs once, inside a transaction.

-- One profile per sign-in account. The role and the active flag are read from here on every request,
-- never from the Supabase token, so a role change or deactivation takes effect immediately.
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (length(name) between 1 and 100),
  email       text not null check (length(email) between 3 and 254),
  role        text not null check (role in ('administrator', 'md', 'pm', 'sales', 'accounts', 'viewer')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Which staff work on which project. The MD and Administrator see every project and have no rows here.
-- project_id is the id inside the records JSON (app_state), so it cannot be a foreign key until Track B.
create table project_members (
  project_id  text not null check (length(project_id) between 1 and 100),
  user_id     uuid not null references profiles (id) on delete cascade,
  added_by    uuid references profiles (id) on delete set null,
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on project_members (user_id);

-- Track A: every business record in one JSON row (id is always 1). Filled from day 3.
create table app_state (
  id          integer primary key check (id = 1),
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Supabase also exposes the public schema through its Data API. Row level security with no policies,
-- plus no table rights for the API roles, means that API returns nothing. Only the server (via pg) reads these.
alter table profiles enable row level security;
alter table project_members enable row level security;
alter table app_state enable row level security;
revoke all on profiles, project_members, app_state from anon, authenticated;
