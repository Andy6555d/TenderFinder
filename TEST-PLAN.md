# UH Tender Finder v3 test plan

## 1. Migration
- Run `supabase-migration-v3-fast-index.sql` once.
- Confirm `ingest_runs.candidates` exists.
- Confirm existing members, saved tenders and pricing sheets remain.

## 2. Reclassify old data
- Admin -> Reclassify stored tenders.
- Confirm irrelevant truck/vehicle records fall below the normal member threshold or are excluded.

## 3. Fast full refresh
- Admin -> Fast full refresh.
- Confirm a new `ingest_runs` row with `mode = fast_full`.
- `reported_live_count` should broadly match eTenders current result count.
- `pages_scanned` should be approximately `ceil(live_count / 10)`.
- `discovered` should be close to the reported live count.
- `candidates` should be materially smaller than `discovered`.
- `eligible` should be more than zero if suitable live merchant opportunities exist.

## 4. Member feed
- Confirm member dashboard does NOT show irrelevant vehicles/consultancy/works merely due to incidental words.
- Confirm valid Supplies notices in hardware/tools/paint/PPE/building/plumbing/heating categories appear where score >= member threshold.

## 5. Mixed review
- Confirm clear supply-and-install obligations go to Mixed/Review.
- Confirm harmless wording like 'tools for maintenance staff' does not become mixed solely because of 'maintenance'.
- Approve a mixed tender; confirm it appears to members.
- Reject it; confirm it disappears.

## 6. Incremental speed
- Run Check newest now.
- It should inspect only newest pages and not initiate a full catalogue crawl.
- Re-running immediately should show mostly existing IDs skipped and very few/no detail fetches.

## 7. Cron
- Verify `/api/cron/ingest` still succeeds using `CRON_SECRET`.
- Confirm hourly ingest rows use `mode = scheduled`.

## 8. Pricing/RLS
- Two approved member accounts must not see each other's saved/pricing data.
- Admin/member feed access rules must remain unchanged.
