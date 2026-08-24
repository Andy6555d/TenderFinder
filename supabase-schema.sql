-- UH Tender Finder - current full schema (v3 fast index)
-- Run this file on a NEW Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  outlet_name text not null,
  contact_name text,
  status text not null default 'pending' check (status in ('pending','approved','suspended')),
  is_admin boolean not null default false,
  categories text[] not null default '{}',
  notify_email boolean not null default true,
  min_relevance_score integer not null default 20 check (min_relevance_score between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.tender_taxonomy (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  rule_type text not null check (rule_type in ('cpv_prefix','keyword','exclude_keyword')),
  value text not null,
  weight integer not null default 10,
  active boolean not null default true,
  unique(category, rule_type, value)
);

create table if not exists public.tenders (
  id uuid primary key default gen_random_uuid(),
  resource_id text not null unique,
  title text not null,
  authority text,
  description text,
  procurement_type text,
  procedure text,
  contract_type text,
  cpv_codes text[] not null default '{}',
  estimated_value numeric,
  published_at timestamptz,
  deadline_at timestamptz,
  clarification_deadline_at timestamptz,
  nuts_codes text[] not null default '{}',
  number_of_lots integer,
  lot_names text[] not null default '{}',
  source_url text not null,
  relevance_score integer not null default 0 check(relevance_score between 0 and 100),
  categories text[] not null default '{}',
  supply_only_status text not null default 'mixed' check(supply_only_status in ('eligible','mixed','excluded')),
  supply_only_reason text,
  admin_override text not null default 'none' check(admin_override in ('none','approve','reject')),
  admin_review_note text,
  admin_reviewed_at timestamptz,
  admin_reviewed_by uuid references public.profiles(id) on delete set null,
  classifier_version text,
  last_classified_at timestamptz,
  status text not null default 'unknown' check(status in ('open','closed','unknown')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists tenders_feed_idx on public.tenders(status,supply_only_status,published_at desc);
create index if not exists tenders_override_idx on public.tenders(admin_override,status,published_at desc);
create index if not exists tenders_categories_gin on public.tenders using gin(categories);
create index if not exists tenders_cpv_gin on public.tenders using gin(cpv_codes);

create table if not exists public.saved_tenders (
  user_id uuid not null references public.profiles(id) on delete cascade,
  tender_id uuid not null references public.tenders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,tender_id)
);

create table if not exists public.pricing_sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tender_id uuid not null references public.tenders(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricing_lines (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.pricing_sheets(id) on delete cascade,
  line_no integer not null,
  description text not null,
  quantity numeric,
  unit text,
  merchant_sku text,
  cost numeric,
  sell numeric,
  notes text,
  unique(sheet_id,line_no)
);

-- A private "standing documents" folder per member outlet - things like a Tax Clearance Cert or
-- eESPD only need to be uploaded once and are always there when needed for a submission.
create table if not exists public.member_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  file_path text not null,
  file_name text not null,
  file_size integer,
  expires_at date,
  created_at timestamptz not null default now()
);
create index if not exists member_documents_user_idx on public.member_documents(user_id, created_at desc);

insert into storage.buckets (id, name, public)
values ('member-documents', 'member-documents', false)
on conflict (id) do nothing;

create table if not exists public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz,
  mode text not null default 'scheduled',
  discovered integer not null default 0,
  candidates integer not null default 0,
  inserted integer not null default 0,
  updated integer not null default 0,
  eligible integer not null default 0,
  mixed integer not null default 0,
  failed integer not null default 0,
  skipped_existing integer not null default 0,
  refreshed integer not null default 0,
  pages_scanned integer not null default 0,
  cursor_start integer,
  cursor_end integer,
  reported_live_count integer,
  errors jsonb not null default '[]'::jsonb
);

create table if not exists public.ingestion_state (
  key text primary key,
  next_page integer not null default 1 check(next_page >= 1),
  complete boolean not null default false,
  reported_live_count integer,
  cycle_started_at timestamptz,
  cycle_completed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
insert into public.ingestion_state(key,next_page,complete,cycle_started_at)
values('live_backfill',1,false,now()) on conflict(key) do nothing;

-- Automatically create an approved profile after auth signup. Admin approval is not required -
-- anyone who signs up gets immediate access. 'pending' and 'suspended' remain valid statuses so an
-- admin can still suspend an existing member later; they're just no longer the default for new signups.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,outlet_name,contact_name,status)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'outlet_name','Pending outlet'),new.raw_user_meta_data->>'contact_name','approved')
  on conflict(id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- RLS.
alter table public.profiles enable row level security;
alter table public.tenders enable row level security;
alter table public.saved_tenders enable row level security;
alter table public.pricing_sheets enable row level security;
alter table public.pricing_lines enable row level security;
alter table public.member_documents enable row level security;
alter table public.tender_taxonomy enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.ingestion_state enable row level security;

create or replace function public.is_approved_member() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved');
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved' and p.is_admin=true);
$$;

create policy "Own profile readable" on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());

create or replace function public.update_my_preferences(
  p_categories text[],
  p_notify_email boolean,
  p_min_relevance_score integer
) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.profiles
  set categories=coalesce(p_categories,'{}'::text[]),
      notify_email=coalesce(p_notify_email,false),
      min_relevance_score=greatest(0,least(100,coalesce(p_min_relevance_score,20)))
  where id=auth.uid();
end; $$;
grant execute on function public.update_my_preferences(text[],boolean,integer) to authenticated;

-- Member feed includes auto-eligible tenders unless manually rejected, plus mixed tenders explicitly approved by admin.
create policy "Approved members read visible tenders" on public.tenders for select to authenticated using(
  public.is_admin()
  or (
    public.is_approved_member()
    and admin_override <> 'reject'
    and (supply_only_status='eligible' or admin_override='approve')
  )
);
create policy "Own saved tenders" on public.saved_tenders for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and public.is_approved_member());
create policy "Own pricing sheets" on public.pricing_sheets for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and public.is_approved_member());
create policy "Own pricing lines" on public.pricing_lines for all to authenticated using(exists(select 1 from public.pricing_sheets s where s.id=sheet_id and s.user_id=auth.uid())) with check(exists(select 1 from public.pricing_sheets s where s.id=sheet_id and s.user_id=auth.uid()));
create policy "Own documents" on public.member_documents for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and public.is_approved_member());
create policy "Own document files" on storage.objects for all to authenticated using(bucket_id='member-documents' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='member-documents' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Admins read taxonomy" on public.tender_taxonomy for select to authenticated using(public.is_admin());
create policy "Admins read ingest runs" on public.ingest_runs for select to authenticated using(public.is_admin());
create policy "Admins read ingestion state" on public.ingestion_state for select to authenticated using(public.is_admin());

-- Service-role-only helper used by the server-side "Reclassify stored tenders" admin action.
create or replace function public.apply_tender_classifications(p_updates jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare
  item jsonb;
  n integer := 0;
begin
  for item in select * from jsonb_array_elements(coalesce(p_updates,'[]'::jsonb))
  loop
    update public.tenders
    set relevance_score = greatest(0,least(100,coalesce((item->>'relevance_score')::integer,0))),
        categories = coalesce(array(select jsonb_array_elements_text(coalesce(item->'categories','[]'::jsonb))), '{}'::text[]),
        supply_only_status = coalesce(item->>'supply_only_status','mixed'),
        supply_only_reason = item->>'supply_only_reason',
        classifier_version = item->>'classifier_version',
        last_classified_at = coalesce((item->>'last_classified_at')::timestamptz,now())
    where id = (item->>'id')::uuid;
    n := n + 1;
  end loop;
  return n;
end; $$;
revoke all on function public.apply_tender_classifications(jsonb) from public, anon, authenticated;
grant execute on function public.apply_tender_classifications(jsonb) to service_role;

-- Merchant relevance taxonomy. Structured CPV matches carry strongest weight in application scoring.
insert into public.tender_taxonomy(category,rule_type,value,weight) values
('Building Materials','cpv_prefix','4411',35),('Building Materials','cpv_prefix','4410',25),('Building Materials','keyword','building materials',35),('Building Materials','keyword','construction materials',30),('Building Materials','keyword','cement',15),('Building Materials','keyword','mortar',15),('Building Materials','keyword','plywood',15),('Building Materials','keyword','mdf',15),
('Timber','cpv_prefix','0341',35),('Timber','keyword','timber',35),('Timber','keyword','wood products',20),('Timber','keyword','sheet material',15),
('Insulation','cpv_prefix','441115',30),('Insulation','keyword','insulation',40),('Insulation','keyword','insulating materials',35),('Insulation','keyword','mineral wool',20),
('Plumbing','cpv_prefix','4416',25),('Plumbing','cpv_prefix','4213',25),('Plumbing','keyword','plumbing',40),('Plumbing','keyword','pipe fittings',25),('Plumbing','keyword','valves',15),('Plumbing','keyword','copper tube',25),
('Heating','cpv_prefix','4462',30),('Heating','cpv_prefix','39715',25),('Heating','keyword','heating equipment',35),('Heating','keyword','boiler',30),('Heating','keyword','radiator',25),('Heating','keyword','heating controls',20),
('Bathrooms & Sanitaryware','cpv_prefix','44411',40),('Bathrooms & Sanitaryware','keyword','sanitaryware',40),('Bathrooms & Sanitaryware','keyword','sanitary ware',40),('Bathrooms & Sanitaryware','keyword','bathroom',25),
('Drainage & Civils','cpv_prefix','44163',25),('Drainage & Civils','keyword','drainage',35),('Drainage & Civils','keyword','manhole',20),('Drainage & Civils','keyword','soil pipe',20),('Drainage & Civils','keyword','civil engineering materials',25),
('Roofing','cpv_prefix','44112',25),('Roofing','keyword','roofing materials',40),('Roofing','keyword','roof tiles',25),('Roofing','keyword','roofing membrane',25),
('Doors & Ironmongery','cpv_prefix','442212',35),('Doors & Ironmongery','keyword','doors',20),('Doors & Ironmongery','keyword','ironmongery',35),('Doors & Ironmongery','keyword','door hardware',30),('Doors & Ironmongery','keyword','locks',15),('Doors & Ironmongery','keyword','hinges',15),
('Hardware & Fixings','cpv_prefix','4450',35),('Hardware & Fixings','cpv_prefix','4452',30),('Hardware & Fixings','cpv_prefix','44316',30),('Hardware & Fixings','keyword','hardware',30),('Hardware & Fixings','keyword','fasteners',30),('Hardware & Fixings','keyword','fixings',30),('Hardware & Fixings','keyword','bolts',15),('Hardware & Fixings','keyword','screws',15),
('Tools','cpv_prefix','4451',35),('Tools','cpv_prefix','4383',35),('Tools','keyword','hand tools',30),('Tools','keyword','power tools',35),('Tools','keyword','tools and consumables',25),
('Paint & Decorating','cpv_prefix','4480',30),('Paint & Decorating','cpv_prefix','4481',35),('Paint & Decorating','keyword','paint',25),('Paint & Decorating','keyword','decorating supplies',30),('Paint & Decorating','keyword','rollers',10),
('PPE & Workwear','cpv_prefix','181',25),('PPE & Workwear','cpv_prefix','1844',20),('PPE & Workwear','cpv_prefix','351134',35),('PPE & Workwear','keyword','ppe',30),('PPE & Workwear','keyword','workwear',30),('PPE & Workwear','keyword','occupational clothing',30),('PPE & Workwear','keyword','protective clothing',25),
('Landscaping','keyword','landscaping materials',35),('Landscaping','keyword','paving',20),('Landscaping','keyword','fencing',20),('Landscaping','keyword','topsoil',15),
('Electrical & Lighting','cpv_prefix','312',25),('Electrical & Lighting','cpv_prefix','313',20),('Electrical & Lighting','cpv_prefix','315',25),('Electrical & Lighting','cpv_prefix','3168',20),('Electrical & Lighting','keyword','electrical supplies',35),('Electrical & Lighting','keyword','lighting',25),('Electrical & Lighting','keyword','cable',15),
('General Merchant','keyword','hardware supplies',25),('General Merchant','keyword','consumables',10),('General Merchant','keyword','maintenance supplies',10),
('General Merchant','exclude_keyword','software',30),('General Merchant','exclude_keyword','consultancy',45),('General Merchant','exclude_keyword','catering',30),('General Merchant','exclude_keyword','medical',35),('General Merchant','exclude_keyword','pharmaceutical',45),('General Merchant','exclude_keyword','vehicle',35),('General Merchant','exclude_keyword','truck',45),('General Merchant','exclude_keyword','bus',45)
on conflict do nothing;

-- IMPORTANT: after creating your first account, make it admin manually:
-- update public.profiles set status='approved', is_admin=true where email='YOUR_EMAIL';


-- ===== V7 Planning & Construction Leads =====
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
using(public.is_admin() or (public.is_approved_member() and ignored=false));
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
