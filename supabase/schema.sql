-- ============================================================
-- Solky Care — Schema Supabase
-- Esegui questo file nell'SQL Editor del tuo progetto Supabase
-- ============================================================

-- Tabella profili (estende auth.users di Supabase)
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text not null,
  role       text not null default 'user' check (role in ('admin', 'user')),
  status     text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz default now()
);

-- Tabella location
create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  created_at timestamptz default now()
);

-- Tabella ore lavorate
create table if not exists public.work_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  date        text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  hours       numeric not null check (hours >= 0 and hours <= 24),
  start_time  text check (start_time ~ '^\d{2}:\d{2}$' or start_time is null),
  end_time    text check (end_time ~ '^\d{2}:\d{2}$' or end_time is null),
  notes       text,
  created_at  timestamptz default now(),
  unique (user_id, location_id, date)
);

-- Tabella notifiche
create table if not exists public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  type               text not null check (type in ('new_registration', 'hours_added')),
  read               boolean not null default false,
  trigger_user_id    uuid not null references public.profiles(id) on delete cascade,
  trigger_user_name  text not null,
  meta               jsonb,
  created_at         timestamptz default now()
);

-- ── Row Level Security ──────────────────────────────────────
-- (il backend usa la service_role key che bypassa RLS,
--  ma attiviamo RLS per sicurezza in caso di accesso diretto)

alter table public.profiles      enable row level security;
alter table public.locations     enable row level security;
alter table public.work_entries  enable row level security;
alter table public.notifications enable row level security;

-- Nessuna policy pubblica: solo la service_role key del backend può leggere/scrivere
-- (la service_role bypassa RLS automaticamente)

-- ── Location di default ─────────────────────────────────────
insert into public.locations (name) values
  ('BnB'),
  ('Casa Vacanze'),
  ('Ufficio'),
  ('Smart Working')
on conflict (name) do nothing;

-- ── Indici utili ────────────────────────────────────────────
create index if not exists idx_work_entries_user_date on public.work_entries (user_id, date);
create index if not exists idx_work_entries_date on public.work_entries (date);
create index if not exists idx_notifications_read on public.notifications (read);
