-- UH Tender Finder v6: a private "standing documents" folder per member outlet, so things like
-- a Tax Clearance Cert or eESPD only need to be uploaded once and are always there when needed.
-- Run this ONCE in Supabase SQL Editor. Non-destructive.

-- Metadata for each uploaded document. The file itself lives in Storage; this table just tracks
-- what it is and, where relevant, when it expires.
create table if not exists public.member_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  file_path text not null,
  file_name text not null,
  file_size integer,
  expires_at date,
  created_at timestamptz not null default now()
);
create index if not exists member_documents_user_idx on public.member_documents(user_id, created_at desc);

alter table public.member_documents enable row level security;
drop policy if exists "Own documents" on public.member_documents;
create policy "Own documents" on public.member_documents for all to authenticated
  using(user_id = auth.uid())
  with check(user_id = auth.uid() and public.is_approved_member());

-- Private storage bucket. Not public: files are only ever reached via short-lived signed URLs
-- generated for the owning member, the same way private pricing data already works.
insert into storage.buckets (id, name, public)
values ('member-documents', 'member-documents', false)
on conflict (id) do nothing;

-- Files are stored under a path of "{user_id}/{filename}", so this restricts each member to
-- the folder matching their own auth.uid() - they can never read, list or overwrite another
-- member's documents even though everyone shares the same bucket.
drop policy if exists "Own document files" on storage.objects;
create policy "Own document files" on storage.objects for all to authenticated
  using(bucket_id = 'member-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check(bucket_id = 'member-documents' and (storage.foldername(name))[1] = auth.uid()::text);
