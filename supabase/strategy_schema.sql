create extension if not exists pgcrypto;
create table if not exists public.strategy_candidates (
 id uuid primary key default gen_random_uuid(), candidate_key text unique not null,
 detected_at timestamptz default now(), last_seen_at timestamptz default now(),
 condition_id text not null, market_title text not null, market_slug text, event_slug text,
 scheduled_start timestamptz, outcome text not null, polymarket_price numeric not null,
 weighted_trader_entry numeric, liquidity numeric, external_fair_probability numeric,
 estimated_edge numeric, consensus_count integer default 0, consensus_value numeric default 0,
 qualified boolean default false, rejection_reasons jsonb default '[]'::jsonb,
 trader_details jsonb default '[]'::jsonb, alerted_at timestamptz, updated_at timestamptz default now()
);
create table if not exists public.paper_bets (
 id uuid primary key default gen_random_uuid(), candidate_key text unique not null references public.strategy_candidates(candidate_key) on delete cascade,
 placed_at timestamptz default now(), condition_id text not null, market_title text not null,
 market_slug text, event_slug text, outcome text not null, entry_price numeric not null,
 stake numeric default 10, shares numeric not null, status text default 'OPEN' check(status in ('OPEN','WON','LOST','VOID')),
 current_price numeric, payout numeric, profit numeric, roi_percent numeric, settled_at timestamptz, updated_at timestamptz default now()
);
create index if not exists strategy_candidates_detected_idx on public.strategy_candidates(detected_at desc);
create index if not exists paper_bets_placed_idx on public.paper_bets(placed_at desc);
alter table public.strategy_candidates enable row level security;
alter table public.paper_bets enable row level security;
