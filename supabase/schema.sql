-- Pet Pantry database schema
-- Run this once in your Supabase project's SQL Editor (Dashboard → SQL Editor → New query → Run).
-- User accounts live in Supabase's built-in auth.users table; these tables hold everything else.

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references auth.users(id) on delete cascade,
  name text not null,
  gender text,
  age text,
  breed text,
  "createdDate" timestamptz not null default now(),
  "lastModifiedDate" timestamptz not null default now()
);

create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references auth.users(id) on delete cascade,
  brand text not null,
  name text not null,
  type text not null,
  "sizeNum" numeric,
  "sizeUnit" text,
  proteins text[] default '{}',
  color text,
  purchased text,
  "createdDate" timestamptz not null default now(),
  "lastModifiedDate" timestamptz not null default now()
);

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references auth.users(id) on delete cascade,
  "foodItemId" uuid not null references public.food_items(id) on delete cascade,
  "expirationDate" date,
  "inventoryNumber" numeric
);

create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references auth.users(id) on delete cascade,
  "dateTime" timestamptz not null,
  "petId" uuid references public.pets(id) on delete set null,
  "inventoryTableId" uuid references public.inventory(id) on delete set null,
  "foodLabel" text,
  size text,
  amount numeric,
  "catRating" int,
  note text,
  "createdDate" timestamptz not null default now()
);

-- Row Level Security: every user can only ever see or touch their own rows.
alter table public.pets enable row level security;
alter table public.food_items enable row level security;
alter table public.inventory enable row level security;
alter table public.meal_logs enable row level security;

create policy "own pets" on public.pets
  for all using (auth.uid() = "userId") with check (auth.uid() = "userId");

create policy "own food_items" on public.food_items
  for all using (auth.uid() = "userId") with check (auth.uid() = "userId");

create policy "own inventory" on public.inventory
  for all using (auth.uid() = "userId") with check (auth.uid() = "userId");

create policy "own meal_logs" on public.meal_logs
  for all using (auth.uid() = "userId") with check (auth.uid() = "userId");
