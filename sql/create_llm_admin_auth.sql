-- Admin access for the LLM page. Run this file once in Supabase SQL Editor.
create extension if not exists pgcrypto with schema extensions;

create table if not exists llm_admins (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint llm_admins_username_not_empty check (length(trim(username)) > 0)
);

create unique index if not exists llm_admins_username_unique
  on llm_admins (lower(username));

create table if not exists llm_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references llm_admins(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create index if not exists llm_admin_sessions_active_idx
  on llm_admin_sessions (token_hash, expires_at)
  where revoked_at is null;

create table if not exists llm_admin_login_attempts (
  identity_hash text primary key,
  failed_count integer not null default 0,
  cooldown_until timestamptz,
  last_failed_at timestamptz not null default now()
);

alter table llm_admins enable row level security;
alter table llm_admin_sessions enable row level security;
alter table llm_admin_login_attempts enable row level security;

-- Only the server service-role client may access these tables.
revoke all on table llm_admins from anon, authenticated;
revoke all on table llm_admin_sessions from anon, authenticated;
revoke all on table llm_admin_login_attempts from anon, authenticated;

create or replace function verify_llm_admin_credentials(
  p_username text,
  p_password text
)
returns table(id uuid)
language sql
security definer
set search_path = public, extensions
as $$
  select admin.id
  from public.llm_admins as admin
  where admin.is_active = true
    and lower(admin.username) = lower(trim(p_username))
    and admin.password_hash = extensions.crypt(p_password, admin.password_hash)
  limit 1;
$$;

revoke all on function verify_llm_admin_credentials(text, text) from public, anon, authenticated;
grant execute on function verify_llm_admin_credentials(text, text) to service_role;

-- Add the first admin manually after this migration. Do not commit a real password to Git.
-- Example template:
-- insert into llm_admins (username, password_hash)
-- values ('<username>', extensions.crypt('<password>', extensions.gen_salt('bf', 12)));

-- Add the DeepSeek key directly to the existing key pool after inserting the admin:
-- insert into llm_api_keys (provider, api_key, priority)
-- values ('deepseek', '<deepseek-api-key>', 100)
-- on conflict (api_key) do nothing;
