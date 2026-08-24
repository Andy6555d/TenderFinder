-- Tender Finder v7: Planning & Construction Leads
-- Run once on an existing TenderFinder v6 database.

alter table public.profiles
  add column if not exists branch_address text,
  add column if not exists branch_eircode text,
  add column if not exists branch_latitude double precision,
  add column if not exists branch_longitude double precision,
  add column if not exists planning_radius_km integer not null default 30,
  add column if not exists notify_planning boolean not null default true;

create table if not exists public.planning_applications (
  id uuid primary key default gen_random_uuid(),
  source_object_id bigint not null unique,
  planning_authority text,
  planning_authority_normalized text,
  application_number text,
  application_number_normalized text,
  development_description text,
  development_address text,
  development_postcode text,
  application_status text,
  application_type text,
  decision text,
  project_stage text not null default 'watch' check(project_stage in ('watch','granted','starting_soon','active','completed','refused','withdrawn','expired','unknown')),
  applicant_name text,
  applicant_address text,
  agent_name text,
  agent_company text,
  site_area numeric,
  floor_area numeric,
  residential_units integer,
  one_off_house boolean,
  received_date timestamptz,
  decision_date timestamptz,
  grant_date timestamptz,
  expiry_date timestamptz,
  latitude double precision,
  longitude double precision,
  source_url text,
  project_type text not null default 'other',
  relevance_score integer not null default 0 check(relevance_score between 0 and 100),
  categories text[] not null default '{}',
  estimated_opportunity_low numeric,
  estimated_opportunity_high numeric,
  score_reason text,
  ignored boolean not null default false,
  commencement_number text,
  commencement_date date,
  commencement_status text,
  commencement_source_url text,
  commencement_matched_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_source jsonb not null default '{}'::jsonb
);
create index if not exists planning_stage_score_idx on public.planning_applications(project_stage, relevance_score desc, received_date desc);
create index if not exists planning_authority_app_idx on public.planning_applications(planning_authority, application_number);
create index if not exists planning_authority_ref_norm_idx on public.planning_applications(planning_authority_normalized, application_number_normalized);
create index if not exists planning_app_normalized_idx on public.planning_applications(application_number_normalized);
create index if not exists planning_grant_idx on public.planning_applications(grant_date desc);
create index if not exists planning_commencement_idx on public.planning_applications(commencement_date desc);
create index if not exists planning_categories_gin on public.planning_applications using gin(categories);

create table if not exists public.planning_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  mode text not null default 'scheduled',
  fetched integer not null default 0,
  inserted integer not null default 0,
  updated integer not null default 0,
  relevant integer not null default 0,
  ignored integer not null default 0,
  pages_scanned integer not null default 0,
  commencements_checked integer not null default 0,
  commencements_matched integer not null default 0,
  errors jsonb not null default '[]'::jsonb
);

create table if not exists public.saved_planning_leads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  planning_id uuid not null references public.planning_applications(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, planning_id)
);

create table if not exists public.planning_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  planning_id uuid not null references public.planning_applications(id) on delete cascade,
  role text not null check(role in ('builder','developer','architect','engineer','plumber','heating_contractor','owner','other')),
  name text not null,
  company text,
  phone text,
  email text,
  notes text,
  source text not null default 'member' check(source in ('member','public_source','existing_customer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists planning_contacts_user_project_idx on public.planning_contacts(user_id, planning_id);

create table if not exists public.planning_alert_deliveries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  planning_id uuid not null references public.planning_applications(id) on delete cascade,
  alert_kind text not null check(alert_kind in ('new','commencement')),
  sent_at timestamptz not null default now(),
  primary key(user_id, planning_id, alert_kind)
);

alter table public.planning_applications enable row level security;
alter table public.planning_ingest_runs enable row level security;
alter table public.saved_planning_leads enable row level security;
alter table public.planning_contacts enable row level security;
alter table public.planning_alert_deliveries enable row level security;

create policy "Approved members read planning leads" on public.planning_applications for select to authenticated
using(public.is_admin() or (public.is_approved_member() and ignored=false and relevance_score >= 20));
create policy "Admins read planning ingest runs" on public.planning_ingest_runs for select to authenticated using(public.is_admin());
create policy "Own saved planning leads" on public.saved_planning_leads for all to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid() and public.is_approved_member());
create policy "Own planning contacts" on public.planning_contacts for all to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid() and public.is_approved_member());

create or replace function public.update_my_opportunity_preferences(
  p_categories text[], p_notify_email boolean, p_min_relevance_score integer,
  p_branch_address text, p_branch_eircode text, p_branch_latitude double precision,
  p_branch_longitude double precision, p_planning_radius_km integer, p_notify_planning boolean
) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.profiles set
    categories=coalesce(p_categories,'{}'::text[]),
    notify_email=coalesce(p_notify_email,false),
    min_relevance_score=greatest(0,least(100,coalesce(p_min_relevance_score,20))),
    branch_address=nullif(trim(coalesce(p_branch_address,'')),''),
    branch_eircode=nullif(upper(trim(coalesce(p_branch_eircode,''))),''),
    branch_latitude=case when p_branch_latitude between -90 and 90 then p_branch_latitude else null end,
    branch_longitude=case when p_branch_longitude between -180 and 180 then p_branch_longitude else null end,
    planning_radius_km=greatest(5,least(100,coalesce(p_planning_radius_km,30))),
    notify_planning=coalesce(p_notify_planning,true)
  where id=auth.uid();
end; $$;
grant execute on function public.update_my_opportunity_preferences(text[],boolean,integer,text,text,double precision,double precision,integer,boolean) to authenticated;
