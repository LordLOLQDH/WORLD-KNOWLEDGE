-- WORLD KNOWLEDGE v0.1.0
-- Run this file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  extract text not null default '',
  source_name text not null default 'Wikipedia',
  source_language text not null default 'de',
  source_url text not null unique,
  license text not null default 'CC BY-SA 4.0',
  license_url text not null default 'https://creativecommons.org/licenses/by-sa/4.0/',
  collected_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('german', coalesce(title, '') || ' ' || coalesce(extract, ''))
  ) stored
);
create index if not exists articles_search_idx on public.articles using gin(search_vector);
create index if not exists articles_collected_idx on public.articles(collected_at desc);

create table if not exists public.collector_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null default 'Wikipedia DE',
  status text not null check (status in ('running','completed','failed','skipped')),
  saved_count integer not null default 0,
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists collector_runs_finished_idx on public.collector_runs(finished_at desc);

create table if not exists public.collector_state (
  id boolean primary key default true check (id = true),
  last_started_at timestamptz,
  total_runs bigint not null default 0,
  total_saved bigint not null default 0
);
insert into public.collector_state(id) values (true) on conflict (id) do nothing;

alter table public.articles enable row level security;
alter table public.collector_runs enable row level security;
alter table public.collector_state enable row level security;

drop policy if exists "Public can read articles" on public.articles;
create policy "Public can read articles" on public.articles for select to anon, authenticated using (true);
drop policy if exists "Public can read collector runs" on public.collector_runs;
create policy "Public can read collector runs" on public.collector_runs for select to anon, authenticated using (true);
drop policy if exists "Public can read collector state" on public.collector_state;
create policy "Public can read collector state" on public.collector_state for select to anon, authenticated using (true);

grant select on public.articles to anon, authenticated;
grant select on public.collector_runs to anon, authenticated;
grant select on public.collector_state to anon, authenticated;

-- Atomically allow at most one public-triggered collection run per cooldown window.
create or replace function public.claim_collector_run(p_cooldown_seconds integer default 90)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean := false;
  safe_cooldown integer := greatest(60, least(coalesce(p_cooldown_seconds, 90), 600));
begin
  insert into public.collector_state(id) values (true) on conflict (id) do nothing;
  update public.collector_state
     set last_started_at = now(),
         total_runs = total_runs + 1
   where id = true
     and (last_started_at is null or last_started_at < now() - make_interval(secs => safe_cooldown))
   returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_collector_run(integer) from public;
grant execute on function public.claim_collector_run(integer) to anon, authenticated;

-- Only the Edge Function's server-side client can insert or update collector data.
revoke insert, update, delete on public.articles from anon, authenticated;
revoke insert, update, delete on public.collector_runs from anon, authenticated;
revoke insert, update, delete on public.collector_state from anon, authenticated;