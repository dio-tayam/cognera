-- Workflow engine hardening.
-- Explicit execution states, job leases, per-organization limits, safe manual retry,
-- atomic schedule dispatch, and write paths that go through checked functions.

alter table workflow_executions drop constraint workflow_executions_status_check;
alter table workflow_executions add constraint workflow_executions_status_check check (
  status in ('queued', 'running', 'retry_scheduled', 'succeeded', 'failed', 'cancelled')
);

alter table workflow_executions
  add column attempt_count integer not null default 0 check (attempt_count >= 0),
  add column manual_retry_count integer not null default 0 check (manual_retry_count between 0 and 3),
  add column next_retry_at timestamptz,
  add column dead_lettered_at timestamptz,
  add column deadline_at timestamptz;

create index workflow_executions_status_idx on workflow_executions (organization_id, status, created_at);

alter table workflow_execution_steps
  add column duration_ms integer check (duration_ms is null or duration_ms >= 0);

create index jobs_workflow_execution_idx
  on jobs ((payload->>'executionId'))
  where type = 'workflow.execute';

create index workflow_webhook_nonces_seen_idx on workflow_webhook_nonces (seen_at);

-- Allowed execution transitions. Anything else is a bug and is rejected.
create or replace function app_check_execution_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if (old.status, new.status) in (
    ('queued', 'running'),
    ('queued', 'cancelled'),
    ('queued', 'failed'),
    ('queued', 'retry_scheduled'),
    ('running', 'succeeded'),
    ('running', 'failed'),
    ('running', 'cancelled'),
    ('running', 'retry_scheduled'),
    ('retry_scheduled', 'running'),
    ('retry_scheduled', 'cancelled'),
    ('retry_scheduled', 'failed'),
    ('failed', 'retry_scheduled')
  ) then
    return new;
  end if;
  raise exception 'workflow execution cannot move from % to %', old.status, new.status;
end;
$$;

create trigger workflow_executions_transition
  before update of status on workflow_executions
  for each row execute function app_check_execution_transition();

-- Editors can save drafts. Only owners and admins can publish or activate.
create or replace function app_guard_workflow_status()
returns trigger
language plpgsql
as $$
begin
  if current_user <> 'cognera_app' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.status = 'draft' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if coalesce(app_org_role(new.organization_id), '') not in ('owner', 'admin') then
    raise exception 'workflow activation requires an owner or admin';
  end if;
  return new;
end;
$$;

create trigger workflows_guard_status
  before insert or update on workflows
  for each row execute function app_guard_workflow_status();

create trigger workflow_versions_guard_status
  before insert or update on workflow_versions
  for each row execute function app_guard_workflow_status();

-- Executions and versions are history. The application writes executions only through
-- the functions below, and it never deletes either table.
revoke insert, update, delete on workflow_executions from cognera_app;
revoke delete on workflow_versions from cognera_app;

create table workflow_org_limits (
  organization_id uuid primary key references organizations (id),
  executions_per_hour integer not null default 100 check (executions_per_hour between 0 and 100000),
  max_running integer not null default 5 check (max_running between 1 and 100),
  updated_at timestamptz not null default now()
);

alter table workflow_org_limits enable row level security;
alter table workflow_org_limits force row level security;
create policy workflow_org_limits_select on workflow_org_limits
  for select using (app_org_visible(organization_id));
grant select on workflow_org_limits to cognera_app;

alter table workflow_runtime
  add column reason text,
  add column updated_by text;

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
  hourly_limit integer;
begin
  if p_trigger not in ('manual', 'lead_created', 'webhook', 'schedule', 'test') then
    raise exception 'workflow trigger is invalid';
  end if;
  if p_input is not null and pg_column_size(p_input) > 65536 then
    raise exception 'workflow input is too large';
  end if;
  if p_idempotency_key is not null and char_length(p_idempotency_key) > 300 then
    raise exception 'workflow idempotency key is too long';
  end if;
  -- One enqueue at a time per organization, so the quota and idempotency checks
  -- cannot both pass for two concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended('workflow-enqueue:' || p_organization_id::text, 0));
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
  if not p_test and not exists (
    select 1 from workflow_versions
    where id = p_version_id
      and definition->'nodes' @> jsonb_build_array(jsonb_build_object('type', p_trigger))
  ) then
    raise exception 'workflow trigger does not match';
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
  select coalesce(
    (select executions_per_hour from workflow_org_limits where organization_id = p_organization_id),
    100
  ) into hourly_limit;
  select count(*) into recent_count
  from workflow_executions
  where organization_id = p_organization_id
    and created_at > now() - interval '1 hour';
  if recent_count >= hourly_limit then
    raise exception 'workflow quota exceeded';
  end if;
  insert into workflow_executions (
    organization_id, workflow_id, version_id, status, trigger_type, input, idempotency_key, deadline_at
  ) values (
    p_organization_id, p_workflow_id, p_version_id, 'queued', p_trigger,
    coalesce(p_input, '{}'::jsonb), p_idempotency_key, now() + interval '15 minutes'
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
      and (
        select count(*) from jobs active
        where active.tenant_id = candidate.tenant_id
          and active.type = 'workflow.execute'
          and active.status = 'running'
      ) < coalesce(
        (select max_running from workflow_org_limits where organization_id = candidate.tenant_id),
        5
      )
    order by candidate.run_after, candidate.created_at
    for update skip locked
    limit 1
  )
    and jobs.status in ('pending', 'failed')
  returning jobs.id, jobs.tenant_id, jobs.payload, jobs.attempts, jobs.max_attempts;
end;
$$;

-- Extends the lease. Returns false when another worker recovered the job,
-- so the caller must stop before it causes another side effect.
create or replace function app_workflow_heartbeat(p_job_id uuid, p_worker text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update jobs
  set locked_at = now(), updated_at = now()
  where id = p_job_id
    and status = 'running'
    and locked_by = p_worker;
  return found;
end;
$$;

create or replace function app_recover_workflow_jobs(p_stale_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  recovered_count integer;
begin
  if p_stale_seconds is null or p_stale_seconds < 30 then
    raise exception 'stale window is too short';
  end if;
  with recovered as (
    update jobs
    set status = case when attempts >= max_attempts then 'dead' else 'failed' end,
        locked_by = null,
        locked_at = null,
        last_error = 'The worker stopped before the job finished.',
        run_after = now(),
        updated_at = now()
    where type = 'workflow.execute'
      and status = 'running'
      and locked_at < now() - make_interval(secs => p_stale_seconds)
    returning payload, status
  ), settled as (
    update workflow_executions execution
    set status = case when recovered.status = 'dead' then 'failed' else 'retry_scheduled' end,
        error = 'The worker stopped before the execution finished.',
        finished_at = case when recovered.status = 'dead' then now() end,
        dead_lettered_at = case when recovered.status = 'dead' then now() end,
        next_retry_at = case when recovered.status = 'dead' then null else now() end
    from recovered
    where execution.id::text = recovered.payload->>'executionId'
      and execution.status in ('queued', 'running', 'retry_scheduled')
    returning execution.id
  )
  select count(*) into recovered_count from recovered;
  return recovered_count;
end;
$$;

drop function app_workflow_execution_state(uuid);
create function app_workflow_execution_state(p_execution_id uuid)
returns table (
  organization_id uuid,
  workflow_id uuid,
  version_id uuid,
  status text,
  input jsonb,
  definition jsonb,
  cancel_requested boolean,
  deadline_passed boolean,
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
    execution.deadline_at is not null and execution.deadline_at < now(),
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

-- Returns the attempt number, or null when the execution must not run
-- (cancelled, already finished, or cancellation requested).
drop function app_workflow_mark_running(uuid);
create function app_workflow_mark_running(p_execution_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt integer;
begin
  update workflow_executions
  set status = 'running',
      started_at = coalesce(started_at, now()),
      attempt_count = attempt_count + 1,
      next_retry_at = null
  where id = p_execution_id
    and status in ('queued', 'retry_scheduled', 'running')
    and cancel_requested_at is null
  returning attempt_count into attempt;
  return attempt;
end;
$$;

drop function app_workflow_log_step(uuid, text, text, jsonb, text, integer);
create function app_workflow_log_step(
  p_execution_id uuid,
  p_node_id text,
  p_status text,
  p_output jsonb,
  p_error text,
  p_attempt integer,
  p_started_at timestamptz,
  p_duration_ms integer
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
    organization_id, execution_id, node_id, status, output, error, attempt, started_at, finished_at, duration_ms
  ) values (
    org_id, p_execution_id, p_node_id, p_status, p_output, left(p_error, 500), p_attempt,
    coalesce(p_started_at, now()), now(), p_duration_ms
  )
  on conflict (execution_id, node_id, attempt) do nothing;
end;
$$;

drop function app_workflow_finish_execution(uuid, text, jsonb, text);
drop function app_workflow_requeue(uuid);

-- Settles an attempt. A failed execution is dead-lettered: it stays visible
-- and can be retried by an editor, a bounded number of times.
create function app_workflow_settle_execution(
  p_execution_id uuid,
  p_status text,
  p_output jsonb,
  p_error text,
  p_retry_delay_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('succeeded', 'failed', 'cancelled', 'retry_scheduled') then
    raise exception 'execution status is invalid';
  end if;
  update workflow_executions
  set status = p_status,
      output = coalesce(p_output, output),
      error = nullif(left(p_error, 500), ''),
      finished_at = case when p_status = 'retry_scheduled' then null else now() end,
      next_retry_at = case
        when p_status = 'retry_scheduled'
          then now() + make_interval(secs => greatest(coalesce(p_retry_delay_seconds, 0), 0))
        else null
      end,
      dead_lettered_at = case when p_status = 'failed' then now() else null end
  where id = p_execution_id
    and status in ('queued', 'running', 'retry_scheduled');
  return found;
end;
$$;

create function app_workflow_cancel(p_execution_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  org_id uuid;
  actor_role text;
begin
  select status, organization_id into current_status, org_id
  from workflow_executions
  where id = p_execution_id
  for update;
  actor_role := app_org_role(org_id);
  if current_status is null or actor_role is null then
    raise exception 'workflow execution was not found';
  end if;
  if actor_role not in ('owner', 'admin', 'editor') then
    raise exception 'workflow change is not permitted';
  end if;
  if current_status in ('queued', 'retry_scheduled') then
    update jobs
    set status = 'succeeded',
        last_error = 'The execution was cancelled.',
        locked_by = null,
        locked_at = null,
        updated_at = now()
    where type = 'workflow.execute'
      and payload->>'executionId' = p_execution_id::text
      and status in ('pending', 'failed');
    if found then
      update workflow_executions
      set status = 'cancelled',
          cancel_requested_at = now(),
          finished_at = now(),
          next_retry_at = null,
          error = 'The execution was cancelled.'
      where id = p_execution_id;
      return 'cancelled';
    end if;
  end if;
  if current_status in ('queued', 'retry_scheduled', 'running') then
    -- A worker holds the job. It checks this flag before each step.
    update workflow_executions
    set cancel_requested_at = coalesce(cancel_requested_at, now())
    where id = p_execution_id;
    return 'cancel_requested';
  end if;
  return current_status;
end;
$$;

create function app_workflow_manual_retry(p_execution_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  execution record;
  actor_role text;
begin
  select * into execution
  from workflow_executions
  where id = p_execution_id
  for update;
  if not found then
    raise exception 'workflow execution was not found';
  end if;
  actor_role := app_org_role(execution.organization_id);
  if actor_role is null then
    raise exception 'workflow execution was not found';
  end if;
  if actor_role not in ('owner', 'admin', 'editor') then
    raise exception 'workflow change is not permitted';
  end if;
  if execution.status <> 'failed' then
    raise exception 'only failed executions can be retried';
  end if;
  if execution.manual_retry_count >= 3 then
    raise exception 'workflow retry limit reached';
  end if;
  if execution.trigger_type is distinct from 'test' and not exists (
    select 1 from workflows where id = execution.workflow_id and status = 'active'
  ) then
    raise exception 'workflow is not active';
  end if;
  update workflow_executions
  set status = 'retry_scheduled',
      manual_retry_count = manual_retry_count + 1,
      dead_lettered_at = null,
      cancel_requested_at = null,
      error = null,
      finished_at = null,
      next_retry_at = now(),
      deadline_at = now() + interval '15 minutes'
  where id = p_execution_id;
  update jobs
  set status = 'pending',
      attempts = 0,
      run_after = now(),
      last_error = null,
      locked_by = null,
      locked_at = null,
      updated_at = now()
  where type = 'workflow.execute'
    and payload->>'executionId' = p_execution_id::text
    and status in ('dead', 'failed', 'succeeded');
  if not found then
    insert into jobs (tenant_id, type, payload, status, max_attempts)
    values (
      execution.organization_id,
      'workflow.execute',
      jsonb_build_object('executionId', execution.id),
      'pending',
      5
    );
  end if;
  return 'retry_scheduled';
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
    and version.definition->'nodes' @> '[{"type": "webhook"}]'::jsonb
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
  -- Signatures older than the five-minute skew window are rejected before this point,
  -- so nonces past fifteen minutes cannot be replayed and can be dropped.
  delete from workflow_webhook_nonces where seen_at < now() - interval '15 minutes';
  insert into workflow_webhook_nonces (workflow_id, nonce)
  values (p_workflow_id, p_nonce)
  on conflict do nothing;
  return found;
end;
$$;

drop function app_due_workflow_schedules();
drop function app_schedule_workflow_next(uuid, integer);

-- Advances each due schedule and queues its execution in one transaction,
-- so a crash cannot advance a schedule without queuing it, or queue it twice.
-- Missed slots while no worker ran are not backfilled.
create function app_dispatch_due_workflow_schedules(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  due record;
  queued integer := 0;
begin
  for due in
    select job.id, job.organization_id, job.workflow_id, version.id as version_id,
           coalesce(job.next_run_at, now()) as slot,
           split_part(job.cron, ':', 2)::int as minutes
    from scheduled_jobs job
    join workflows workflow on workflow.id = job.workflow_id and workflow.status = 'active'
    join workflow_versions version on version.workflow_id = job.workflow_id and version.status = 'published'
    where job.status = 'active'
      and job.cron ~ '^interval:[0-9]{1,4}$'
      and (job.next_run_at is null or job.next_run_at <= now())
    order by job.next_run_at nulls first
    limit greatest(least(coalesce(p_limit, 25), 100), 1)
    for update of job skip locked
  loop
    update scheduled_jobs
    set next_run_at = now() + make_interval(mins => due.minutes), updated_at = now()
    where id = due.id;
    begin
      perform app_enqueue_workflow_execution(
        due.organization_id,
        due.workflow_id,
        due.version_id,
        'schedule',
        jsonb_build_object('scheduledAt', due.slot),
        'schedule:' || due.workflow_id::text || ':' || to_char(due.slot at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'),
        false
      );
      queued := queued + 1;
    exception when others then
      raise warning 'workflow schedule % was skipped: %', due.id, sqlerrm;
    end;
  end loop;
  return queued;
end;
$$;

revoke all on function app_workflow_heartbeat(uuid, text) from public;
revoke all on function app_workflow_execution_state(uuid) from public;
revoke all on function app_workflow_mark_running(uuid) from public;
revoke all on function app_workflow_log_step(uuid, text, text, jsonb, text, integer, timestamptz, integer) from public;
revoke all on function app_workflow_settle_execution(uuid, text, jsonb, text, integer) from public;
revoke all on function app_workflow_cancel(uuid) from public;
revoke all on function app_workflow_manual_retry(uuid) from public;
revoke all on function app_dispatch_due_workflow_schedules(integer) from public;

grant execute on function app_workflow_heartbeat(uuid, text) to cognera_app;
grant execute on function app_workflow_execution_state(uuid) to cognera_app;
grant execute on function app_workflow_mark_running(uuid) to cognera_app;
grant execute on function app_workflow_log_step(uuid, text, text, jsonb, text, integer, timestamptz, integer) to cognera_app;
grant execute on function app_workflow_settle_execution(uuid, text, jsonb, text, integer) to cognera_app;
grant execute on function app_workflow_cancel(uuid) to cognera_app;
grant execute on function app_workflow_manual_retry(uuid) to cognera_app;
grant execute on function app_dispatch_due_workflow_schedules(integer) to cognera_app;
