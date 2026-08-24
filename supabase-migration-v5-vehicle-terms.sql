-- Closes a gap: the General Merchant exclude list only covered vehicle/truck/bus, so notices
-- worded "lorry", "van" or "trailer" (like the flatbed lorry) weren't excluded even though the
-- diagnostic query's own comment expected them to be. Run once, then Admin -> Reclassify stored
-- tenders to apply it to notices already in the database.
insert into public.tender_taxonomy(category,rule_type,value,weight) values
('General Merchant','exclude_keyword','lorry',45),
('General Merchant','exclude_keyword','van',35),
('General Merchant','exclude_keyword','trailer',35)
on conflict(category,rule_type,value) do update set weight=excluded.weight, active=true;
