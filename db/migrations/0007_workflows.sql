alter table jobs
  add column idempotency_key text;

create unique index jobs_idempotency_key
  on jobs (tenant_id, type, idempotency_key)
  where idempotency_key is not null;

alter table workflow_executions
  add column trigger_type text,
  add column input jsonb not null default '{}'::jsonb,
  add column output jsonb,
  add column error text,
  add column idempotency_key text,
  add column cancel_requested_at timestamptz;

alter table workflow_executions
  add constraint workflow_executions_trigger_check check (
    trigger_type is null or trigger_type in ('manual', 'lead_created', 'webhook', 'schedule', 'test')
  );

create unique index workflow_executions_idempotency_key
  on workflow_executions (organization_id, idempotency_key)
  where idempotency_key is not null;

create unique index workflow_executions_id_organization_key on workflow_executions (id, organization_id);
create index workflow_executions_created_idx on workflow_executions (organization_id, created_at);

create table workflow_execution_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  execution_id uuid not null,
  node_id text not null check (node_id ~ '^[a-z][a-z0-9_]{0,40}$'),
  status text not null check (status in ('succeeded', 'failed', 'skipped', 'cancelled')),
  output jsonb,
  error text,
  attempt integer not null check (attempt > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  unique (execution_id, node_id, attempt),
  foreign key (execution_id, organization_id) references workflow_executions (id, organization_id)
);

create index workflow_execution_steps_execution_idx on workflow_execution_steps (execution_id);

create table follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  execution_id uuid not null,
  node_id text not null,
  lead_id uuid,
  title text not null check (char_length(btrim(title)) > 0),
  body text not null default '',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (execution_id, organization_id) references workflow_executions (id, organization_id)
);

create index follow_up_tasks_organization_idx on follow_up_tasks (organization_id, created_at);

create table workflow_webhook_secrets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_id uuid not null,
  secret text not null check (char_length(secret) >= 32),
  status text not null check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  foreign key (workflow_id, organization_id) references workflows (id, organization_id)
);

create unique index workflow_webhook_one_active
  on workflow_webhook_secrets (workflow_id)
  where status = 'active';

create table workflow_webhook_nonces (
  workflow_id uuid not null,
  nonce text not null check (char_length(nonce) between 16 and 200),
  seen_at timestamptz not null default now(),
  primary key (workflow_id, nonce)
);

create table workflow_runtime (
  id integer primary key check (id = 1),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into workflow_runtime (id, enabled) values (1, true);

create or replace function app_lock_workflow_version()
returns trigger
language plpgsql
as $$
begin
  if new.definition is distinct from old.definition
     or new.version_number is distinct from old.version_number
     or new.workflow_id is distinct from old.workflow_id
     or new.organization_id is distinct from old.organization_id then
    raise exception 'workflow versions are immutable';
  end if;
  return new;
end;
$$;

create trigger workflow_versions_immutable
  before update on workflow_versions
  for each row execute function app_lock_workflow_version();

create or replace function app_workflow_execution_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select enabled from workflow_runtime where id = 1;
$$;

create or replace function app_claim_workflow_job(p_worker text, p_execution_id uuid default null)
returns table (
  job_id uuid,
  tenant_id uuid,
  payload jsonb,
  attempts integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_worker is null or char_length(btrim(p_worker)) = 0 then
    raise exception 'worker id is required';
  end if;
  if not coalesce(app_workflow_execution_enabled(), false) then
    return;
  end if;
  return query
  update jobs
  set status = 'running',
      locked_by = p_worker,
      locked_at = now(),
      attempts = jobs.attempts + 1,
      updated_at = now()
  where jobs.id = (
    select candidate.id from jobs candidate
    where candidate.type = 'workflow.execute'
      and candidate.status in ('pending', 'failed')
      and candidate.run_after <= now()
      and (p_execution_id is null or candidate.payload->>'executionId' = p_execution_id::text)
    order by candidate.created_at
    for update skip locked
    limit 1
  )
  returning jobs.id, jobs.tenant_id, jobs.payload, jobs.attempts, jobs.max_attempts;
end;
$$;

create or replace function app_recover_workflow_jobs(p_stale_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  recovered integer;
begin
  if p_stale_seconds is null or p_stale_seconds < 30 then
    raise exception 'stale window is too short';
  end if;
  update jobs
  set status = case when attempts >= max_attempts then 'dead' else 'failed' end,
      locked_by = null,
      locked_at = null,
      last_error = 'The worker stopped before the job finished.',
      run_after = now(),
      updated_at = now()
  where type = 'workflow.execute'
    and status = 'running'
    and locked_at < now() - make_interval(secs => p_stale_seconds);
  get diagnostics recovered = row_count;
  return recovered;
end;
$$;

create or replace function app_finish_workflow_job(
  p_job_id uuid,
  p_worker text,
  p_outcome text,
  p_error text,
  p_delay_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_outcome not in ('succeeded', 'retry', 'dead') then
    raise exception 'job outcome is invalid';
  end if;
  update jobs
  set status = case
        when p_outcome = 'succeeded' then 'succeeded'
        when p_outcome = 'dead' then 'dead'
        else 'failed'
      end,
      run_after = case
        when p_outcome = 'retry' then now() + make_interval(secs => greatest(p_delay_seconds, 0))
        else run_after
      end,
      locked_by = null,
      locked_at = null,
      last_error = nullif(p_error, ''),
      updated_at = now()
  where id = p_job_id
    and status = 'running'
    and locked_by = p_worker;
  if not found then
    raise exception 'job is not locked by this worker';
  end if;
end;
$$;

create or replace function app_enqueue_workflow_execution(
  p_organization_id uuid,
  p_workflow_id uuid,
  p_version_id uuid,
  p_trigger text,
  p_input jsonb,
  p_idempotency_key text,
  p_test boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  execution_id uuid;
  recent_count integer;
begin
  if p_trigger not in ('manual', 'lead_created', 'webhook', 'schedule', 'test') then
    raise exception 'workflow trigger is invalid';
  end if;
  if not exists (
    select 1 from workflows
    where id = p_workflow_id
      and organization_id = p_organization_id
      and (p_test or status = 'active')
  ) then
    raise exception 'workflow is not active';
  end if;
  if not exists (
    select 1 from workflow_versions
    where id = p_version_id
      and workflow_id = p_workflow_id
      and organization_id = p_organization_id
      and (p_test or status = 'published')
  ) then
    raise exception 'workflow version is not published';
  end if;
  if p_idempotency_key is not null then
    select id into execution_id
    from workflow_executions
    where organization_id = p_organization_id
      and idempotency_key = p_idempotency_key;
    if execution_id is not null then
      return execution_id;
    end if;
  end if;
  select count(*) into recent_count
  from workflow_executions
  where organization_id = p_organization_id
    and created_at > now() - interval '1 hour';
  if recent_count >= 100 then
    raise exception 'workflow quota exceeded';
  end if;
  insert into workflow_executions (
    organization_id, workflow_id, version_id, status, trigger_type, input, idempotency_key
  ) values (
    p_organization_id, p_workflow_id, p_version_id, 'queued', p_trigger, coalesce(p_input, '{}'::jsonb), p_idempotency_key
  )
  returning id into execution_id;
  insert into jobs (tenant_id, type, payload, status, max_attempts, idempotency_key)
  values (
    p_organization_id,
    'workflow.execute',
    jsonb_build_object('executionId', execution_id),
    'pending',
    5,
    p_idempotency_key
  );
  return execution_id;
end;
$$;

create or replace function app_workflow_execution_state(p_execution_id uuid)
returns table (
  organization_id uuid,
  workflow_id uuid,
  version_id uuid,
  status text,
  input jsonb,
  definition jsonb,
  cancel_requested boolean,
  succeeded_nodes text[],
  step_outputs jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    execution.organization_id,
    execution.workflow_id,
    execution.version_id,
    execution.status,
    execution.input,
    version.definition,
    execution.cancel_requested_at is not null,
    coalesce(array(
      select step.node_id
      from workflow_execution_steps step
      where step.execution_id = execution.id
        and step.status = 'succeeded'
    ), array[]::text[]),
    coalesce((
      select jsonb_object_agg(step.node_id, step.output)
      from workflow_execution_steps step
      where step.execution_id = execution.id
        and step.status = 'succeeded'
    ), '{}'::jsonb)
  from workflow_executions execution
  join workflow_versions version on version.id = execution.version_id
  where execution.id = p_execution_id;
$$;

create or replace function app_workflow_mark_running(p_execution_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update workflow_executions
  set status = 'running', started_at = coalesce(started_at, now())
  where id = p_execution_id
    and status in ('queued', 'running');
$$;

create or replace function app_workflow_log_step(
  p_execution_id uuid,
  p_node_id text,
  p_status text,
  p_output jsonb,
  p_error text,
  p_attempt integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
begin
  select organization_id into org_id from workflow_executions where id = p_execution_id;
  if org_id is null then
    raise exception 'workflow execution was not found';
  end if;
  insert into workflow_execution_steps (
    organization_id, execution_id, node_id, status, output, error, attempt
  ) values (
    org_id, p_execution_id, p_node_id, p_status, p_output, p_error, p_attempt
  )
  on conflict (execution_id, node_id, attempt) do nothing;
end;
$$;

create or replace function app_workflow_finish_execution(
  p_execution_id uuid,
  p_status text,
  p_output jsonb,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('succeeded', 'failed', 'cancelled') then
    raise exception 'execution status is invalid';
  end if;
  update workflow_executions
  set status = p_status,
      output = p_output,
      error = nullif(p_error, ''),
      finished_at = now()
  where id = p_execution_id
    and status in ('queued', 'running');
end;
$$;

create or replace function app_workflow_create_follow_up(
  p_execution_id uuid,
  p_node_id text,
  p_lead_id uuid,
  p_title text,
  p_body text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  task_id uuid;
begin
  select organization_id into org_id from workflow_executions where id = p_execution_id;
  if org_id is null then
    raise exception 'workflow execution was not found';
  end if;
  insert into follow_up_tasks (
    organization_id, execution_id, node_id, lead_id, title, body, idempotency_key
  ) values (
    org_id, p_execution_id, p_node_id, p_lead_id, p_title, p_body, p_idempotency_key
  )
  on conflict (organization_id, idempotency_key) do nothing
  returning id into task_id;
  if task_id is null then
    select id into task_id
    from follow_up_tasks
    where organization_id = org_id
      and idempotency_key = p_idempotency_key;
  end if;
  return task_id;
end;
$$;

create or replace function app_active_webhook_secret(p_workflow_id uuid)
returns table (organization_id uuid, secret text, version_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select secret.organization_id, secret.secret, version.id
  from workflow_webhook_secrets secret
  join workflows workflow on workflow.id = secret.workflow_id and workflow.status = 'active'
  join workflow_versions version
    on version.workflow_id = secret.workflow_id
   and version.status = 'published'
  where secret.workflow_id = p_workflow_id
    and secret.status = 'active'
  order by version.version_number desc
  limit 1;
$$;

create or replace function app_record_webhook_nonce(p_workflow_id uuid, p_nonce text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into workflow_webhook_nonces (workflow_id, nonce)
  values (p_workflow_id, p_nonce)
  on conflict do nothing;
  return found;
end;
$$;

create or replace function app_workflow_requeue(p_execution_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update workflow_executions
  set status = 'queued', finished_at = null, error = null
  where id = p_execution_id
    and status = 'failed';
$$;

create or replace function app_due_workflow_schedules()
returns table (
  id uuid,
  organization_id uuid,
  workflow_id uuid,
  version_id uuid,
  interval_minutes integer
)
language sql
stable
security definer
set search_path = public
as $$
  select job.id, job.organization_id, job.workflow_id, version.id, split_part(job.cron, ':', 2)::int
  from scheduled_jobs job
  join workflows workflow on workflow.id = job.workflow_id and workflow.status = 'active'
  join workflow_versions version on version.workflow_id = workflow.id and version.status = 'published'
  where job.status = 'active'
    and job.cron like 'interval:%'
    and (job.next_run_at is null or job.next_run_at <= now());
$$;

create or replace function app_schedule_workflow_next(p_job_id uuid, p_minutes integer)
returns void
language sql
security definer
set search_path = public
as $$
  update scheduled_jobs
  set next_run_at = now() + (p_minutes * interval '1 minute'), updated_at = now()
  where id = p_job_id;
$$;

revoke all on function app_workflow_execution_enabled() from public;
revoke all on function app_claim_workflow_job(text, uuid) from public;
revoke all on function app_recover_workflow_jobs(integer) from public;
revoke all on function app_finish_workflow_job(uuid, text, text, text, integer) from public;
revoke all on function app_enqueue_workflow_execution(uuid, uuid, uuid, text, jsonb, text, boolean) from public;
revoke all on function app_workflow_execution_state(uuid) from public;
revoke all on function app_workflow_mark_running(uuid) from public;
revoke all on function app_workflow_log_step(uuid, text, text, jsonb, text, integer) from public;
revoke all on function app_workflow_finish_execution(uuid, text, jsonb, text) from public;
revoke all on function app_workflow_create_follow_up(uuid, text, uuid, text, text, text) from public;
revoke all on function app_active_webhook_secret(uuid) from public;
revoke all on function app_record_webhook_nonce(uuid, text) from public;

grant execute on function app_workflow_execution_enabled() to cognera_app;
grant execute on function app_claim_workflow_job(text, uuid) to cognera_app;
grant execute on function app_recover_workflow_jobs(integer) to cognera_app;
grant execute on function app_finish_workflow_job(uuid, text, text, text, integer) to cognera_app;
grant execute on function app_enqueue_workflow_execution(uuid, uuid, uuid, text, jsonb, text, boolean) to cognera_app;
grant execute on function app_workflow_execution_state(uuid) to cognera_app;
grant execute on function app_workflow_mark_running(uuid) to cognera_app;
grant execute on function app_workflow_log_step(uuid, text, text, jsonb, text, integer) to cognera_app;
grant execute on function app_workflow_finish_execution(uuid, text, jsonb, text) to cognera_app;
grant execute on function app_workflow_create_follow_up(uuid, text, uuid, text, text, text) to cognera_app;
grant execute on function app_active_webhook_secret(uuid) to cognera_app;
grant execute on function app_record_webhook_nonce(uuid, text) to cognera_app;
revoke all on function app_due_workflow_schedules() from public;
revoke all on function app_schedule_workflow_next(uuid, integer) from public;
grant execute on function app_due_workflow_schedules() to cognera_app;
revoke all on function app_workflow_requeue(uuid) from public;
grant execute on function app_workflow_requeue(uuid) to cognera_app;
grant execute on function app_schedule_workflow_next(uuid, integer) to cognera_app;

alter table workflow_execution_steps enable row level security;
alter table workflow_execution_steps force row level security;
alter table follow_up_tasks enable row level security;
alter table follow_up_tasks force row level security;
alter table workflow_webhook_secrets enable row level security;
alter table workflow_webhook_secrets force row level security;
alter table workflow_webhook_nonces enable row level security;
alter table workflow_webhook_nonces force row level security;
alter table workflow_runtime enable row level security;
alter table workflow_runtime force row level security;

create policy workflow_execution_steps_select on workflow_execution_steps
  for select using (app_org_visible(organization_id));
create policy follow_up_tasks_select on follow_up_tasks
  for select using (app_org_visible(organization_id));
create policy workflow_webhook_secrets_select on workflow_webhook_secrets
  for select using (app_org_role(organization_id) in ('owner', 'admin'));
create policy workflow_webhook_secrets_insert on workflow_webhook_secrets
  for insert with check (app_org_role(organization_id) in ('owner', 'admin'));
create policy workflow_webhook_secrets_update on workflow_webhook_secrets
  for update using (app_org_role(organization_id) in ('owner', 'admin'))
  with check (app_org_role(organization_id) in ('owner', 'admin'));

grant select on workflow_execution_steps to cognera_app;
grant select on follow_up_tasks to cognera_app;
grant select, insert, update on workflow_webhook_secrets to cognera_app;
