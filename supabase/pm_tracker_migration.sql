-- Pet Pantry: PM tracker storage
-- Run this once in the Supabase SQL Editor.
--
-- Backs the /pm.html project tracker. One row per user: the tracker's whole
-- state is a single JSON blob keyed by the owner's auth.users id, scoped by
-- row-level security exactly like pets / food_items / inventory / meal_logs.
--
-- The page authenticates with Supabase Auth (the same email/password login as
-- the rest of the app) rather than a client-side password gate, so the anon
-- key being public in config.js grants no access to anyone else's tracker.
--
-- Safe to re-run: this drops and recreates the table. It is DESTRUCTIVE if the
-- table already holds data you care about — an earlier revision of this file
-- created a shared, world-readable pm_tracker keyed by a text id, and this
-- replaces it.

drop table if exists public.pm_tracker;

create table public.pm_tracker (
  "userId" uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  "updatedAt" timestamptz not null default now()
);

alter table public.pm_tracker enable row level security;

create policy "own pm_tracker" on public.pm_tracker
  for all using (auth.uid() = "userId") with check (auth.uid() = "userId");
