-- UH Tender Finder v3 diagnostics

-- 1) Latest ingestion runs. FAST FULL should show almost the full live catalogue under discovered,
-- but only a much smaller merchant candidate count.
select
  started_at, finished_at, mode, reported_live_count,
  discovered as catalogue_found,
  candidates,
  inserted, updated, eligible, mixed, skipped_existing, refreshed,
  pages_scanned, failed, errors
from public.ingest_runs
order by started_at desc
limit 20;

-- 2) Fast-index state. complete=true means the last full catalogue page sweep succeeded.
select * from public.ingestion_state where key='live_backfill';

-- 3) Member-visible open opportunities.
select
  title, authority, procurement_type, cpv_codes, relevance_score, categories,
  supply_only_status, admin_override, deadline_at, source_url
from public.tenders
where status='open'
  and admin_override <> 'reject'
  and (supply_only_status='eligible' or admin_override='approve')
  and relevance_score >= 20
  and (deadline_at is null or deadline_at > now())
order by relevance_score desc, published_at desc;

-- 4) Review queue.
select
  title, authority, procurement_type, cpv_codes, relevance_score, categories,
  supply_only_status, supply_only_reason, admin_override, source_url
from public.tenders
where status='open'
  and (supply_only_status='mixed' or admin_override <> 'none')
order by relevance_score desc;

-- 5) Look for vehicle/truck false positives. These should normally have low relevance or be rejected.
select title, procurement_type, relevance_score, categories, supply_only_status, admin_override, source_url
from public.tenders
where lower(coalesce(title,'')) ~ '(truck|vehicle|bus|van|trailer)'
order by relevance_score desc;

-- 6) Classifier coverage.
select classifier_version, count(*)
from public.tenders
group by classifier_version
order by count(*) desc;
