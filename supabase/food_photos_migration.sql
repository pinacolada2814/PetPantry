-- Pet Pantry: add photo support to food items
-- Run this once in the Supabase SQL Editor (your database already exists,
-- so schema.sql can't be re-run as-is — this adds just the new pieces).

alter table public.food_items add column photos text[] not null default '{}';

-- Public bucket: photos aren't sensitive, and a public bucket means the app
-- can just use <img src> directly instead of generating signed URLs.
insert into storage.buckets (id, name, public)
values ('food-photos', 'food-photos', true)
on conflict (id) do nothing;

create policy "food photos are publicly readable"
on storage.objects for select
using (bucket_id = 'food-photos');

-- Uploads/edits/deletes are still locked to the user's own folder
-- (files are stored as "<userId>/<foodItemId>/<filename>").
create policy "users can upload their own food photos"
on storage.objects for insert
with check (
  bucket_id = 'food-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "users can update their own food photos"
on storage.objects for update
using (
  bucket_id = 'food-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "users can delete their own food photos"
on storage.objects for delete
using (
  bucket_id = 'food-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);
