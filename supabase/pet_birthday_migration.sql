-- Pet birthdays: pets carried a free-text "age" ("4 years"), which went stale
-- the moment it was typed. This adds a real date of birth, which the app now
-- writes, and from which it works out the age wherever one is shown.
--
-- Run this once in your Supabase project's SQL Editor
-- (Dashboard -> SQL Editor -> New query -> Run). Safe to run twice.

alter table public.pets
  add column if not exists birthday date;

-- The old age column is left in place, and the app no longer reads or writes
-- it. Free text cannot be turned into a date automatically ("4 years", "about
-- 2", "kitten" all meant something to whoever typed them and nothing to
-- Postgres), so dropping it here would quietly throw that away.
--
-- Open My Pets, set each pet's birthday, then retire the column by running:
--
--   alter table public.pets drop column if exists age;
--
-- supabase/schema.sql already describes the table without it, so a fresh
-- install never gets the column at all.
