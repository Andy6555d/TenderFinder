# UH Tender Finder v3 — Fast Index

A Next.js + Supabase member tool that continuously finds **merchant-relevant, supply-only eTenders opportunities** and gives United Hardware/builders-merchant members a clean opportunity feed plus private tender pricing workspaces.

## What changed in v3

V2 fixed the missing-catalogue bug but its initial page-by-page backfill could take days. V3 replaces that architecture completely.

### Fast Full Refresh

`Fast full refresh` now:

1. Opens the first current eTenders search page and reads the reported live count.
2. Calculates every current search-results page.
3. Downloads those lightweight search pages **in bounded parallel concurrency**.
4. Extracts title + public summary for every live notice.
5. Applies a cheap builders-merchant relevance filter **before opening detail pages**.
6. Opens only plausible merchant candidates, also in bounded parallel batches.
7. Applies the official detail-page checks: `Procurement Type = Supplies`, CPV scoring and context-aware supply-vs-works classification.
8. Bulk-upserts the resulting tenders into Supabase.

This is designed to turn the first live index from days into **minutes**, subject to eTenders response time and your Vercel plan's execution limit.

### Normal hourly scan

The hourly cron no longer crawls the full catalogue. It checks only the newest five search pages, fetches details only for genuinely new IDs, and refreshes a small number of stale relevant notices. Normal updates should therefore be fast.

---

# UPGRADE FROM V2

1. Back up Supabase if available.
2. In Supabase SQL Editor run the complete file:

   `supabase-migration-v3-fast-index.sql`

3. Replace your GitHub project with this v3 project and deploy on Vercel.
4. Open `/admin`.
5. Click **Reclassify stored tenders** once.
6. Click **Fast full refresh** once.
7. Refresh the Admin page after it returns. The latest `fast_full` row shows:
   - live count
   - catalogue notices found
   - candidates
   - inserted
   - updated
   - eligible
   - mixed/review
   - pages scanned
   - failures

The old `Restart full backfill` button is intentionally gone. It is not needed in v3.

## If Fast Full Refresh times out on your Vercel plan

The code uses bounded concurrency and the admin route declares `maxDuration = 300`, but Vercel account limits can override that. If your plan terminates the request early, lower/raise concurrency carefully using environment variables:

```bash
ETENDERS_SEARCH_CONCURRENCY=14
ETENDERS_DETAIL_CONCURRENCY=8
ETENDERS_PREFILTER_SCORE=8
```

Recommended ranges:

- Search concurrency: 8–20
- Detail concurrency: 4–10
- Prefilter score: 6–12

Do not set extreme concurrency. The objective is fast indexing without hammering eTenders.

## Environment variables

Existing variables remain the same. Update the user agent version/contact if desired:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...
NEXT_PUBLIC_SITE_URL=https://YOUR-DOMAIN
ETENDERS_USER_AGENT=UH-Tender-Finder/3.0 (contact: your-real-contact@example.ie)
```

Optional:

```bash
ETENDERS_SEARCH_CONCURRENCY=14
ETENDERS_DETAIL_CONCURRENCY=8
ETENDERS_PREFILTER_SCORE=8
RESEND_API_KEY=...
ALERT_FROM_EMAIL=...
```

Never commit real secrets.

---

# NEW INSTALLATION

1. Create a new Supabase project.
2. Run the complete `supabase-schema.sql`.
3. Enable Email/Password auth.
4. Add the environment variables above in Vercel.
5. Deploy the repository.
6. Sign up through the app.
7. Promote your first admin in Supabase:

```sql
update public.profiles
set status='approved', is_admin=true
where email='YOUR_EMAIL';
```

8. Log out/in, open `/admin`, then run **Fast full refresh**.

---

# What members see

Members only see open opportunities that are:

- officially classed as `Supplies` by eTenders;
- relevant to the merchant taxonomy;
- not manually rejected;
- not clearly works/service obligations unless an admin approves them.

Members can save tenders, use a private pricing workspace, import official CSV/XLSX pricing schedules they obtained legitimately from eTenders, add their own SKU/cost/sell/margin notes, and export pricing to Excel. One member cannot see another member's private pricing.

# Boundary

UH Tender Finder reads public eTenders notice pages. It does not bypass login/CAPTCHA, access protected tender documents, submit tenders, or coordinate member bid prices. eTenders remains the official procurement/submission system.

---

# V7 — Planning & Construction Leads

V7 adds a second opportunity engine alongside eTenders. It uses the Department of Housing National Planning Applications ArcGIS service and the National Building Control Office commencement dataset. The two engines remain isolated underneath but members enter them from one `Find opportunities` home page.

## Upgrade an existing V6 deployment

1. Back up Supabase.
2. Run `supabase-migration-v7-planning-leads.sql` in the Supabase SQL Editor.
3. Deploy this repository.
4. In Vercel, keep the existing environment variables. The planning variables in `.env.example` are optional because safe official defaults are included.
5. Open `/admin` and click **Planning full refresh** once.
6. Click **Match commencements** after the first planning import.
7. Each member should open **Alerts & branch** and set their branch location/radius. If they are physically at the branch, **Use my current location** captures browser coordinates.

## What the planning engine does

- reads structured official planning applications, not council HTML;
- classifies one-off houses, housing developments, extensions, commercial, agricultural, renovation and ancillary work;
- suppresses obvious low-value signals such as signage, telecoms and retention-only records;
- scores likely builders-merchant relevance and predicts broad material categories;
- stores indicative opportunity ranges as estimates, never confirmed project spend;
- matches BCMS commencement records using normalized planning references and promotes matched projects to **Starting soon**;
- calculates member-to-project distance when a member has configured branch coordinates;
- lets a member privately add a known builder, developer, architect, engineer, plumber or heating contractor;
- keeps member contact/relationship notes private under RLS.

## Important contact-data boundary

The national BCMS open dataset includes planning reference, project details and commencement dates but not the builder/owner contact fields held inside the BCMS submission process. The app therefore does **not** invent or scrape private contact details. It surfaces applicant/agent fields only where the official planning feed exposes them and lets members record reliable local/customer knowledge privately.

## Scheduled scans

`vercel.json` keeps the hourly eTenders scan and adds a daily planning scan at 05:35 UTC. Normal planning scans inspect the newest configured pages; the admin full refresh reads a larger recent slice. This avoids repeatedly downloading the full national historical archive.
