# UH Tender Finder v2

A Next.js/Supabase member tool for finding **public eTenders supply opportunities** that builders merchants can realistically price. Version 2 fixes the V1 ingestion problem where the app repeatedly scanned only the newest notices and therefore missed older-but-still-open opportunities.

## What v2 fixes

1. **Complete live-catalogue backfill** — the app now walks every page of eTenders' currently-live opportunity list using a persistent page cursor stored in Supabase.
2. **Fast incremental discovery** — every hourly run still checks the newest 30 notices first so newly published tenders appear quickly.
3. **No permanent timeout gaps** — a backfill page is advanced only after that complete page is safely processed or recognised as already stored.
4. **Existing IDs are skipped before detail fetch** — the app no longer repeatedly downloads the same full tender pages every hour.
5. **Small refresh queue** — previously relevant open notices are periodically refreshed for changed deadlines/status.
6. **Context-aware supply classifier** — words such as `maintenance` no longer automatically reject a tender merely because goods are intended for maintenance staff/facilities. The app looks for actual supplier obligations such as `maintenance services`, `supply and installation`, `construction works`, etc.
7. **No mandatory "supply" keyword** — if the official eTenders procurement type is `Supplies`, lack of the literal word `supply` no longer forces a valid opportunity into review.
8. **Stronger CPV scoring** — structured CPV matches carry more weight than passing description keywords; title matches are stronger than description matches.
9. **Expanded merchant taxonomy** — additional hardware, paint, PPE, electrical, plumbing and related CPV families are included.
10. **Admin approve/reject override** — ambiguous tenders can be deliberately approved or rejected and the manual decision persists through rescans.
11. **Reclassify stored tenders** — fixes stale scores/classifications created by V1, including irrelevant records that previously received an incorrect score.
12. **Backfill health dashboard** — admin can see the reported live count, current page cursor, pages scanned, existing IDs skipped and refresh activity.

## Important boundary

The app reads **public eTenders notice pages only**. It does not automate eTenders login, association, CAPTCHA, protected document access or tender submission. Members download protected RFT/pricing documents from their own authorised eTenders account and can use the private pricing workspace here.

---

# UPGRADE AN EXISTING V1 INSTALLATION

If you already deployed the earlier version, **do this in this exact order**.

### 1. Back up Supabase

Create a database backup/snapshot if your plan supports it. This migration is non-destructive, but you should always back up before schema changes.

### 2. Run the v2 migration

In Supabase → **SQL Editor**, open and run the complete file:

`supabase-migration-v2-ingestion-review.sql`

Do **not** run `supabase-schema.sql` over an existing production database. The migration is the upgrade path.

### 3. Deploy this v2 code

Replace the existing GitHub project with the contents of this ZIP (or commit the changed files), then redeploy on Vercel.

### 4. Open `/admin`

You will now see:

- **Run scan now**
- **Reclassify stored tenders**
- **Restart full backfill**
- current backfill page
- eTenders reported live count (when parsable)
- review/override queue

### 5. Click `Reclassify stored tenders` ONCE

This recalculates every stored record using the new classifier and taxonomy without refetching eTenders. It is important because V1 may contain stale/incorrect scores such as an irrelevant vehicle tender.

### 6. Click `Restart full backfill` ONCE

This sets the live-catalogue cursor to page 1. It does **not** delete tenders.

### 7. Click `Run scan now`

The first run will:

- check newest notices;
- process the next pages of the full live catalogue;
- store new tenders;
- skip already-known IDs without downloading their full detail page;
- update the cursor.

After that, the existing hourly Vercel cron continues the backfill automatically. With roughly 10 results per eTenders page and up to 3 backfill pages per hourly run, a catalogue of a few thousand live opportunities takes several days to complete automatically. You may press **Run scan now** manually between cron runs if you want to accelerate it, while still keeping request volume conservative.

**Do not expect every eTenders notice to appear to members.** The backfill scans the complete live catalogue, but the member feed remains filtered to relevant `Supplies` opportunities.

---

# NEW INSTALLATION

### 1. Create a Supabase project

Run the entire:

`supabase-schema.sql`

in Supabase SQL Editor.

Enable Email/Password auth.

### 2. Environment variables

Copy `.env.example` to `.env.local` locally, and add the same variables in Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...
NEXT_PUBLIC_SITE_URL=https://YOUR-DOMAIN
ETENDERS_USER_AGENT=UH-Tender-Finder/2.0 (contact: your-real-contact@example.ie)
```

Optional email alerts:

```bash
RESEND_API_KEY=re_...
ALERT_FROM_EMAIL=UH Tender Finder <tenders@your-domain.ie>
```

Never commit secrets to Git.

### 3. Install/run locally

```bash
npm ci
npm run dev
```

### 4. Create first admin

Create your account through the app, then run:

```sql
update public.profiles
set status='approved', is_admin=true
where email='YOUR_EMAIL';
```

Log out/in, then open `/admin`.

---

# How ingestion works now

Each hourly cron has three lanes:

## A. Incremental lane

Checks approximately the newest 30 public notices immediately.

Before fetching full notice details, the app checks whether each `resource_id` already exists. Known IDs are skipped, so the hourly job does not waste most of its time re-downloading the same notices.

## B. Persistent full backfill

Supabase table `ingestion_state` stores a `next_page` cursor. The app walks currently-live eTenders pages sequentially.

Example:

- Run 1: pages 1–3
- Run 2: pages 4–6
- Run 3: pages 7–9
- ...

If Vercel's time budget is reached halfway through a page, that page is **not** advanced. The next run retries it. This prevents the old permanent-gap problem.

When the end of the current-live list is reached, `complete=true`. New tenders are still caught by the incremental lane.

If you deliberately want to re-walk the whole current catalogue later, use **Restart full backfill**.

## C. Refresh lane

A small number of stored, relevant, open tenders that have not been checked for at least 24 hours are refreshed. This is deliberately bounded so the app does not hammer eTenders.

The dashboard also hides tenders whose stored deadline has already passed even if a refresh has not yet occurred.

---

# Supply-only classification v2

The official eTenders `Procurement Type` must still be **Supplies**. That remains the hard gate.

V1 then rejected any description containing words such as `maintenance`, `repair` or `installation`, which created false negatives. For example, goods "for maintenance staff" are still goods.

V2 instead looks for actual supplier obligations such as:

- supply and installation;
- supply and fit;
- installation services/works;
- supplier/contractor must install;
- maintenance services/contracts;
- repair services;
- service and maintenance;
- construction/building/refurbishment works;
- labour and materials;
- design and build;
- installation and commissioning.

A clear obligation becomes **Mixed / Review** rather than automatically visible.

Ordinary contextual wording such as:

- maintenance staff;
- maintenance department;
- for maintenance;
- maintenance facilities;
- maintenance supplies;

no longer causes rejection by itself.

---

# Relevance scoring v2

The scoring order is intentionally:

1. **Relevant CPV family** — strongest structured evidence.
2. **Relevant wording in title** — strong evidence.
3. **Relevant wording in description** — supporting evidence.
4. Negative/irrelevant keywords reduce confidence.

The score is no longer a simple unlimited sum of every word found in a long description. The strongest category drives most of the 0–100 score and secondary categories add limited supporting confidence.

Default member threshold remains **20+**. Adjust only after looking at real false positives/negatives.

---

# Admin review

A mixed tender is not shown to ordinary members unless an administrator chooses **Approve**.

- **Approve**: makes it member-visible and ensures at least the default 20 relevance score.
- **Reject**: explicitly hides it, even if a future automatic scan would otherwise classify it eligible.
- **Auto**: removes the override and returns the tender to automatic classifier behaviour.

Manual override lives in separate columns, so rescans do not erase the decision.

---

# Diagnosing ingestion

Use `/admin` first. Important columns are:

- eTenders live count
- Found
- New
- Existing skipped
- Refreshed
- Eligible
- Mixed
- Backfill pages
- Cursor
- Failed

Useful SQL:

```sql
select *
from public.ingestion_state
where key='live_backfill';
```

```sql
select
  started_at, reported_live_count, discovered, inserted,
  skipped_existing, refreshed, eligible, mixed,
  pages_scanned, cursor_start, cursor_end, failed, errors
from public.ingest_runs
order by started_at desc
limit 20;
```

```sql
select
  resource_id, title, procurement_type, cpv_codes,
  relevance_score, categories, supply_only_status,
  admin_override, supply_only_reason, classifier_version,
  published_at, deadline_at, first_seen_at, last_seen_at
from public.tenders
order by first_seen_at desc;
```

If the cursor advances, new rows are being inserted and `Existing skipped` rises on repeated scans, the two-lane crawler is behaving as intended.

---

# Private pricing

Pricing remains strictly per-user through RLS. Members can upload an official `.xlsx/.xls/.csv` pricing schedule obtained through their own eTenders access, add private SKU/cost/sell/notes and export a priced XLSX.

Do not weaken pricing RLS or create group-wide bid-price sharing between independent bidders.

---

# Deployment

Keep the GitHub repository **private**. Deploy through Vercel.

`vercel.json` calls:

`/api/cron/ingest`

hourly at minute 15.

The route requires `Authorization: Bearer CRON_SECRET` when the secret is configured.

---

# Recommended validation after upgrade

After migration/reclassification/backfill starts:

1. Verify the previously irrelevant flatbed/vehicle record is no longer in the normal member feed unless it genuinely matches a merchant category.
2. Search admin/database for known hardware/tools/paint/workwear supply opportunities.
3. Review at least 50 automatic decisions.
4. Approve legitimate ambiguous supply tenders from Admin rather than weakening the classifier globally.
5. Check source values/deadlines against official eTenders notices.
6. Test with two separate member accounts to confirm pricing isolation.

The objective is **not** to show hundreds of tenders. It is to scan the whole live universe and show a clean set of genuinely priceable merchant supply opportunities.
