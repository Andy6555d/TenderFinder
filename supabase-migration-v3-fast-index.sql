-- UH Tender Finder v3 FAST INDEX migration for an EXISTING v2 database.
-- Run this ONCE in Supabase SQL Editor BEFORE deploying v3 code.
-- Non-destructive: it keeps members, tenders, saves and pricing data.

alter table public.ingest_runs add column if not exists candidates integer not null default 0;

-- The old 'live_backfill' row is retained for backwards compatibility, but v3 uses it only as
-- a compact catalogue-index status record. There is no longer a slow page-by-page backfill.
update public.ingestion_state
set complete = false,
    next_page = 1,
    cycle_started_at = now(),
    cycle_completed_at = null,
    last_error = null,
    updated_at = now()
where key = 'live_backfill';

-- Make sure the useful merchant taxonomy additions are present even on older installations.
insert into public.tender_taxonomy(category,rule_type,value,weight) values
('Building Materials','keyword','blocks',15),
('Building Materials','keyword','bricks',15),
('Building Materials','keyword','aggregates',15),
('Building Materials','keyword','plasterboard',20),
('Building Materials','keyword','drywall',15),
('Timber','keyword','plywood',20),
('Timber','keyword','mdf',20),
('Timber','keyword','osb',20),
('Plumbing','keyword','pipework',20),
('Plumbing','keyword','fittings',15),
('Plumbing','keyword','sanitary fittings',20),
('Heating','keyword','heat pump',30),
('Heating','keyword','cylinder',20),
('Heating','keyword','heating supplies',30),
('Drainage & Civils','keyword','ducting',15),
('Drainage & Civils','keyword','drainage supplies',30),
('Hardware & Fixings','keyword','nuts and bolts',20),
('Hardware & Fixings','keyword','anchors',15),
('Tools','keyword','tooling',20),
('Paint & Decorating','keyword','coatings',20),
('PPE & Workwear','keyword','safety footwear',20),
('PPE & Workwear','keyword','personal protective equipment',30),
('Electrical & Lighting','keyword','electrical materials',30),
('Electrical & Lighting','keyword','lamps',15)
on conflict do nothing;
