-- Apply in the Supabase SQL Editor after 0008_workflow_reliability.sql.
-- Does not create a database login. Local Docker migrations are unchanged.

-- AI usage ledger. Organization-owned metrics only: operation, model, outcome,
-- sizes, and timings. Prompts and model output are deliberately not stored.

create table ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id text not null check (char_length(btrim(user_id)) > 0),
  operation text not null check (operation in (
    'draft_email', 'lead_summary', 'lead_classify', 'blog_outline',
    'article_draft', 'faq_draft', 'transform_text'
  )),
  model text not null check (char_length(model) between 1 and 120),
  status text not null check (status in ('succeeded', 'failed', 'cancelled')),
  error_code text check (error_code is null or char_length(error_code) <= 40),
  input_chars integer not null default 0 check (input_chars >= 0),
  output_chars integer not null default 0 check (output_chars >= 0),
  prompt_tokens integer check (prompt_tokens is null or prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens is null or completion_tokens >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index ai_usage_events_organization_idx on ai_usage_events (organization_id, created_at desc);

alter table ai_usage_events enable row level security;
alter table ai_usage_events force row level security;

create policy ai_usage_events_select on ai_usage_events
  for select using (app_org_visible(organization_id));
create policy ai_usage_events_insert on ai_usage_events
  for insert with check (app_org_visible(organization_id));

grant select, insert on ai_usage_events to cognera_app;
