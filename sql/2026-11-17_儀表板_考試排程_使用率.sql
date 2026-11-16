-- =========================================================
-- 序光計畫：📊 學習儀表板、🗓️ 考試排程、🧹 功能使用率（已經在線上套用過；可以重複執行）
--   kb_plans：考試排程（考試名稱、日期、要讀哪幾份複習資料）；每天要學幾個單元由前端依剩下的量回推
--   feature_usage：每天每個功能（分頁、今日頁卡片）點了幾次；usage_bump() 一次寫入一批
-- =========================================================
create table if not exists public.kb_plans (
  id bigserial primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, exam_date date not null, source_ids bigint[] not null default '{}', created_at timestamptz not null default now());
create table if not exists public.feature_usage (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, day date not null default public.app_today(),
  key text not null, label text, n integer not null default 0, primary key (user_id, day, key));
do $$ declare t text; begin
  foreach t in array array['kb_plans','feature_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'own all') then
      execute format('create policy "own all" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    end if;
  end loop;
end $$;
grant select, insert, update, delete on public.kb_plans, public.feature_usage to authenticated;
grant usage, select on sequence public.kb_plans_id_seq to authenticated;

create or replace function public.usage_bump(p jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today();
begin
  if u is null then return; end if;
  insert into public.feature_usage (user_id, day, key, label, n)
  select u, t, k, max(l), least(sum(n), 500)::int from (
    select left(x->>'k', 60) k, left(x->>'l', 40) l, coalesce((x->>'n')::int, 1) n from jsonb_array_elements(p) x where coalesce(x->>'k', '') <> '' limit 80) y
  group by k
  on conflict (user_id, day, key) do update set n = public.feature_usage.n + excluded.n, label = coalesce(excluded.label, public.feature_usage.label);
end; $$;
revoke all on function public.usage_bump(jsonb) from public, anon;
grant execute on function public.usage_bump(jsonb) to authenticated;
