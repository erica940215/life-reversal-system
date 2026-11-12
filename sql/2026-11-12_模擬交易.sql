-- =========================================================
-- 序光計畫：📈 模擬交易
--   往後模擬：建立時把策略與參數鎖住，從起始日開始照公式自動買賣
--   （行情由 edge function「market」從 Yahoo Finance 取得，模擬在瀏覽器計算）
-- 可以重複執行。
-- =========================================================
create table if not exists public.trade_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  symbol text not null,
  strategy text not null,
  params jsonb not null default '{}',
  capital numeric not null default 100000,
  fee numeric not null default 0.1,
  start_date date not null default current_date,
  created_at timestamptz not null default now()
);
alter table public.trade_runs enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'trade_runs' and policyname = 'own all') then
    create policy "own all" on public.trade_runs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
