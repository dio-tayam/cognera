alter table cms_pages drop constraint cms_pages_status_check;
alter table cms_pages
  add constraint cms_pages_status_check
  check (status in ('draft', 'review', 'scheduled', 'published', 'archived'));

alter table cms_posts drop constraint cms_posts_status_check;
alter table cms_posts
  add constraint cms_posts_status_check
  check (status in ('draft', 'review', 'scheduled', 'published', 'archived'));

alter table cms_pages
  add column excerpt text,
  add column author_id text,
  add column category_id uuid,
  add column featured_media_id uuid,
  add column seo_title text,
  add column meta_description text,
  add column canonical_url text,
  add column publish_at timestamptz,
  add column published_at timestamptz;

alter table cms_posts
  add column excerpt text,
  add column author_id text,
  add column featured_media_id uuid,
  add column seo_title text,
  add column meta_description text,
  add column canonical_url text,
  add column publish_at timestamptz,
  add column published_at timestamptz;

alter table cms_pages
  add constraint cms_pages_excerpt_length check (excerpt is null or char_length(excerpt) <= 300),
  add constraint cms_pages_seo_title_length check (seo_title is null or char_length(seo_title) <= 70),
  add constraint cms_pages_meta_length check (meta_description is null or char_length(meta_description) <= 160),
  add constraint cms_pages_canonical_url check (canonical_url is null or canonical_url ~ '^https://'),
  add constraint cms_pages_schedule_check check (status <> 'scheduled' or publish_at is not null);

alter table cms_posts
  add constraint cms_posts_excerpt_length check (excerpt is null or char_length(excerpt) <= 300),
  add constraint cms_posts_seo_title_length check (seo_title is null or char_length(seo_title) <= 70),
  add constraint cms_posts_meta_length check (meta_description is null or char_length(meta_description) <= 160),
  add constraint cms_posts_canonical_url check (canonical_url is null or canonical_url ~ '^https://'),
  add constraint cms_posts_schedule_check check (status <> 'scheduled' or publish_at is not null);

create unique index media_assets_id_organization_key on media_assets (id, organization_id);

alter table media_assets
  add column content_type text,
  add column byte_size integer check (byte_size is null or byte_size >= 0);

alter table cms_pages
  add constraint cms_pages_category_fk
  foreign key (category_id, organization_id) references cms_categories (id, organization_id);

alter table cms_pages
  add constraint cms_pages_featured_fk
  foreign key (featured_media_id, organization_id) references media_assets (id, organization_id);

alter table cms_posts
  add constraint cms_posts_featured_fk
  foreign key (featured_media_id, organization_id) references media_assets (id, organization_id);

create table cms_page_tags (
  organization_id uuid not null,
  page_id uuid not null,
  tag_id uuid not null,
  primary key (page_id, tag_id),
  foreign key (page_id, organization_id) references cms_pages (id, organization_id),
  foreign key (tag_id, organization_id) references cms_tags (id, organization_id)
);

alter table cms_page_tags enable row level security;
alter table cms_page_tags force row level security;
create policy cms_page_tags_select on cms_page_tags for select using (app_org_visible(organization_id));
create policy cms_page_tags_insert on cms_page_tags for insert with check (app_org_role(organization_id) in ('owner', 'admin', 'editor'));
create policy cms_page_tags_update on cms_page_tags for update using (app_org_role(organization_id) in ('owner', 'admin', 'editor')) with check (app_org_role(organization_id) in ('owner', 'admin', 'editor'));
create policy cms_page_tags_delete on cms_page_tags for delete using (app_org_role(organization_id) in ('owner', 'admin', 'editor'));
drop policy cms_post_tags_delete on cms_post_tags;
create policy cms_post_tags_delete on cms_post_tags for delete using (app_org_role(organization_id) in ('owner', 'admin', 'editor'));
grant select, insert, update, delete on cms_page_tags to cognera_app;

create or replace function app_guard_cms_status()
returns trigger
language plpgsql
as $$
declare
  actor_role text := app_org_role(new.organization_id);
begin
  if actor_role in ('owner', 'admin') then
    return new;
  end if;
  if actor_role is null and nullif(current_setting('app.user_id', true), '') is null then
    return new;
  end if;
  if new.status in ('published', 'scheduled', 'archived') then
    raise exception 'publishing is not permitted';
  end if;
  if tg_op = 'UPDATE' and old.status in ('published', 'scheduled', 'archived') then
    raise exception 'publishing is not permitted';
  end if;
  return new;
end;
$$;

create trigger cms_pages_status_guard
  before insert or update on cms_pages
  for each row execute function app_guard_cms_status();

create trigger cms_posts_status_guard
  before insert or update on cms_posts
  for each row execute function app_guard_cms_status();

create or replace function app_content_is_public(p_status text, p_publish_at timestamptz)
returns boolean
language sql
stable
as $$
  select (p_status = 'published' and (p_publish_at is null or p_publish_at <= now()))
    or (p_status = 'scheduled' and p_publish_at is not null and p_publish_at <= now());
$$;

create or replace function app_public_pages(p_organization_id uuid)
returns table (
  id uuid,
  slug text,
  title text,
  excerpt text,
  body text,
  seo_title text,
  meta_description text,
  canonical_url text,
  featured_media_id uuid,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, slug, title, excerpt, body, seo_title, meta_description, canonical_url, featured_media_id, published_at, updated_at
  from cms_pages
  where organization_id = p_organization_id
    and app_content_is_public(status, publish_at);
$$;

create or replace function app_public_page(p_organization_id uuid, p_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  excerpt text,
  body text,
  seo_title text,
  meta_description text,
  canonical_url text,
  featured_media_id uuid,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, slug, title, excerpt, body, seo_title, meta_description, canonical_url, featured_media_id, published_at, updated_at
  from cms_pages
  where organization_id = p_organization_id
    and slug = p_slug
    and app_content_is_public(status, publish_at);
$$;

create or replace function app_public_posts(p_organization_id uuid)
returns table (
  id uuid,
  slug text,
  title text,
  excerpt text,
  body text,
  seo_title text,
  meta_description text,
  canonical_url text,
  featured_media_id uuid,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, slug, title, excerpt, body, seo_title, meta_description, canonical_url, featured_media_id, published_at, updated_at
  from cms_posts
  where organization_id = p_organization_id
    and app_content_is_public(status, publish_at)
  order by coalesce(published_at, updated_at) desc;
$$;

create or replace function app_public_post(p_organization_id uuid, p_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  excerpt text,
  body text,
  seo_title text,
  meta_description text,
  canonical_url text,
  featured_media_id uuid,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, slug, title, excerpt, body, seo_title, meta_description, canonical_url, featured_media_id, published_at, updated_at
  from cms_posts
  where organization_id = p_organization_id
    and slug = p_slug
    and app_content_is_public(status, publish_at);
$$;

create or replace function app_public_media_visible(p_organization_id uuid, p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from cms_pages
    where organization_id = p_organization_id
      and app_content_is_public(status, publish_at)
      and (featured_media_id = p_media_id or position(p_media_id::text in body) > 0)
  ) or exists (
    select 1 from cms_posts
    where organization_id = p_organization_id
      and app_content_is_public(status, publish_at)
      and (featured_media_id = p_media_id or position(p_media_id::text in body) > 0)
  );
$$;

create or replace function app_public_media_file(p_organization_id uuid, p_media_id uuid)
returns table (
  filename text,
  content_type text,
  storage_path text,
  byte_size integer
)
language sql
stable
security definer
set search_path = public
as $$
  select filename, content_type, storage_path, byte_size
  from media_assets
  where organization_id = p_organization_id
    and id = p_media_id
    and status = 'stored'
    and content_type in ('image/png', 'image/jpeg', 'image/gif', 'image/webp')
    and app_public_media_visible(p_organization_id, p_media_id);
$$;

revoke all on function app_public_pages(uuid) from public;
revoke all on function app_public_page(uuid, text) from public;
revoke all on function app_public_posts(uuid) from public;
revoke all on function app_public_post(uuid, text) from public;
revoke all on function app_public_media_visible(uuid, uuid) from public;
revoke all on function app_content_is_public(text, timestamptz) from public;
grant execute on function app_public_pages(uuid) to cognera_app;
grant execute on function app_public_page(uuid, text) to cognera_app;
grant execute on function app_public_posts(uuid) to cognera_app;
grant execute on function app_public_post(uuid, text) to cognera_app;
grant execute on function app_public_media_visible(uuid, uuid) to cognera_app;
revoke all on function app_public_media_file(uuid, uuid) from public;
grant execute on function app_public_media_file(uuid, uuid) to cognera_app;
grant execute on function app_content_is_public(text, timestamptz) to cognera_app;
