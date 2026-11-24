-- =========================================================
-- 序光計畫：⚡ 精力管理（已經在線上套用過；可以重複執行）
--   energy_logs：每天一筆精力評估（綠 充沛／藍 普通／黃 疲憊）＋建議模式（巔峰／穩定／節能／恢復／休養）
--   其他分析全部重用既有資料：sleep_logs、focus_sessions、water_logs、meal_logs、exercise_logs、ideas
--   ⚠️ 這張表和獎勵、魂力、經驗、星屑、金幣、連擊、休息券都沒有關聯，也沒有任何發獎勵的函式
-- =========================================================
create table if not exists public.energy_logs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, day date not null,
  level text not null check (level in ('green','blue','yellow')), mode text not null check (mode in ('peak','steady','save','recover','rest')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key (user_id, day));
alter table public.energy_logs enable row level security;
do $$ begin if not exists (select 1 from pg_policies where tablename='energy_logs' and policyname='own all') then
  create policy "own all" on public.energy_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id); end if; end $$;
revoke all on public.energy_logs from anon;
grant select, insert, update, delete on public.energy_logs to authenticated, service_role;
