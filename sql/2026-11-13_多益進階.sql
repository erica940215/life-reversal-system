-- =========================================================
-- 序光計畫：🎯 多益進階（錯誤原因、每週 Boss、連續火焰、靈獸陪讀經驗）
-- 可以重複執行。
-- =========================================================
create table if not exists public.toeic_reasons (
  id bigserial primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  qid text not null, part integer not null, tag text not null, reason text not null,
  day date not null default public.app_today(), created_at timestamptz not null default now());
alter table public.toeic_reasons enable row level security;
grant select, insert, delete on public.toeic_reasons to authenticated;
grant usage, select on sequence public.toeic_reasons_id_seq to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'toeic_reasons' and policyname = 'own all') then
    create policy "own all" on public.toeic_reasons for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- 👹 每週 Boss：這週答對的題目就是傷害（模考、完整試題答對算 2 點），HP 150；打倒給召喚券＋星屑（每週一次）
create or replace function public.toeic_boss()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); w date := public.life_week(public.app_today()); dmg integer; claimed boolean;
begin
  if u is null then raise exception '尚未登入'; end if;
  select coalesce(sum(case when mode in ('mock', 'test') then 2 else 1 end), 0) into dmg
    from public.toeic_answers where user_id = u and correct and day >= w and day < w + 7;
  claimed := exists (select 1 from public.item_events where user_id = u and source_key = 'toeic-boss:' || w);
  return json_build_object('week', w, 'hp', 150, 'dmg', dmg, 'claimed', claimed);
end; $$;
create or replace function public.toeic_boss_claim()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); b json;
begin
  b := public.toeic_boss();
  if (b->>'dmg')::int < 150 then raise exception 'Boss 還沒被打倒'; end if;
  if not public.grant_item(u, 'ticket_normal', 1, 'toeic-boss:' || (b->>'week')) then raise exception '這週的 Boss 獎勵已經領過了'; end if;
  perform public.grant_item(u, 'stardust', 200, 'toeic-boss:' || (b->>'week') || ':sd');
  return public.toeic_boss();
end; $$;

-- 🔥 連續火焰：每天完成全部多益任務（allday）算一天；7／30／100 天各給一次獎勵
create or replace function public.toeic_streak()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); d date[]; s record; got integer := 0;
begin
  if u is null then raise exception '尚未登入'; end if;
  select array_agg(split_part(source_key, ':', 2)::date) into d from public.item_events
    where user_id = u and source_key like 'toeic:%:allday';
  select * into s from public.streak_best(coalesce(d, '{}'), public.app_today());
  if s.cur >= 7 and public.grant_item(u, 'stardust', 100, 'toeic-streak:7') then got := got + 100; end if;
  if s.cur >= 30 and public.grant_item(u, 'stardust', 500, 'toeic-streak:30') then got := got + 500; end if;
  if s.cur >= 100 and public.grant_item(u, 'ticket_special', 2, 'toeic-streak:100') then got := got + 1; end if;
  return json_build_object('cur', s.cur, 'best', s.best, 'granted', got);
end; $$;
do $$ declare f text; begin
  foreach f in array array['toeic_boss()', 'toeic_boss_claim()', 'toeic_streak()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
