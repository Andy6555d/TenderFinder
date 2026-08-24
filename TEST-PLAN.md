# UH Tender Finder v2 validation checklist

Run this after the migration and deployment.

## Database / upgrade
- [ ] Run `supabase-migration-v2-ingestion-review.sql` successfully.
- [ ] Confirm `/admin` loads and shows a backfill state.
- [ ] Click **Reclassify stored tenders** once.
- [ ] Confirm stored records show classifier version `v2_context_aware_supply_relevance`.
- [ ] Click **Restart full backfill** once.

## Ingestion
- [ ] Click **Run scan now**.
- [ ] Confirm `ingest_runs.reported_live_count` is populated when eTenders exposes a parseable total.
- [ ] Confirm `cursor_end` advances after a completed backfill page.
- [ ] Run scan a second time and confirm `skipped_existing` increases.
- [ ] Confirm new `resource_id` values are inserted rather than repeatedly updating only the same small set.
- [ ] Confirm a timeout/error does not advance an incomplete page.

## Classification
- [ ] A tender officially classified as `Works` is excluded.
- [ ] `Supply of tools for maintenance staff` is not rejected merely because it contains `maintenance`.
- [ ] `Supply of paint for maintenance facilities` is not rejected merely because it contains `maintenance`.
- [ ] `Supply and installation of ...` is held for admin review.
- [ ] `Maintenance services` is held for admin review.
- [ ] An irrelevant truck/vehicle tender scores below the normal member threshold unless it contains a genuine merchant category.
- [ ] Hardware/tools/paint/PPE CPV matches receive meaningful scores.

## Admin override
- [ ] Mixed tender is not visible to an ordinary member.
- [ ] Admin **Approve** makes it visible.
- [ ] Admin **Reject** hides it.
- [ ] A later scan does not wipe the manual override.
- [ ] **Auto** restores classifier-only behaviour.

## Member security
- [ ] Pending/suspended account cannot access member tenders.
- [ ] Approved member can access visible tenders.
- [ ] Member cannot read another member's private pricing sheet.
- [ ] Member cannot read another member's pricing lines.
- [ ] Admin normal UI does not expose private member cost/sell pricing.

## Tender details
- [ ] Title matches official eTenders notice.
- [ ] Contracting authority matches.
- [ ] Procurement Type matches.
- [ ] CPV codes match.
- [ ] Estimated value matches when stated.
- [ ] Deadline matches Irish local time.
- [ ] Official source link opens the correct notice.

## Cron
- [ ] `/api/cron/ingest` rejects an incorrect `CRON_SECRET`.
- [ ] Vercel cron runs hourly.
- [ ] After several cron runs the backfill cursor continues moving.
- [ ] Once backfill completes, newest notices continue to be discovered by the incremental lane.
