alter table leads
  add column company text,
  add column phone text,
  add column source text not null default 'manual',
  add column owner_id text,
  add column archived_from text;

alter table leads
  add constraint leads_company_length check (company is null or char_length(btrim(company)) between 1 and 200),
  add constraint leads_phone_shape check (phone is null or phone ~ '^[0-9+(). -]{3,40}$'),
  add constraint leads_source_check check (source in ('manual', 'contact_form', 'referral', 'import', 'other')),
  add constraint leads_owner_length check (owner_id is null or char_length(btrim(owner_id)) > 0),
  add constraint leads_archived_from_check check (
    archived_from is null or archived_from in ('new', 'contacted', 'qualified')
  ),
  add constraint leads_archive_state check (
    (status = 'archived' and archived_from is not null)
    or (status <> 'archived' and archived_from is null)
  );

create unique index leads_organization_email_key on leads (organization_id, lower(email));
create index leads_organization_status_idx on leads (organization_id, status);

create or replace function app_record_audit(
  p_organization_id uuid,
  p_actor text,
  p_action text,
  p_entity text,
  p_entity_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.audit_system', true) is distinct from '1' then
    if auth.uid() is not null and auth.uid()::text is distinct from p_actor then
      raise exception 'user id does not match the session';
    end if;
    if not exists (
      select 1
      from organization_members
      where organization_id = p_organization_id
        and user_id = p_actor
    ) then
      raise exception 'audit actor is not a member';
    end if;
  end if;

  insert into audit_logs (organization_id, actor_id, action, entity, entity_id)
  values (p_organization_id, p_actor, p_action, p_entity, p_entity_id);
end;
$$;

create or replace function app_capture_public_lead(
  p_organization_id uuid,
  p_name text,
  p_email text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_id uuid;
begin
  if not exists (select 1 from organizations where id = p_organization_id) then
    raise exception 'contact organization is not configured';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 2 then
    raise exception 'contact name is invalid';
  end if;
  if p_email is null or position('@' in p_email) < 2 then
    raise exception 'contact email is invalid';
  end if;
  if p_message is null or char_length(btrim(p_message)) < 10 or char_length(p_message) > 5000 then
    raise exception 'contact message is invalid';
  end if;

  perform set_config('app.audit_system', '1', true);
  insert into leads (organization_id, name, email, source, status)
  values (p_organization_id, btrim(p_name), lower(btrim(p_email)), 'contact_form', 'new')
  returning id into lead_id;

  insert into lead_notes (organization_id, lead_id, body, author_id)
  values (p_organization_id, lead_id, btrim(p_message), 'public');
  perform app_record_audit(p_organization_id, 'public', 'lead.created', 'lead', lead_id::text);
exception
  when unique_violation then
    select id into lead_id
    from leads
    where organization_id = p_organization_id
      and lower(email) = lower(btrim(p_email));
    if lead_id is null then
      raise;
    end if;
    perform set_config('app.audit_system', '1', true);
    insert into lead_notes (organization_id, lead_id, body, author_id)
    values (p_organization_id, lead_id, btrim(p_message), 'public');
    perform app_record_audit(p_organization_id, 'public', 'lead.note_created', 'lead', lead_id::text);
end;
$$;

revoke all on function app_record_audit(uuid, text, text, text, text) from public;
revoke all on function app_capture_public_lead(uuid, text, text, text) from public;
grant execute on function app_record_audit(uuid, text, text, text, text) to cognera_app;
grant execute on function app_capture_public_lead(uuid, text, text, text) to cognera_app;
