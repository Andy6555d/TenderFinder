# Tender Finder V7 — Acceptance Test

## Deployment
- [ ] `supabase-migration-v7-planning-leads.sql` completed without SQL errors.
- [ ] Vercel deployment completes.
- [ ] Existing eTenders environment variables are still present.
- [ ] `/api/cron/planning` is listed as a Vercel cron.

## Existing V6 regression
- [ ] Login works.
- [ ] eTenders dashboard loads.
- [ ] Tender search/filter works.
- [ ] Tender detail opens the official notice.
- [ ] Save/unsave tender works.
- [ ] Pricing sheets still work.
- [ ] Member documents still work.
- [ ] Admin fast eTenders refresh still works.

## Planning ingestion
- [ ] Admin → Planning full refresh returns a completed run.
- [ ] Run shows fetched rows and page count.
- [ ] `/planning` shows relevant records.
- [ ] Obvious signage/telecom-only applications are not in the member feed.
- [ ] New houses/extensions/developments receive sensible project types and material categories.
- [ ] Official planning link opens the corresponding public record where `LinkAppDetails` is supplied.

## Commencement matching
- [ ] Admin → Match commencements completes.
- [ ] Latest planning run shows BCMS checked/matched counts.
- [ ] A matched project shows a commencement number/date.
- [ ] Future commencement date shows `STARTING SOON`.
- [ ] Already-started commencement shows `ACTIVE`.
- [ ] Council/reference matching does not connect same-number applications from a different local authority.

## Branch distance
- [ ] Alerts & branch page loads.
- [ ] Use current location fills latitude/longitude after browser permission.
- [ ] Save preferences succeeds.
- [ ] Planning page shows km from branch.
- [ ] 10/20/30/50/75/100 km filters work.
- [ ] Nearest-first sorting works.

## Contacts
- [ ] Open a planning lead.
- [ ] Add a builder/contact under “I know who is involved in this job”.
- [ ] Contact appears on the same lead.
- [ ] Remove contact works.
- [ ] Sign in as another member and confirm the first member's private contact is not visible.

## Saved
- [ ] Save a planning lead.
- [ ] Saved page contains separate eTenders and Planning & Construction sections when both exist.
- [ ] Unsave planning lead works.

## Alerts
- [ ] If Resend is configured, planning cron sends matching planning/commencement email.
- [ ] The same planning alert is not resent on the next daily cron.
- [ ] When a previously alerted planning lead later gets a commencement, a separate commencement alert can be sent.

## Data wording
- [ ] Estimated material opportunity is visibly described as indicative, not confirmed spend.
- [ ] Contractor is not shown as identified unless a reliable source/member has supplied it.
- [ ] Footer includes planning-data attribution.
