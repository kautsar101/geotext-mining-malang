create table if not exists llm_api_keys (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'groq',
  api_key text not null,
  is_active boolean not null default true,
  priority int not null default 100,
  cooldown_until timestamptz,
  failure_count int not null default 0,
  last_error text,
  last_error_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists llm_api_keys_api_key_unique
  on llm_api_keys (api_key);

alter table llm_api_keys enable row level security;
