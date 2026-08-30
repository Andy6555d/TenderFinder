-- Tender Finder v10: replaces address/Eircode geocoding (and its Google/Nominatim dependency)
-- with a simple county + radius picker set directly on the Planning page. Simpler, no external
-- geocoding service to fail, no address ambiguity - a member picks a county from a fixed list and
-- a radius, done. Run once in Supabase SQL Editor.

-- New, minimal function: only ever touches branch_address (repurposed to hold the county's display
-- name, e.g. "Meath"), branch_latitude/longitude (the county centroid) and planning_radius_km.
-- SECURITY DEFINER + explicit column list, same safe pattern as the existing preferences function -
-- a member can only ever update their own row, and only these four non-privileged columns.
create or replace function public.set_my_planning_location(
  p_county text, p_latitude double precision, p_longitude double precision, p_radius_km integer
) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.profiles set
    branch_address = nullif(trim(coalesce(p_county,'')),''),
    branch_latitude = case when p_latitude between -90 and 90 then p_latitude else null end,
    branch_longitude = case when p_longitude between -180 and 180 then p_longitude else null end,
    planning_radius_km = greatest(5,least(100,coalesce(p_radius_km,30)))
  where id = auth.uid();
end; $$;
grant execute on function public.set_my_planning_location(text,double precision,double precision,integer) to authenticated;

-- The general preferences function no longer needs address/Eircode/lat/lon/radius params - those
-- move to set_my_planning_location above. Postgres requires dropping a function before changing
-- its parameter list, not just replacing the body.
drop function if exists public.update_my_opportunity_preferences(text[],boolean,integer,text,text,double precision,double precision,integer,boolean);
create or replace function public.update_my_opportunity_preferences(
  p_categories text[], p_notify_email boolean, p_min_relevance_score integer, p_notify_planning boolean
) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.profiles set
    categories=coalesce(p_categories,'{}'::text[]),
    notify_email=coalesce(p_notify_email,false),
    min_relevance_score=greatest(0,least(100,coalesce(p_min_relevance_score,20))),
    notify_planning=coalesce(p_notify_planning,true)
  where id=auth.uid();
end; $$;
grant execute on function public.update_my_opportunity_preferences(text[],boolean,integer,boolean) to authenticated;
