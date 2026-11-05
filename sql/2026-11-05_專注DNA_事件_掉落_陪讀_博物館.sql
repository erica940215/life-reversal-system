-- =========================================================
-- 序光計畫：🧬 專注 DNA、🎴 每日隨機事件、🍂 專注掉落物、👻 幽靈陪讀、🏛️ 人生博物館
-- 要先跑過「2026-10-19_好友.sql」「2026-11-01_冒險_競技場.sql」「2026-11-02_生活打卡.sql」「2026-11-05_夢境副本.sql」。可以重複執行。
-- =========================================================

-- ============ 🍂 專注掉落物 ＋ 👻 幽靈陪讀 ============
--   專注時每 5 分鐘掉一個東西，越久越稀有：
--     🍂 葉子（星屑 3）⭐ 星星（星屑 6）：隨時
--     💎 寶石（扭蛋幣 1）：專注滿 25 分鐘後
--     🌠 流星（普通星願瓶 1）：滿 60 分鐘後
--     🌈 彩虹碎片（稀有星願瓶 1）：滿 90 分鐘後，一次最多 2 個
--     👑 王冠（特殊召喚券 1）：滿 150 分鐘後，一次最多 1 個
--   結束專注時一起領；這次專注跟好友重疊 20 分鐘以上 → 「一起讀書」再加 星屑 30＋扭蛋幣 1

create table if not exists public.focus_drop_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  drops jsonb not null,
  co_min integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, started_at)
);
alter table public.focus_drop_claims enable row level security;
drop policy if exists "own select" on public.focus_drop_claims;
create policy "own select" on public.focus_drop_claims for select using (auth.uid() = user_id);
revoke insert, update, delete on public.focus_drop_claims from authenticated, anon;

create or replace function public.focus_drop_defs()
returns jsonb language sql immutable as $$ select $j${
  "leaf":    {"name":"葉子","emoji":"🍂","min":0,"item":"stardust","qty":3},
  "star":    {"name":"星星","emoji":"⭐","min":0,"item":"stardust","qty":6},
  "gem":     {"name":"寶石","emoji":"💎","min":25,"item":"gacha_coin","qty":1},
  "meteor":  {"name":"流星","emoji":"🌠","min":60,"item":"wish_normal","qty":1},
  "rainbow": {"name":"彩虹碎片","emoji":"🌈","min":90,"item":"wish_rare","qty":1,"max":2},
  "crown":   {"name":"王冠","emoji":"👑","min":150,"item":"ticket_special","qty":1,"max":1}
}$j$::jsonb $$;
grant execute on function public.focus_drop_defs() to authenticated;

-- 這次專注跟好友重疊幾分鐘
create or replace function public.co_study_min(u uuid, t0 timestamptz, t1 timestamptz)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce(max(m), 0)::int from (
    select f, (coalesce((select sum(extract(epoch from (least(s.ended_at, t1) - greatest(s.started_at, t0))))
                          from public.focus_sessions s where s.user_id = f and s.ended_at > t0 and s.started_at < t1), 0)
             + coalesce((select extract(epoch from (t1 - greatest(p.started_at, t0)))
                          from public.focus_presence p where p.user_id = f and p.status = 'running' and p.updated_at > now() - interval '12 hours'
                            and p.started_at < t1 and not exists (select 1 from public.focus_sessions s2 where s2.user_id = f and s2.started_at = p.started_at)), 0)) / 60 m
      from public.arena_friends(u) f) x
$$;
revoke all on function public.co_study_min(uuid, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.focus_drops_claim(p_started timestamptz, p_drops text[])
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); defs jsonb := public.focus_drop_defs(); mins numeric; k text; d jsonb; cnt jsonb := '{}'::jsonb; ok text[] := '{}';
  t1 timestamptz; co integer; got jsonb := '{}'::jsonb; n integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  if exists (select 1 from public.focus_drop_claims where user_id = u and started_at = p_started) then return json_build_object('ok', false, 'msg', '領過了'); end if;
  select coalesce(sum(duration_seconds), 0) / 60.0, max(ended_at) into mins, t1 from public.focus_sessions
   where user_id = u and started_at between p_started - interval '1 second' and p_started + interval '24 hours'
     and started_at >= p_started - interval '1 second' and session_date >= (p_started at time zone 'Asia/Taipei')::date - 1;
  if mins < 1 then raise exception '找不到這次專注的紀錄'; end if;
  -- 一次的專注最多看到 24 小時以內的那幾段
  n := 0;
  foreach k in array coalesce(p_drops, '{}') loop
    d := defs->k;
    continue when d is null or (d->>'min')::numeric > mins;
    continue when n >= floor(mins / 5) + 1;
    continue when d ? 'max' and coalesce((cnt->>k)::int, 0) >= (d->>'max')::int;
    cnt := cnt || jsonb_build_object(k, coalesce((cnt->>k)::int, 0) + 1);
    got := got || jsonb_build_object(d->>'item', coalesce((got->>(d->>'item'))::int, 0) + (d->>'qty')::int);
    ok := ok || k; n := n + 1;
  end loop;
  co := public.co_study_min(u, p_started, coalesce(t1, now()));
  if co >= 20 then got := got || jsonb_build_object('stardust', coalesce((got->>'stardust')::int, 0) + 30, 'gacha_coin', coalesce((got->>'gacha_coin')::int, 0) + 1); end if;
  insert into public.focus_drop_claims (user_id, started_at, drops, co_min) values (u, p_started, to_jsonb(ok), co);
  for k, n in select key, value::int from jsonb_each_text(got) loop
    perform public.grant_item(u, k, n, 'fdrop:' || p_started || ':' || k);
  end loop;
  return json_build_object('ok', true, 'drops', cnt, 'reward', got, 'co_min', co);
end; $$;
revoke all on function public.focus_drops_claim(timestamptz, text[]) from public, anon;
grant execute on function public.focus_drops_claim(timestamptz, text[]) to authenticated;

-- 👻 陪讀：好友現在的專注狀態（專注頁每 30 秒讀一次）
create or replace function public.co_study_status()
returns json language sql stable security definer set search_path to 'public' as $$
  select coalesce(json_agg(json_build_object(
      'name', public.arena_name(f),
      'state', case when p.status is not null and p.status <> 'idle' and p.updated_at > now() - interval '12 hours' then p.status else 'idle' end,
      'live_ms', case when p.status = 'running' and p.updated_at > now() - interval '12 hours' then p.acc_ms + (extract(epoch from (now() - p.seg_start)) * 1000)::bigint
                      when p.status = 'paused' and p.updated_at > now() - interval '12 hours' then p.acc_ms else 0 end,
      'started_at', p.started_at,
      'subject_today', (select subject from public.focus_sessions s where s.user_id = f order by started_at desc limit 1),
      'class', (select h.class from public.rpg_heroes h where h.user_id = f))), '[]'::json)
  from public.arena_friends(auth.uid()) f left join public.focus_presence p on p.user_id = f
$$;
revoke all on function public.co_study_status() from public, anon;
grant execute on function public.co_study_status() to authenticated;


-- ============ 🎴 每日隨機事件 ============
create table if not exists public.daily_event_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  ev text not null,
  done_at timestamptz,
  settled boolean not null default false,
  primary key (user_id, day)
);
alter table public.daily_event_log enable row level security;
drop policy if exists "own select" on public.daily_event_log;
create policy "own select" on public.daily_event_log for select using (auth.uid() = user_id);
revoke insert, update, delete on public.daily_event_log from authenticated, anon;

create or replace function public.daily_event_defs()
returns jsonb language sql immutable as $$ select $j${
  "meteor":   {"name":"流星雨","emoji":"🌠","good":true, "text":"今天每完成 1 個任務，天上就掉下一顆流星（星屑 +10，最多 10 顆）。"},
  "traveler": {"name":"神祕旅人","emoji":"🧙","good":true, "text":"一位旅人在村口休息。今天專注滿 2 小時，他會留下一瓶稀有星願瓶。"},
  "thief":    {"name":"小偷出沒","emoji":"🦝","good":false,"text":"有小浣熊在附近徘徊！今天專注滿 30 分鐘就能把牠趕走（還會撿到扭蛋幣）；趕不走的話，明天會被偷走 50 星屑。"},
  "lucky":    {"name":"幸運日","emoji":"🍀","good":true, "text":"今天專注掉下來的東西比較容易是稀有的。簽到再送 30 星屑。"},
  "earlybird":{"name":"早起鳥","emoji":"🐦","good":true, "text":"早上 10:30 前完成 1 個任務，早起鳥會叼來 2 枚扭蛋幣。"},
  "harvest":  {"name":"豐收日","emoji":"🌾","good":true, "text":"今天生活打卡五個領域全勤，就能收成一個金寶箱。"},
  "together": {"name":"讀書會","emoji":"👥","good":true, "text":"今天跟好友一起專注 20 分鐘以上（同一段時間），兩個人各拿 1 張特殊召喚券。"},
  "dreamy":   {"name":"好夢日","emoji":"🌙","good":true, "text":"今晚入夢的話，明早帶出來時夢之碎片多 2 片。"},
  "marathon": {"name":"任務馬拉松","emoji":"🏃","good":true, "text":"今天完成 5 個任務，拿 1 張普通召喚券。"},
  "quiet":    {"name":"安靜的一天","emoji":"☕","good":true, "text":"今天沒有特別的事。好好休息，明天的事件一定是好事。"}
}$j$::jsonb $$;
grant execute on function public.daily_event_defs() to authenticated;

create or replace function public.daily_event_pick(u uuid, d date)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare keys text[] := array['meteor', 'traveler', 'thief', 'lucky', 'earlybird', 'harvest', 'together', 'dreamy', 'marathon', 'quiet', 'meteor', 'lucky']; k text; y text;
begin
  select ev into y from public.daily_event_log where user_id = u and day = d;
  if found then return y; end if;
  k := keys[1 + abs(hashtext(u::text || ':ev:' || d)) % array_length(keys, 1)];
  select ev into y from public.daily_event_log where user_id = u and day = d - 1;
  if (y = 'quiet' or y = 'thief') and k = 'thief' then k := 'meteor'; end if;
  return k;
end; $$;
revoke all on function public.daily_event_pick(uuid, date) from public, anon, authenticated;

-- 今天的進度：回傳 [現在, 目標]
create or replace function public.daily_event_progress(u uuid, ev text, d date)
returns int[] language plpgsql stable security definer set search_path to 'public' as $$
declare a integer; t0 timestamptz := (d::timestamp + interval '6 hours') at time zone 'Asia/Taipei';
begin
  case ev
    when 'meteor' then select least(10, count(*)) into a from public.tasks where user_id = u and task_date = d and completed; return array[a, 10];
    when 'traveler' then select coalesce(sum(duration_seconds), 0) / 60 into a from public.focus_sessions where user_id = u and session_date = d; return array[a, 120];
    when 'thief' then select coalesce(sum(duration_seconds), 0) / 60 into a from public.focus_sessions where user_id = u and session_date = d; return array[least(a, 30), 30];
    when 'lucky' then return array[(exists (select 1 from public.checkins where user_id = u and checkin_date = d))::int, 1];
    when 'earlybird' then select count(*) into a from public.tasks where user_id = u and completed and completed_at >= t0 and completed_at < t0 + interval '4 hours 30 minutes'; return array[least(a, 1), 1];
    when 'harvest' then return array[public.life_all_clear(u, d)::int, 1];
    when 'together' then return array[least(public.co_study_min(u, t0, least(now(), t0 + interval '1 day')), 20), 20];
    when 'dreamy' then return array[(exists (select 1 from public.dream_nights where user_id = u and day = d and entered_at is not null))::int, 1];
    when 'marathon' then select least(5, count(*)) into a from public.tasks where user_id = u and task_date = d and completed; return array[a, 5];
    else return array[1, 1];
  end case;
end; $$;
revoke all on function public.daily_event_progress(uuid, text, date) from public, anon, authenticated;

create or replace function public.daily_event_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); t date := public.app_today(); ev text; pr int[]; done boolean; got jsonb := '[]'::jsonb; y record; n integer; have integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  -- 結算昨天以前（小偷、好夢）
  for y in select * from public.daily_event_log where user_id = u and day < t and not settled loop
    pr := public.daily_event_progress(u, y.ev, y.day);
    if y.ev = 'thief' and pr[1] < pr[2] then
      select coalesce((select qty from public.player_items where user_id = u and item_key = 'stardust'), 0) into have;
      if have > 0 then perform public.fun_take(u, 'stardust', least(50, have), 'devt-thief:' || y.day); end if;
      got := got || jsonb_build_object('why', '🦝 昨天沒趕走小偷', 'text', '被偷走了 ' || least(50, have) || ' 星屑', 'bad', true);
    end if;
    if y.ev = 'dreamy' and pr[1] >= 1 and public.grant_item(u, 'dream_shard', 2, 'devt-dreamy:' || y.day) then
      got := got || jsonb_build_object('why', '🌙 好夢日', 'text', '夢之碎片 +2');
    end if;
    -- 跨日才完成的（例如昨晚很晚才專注完）也補發
    update public.daily_event_log set settled = true where user_id = u and day = y.day;
  end loop;
  ev := public.daily_event_pick(u, t);
  insert into public.daily_event_log (user_id, day, ev) values (u, t, ev) on conflict do nothing;
  pr := public.daily_event_progress(u, ev, t);
  done := pr[1] >= pr[2];
  -- 流星雨：每顆都發
  if ev = 'meteor' then
    for n in 1..pr[1] loop
      if public.grant_item(u, 'stardust', 10, 'devt:' || t || ':meteor:' || n) then got := got || jsonb_build_object('why', '🌠 流星雨', 'text', '星屑 +10'); end if;
    end loop;
  elsif done and ev not in ('quiet', 'dreamy') then
    if (case ev when 'traveler' then public.grant_item(u, 'wish_rare', 1, 'devt:' || t)
                when 'thief' then public.grant_item(u, 'gacha_coin', 1, 'devt:' || t)
                when 'lucky' then public.grant_item(u, 'stardust', 30, 'devt:' || t)
                when 'earlybird' then public.grant_item(u, 'gacha_coin', 2, 'devt:' || t)
                when 'harvest' then public.grant_item(u, 'chest_gold', 1, 'devt:' || t)
                when 'together' then public.grant_item(u, 'ticket_special', 1, 'devt:' || t)
                when 'marathon' then public.grant_item(u, 'ticket_normal', 1, 'devt:' || t)
                else false end) then
      update public.daily_event_log set done_at = now() where user_id = u and day = t;
      got := got || jsonb_build_object('why', (public.daily_event_defs()->ev->>'emoji') || ' ' || (public.daily_event_defs()->ev->>'name'), 'text', '完成了！獎勵已放進背包');
    end if;
  end if;
  return json_build_object('day', t, 'ev', ev, 'def', public.daily_event_defs()->ev, 'progress', pr, 'done', done, 'got', got);
end; $$;
revoke all on function public.daily_event_status() from public, anon;
grant execute on function public.daily_event_status() to authenticated;


-- ============ 🧬 專注 DNA ============
create or replace function public.focus_dna(p_offset integer default 0)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); m date := (date_trunc('month', public.app_today()) + make_interval(months => least(p_offset, 0)))::date;
  m1 date := (m + interval '1 month - 1 day')::date; d1 date;
begin
  if u is null then raise exception '尚未登入'; end if;
  d1 := least(m1, public.app_today());
  return (with s as (
      select subject, duration_seconds / 60.0 mn, extract(hour from started_at at time zone 'Asia/Taipei')::int h,
             extract(isodow from session_date)::int wd, session_date, mode, planned_minutes, coalesce(is_manual, false) man
        from public.focus_sessions where user_id = u and session_date between m and m1),
    prev as (select duration_seconds / 60.0 mn, session_date from public.focus_sessions
              where user_id = u and session_date between (m - interval '1 month')::date and m - 1)
    select json_build_object(
      'month', m, 'offset', least(p_offset, 0), 'days', d1 - m + 1,
      'total_min', round(coalesce((select sum(mn) from s), 0)),
      'sessions', (select count(*) from s where not man),
      'avg_min', round(coalesce((select avg(mn) from s where not man), 0)),
      'median_min', round(coalesce((select percentile_cont(0.5) within group (order by mn) from s where not man), 0)::numeric),
      'longest_min', round(coalesce((select max(mn) from s), 0)),
      'focus_days', (select count(distinct session_date) from s),
      'hours', (select json_agg(round(coalesce((select sum(mn) from s where s.h = hh), 0)) order by hh) from generate_series(0, 23) hh),
      'weekdays', (select json_agg(round(coalesce((select sum(mn) from s where s.wd = w), 0)) order by w) from generate_series(1, 7) w),
      'subjects', coalesce((select json_agg(x order by (x->>'min')::numeric desc) from (
          select json_build_object('name', subject, 'min', round(sum(mn)), 'n', count(*), 'avg', round(avg(mn)),
                 'short', round(100.0 * count(*) filter (where mn < 15) / count(*)),
                 'stop', round(100.0 * count(*) filter (where mode = 'down' and planned_minutes > 0 and mn < planned_minutes * 0.8) / nullif(count(*) filter (where mode = 'down' and planned_minutes > 0), 0))) x
            from s where not man group by subject) q), '[]'::json),
      'prev', json_build_object('total_min', round(coalesce((select sum(mn) from prev), 0)), 'avg_min', round(coalesce((select avg(mn) from prev), 0)),
                                'focus_days', (select count(distinct session_date) from prev))));
end; $$;
revoke all on function public.focus_dna(integer) from public, anon;
grant execute on function public.focus_dna(integer) to authenticated;


-- ============ 🏛️ 人生博物館 ============
create table if not exists public.museum_items (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  note text check (char_length(note) <= 300),
  happened_on date not null default current_date,
  category text not null default 'other',
  emoji text,
  photo text check (photo is null or char_length(photo) <= 400000),
  created_at timestamptz not null default now()
);
alter table public.museum_items enable row level security;
drop policy if exists "own all" on public.museum_items;
create policy "own all" on public.museum_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.museum_items to authenticated;
grant usage, select on sequence public.museum_items_id_seq to authenticated;

-- 每 3 件展品 → 一次策展獎勵（星屑 50），每開一間新展廳（每 6 件）→ 稀有星願瓶
create or replace function public.museum_reward()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); n integer; i integer; got jsonb := '[]'::jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select count(*) into n from public.museum_items where user_id = u;
  for i in 1..(n / 3) loop
    if public.grant_item(u, 'stardust', 50, 'museum:' || (i * 3)) then got := got || jsonb_build_object('n', i * 3, 'text', '策展獎勵：星屑 +50'); end if;
    if (i * 3) % 6 = 0 and public.grant_item(u, 'wish_rare', 1, 'museum-hall:' || (i * 3)) then got := got || jsonb_build_object('n', i * 3, 'text', '新展廳開幕：稀有星願瓶 ×1'); end if;
  end loop;
  return json_build_object('count', n, 'got', got);
end; $$;
revoke all on function public.museum_reward() from public, anon;
grant execute on function public.museum_reward() to authenticated;
