# UH Tender Finder

A production-oriented Next.js/Supabase application for United Hardware / builders-merchant members. It scans **public eTenders notice pages**, keeps only opportunities whose official procurement type is **Supplies**, holds back notices that appear to include installation/works/services, scores merchant relevance, matches categories to member preferences, and gives each member a **private pricing workspace**.

## Important boundary

This app does **not** bypass eTenders authentication, association or tender-document controls. It reads public notice pages only. Where the official pricing schedule/RFT documents require an authorised eTenders login, the member downloads them from their own eTenders account and can upload the `.xlsx/.xls/.csv` pricing schedule into their private workspace here.

The eTenders HTML structure is controlled by the eTenders platform and can change. The collector therefore logs every run, fails visibly, and does not invent missing fields. Always verify the official notice before bidding.

## What is included

- Free member signup + administrator approval
- Approved-member-only RLS access
- Hourly Vercel cron ingestion
- Public eTenders latest-notice discovery
- Public tender detail parser
- `Procurement Type = Supplies` hard gate
- Supply-only/mixed classifier (mixed notices are hidden from members)
- CPV + keyword merchant taxonomy and 0–100 relevance score
- Category/search/relevance filters
- Saved tenders
- Member alert preferences
- Optional hourly email alert via Resend
- eTenders source link on every tender
- Private per-user pricing sheets
- XLSX/CSV pricing-schedule import in the browser
- Cost / sell / gross-margin pricing workspace
- Export completed pricing back to XLSX
- Admin member approval/suspension
- Admin ingestion run history
- Admin mixed-notice review
- Full Supabase schema + RLS + taxonomy seed

## 1. Create Supabase project

Create a new Supabase project. In **SQL Editor**, paste and run the complete `supabase-schema.sql` file.

In Supabase Authentication settings, enable Email/Password sign-in. For a closed member service you can turn off public email confirmation if you want approval to be entirely controlled by the app administrator; otherwise keep confirmation enabled.

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=use-a-long-random-secret
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ETENDERS_USER_AGENT=UH-Tender-Finder/1.0 (contact: your-real-contact@example.ie)
```

Optional email alerts:

```bash
RESEND_API_KEY=re_...
ALERT_FROM_EMAIL=UH Tender Finder <tenders@your-domain.ie>
```

Never put `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` or `RESEND_API_KEY` in client-side code or Git.

## 3. Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 4. Create first administrator

1. Use **Request access** to create your own account.
2. In Supabase SQL Editor run:

```sql
update public.profiles
set status='approved', is_admin=true
where email='your-email@example.ie';
```

3. Log out/in and open `/admin`.

## 5. Test ingestion manually

From `/admin`, press **Run eTenders scan now**.

The app fetches the public search page:

`https://www.etenders.gov.ie/epps/quickSearchAction.do?searchType=cftFTS`

It discovers public `resourceId` links, fetches each public `prepareViewCfTWS.do?resourceId=...` notice and stores structured fields. Check **Ingestion runs** in admin.

If eTenders changes its HTML structure the run will expose failures instead of silently fabricating data. The only file normally requiring parser maintenance is `lib/etenders.ts`.

## 6. Supply-only rules

A notice must pass **both** layers before members see it:

1. eTenders `Procurement Type` must equal `Supplies`.
2. The public title/description must not contain obvious works/service terms such as installation, maintenance, repair, refurbishment works or design-and-build.

Ambiguous supply notices are stored as `mixed` and are visible only in the admin review table. This is deliberately conservative because the product goal is to avoid wasting member time.

## 7. Merchant relevance

`tender_taxonomy` contains editable CPV-prefix and keyword rules seeded for:

- Building Materials
- Timber
- Insulation
- Plumbing
- Heating
- Bathrooms & Sanitaryware
- Drainage & Civils
- Roofing
- Doors & Ironmongery
- Hardware & Fixings
- Tools
- Paint & Decorating
- PPE & Workwear
- Landscaping
- Electrical & Lighting
- General Merchant

The current build intentionally keeps these rules in Supabase rather than hard-coding the final taxonomy. Adjust/add rules after observing real notices.

## 8. Pricing workflow

For a relevant tender:

1. Member opens the tender summary.
2. Member clicks **Open official eTenders notice**.
3. If tender documents require association/login, member uses their own authorised eTenders account.
4. Member downloads the official pricing schedule.
5. Back in Tender Finder, click **Create pricing sheet**.
6. Upload `.xlsx`, `.xls` or `.csv`.
7. The first sheet is read client-side. Column 1 is treated as description, 2 as quantity, 3 as unit after the detected heading row.
8. Member can fill own SKU, cost, sell and notes.
9. Gross margin is calculated.
10. Export completed pricing to XLSX.

Pricing RLS is deliberately user-private: a member can only see their own `pricing_sheets` and `pricing_lines`. Do not weaken these policies for group-wide price sharing; independent member bid prices should stay private.

## 9. Deploy to Vercel

Push this repository to a **private** GitHub repository, then import it into Vercel.

Add every production environment variable from `.env.example`. Change:

```bash
NEXT_PUBLIC_SITE_URL=https://your-production-domain.ie
```

`vercel.json` runs `/api/cron/ingest` hourly at minute 15. Vercel Cron sends the production `CRON_SECRET` in the Authorization header when configured according to Vercel's cron security behaviour. If you invoke the route manually, send:

```http
Authorization: Bearer YOUR_CRON_SECRET
```

## 10. Email alerts

If `RESEND_API_KEY` is not supplied, ingestion still works and no email is sent. If configured, after each hourly scan members with matching categories receive a short list of newly seen eligible opportunities.

Set a verified sending domain in Resend before production use.

## 11. Recommended launch test

Before all members see it, approve 5–10 test accounts and validate at least 50 real notices:

- true supply contracts appear;
- works/services are absent;
- mixed `supply + install` contracts stay in admin;
- CPV/category matches are sensible;
- deadlines and values match eTenders exactly;
- official source link opens the correct notice;
- pricing sheet is private between two separate test members;
- suspended/pending users cannot read tenders;
- cron failures are visible in `ingest_runs`.

Tune `tender_taxonomy` and `MIXED_TERMS` in `lib/relevance.ts` from real false positives/negatives. Do not loosen the hard `Procurement Type = Supplies` gate for this member product.

## 12. What I would add only after real usage

Do not overbuild before members use it. The strongest later additions are:

- direct XLSX layout mapping wizard for unusual pricing schedules;
- tender-document summarisation from member-uploaded RFT PDFs;
- member-specific county/contract-value preferences;
- central opportunity analytics (views/saves/pricing started) without exposing private prices;
- tender award/result follow-up;
- procurement-calendar/history insights;
- optional supplier/SKU matching against a member's own catalogue.

## Legal/operational notes

- The app is an opportunity-discovery and private-pricing aid, not legal/procurement advice.
- The official eTenders notice/documents always control.
- Use a real contact address in `ETENDERS_USER_AGENT` and keep scan frequency reasonable.
- Do not automate logins, CAPTCHA, protected tender document access, submissions, or association actions.
- Confirm eTenders/European Dynamics terms and robots/access expectations before broad production scraping. If an official supported feed/API becomes available, replace the HTML collector while keeping the rest of the application unchanged.
