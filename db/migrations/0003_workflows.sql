create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  workflow_id text not null check (char_length(btrim(workflow_id)) > 0),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  input jsonb not null,
  state jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workflow_step_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id),
  run_id uuid not null references workflow_runs (id),
  step_id text not null check (char_length(btrim(step_id)) > 0),
  status text not null check (status in ('succeeded', 'failed')),
  state_patch jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  unique (run_id, step_id)
);

create index workflow_runs_tenant_idx on workflow_runs (tenant_id, created_at);

alter table workflow_runs enable row level security;
alter table workflow_runs force row level security;
alter table workflow_step_runs enable row level security;
alter table workflow_step_runs force row level security;

create policy workflow_runs_isolation on workflow_runs
  using (tenant_id::text = current_setting('app.tenant_id', true))
  with check (tenant_id::text = current_setting('app.tenant_id', true));

create policy workflow_step_runs_isolation on workflow_step_runs
  using (tenant_id::text = current_setting('app.tenant_id', true))
  with check (tenant_id::text = current_setting('app.tenant_id', true));

grant select, insert, update, delete on workflow_runs, workflow_step_runs to cognera_app;
