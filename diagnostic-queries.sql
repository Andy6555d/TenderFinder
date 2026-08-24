-- UH Tender Finder v2 - safe read-only diagnostics

-- 1. Backfill position
select *
from public.ingestion_state
where key='live_backfill';

-- 2. Last 20 ingestion runs
select
  started_at,
  finished_at,
  reported_live_count,
  discovered,
  inserted,
  updated,
  skipped_existing,
  refreshed,
  eligible,
  mixed,
  pages_scanned,
  cursor_start,
  cursor_end,
  failed,
  errors
from public.ingest_runs
order by started_at desc
limit 20;

-- 3. Current member-visible candidates at default score threshold
select
  resource_id,
  title,
  authority,
  procurement_type,
  cpv_codes,
  relevance_score,
  categories,
  supply_only_status,
  admin_override,
  supply_only_reason,
  classifier_version,
  published_at,
  deadline_at
from public.tenders
where status='open'
  and relevance_score >= 20
  and admin_override <> 'reject'
  and (supply_only_status='eligible' or admin_override='approve')
  and (deadline_at is null or deadline_at > now())
order by relevance_score desc, published_at desc;

-- 4. Mixed review queue
select
  resource_id,
  title,
  authority,
  relevance_score,
  categories,
  supply_only_reason,
  admin_override,
  source_url
from public.tenders
where status='open'
  and supply_only_status='mixed'
order by relevance_score desc, published_at desc;

-- 5. Check for irrelevant vehicle leads after reclassification
select
  resource_id,
  title,
  relevance_score,
  categories,
  supply_only_status,
  admin_override
from public.tenders
where lower(title) similar to '%(truck|vehicle|trailer|bus)%'
order by relevance_score desc;

-- 6. Classification version coverage
select
  coalesce(classifier_version,'UNCLASSIFIED') as classifier_version,
  count(*) as records
from public.tenders
group by 1
order by 2 desc;
