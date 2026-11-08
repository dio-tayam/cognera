-- Local application role. cognera_local_app is a development and CI password only.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cognera_app') then
    create role cognera_app login password 'cognera_local_app'
      nosuperuser nobypassrls nocreatedb nocreaterole;
  end if;
end
$$;

revoke create on schema public from public;
grant usage on schema public to cognera_app;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

create table tenant_members (
  tenant_id uuid not null references tenants (id),
  user_id text not null check (char_length(btrim(user_id)) > 0),
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table tenants enable row level security;
alter table tenants force row level security;
alter table tenant_members enable row level security;
alter table tenant_members force row level security;

create policy tenants_isolation on tenants
  using (id::text = current_setting('app.tenant_id', true))
  with check (id::text = current_setting('app.tenant_id', true));

create policy tenant_members_isolation on tenant_members
  using (
    tenant_id::text = current_setting('app.tenant_id', true)
    and user_id = current_setting('app.user_id', true)
  )
  with check (
    tenant_id::text = current_setting('app.tenant_id', true)
    and user_id = current_setting('app.user_id', true)
  );

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

  perform set_config('app.tenant_id', p_tenant_id::text, true);
  perform set_config('app.user_id', p_user_id, true);
end;
$$;

revoke all on function app_set_context(uuid, text) from public;
grant execute on function app_set_context(uuid, text) to cognera_app;
grant select, insert, update, delete on tenants, tenant_members to cognera_app;
grant select on schema_migrations to cognera_app;
