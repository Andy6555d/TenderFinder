# Tender Finder V7 — Planning & Construction Upgrade

This is the upgrade path from the supplied V6 Documents build. Do these steps in order.

## 1. Back up Supabase
Create a database backup/snapshot before changing the schema.

## 2. Run the V7 migration
In Supabase → SQL Editor, open and run the complete file:

`supabase-migration-v7-planning-leads.sql`

Do not manually create the tables one by one.

The migration adds:
- branch address/Eircode/coordinates/radius settings to member profiles;
- `planning_applications`;
- `planning_ingest_runs`;
- `saved_planning_leads`;
- private `planning_contacts`;
- `planning_alert_deliveries` to prevent repeat planning alerts;
- RLS policies and the combined preferences RPC.

## 3. Replace/deploy the project
Push this complete project to the existing GitHub repository and deploy it on Vercel in the same way as V6.

Existing environment variables stay in place. The planning source variables have official defaults in code, so you do not have to create them unless you want to override tuning. The optional values are documented in `.env.example`.

## 4. First planning load
Log in as an admin and open `/admin`.

Under **Planning & Construction engine**:
1. Click **Planning full refresh**.
2. When it completes, review the run row.
3. Click **Match commencements** if you want to rerun the BCMS match independently.

A normal scheduled planning scan then runs daily through `/api/cron/planning`.

## 5. Configure each branch
A member opens **Alerts & branch**.

Set:
- branch address;
- branch Eircode;
- branch latitude/longitude;
- preferred lead radius (10–100 km);
- planning alerts on/off.

If the member is physically at the branch they can click **Use my current location**, allow browser location access, then save preferences.

## 6. Member workflow
After login the member lands at `/opportunities` and chooses:

### eTenders
The existing V6 supply-only tender flow remains intact at `/dashboard`.

### Planning & Construction
The new flow is at `/planning` and supports:
- search;
- project-stage filtering;
- project-type filtering;
- branch-radius filtering;
- nearest/best/highest-score sorting;
- project detail;
- save/unsave;
- commencement signal;
- applicant/agent fields where the official planning record exposes them;
- private member-added builder/developer/architect/engineer/plumber/heating-contractor details.

## 7. Important data boundary
The national planning feed is used for planning records. The national BCMS open dataset is used for commencement matching.

BCMS contains a planning-permission number, project details and commencement timing, but the national open dataset does not publish the builder contact fields that exist inside the underlying BCMS submission process. V7 therefore does not fabricate a builder. A member can add a builder they reliably know, and that note is private to their account under RLS.

## 8. What to check after deployment
Run through `V7-TEST-PLAN.md` before giving access to members.

## 9. Rollback
The V7 migration is additive: it does not remove or rename the existing V6 tender/pricing/document tables. If the new deployment has an application problem, redeploy the previous V6 Git commit. The added planning tables can remain in Supabase while the old app is running.
