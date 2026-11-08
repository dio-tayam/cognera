create table jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  type text not null check (char_length(btrim(type)) > 0),
  payload jsonb not null,
  status text not null check (status in ('pending', 'running', 'failed', 'succeeded', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null check (max_attempts between 1 and 25),
  run_after timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_claim_idx on jobs (status, run_after, created_at);

alter table jobs enable row level security;
alter table jobs force row level security;

create policy jobs_isolation on jobs
  using (tenant_id::text = current_setting('app.tenant_id', true))
  with check (tenant_id::text = current_setting('app.tenant_id', true));

grant select, insert, update, delete on jobs to cognera_app;
