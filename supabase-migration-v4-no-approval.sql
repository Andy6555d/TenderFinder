-- UH Tender Finder v4: remove admin approval requirement for new signups.
-- Run this ONCE in Supabase SQL Editor. Non-destructive.

-- New signups get 'approved' immediately instead of 'pending'.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,outlet_name,contact_name,status)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'outlet_name','Pending outlet'),new.raw_user_meta_data->>'contact_name','approved')
  on conflict(id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Optional: approve anyone who signed up previously and is still sitting in 'pending' from
-- before this change. Comment this out if you'd rather review and approve those manually instead.
update public.profiles set status = 'approved' where status = 'pending';
