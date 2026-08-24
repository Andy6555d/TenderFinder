-- Tender Finder v8: the planning_applications RLS policy hardcoded "relevance_score >= 20"
-- directly into the security rule, unlike the tenders table (which has no such floor and lets
-- the app-level query and each member's own min_relevance_score preference do the filtering).
-- A member who lowered their threshold below 20 on Preferences got full flexibility on
-- eTenders and silently truncated results on Planning, with nothing to explain why.
-- Run once in Supabase SQL Editor.

drop policy if exists "Approved members read planning leads" on public.planning_applications;
create policy "Approved members read planning leads" on public.planning_applications for select to authenticated
using(public.is_admin() or (public.is_approved_member() and ignored=false));
