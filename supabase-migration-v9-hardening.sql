-- Tender Finder v9 hardening pass. Fixes the core issue an external review caught: distance
-- filtering was happening in JavaScript AFTER a national row limit (300 on the planning page,
-- 2,500 on alerts) had already discarded everything past that cut. A genuinely close, relevant
-- lead could be silently excluded just because 300+ leads elsewhere in the country sorted ahead
-- of it by date. Run once in Supabase SQL Editor.

-- Plain-SQL haversine distance in km. No PostGIS/earthdistance extension dependency - just the
-- formula, which keeps this portable and avoids relying on an extension being enabled.
create or replace function public.haversine_km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable parallel safe as $$
  select 6371 * acos(
    least(1, greatest(-1,
      cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lon2) - radians(lon1)) +
      sin(radians(lat1)) * sin(radians(lat2))
    ))
  )
$$;

-- The actual fix: computes distance and applies the radius filter and sort BEFORE any limit is
-- applied, so the limit only ever trims an already-nearby set, never hides one. Runs as the
-- calling member's own session (SECURITY INVOKER, the default) so existing RLS on
-- planning_applications still applies exactly as it does to a normal SELECT - no bypass.
create or replace function public.nearby_planning_leads(
  p_lat double precision, p_lon double precision, p_radius_km double precision,
  p_min_score integer, p_stages text[], p_search text, p_type text, p_sort text, p_limit integer
) returns setof public.planning_applications
language sql stable as $$
  select pa.* from public.planning_applications pa
  where pa.ignored = false
    and pa.relevance_score >= p_min_score
    and (p_stages is null or pa.project_stage = any(p_stages))
    and (p_type is null or pa.project_type = p_type)
    and (p_search is null or pa.development_description ilike '%'||p_search||'%'
         or pa.development_address ilike '%'||p_search||'%'
         or pa.application_number ilike '%'||p_search||'%'
         or pa.planning_authority ilike '%'||p_search||'%')
    and (p_lat is null or (pa.latitude is not null and pa.longitude is not null
         and public.haversine_km(p_lat, p_lon, pa.latitude, pa.longitude) <= p_radius_km))
  order by
    case when p_sort = 'distance' and p_lat is not null then public.haversine_km(p_lat, p_lon, pa.latitude, pa.longitude) end asc nulls last,
    case when p_sort = 'score' then pa.relevance_score end desc,
    case when p_sort is null or p_sort = 'smart' then (case when pa.project_stage = 'starting_soon' then 0 else 1 end) end asc,
    pa.relevance_score desc,
    coalesce(pa.commencement_date::timestamptz, pa.grant_date, pa.received_date) desc nulls last
  limit p_limit
$$;

-- Same idea for the count shown on the opportunities landing page: a proper distance-aware count,
-- not a national one mislabelled "near your branch".
create or replace function public.nearby_planning_count(
  p_lat double precision, p_lon double precision, p_radius_km double precision,
  p_min_score integer, p_stages text[]
) returns integer language sql stable as $$
  select count(*)::integer from public.planning_applications pa
  where pa.ignored = false
    and pa.relevance_score >= p_min_score
    and (p_stages is null or pa.project_stage = any(p_stages))
    and (p_lat is null or (pa.latitude is not null and pa.longitude is not null
         and public.haversine_km(p_lat, p_lon, pa.latitude, pa.longitude) <= p_radius_km))
$$;

-- Speeds up the two functions above at real data volumes.
create index if not exists planning_applications_score_stage_idx on public.planning_applications(relevance_score, project_stage) where ignored = false;
create index if not exists planning_applications_latlon_idx on public.planning_applications(latitude, longitude) where latitude is not null;

-- Item 5: opportunity value now carries an explicit indicative scale label (Low/Medium/High/Very
-- High) alongside the euro range, rather than the euro figures alone implying more precision than
-- these hard-coded, uncalibrated bands actually have.
alter table public.planning_applications add column if not exists estimated_opportunity_band text;

-- Item 3: applications still awaiting a decision (grant_date is null) need to keep being refreshed
-- regardless of how long ago they were received - otherwise an application stuck in "further
-- information requested" for months quietly falls out of the "newest received" ingestion window
-- and never gets checked again, even though it's still commercially live. This view is just a
-- convenience for admin/diagnostic queries; the actual refresh logic lives in lib/planning.ts.
create or replace view public.planning_pending_decisions as
  select id, application_number, planning_authority, received_date, project_stage, relevance_score
  from public.planning_applications
  where grant_date is null and project_stage in ('watch','granted') and ignored = false
  order by received_date asc;
