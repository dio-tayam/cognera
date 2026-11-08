-- Product records and organization membership.
-- Local Postgres checks membership through app.user_id, which withTenant sets
-- only after app_set_context confirms tenant_members. Supabase Auth uses auth.uid().
-- This file does not create a login role and does not store a password.

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
  end if;
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute $fn$
      create function auth.uid() returns uuid
      language sql
      stable
      as $body$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $body$
    $fn$;
  end if;
end
$$;

alter table tenant_members drop constraint tenant_members_role_check;
alter table tenant_members
  add constraint tenant_members_role_check
  check (role in ('owner', 'admin', 'editor', 'member'));

create or replace function app_set_context(p_tenant_id uuid, p_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or char_length(btrim(p_user_id)) = 0 then
    raise exception 'user id is required';
  end if;

  if not exists (
    select 1
    from tenant_members
    where tenant_id = p_tenant_id
      and user_id = p_user_id
  ) then
    raise exception 'user is not a member of this tenant';
  end if;

  if exists (select 1 from organizations where id = p_tenant_id)
    and not exists (
      select 1
      from organization_members
      where organization_id = p_tenant_id
        and user_id = p_user_id
    ) then
    raise exception 'user is not a member of this tenant';
  end if;

  perform set_config('app.tenant_id', p_tenant_id::text, true);
  perform set_config('app.user_id', p_user_id, true);
end;
$$;

create table profiles (
  id text primary key check (char_length(btrim(id)) > 0),
  email text,
  display_name text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_shape check (email is null or position('@' in email) > 1)
);

create table organizations (
  id uuid primary key references tenants (id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index organizations_slug_key on organizations (slug);

create table organization_members (
  organization_id uuid not null references organizations (id),
  user_id text not null check (char_length(btrim(user_id)) > 0),
  role text not null check (role in ('owner', 'admin', 'editor', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_idx on organization_members (user_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  email text not null check (position('@' in email) > 1),
  role text not null check (role in ('admin', 'editor', 'member')),
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by text not null,
  expires_at timestamptz not null,
  accepted_by text,
  created_at timestamptz not null default now()
);

create unique index invitations_token_hash_key on invitations (token_hash);
create index invitations_organization_idx on invitations (organization_id);
create unique index invitations_pending_email_key
  on invitations (organization_id, lower(email))
  where status = 'pending';

create table leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  name text not null check (char_length(btrim(name)) > 0),
  email text not null check (position('@' in email) > 1),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_organization_idx on leads (organization_id);
create unique index leads_id_organization_key on leads (id, organization_id);

create table lead_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  body text not null check (char_length(btrim(body)) > 0),
  author_id text not null,
  created_at timestamptz not null default now(),
  constraint lead_notes_lead_organization_fk
    foreign key (lead_id, organization_id) references leads (id, organization_id)
);

create index lead_notes_organization_idx on lead_notes (organization_id);
create index lead_notes_lead_idx on lead_notes (lead_id);

create table workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  name text not null check (char_length(btrim(name)) > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workflows_organization_idx on workflows (organization_id);
create unique index workflows_id_organization_key on workflows (id, organization_id);

create table workflow_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_id uuid not null,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workflow_id, version_number),
  foreign key (workflow_id, organization_id) references workflows (id, organization_id)
);

create unique index workflow_versions_id_organization_key on workflow_versions (id, organization_id);
create index workflow_versions_organization_idx on workflow_versions (organization_id);

create table workflow_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  version_id uuid not null,
  position integer not null check (position > 0),
  step_key text not null check (step_key ~ '^[a-z0-9_]+$'),
  kind text not null check (kind in ('task', 'condition', 'wait')),
  created_at timestamptz not null default now(),
  unique (version_id, position),
  unique (version_id, step_key),
  foreign key (version_id, organization_id) references workflow_versions (id, organization_id)
);

create index workflow_steps_organization_idx on workflow_steps (organization_id);

create table workflow_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_id uuid not null,
  version_id uuid not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workflow_id, organization_id) references workflows (id, organization_id),
  foreign key (version_id, organization_id) references workflow_versions (id, organization_id)
);

create index workflow_executions_organization_idx on workflow_executions (organization_id);

create table scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_id uuid not null,
  cron text not null check (char_length(btrim(cron)) > 0),
  status text not null default 'paused' check (status in ('active', 'paused')),
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workflow_id, organization_id) references workflows (id, organization_id)
);

create index scheduled_jobs_organization_idx on scheduled_jobs (organization_id);

create table cms_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  title text not null check (char_length(btrim(title)) > 0),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index cms_pages_organization_idx on cms_pages (organization_id);
create unique index cms_pages_id_organization_key on cms_pages (id, organization_id);

create table cms_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  title text not null check (char_length(btrim(title)) > 0),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  body text not null default '',
  category_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index cms_posts_organization_idx on cms_posts (organization_id);
create unique index cms_posts_id_organization_key on cms_posts (id, organization_id);

create table cms_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  name text not null check (char_length(btrim(name)) > 0),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create unique index cms_categories_id_organization_key on cms_categories (id, organization_id);
create index cms_categories_organization_idx on cms_categories (organization_id);

alter table cms_posts
  add constraint cms_posts_category_fk
  foreign key (category_id, organization_id) references cms_categories (id, organization_id);

create table cms_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  name text not null check (char_length(btrim(name)) > 0),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index cms_tags_organization_idx on cms_tags (organization_id);
create unique index cms_tags_id_organization_key on cms_tags (id, organization_id);

create table cms_post_tags (
  organization_id uuid not null,
  post_id uuid not null,
  tag_id uuid not null,
  primary key (post_id, tag_id),
  foreign key (post_id, organization_id) references cms_posts (id, organization_id),
  foreign key (tag_id, organization_id) references cms_tags (id, organization_id)
);

create table cms_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  target_type text not null check (target_type in ('page', 'post')),
  target_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index cms_revisions_organization_idx on cms_revisions (organization_id);
create index cms_revisions_target_idx on cms_revisions (target_type, target_id);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  filename text not null check (char_length(btrim(filename)) > 0),
  storage_path text,
  status text not null default 'pending' check (status in ('pending', 'stored', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index media_assets_organization_idx on media_assets (organization_id);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  provider text not null check (provider ~ '^[a-z0-9_]+$'),
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error')),
  secret_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider),
  constraint integrations_secret_ref_shape check (
    secret_ref is null or secret_ref ~ '^[a-z0-9_.:-]{1,200}$'
  )
);

create index integrations_organization_idx on integrations (organization_id);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  actor_id text not null,
  action text not null check (action ~ '^[a-z0-9_.]+$'),
  entity text not null,
  entity_id text,
  created_at timestamptz not null default now()
);

create index audit_logs_organization_idx on audit_logs (organization_id, created_at);

create table usage_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id),
  metric text not null check (metric ~ '^[a-z0-9_.]+$'),
  quantity integer not null check (quantity >= 0),
  recorded_on date not null,
  created_at timestamptz not null default now()
);

create index usage_records_organization_idx on usage_records (organization_id, recorded_on);

create table auth_rate_limits (
  bucket text primary key check (char_length(bucket) between 16 and 128),
  attempts integer not null check (attempts >= 0),
  window_started_at timestamptz not null
);

create or replace function app_actor_id()
returns text
language sql
stable
as $$
  select coalesce(auth.uid()::text, nullif(current_setting('app.user_id', true), ''));
$$;

create or replace function app_org_role(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from organization_members
  where organization_id = p_organization_id
    and user_id = app_actor_id();
$$;

create or replace function app_org_visible(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_org_role(p_organization_id) is not null;
$$;

create or replace function app_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app_lock_organization()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'organization cannot be reassigned';
  end if;
  return new;
end;
$$;

create or replace function app_sync_member_to_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.member_sync', '1', true);
  if tg_op = 'DELETE' then
    delete from tenant_members
    where tenant_id = old.organization_id
      and user_id = old.user_id;
    return old;
  end if;

  insert into tenant_members (tenant_id, user_id, role)
  values (new.organization_id, new.user_id, new.role)
  on conflict (tenant_id, user_id) do update set role = excluded.role;
  return new;
end;
$$;

create trigger organization_members_sync
  after insert or update or delete on organization_members
  for each row execute function app_sync_member_to_tenant();

create or replace function app_reject_direct_tenant_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
    and current_setting('app.member_sync', true) is distinct from '1' then
    raise exception 'change membership through organization_members';
  end if;
  return new;
end;
$$;

create trigger tenant_members_role_guard
  before update on tenant_members
  for each row execute function app_reject_direct_tenant_role_change();

create or replace function app_guard_membership()
returns trigger
language plpgsql
as $$
declare
  actor_role text;
begin
  if current_setting('app.member_sync', true) = '1'
    or current_setting('app.invitation_accept', true) = '1' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.user_id = old.user_id and new.role = old.role then
    return new;
  end if;

  actor_role := app_org_role(case when tg_op = 'DELETE' then old.organization_id else new.organization_id end);

  if tg_op = 'UPDATE' and old.user_id = app_actor_id() and new.role is distinct from old.role then
    raise exception 'you cannot change your own role';
  end if;

  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'membership change is not permitted';
  end if;

  if tg_op <> 'DELETE' and new.role = 'owner' and actor_role <> 'owner' then
    raise exception 'only an owner can grant the owner role';
  end if;

  if tg_op = 'UPDATE' and old.role = 'owner' and actor_role <> 'owner' then
    raise exception 'only an owner can change an owner';
  end if;

  if tg_op = 'DELETE' and old.role = 'owner' and actor_role <> 'owner' then
    raise exception 'only an owner can remove an owner';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger organization_members_guard
  before insert or update or delete on organization_members
  for each row execute function app_guard_membership();

create or replace function app_guard_invitation()
returns trigger
language plpgsql
as $$
declare
  actor_role text;
begin
  if current_setting('app.invitation_accept', true) = '1' then
    return new;
  end if;

  actor_role := app_org_role(new.organization_id);
  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'invitation change is not permitted';
  end if;

  if tg_op = 'INSERT' and new.role = 'owner' then
    raise exception 'the owner role cannot be invited';
  end if;

  if tg_op = 'UPDATE' and new.status = 'accepted' then
    raise exception 'invitations are accepted with a token';
  end if;

  return new;
end;
$$;

create trigger invitations_guard
  before insert or update on invitations
  for each row execute function app_guard_invitation();

create or replace function app_create_organization(p_name text, p_slug text, p_user_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  if auth.uid() is not null and auth.uid()::text is distinct from p_user_id then
    raise exception 'user id does not match the session';
  end if;
  if p_user_id is null or char_length(btrim(p_user_id)) = 0 then
    raise exception 'user id is required';
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'organization name is required';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'organization slug is invalid';
  end if;

  insert into tenants (id, name) values (new_id, btrim(p_name));
  insert into organizations (id, name, slug) values (new_id, btrim(p_name), p_slug);
  perform set_config('app.member_sync', '1', true);
  insert into organization_members (organization_id, user_id, role)
  values (new_id, p_user_id, 'owner');
  insert into profiles (id)
  values (p_user_id)
  on conflict (id) do nothing;
  return new_id;
end;
$$;

create or replace function app_set_member_role(
  p_organization_id uuid,
  p_user_id text,
  p_role text,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid()::text is distinct from p_actor then
    raise exception 'user id does not match the session';
  end if;
  perform set_config('app.user_id', p_actor, true);
  update organization_members
  set role = p_role
  where organization_id = p_organization_id
    and user_id = p_user_id;
  if not found then
    raise exception 'member was not found';
  end if;
end;
$$;

create or replace function app_create_invitation(
  p_organization_id uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_actor text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid := gen_random_uuid();
  actor_role text;
begin
  if auth.uid() is not null and auth.uid()::text is distinct from p_actor then
    raise exception 'user id does not match the session';
  end if;
  perform set_config('app.user_id', p_actor, true);
  actor_role := app_org_role(p_organization_id);
  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'invitation change is not permitted';
  end if;
  if p_role not in ('admin', 'editor', 'member') then
    raise exception 'invitation role is invalid';
  end if;

  insert into invitations (
    id, organization_id, email, role, token_hash, invited_by, expires_at
  ) values (
    new_id, p_organization_id, lower(btrim(p_email)), p_role, p_token_hash, p_actor, p_expires_at
  );
  return new_id;
end;
$$;

create or replace function app_accept_invitation(
  p_token_hash text,
  p_user_id text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite invitations%rowtype;
begin
  if auth.uid() is not null and auth.uid()::text is distinct from p_user_id then
    raise exception 'user id does not match the session';
  end if;
  if p_email is null or position('@' in p_email) < 2 then
    raise exception 'invitation email is invalid';
  end if;

  select * into invite
  from invitations
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'invitation was not found';
  end if;
  if invite.status <> 'pending' then
    raise exception 'invitation is no longer pending';
  end if;
  if invite.expires_at <= now() then
    update invitations set status = 'expired' where id = invite.id;
    raise exception 'invitation has expired';
  end if;
  if lower(invite.email) <> lower(btrim(p_email)) then
    raise exception 'invitation email does not match the account';
  end if;

  perform set_config('app.invitation_accept', '1', true);
  perform set_config('app.member_sync', '1', true);
  insert into organization_members (organization_id, user_id, role)
  values (invite.organization_id, p_user_id, invite.role)
  on conflict (organization_id, user_id) do nothing;
  update invitations
  set status = 'accepted', accepted_by = p_user_id
  where id = invite.id;
  insert into profiles (id, email)
  values (p_user_id, lower(btrim(p_email)))
  on conflict (id) do update set email = excluded.email
  where profiles.email is null;
  return invite.organization_id;
end;
$$;

create or replace function app_delete_account(p_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid()::text is distinct from p_user_id then
    raise exception 'user id does not match the session';
  end if;
  if exists (
    select 1
    from organization_members owner_row
    where owner_row.user_id = p_user_id
      and owner_row.role = 'owner'
      and not exists (
        select 1
        from organization_members other_owner
        where other_owner.organization_id = owner_row.organization_id
          and other_owner.user_id <> p_user_id
          and other_owner.role = 'owner'
      )
  ) then
    raise exception 'transfer ownership before deleting this account';
  end if;

  perform set_config('app.member_sync', '1', true);
  delete from organization_members where user_id = p_user_id;
  update profiles
  set deleted_at = now(), email = null, display_name = null
  where id = p_user_id;
end;
$$;

create or replace function app_organizations_for_user(p_user_id text)
returns table (id uuid, name text, role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid()::text is distinct from p_user_id then
    raise exception 'user id does not match the session';
  end if;
  if p_user_id is null or char_length(btrim(p_user_id)) = 0 then
    raise exception 'user id is required';
  end if;

  return query
  select organizations.id, organizations.name, organization_members.role
  from organization_members
  join organizations on organizations.id = organization_members.organization_id
  where organization_members.user_id = p_user_id
  order by organizations.name;
end;
$$;

create or replace function app_update_profile(p_user_id text, p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid()::text is distinct from p_user_id then
    raise exception 'user id does not match the session';
  end if;
  if p_display_name is null or char_length(btrim(p_display_name)) < 2 then
    raise exception 'display name is required';
  end if;

  insert into profiles (id, display_name)
  values (p_user_id, btrim(p_display_name))
  on conflict (id) do update
  set display_name = excluded.display_name
  where profiles.deleted_at is null;
end;
$$;

create or replace function app_consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attempts integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'rate limit configuration is invalid';
  end if;

  insert into auth_rate_limits (bucket, attempts, window_started_at)
  values (p_bucket, 1, now())
  on conflict (bucket) do update
  set
    attempts = case
      when auth_rate_limits.window_started_at < now() - (p_window_seconds * interval '1 second') then 1
      else auth_rate_limits.attempts + 1
    end,
    window_started_at = case
      when auth_rate_limits.window_started_at < now() - (p_window_seconds * interval '1 second') then now()
      else auth_rate_limits.window_started_at
    end
  returning attempts into current_attempts;

  return current_attempts <= p_limit;
end;
$$;

create trigger profiles_touch before update on profiles
  for each row execute function app_touch_updated_at();
create trigger organizations_touch before update on organizations
  for each row execute function app_touch_updated_at();
create trigger leads_touch before update on leads
  for each row execute function app_touch_updated_at();
create trigger workflows_touch before update on workflows
  for each row execute function app_touch_updated_at();
create trigger scheduled_jobs_touch before update on scheduled_jobs
  for each row execute function app_touch_updated_at();
create trigger cms_pages_touch before update on cms_pages
  for each row execute function app_touch_updated_at();
create trigger cms_posts_touch before update on cms_posts
  for each row execute function app_touch_updated_at();
create trigger media_assets_touch before update on media_assets
  for each row execute function app_touch_updated_at();
create trigger integrations_touch before update on integrations
  for each row execute function app_touch_updated_at();

do $$
declare
  content_table text;
  admin_table text;
begin
  foreach content_table in array array[
    'leads',
    'lead_notes',
    'workflows',
    'workflow_versions',
    'workflow_steps',
    'workflow_executions',
    'cms_pages',
    'cms_posts',
    'cms_revisions',
    'cms_categories',
    'cms_tags',
    'cms_post_tags',
    'media_assets'
  ]
  loop
    execute format('alter table %I enable row level security', content_table);
    execute format('alter table %I force row level security', content_table);
    execute format(
      'create trigger %I before update on %I for each row execute function app_lock_organization()',
      content_table || '_lock_org',
      content_table
    );
    execute format(
      'create policy %I on %I for select using (app_org_visible(organization_id))',
      content_table || '_select',
      content_table
    );
    execute format(
      'create policy %I on %I for insert with check (app_org_role(organization_id) in (''owner'', ''admin'', ''editor''))',
      content_table || '_insert',
      content_table
    );
    execute format(
      'create policy %I on %I for update using (app_org_role(organization_id) in (''owner'', ''admin'', ''editor'')) with check (app_org_role(organization_id) in (''owner'', ''admin'', ''editor''))',
      content_table || '_update',
      content_table
    );
    execute format(
      'create policy %I on %I for delete using (app_org_role(organization_id) in (''owner'', ''admin''))',
      content_table || '_delete',
      content_table
    );
    execute format('grant select, insert, update, delete on %I to cognera_app', content_table);
  end loop;

  foreach admin_table in array array['invitations', 'integrations', 'scheduled_jobs']
  loop
    execute format('alter table %I enable row level security', admin_table);
    execute format('alter table %I force row level security', admin_table);
    execute format(
      'create trigger %I before update on %I for each row execute function app_lock_organization()',
      admin_table || '_lock_org',
      admin_table
    );
    execute format(
      'create policy %I on %I for select using (app_org_visible(organization_id))',
      admin_table || '_select',
      admin_table
    );
    execute format(
      'create policy %I on %I for insert with check (app_org_role(organization_id) in (''owner'', ''admin''))',
      admin_table || '_insert',
      admin_table
    );
    execute format(
      'create policy %I on %I for update using (app_org_role(organization_id) in (''owner'', ''admin'')) with check (app_org_role(organization_id) in (''owner'', ''admin''))',
      admin_table || '_update',
      admin_table
    );
    execute format(
      'create policy %I on %I for delete using (app_org_role(organization_id) in (''owner'', ''admin''))',
      admin_table || '_delete',
      admin_table
    );
    execute format('grant select, insert, update, delete on %I to cognera_app', admin_table);
  end loop;
end
$$;

alter table organizations enable row level security;
alter table organizations force row level security;
alter table organization_members enable row level security;
alter table organization_members force row level security;
alter table profiles enable row level security;
alter table profiles force row level security;
alter table audit_logs enable row level security;
alter table audit_logs force row level security;
alter table usage_records enable row level security;
alter table usage_records force row level security;
alter table auth_rate_limits enable row level security;
alter table auth_rate_limits force row level security;

create policy organizations_select on organizations
  for select using (app_org_visible(id));
create policy organizations_update on organizations
  for update using (app_org_role(id) in ('owner', 'admin'))
  with check (app_org_role(id) in ('owner', 'admin'));
create policy organizations_delete on organizations
  for delete using (app_org_role(id) = 'owner');

create policy organization_members_select on organization_members
  for select using (app_org_visible(organization_id));
create policy organization_members_insert on organization_members
  for insert with check (app_org_role(organization_id) in ('owner', 'admin') or current_setting('app.invitation_accept', true) = '1');
create policy organization_members_update on organization_members
  for update
  using (
    app_org_visible(organization_id)
    and (
      app_org_role(organization_id) in ('owner', 'admin')
      or user_id = app_actor_id()
    )
  )
  with check (app_org_visible(organization_id));
create policy organization_members_delete on organization_members
  for delete using (app_org_role(organization_id) in ('owner', 'admin'));

create policy profiles_select on profiles
  for select using (id = app_actor_id());
create policy profiles_insert on profiles
  for insert with check (id = app_actor_id());
create policy profiles_update on profiles
  for update using (id = app_actor_id()) with check (id = app_actor_id());

create policy audit_logs_select on audit_logs
  for select using (app_org_visible(organization_id));
create policy usage_records_select on usage_records
  for select using (app_org_visible(organization_id));

grant select, update, delete on organizations to cognera_app;
grant select, insert, update, delete on organization_members to cognera_app;
grant select, insert, update on profiles to cognera_app;
grant select on audit_logs, usage_records to cognera_app;

revoke all on function app_actor_id() from public;
revoke all on function app_org_role(uuid) from public;
revoke all on function app_org_visible(uuid) from public;
revoke all on function app_create_organization(text, text, text) from public;
revoke all on function app_set_member_role(uuid, text, text, text) from public;
revoke all on function app_create_invitation(uuid, text, text, text, text, timestamptz) from public;
revoke all on function app_accept_invitation(text, text, text) from public;
revoke all on function app_delete_account(text) from public;
revoke all on function app_organizations_for_user(text) from public;
revoke all on function app_update_profile(text, text) from public;
revoke all on function app_consume_rate_limit(text, integer, integer) from public;

grant execute on function app_actor_id() to cognera_app;
grant execute on function app_org_role(uuid) to cognera_app;
grant execute on function app_org_visible(uuid) to cognera_app;
grant execute on function app_create_organization(text, text, text) to cognera_app;
grant execute on function app_set_member_role(uuid, text, text, text) to cognera_app;
grant execute on function app_create_invitation(uuid, text, text, text, text, timestamptz) to cognera_app;
grant execute on function app_accept_invitation(text, text, text) to cognera_app;
grant execute on function app_delete_account(text) to cognera_app;
grant execute on function app_organizations_for_user(text) to cognera_app;
grant execute on function app_update_profile(text, text) to cognera_app;
grant execute on function app_consume_rate_limit(text, integer, integer) to cognera_app;
