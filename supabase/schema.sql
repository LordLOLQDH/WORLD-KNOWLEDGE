-- WORLD KNOWLEDGE v0.1.0 isolated schema objects inside the shared KDS-AI project.
create extension if not exists pgcrypto;

create table if not exists public.world_knowledge_articles (
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
create index if not exists world_knowledge_articles_search_idx on public.world_knowledge_articles using gin(search_vector);
create index if not exists world_knowledge_articles_collected_idx on public.world_knowledge_articles(collected_at desc);

create table if not exists public.world_knowledge_collector_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null default 'Wikipedia DE',
  status text not null check (status in ('running','completed','failed','skipped')),
  saved_count integer not null default 0,
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists world_knowledge_collector_runs_finished_idx on public.world_knowledge_collector_runs(finished_at desc);

create table if not exists public.world_knowledge_collector_state (
  id boolean primary key default true check (id = true),
  last_started_at timestamptz,
  total_runs bigint not null default 0,
  total_saved bigint not null default 0
);
insert into public.world_knowledge_collector_state(id) values (true) on conflict (id) do nothing;

alter table public.world_knowledge_articles enable row level security;
alter table public.world_knowledge_collector_runs enable row level security;
alter table public.world_knowledge_collector_state enable row level security;

drop policy if exists "World knowledge public article read" on public.world_knowledge_articles;
create policy "World knowledge public article read" on public.world_knowledge_articles for select to anon, authenticated using (true);
drop policy if exists "World knowledge public run read" on public.world_knowledge_collector_runs;
create policy "World knowledge public run read" on public.world_knowledge_collector_runs for select to anon, authenticated using (true);

grant select on public.world_knowledge_articles to anon, authenticated;
grant select on public.world_knowledge_collector_runs to anon, authenticated;
revoke all on public.world_knowledge_collector_state from anon, authenticated;

create or replace function public.world_knowledge_claim_collector_run(p_cooldown_seconds integer default 90)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean := false;
  safe_cooldown integer := greatest(60, least(coalesce(p_cooldown_seconds, 90), 600));
begin
  insert into public.world_knowledge_collector_state(id) values (true) on conflict (id) do nothing;
  update public.world_knowledge_collector_state
     set last_started_at = now(),
         total_runs = total_runs + 1
   where id = true
     and (last_started_at is null or last_started_at < now() - make_interval(secs => safe_cooldown))
   returning true into claimed;
  return coalesce(claimed, false);
end;
$$;
revoke all on function public.world_knowledge_claim_collector_run(integer) from public, anon, authenticated;
grant execute on function public.world_knowledge_claim_collector_run(integer) to service_role;

revoke insert, update, delete on public.world_knowledge_articles from anon, authenticated;
revoke insert, update, delete on public.world_knowledge_collector_runs from anon, authenticated;


-- Public AI request throttling. The raw IP is never stored; the backend stores only a SHA-256 hash.
create table if not exists public.world_knowledge_ai_limits (
  ip_hash text primary key,
  last_request_at timestamptz not null default now()
);
alter table public.world_knowledge_ai_limits enable row level security;
revoke all on public.world_knowledge_ai_limits from anon, authenticated;
grant all on public.world_knowledge_ai_limits to service_role;

create or replace function public.world_knowledge_claim_ai_request(
  p_ip_hash text,
  p_cooldown_seconds integer default 8
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean := false;
  safe_cooldown integer := greatest(3, least(coalesce(p_cooldown_seconds, 8), 60));
begin
  if p_ip_hash is null or length(p_ip_hash) < 16 then return false; end if;
  insert into public.world_knowledge_ai_limits(ip_hash, last_request_at)
  values (p_ip_hash, now() - make_interval(secs => safe_cooldown))
  on conflict (ip_hash) do nothing;
  update public.world_knowledge_ai_limits
     set last_request_at = now()
   where ip_hash = p_ip_hash
     and last_request_at <= now() - make_interval(secs => safe_cooldown)
   returning true into claimed;
  return coalesce(claimed, false);
end;
$$;
revoke all on function public.world_knowledge_claim_ai_request(text, integer) from public, anon, authenticated;
grant execute on function public.world_knowledge_claim_ai_request(text, integer) to service_role;

-- Explicit backend write permissions. Browser roles remain read-only.
grant select, insert, update, delete on public.world_knowledge_articles to service_role;
grant select, insert, update, delete on public.world_knowledge_collector_runs to service_role;
grant select, insert, update, delete on public.world_knowledge_collector_state to service_role;
grant select, insert, update, delete on public.world_knowledge_ai_limits to service_role;
