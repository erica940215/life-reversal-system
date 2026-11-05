-- =========================================================
-- 序光計畫：🪞 理想中的你（分身）
-- 可以重複執行。
--
--   分身每天照計畫走 1 天的路；你每天走「今日分數」那麼遠
--   今日分數 = 專注 50%（達到每日專注目標＝滿分，最多 1.5 倍）
--            ＋ 生活打卡 30%（六個領域平均完成度）
--            ＋ 任務 20%（今天任務完成比例，沒有任務算滿分）
--   落後時你的分數 ×1.5（追趕加速）；差距最多 7 天，超過分身會停下來等你
--   休息日（rest_days）分身也休息
-- =========================================================

create table if not exists public.twin_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  start_date date not null,
  focus_goal integer not null default 240 check (focus_goal between 30 and 720),
  name text not null default '理想中的我' check (char_length(name) between 1 and 20),
  updated_at timestamptz not null default now()
);
alter table public.twin_settings enable row level security;
drop policy if exists "own select" on public.twin_settings;
create policy "own select" on public.twin_settings for select using (auth.uid() = user_id);
revoke insert, update, delete on public.twin_settings from authenticated, anon;

create or replace function public.twin_day_score(u uuid, d date, goal integer)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare fm integer; lp numeric; tn integer; td integer; f numeric; l numeric; k numeric;
begin
  select coalesce(sum(duration_seconds), 0) / 60 into fm from public.focus_sessions where user_id = u and session_date = d;
  select avg(p) into lp from (select public.life_pct(u, dom, d) p from unnest(array['sleep', 'care', 'health', 'food', 'life', 'weekly']) dom) x where p is not null;
  select count(*), count(*) filter (where completed) into tn, td from public.tasks where user_id = u and task_date = d and not coalesce(skipped, false);
  f := least(fm::numeric / goal, 1.5);
  l := coalesce(lp, 0) / 100;
  k := case when tn = 0 then 1 else td::numeric / tn end;
  return jsonb_build_object('focus_min', fm, 'life', round(coalesce(lp, 0)), 'tasks', tn, 'done', td,
    'f', round(f, 3), 'l', round(l, 3), 'k', round(k, 3), 'score', round(0.5 * f + 0.3 * l + 0.2 * k, 3));
end; $$;
revoke all on function public.twin_day_score(uuid, date, integer) from public, anon, authenticated;

create or replace function public.twin_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); s public.twin_settings; d date; sc jsonb; ideal numeric := 0; me numeric := 0;
  gain numeric; rest boolean; hist jsonb := '[]'::jsonb; waited boolean := false; behind14 integer := 0; ahead7 integer := 0; gap numeric; today jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into s from public.twin_settings where user_id = u;
  if not found then
    insert into public.twin_settings (user_id, start_date) values (u, t) returning * into s;
  end if;
  d := s.start_date;
  while d <= t loop
    rest := exists (select 1 from public.rest_days r where r.user_id = u and r.day = d);
    sc := public.twin_day_score(u, d, s.focus_goal);
    -- 今天還沒過完：分身只走到「現在的時間比例」
    if not rest then ideal := ideal + case when d = t then least(1, greatest(0.15, extract(epoch from (now() at time zone 'Asia/Taipei') - (d + time '06:00')) / 86400.0)) else 1 end; end if;
    gain := (sc->>'score')::numeric;
    if me < ideal - 0.05 then gain := gain * 1.5; end if;
    me := me + gain;
    waited := false;
    if ideal - me > 7 then ideal := me + 7; waited := true; end if;
    gap := ideal - me;
    hist := hist || jsonb_build_array(jsonb_build_object('d', d, 'gap', round(gap, 2), 'score', sc->'score', 'rest', rest));
    if d > t - 14 and gap >= 5 then behind14 := behind14 + 1; end if;
    if d > t - 7 and gap <= -1 then ahead7 := ahead7 + 1; end if;
    if d = t then today := sc; end if;
    d := d + 1;
  end loop;
  gap := ideal - me;
  return json_build_object('settings', row_to_json(s), 'ideal', round(ideal, 2), 'me', round(me, 2), 'gap', round(gap, 2),
    'waiting', gap >= 6.99, 'today', today, 'rest_today', exists (select 1 from public.rest_days where user_id = u and day = t),
    'history', (select jsonb_agg(h) from (select h from jsonb_array_elements(hist) h order by h->>'d' desc limit 21) x),
    'days', t - s.start_date + 1,
    'suggest', case when behind14 >= 14 then 'lower' when ahead7 >= 7 then 'raise' end,
    'can_claim', gap <= 0.05 and not exists (select 1 from public.item_events where user_id = u and source_key = 'twin:' || public.life_week(t) || ':stardust'));
end; $$;

create or replace function public.twin_save(p_goal integer, p_name text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '尚未登入'; end if;
  insert into public.twin_settings (user_id, start_date, focus_goal, name) values (u, public.app_today(), p_goal, coalesce(nullif(btrim(p_name), ''), '理想中的我'))
    on conflict (user_id) do update set focus_goal = excluded.focus_goal, name = excluded.name, updated_at = now();
  return public.twin_status();
end; $$;

-- 並肩或超越 → 每週一次獎勵
create or replace function public.twin_claim()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); st jsonb; w date := public.life_week(public.app_today());
begin
  st := public.twin_status()::jsonb;
  if (st->>'gap')::numeric > 0.05 then raise exception '還沒追上分身'; end if;
  if public.grant_item(u, 'stardust', 100, 'twin:' || w || ':stardust') then
    perform public.grant_item(u, 'gacha_coin', 2, 'twin:' || w || ':coin');
  end if;
  return public.twin_status();
end; $$;

-- 重新開始（把起點改成今天，差距歸零）
create or replace function public.twin_reset()
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  update public.twin_settings set start_date = public.app_today(), updated_at = now() where user_id = auth.uid();
  return public.twin_status();
end; $$;

do $$ declare f text; begin
  foreach f in array array['twin_status()', 'twin_save(integer,text)', 'twin_claim()', 'twin_reset()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
