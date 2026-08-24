-- UH Tender Finder v2 migration for an EXISTING v1 database.
-- Run this once in Supabase SQL Editor BEFORE deploying the v2 application code.

alter table public.tenders add column if not exists admin_override text not null default 'none';
alter table public.tenders drop constraint if exists tenders_admin_override_check;
alter table public.tenders add constraint tenders_admin_override_check check(admin_override in ('none','approve','reject'));
alter table public.tenders add column if not exists admin_review_note text;
alter table public.tenders add column if not exists admin_reviewed_at timestamptz;
alter table public.tenders add column if not exists admin_reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.tenders add column if not exists classifier_version text;
alter table public.tenders add column if not exists last_classified_at timestamptz;
create index if not exists tenders_override_idx on public.tenders(admin_override,status,published_at desc);

alter table public.ingest_runs add column if not exists mode text not null default 'scheduled';
alter table public.ingest_runs add column if not exists skipped_existing integer not null default 0;
alter table public.ingest_runs add column if not exists refreshed integer not null default 0;
alter table public.ingest_runs add column if not exists pages_scanned integer not null default 0;
alter table public.ingest_runs add column if not exists cursor_start integer;
alter table public.ingest_runs add column if not exists cursor_end integer;
alter table public.ingest_runs add column if not exists reported_live_count integer;

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
values('live_backfill',1,false,now()) on conflict(key) do update set complete=false, next_page=1, cycle_started_at=now(), cycle_completed_at=null, last_error=null, updated_at=now();

alter table public.ingestion_state enable row level security;
drop policy if exists "Admins read ingestion state" on public.ingestion_state;
create policy "Admins read ingestion state" on public.ingestion_state for select to authenticated using(public.is_admin());

drop policy if exists "Approved members read eligible tenders" on public.tenders;
drop policy if exists "Approved members read visible tenders" on public.tenders;
create policy "Approved members read visible tenders" on public.tenders for select to authenticated using(
  public.is_admin()
  or (
    public.is_approved_member()
    and admin_override <> 'reject'
    and (supply_only_status='eligible' or admin_override='approve')
  )
);

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

-- Add/strengthen CPV + keyword rules observed in real merchant-suitable notices.
insert into public.tender_taxonomy(category,rule_type,value,weight) values
('Building Materials','keyword','construction materials',30),
('Insulation','cpv_prefix','441115',30),
('Plumbing','cpv_prefix','4213',25),
('Heating','cpv_prefix','39715',25),
('Drainage & Civils','cpv_prefix','44163',25),
('Roofing','cpv_prefix','44112',25),
('Hardware & Fixings','cpv_prefix','4450',35),
('Hardware & Fixings','cpv_prefix','44316',30),
('Hardware & Fixings','keyword','hardware',30),
('Hardware & Fixings','keyword','bolts',15),
('Hardware & Fixings','keyword','screws',15),
('Paint & Decorating','cpv_prefix','4480',30),
('PPE & Workwear','cpv_prefix','1844',20),
('PPE & Workwear','keyword','occupational clothing',30),
('Electrical & Lighting','cpv_prefix','313',20),
('Electrical & Lighting','cpv_prefix','3168',20),
('General Merchant','exclude_keyword','vehicle',35),
('General Merchant','exclude_keyword','truck',45),
('General Merchant','exclude_keyword','bus',45)
on conflict(category,rule_type,value) do update set weight=excluded.weight, active=true;

-- Do not delete existing data. After deploying v2, use Admin -> "Reclassify stored tenders" once.
