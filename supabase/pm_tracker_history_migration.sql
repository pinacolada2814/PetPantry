-- Pet Pantry: PM tracker version history
-- Run this once in the Supabase SQL Editor, after pm_tracker_migration.sql.
--
-- The tracker is a single JSON row that every save overwrites in place, so a
-- bad edit — from the page or from scripts/pm.py — is otherwise unrecoverable.
-- This keeps the previous state on every change, giving a rollback point.
--
-- A database trigger does the snapshotting rather than the clients, so the page
-- and the CLI both get history without either having to remember to write it.
--
-- Safe to re-run.

create table if not exists public.pm_tracker_history (
  id bigserial primary key,
  "userId" uuid not null references auth.users(id) on delete cascade,
  state jsonb not null,
  "savedAt" timestamptz not null default now()
);

create index if not exists pm_tracker_history_user_time
  on public.pm_tracker_history ("userId", "savedAt" desc);

alter table public.pm_tracker_history enable row level security;

drop policy if exists "own pm_tracker_history" on public.pm_tracker_history;
create policy "own pm_tracker_history" on public.pm_tracker_history
  for all using (auth.uid() = "userId") with check (auth.uid() = "userId");

-- Snapshot the state being replaced, then keep only the most recent 50 per
-- user. The page saves on a debounce, so an editing session produces several
-- rows; 50 is deep enough to walk back a bad day without growing forever.
create or replace function public.pm_tracker_snapshot()
returns trigger
language plpgsql
as $$
begin
  insert into public.pm_tracker_history ("userId", state)
  values (old."userId", old.state);

  delete from public.pm_tracker_history
   where "userId" = old."userId"
     and id not in (
       select id from public.pm_tracker_history
        where "userId" = old."userId"
        order by "savedAt" desc
        limit 50
     );

  return new;
end;
$$;

drop trigger if exists pm_tracker_snapshot_before_update on public.pm_tracker;
create trigger pm_tracker_snapshot_before_update
  before update on public.pm_tracker
  for each row
  when (old.state is distinct from new.state)
  execute function public.pm_tracker_snapshot();
