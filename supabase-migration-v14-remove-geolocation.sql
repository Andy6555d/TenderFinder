-- Tender Finder v14: removes geolocation entirely, per explicit request. Planning is now filtered
-- by a plain county text match against planning_authority - no coordinates, no distance math,
-- no radius search. This drops the functions that implemented the removed feature; they're no
-- longer called from any code path. Run once in Supabase SQL Editor.

drop function if exists public.nearby_planning_leads(double precision,double precision,double precision,integer,text[],text,text,text,integer);
drop function if exists public.nearby_planning_count(double precision,double precision,double precision,integer,text[]);
drop function if exists public.set_my_planning_location(text,double precision,double precision,integer);
drop function if exists public.haversine_km(double precision,double precision,double precision,double precision);

-- branch_latitude, branch_longitude, branch_address, branch_eircode and planning_radius_km
-- columns on profiles are left in place (unused, harmless) rather than dropped - no code writes
-- to them anymore, and there's no benefit to a destructive column drop over simply not using them.
