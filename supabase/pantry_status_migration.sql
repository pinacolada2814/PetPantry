-- Pet Pantry: low-stock thresholds
-- Run this once in the Supabase SQL Editor (your database already exists,
-- so schema.sql can't be re-run as-is — this adds just the new piece).
--
-- The threshold lives on food_items rather than inventory because "am I
-- running low on this food?" is a question about the food as a whole, not
-- about one expiration batch of it: three cans expiring in March plus ten
-- expiring in August is thirteen cans on hand, not two separate shortages.
-- Stock level therefore compares the threshold against the SUM of the
-- inventoryNumber across all of a food's inventory rows.
--
-- Null means "use the app default" (see DEFAULT_LOW_STOCK in app.js), so
-- existing rows need no backfill and a user who never touches the setting
-- still gets a sensible badge.
--
-- Safe to re-run.

alter table public.food_items
  add column if not exists "lowStockThreshold" numeric;
