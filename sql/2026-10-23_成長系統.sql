-- =========================================================
-- 🌱 成長系統：大地圖探索、壞習慣封印、會長大的小夥伴、怪怪稱號、好友賭約
-- 需要先跑過：2026-10-23_小隊.sql、2026-10-23_遠征萬聖節日誌.sql
-- 可以重複執行。
--
--   大地圖：累積專注的分鐘數＋每個完成的任務算 10 分鐘＝走過的路，抵達新地區送獎勵
--   壞習慣封印：最多 5 個；每天沒破戒，封印就多一天；3/7/14/30/60/100 天各有獎勵（每個封印每階一次）
--     破戒了：天數歸零；2 天內可以花 5 星屑修補一次（每個封印 30 天一次），天數回來
--   小夥伴：領養後吃你的真實行動長大（蛋 → 寶寶 → 少年 → 成年 → 傳說）
--     成年時看你最常做什麼決定型態：專注＝智慧型、任務＝力量型、運動＝活力型、習慣和簽到＝守護型
--     兩天沒做事會睡著（不會死）；每天可以摸一次，拿星屑 1
--   稱號：依真實數據自動頒發，可以戴一個，會顯示在小隊、排行、動態牆
--   好友賭約：跟好友約本週目標，各押星屑；達成的人拿回來；對方沒達成你就把他的也贏走；兩個都達成各加 50%
--     兩個都沒達成各退一半；對方沒接受的話週末自動退回
-- =========================================================

alter table public.fun_profile add column if not exists title text;


-- =========================================================
-- 🗺️ 大地圖
-- =========================================================
create or replace function public.map_catalog()
returns jsonb language sql immutable as $$
  select '[
    {"key":"map_village", "name":"起始之村", "emoji":"🏡", "min":0,     "lore":"一切從這裡開始。村口的老爺爺說：「每一分鐘的專注，都是一步。」"},
    {"key":"map_forest",  "name":"晨光森林", "emoji":"🌲", "min":180,   "lore":"樹葉間的光點會跟著專注的人走。"},
    {"key":"map_swamp",   "name":"迷霧沼澤", "emoji":"🌫️", "min":600,   "lore":"手機幽靈的老家。只有不回頭的人走得出去。"},
    {"key":"map_ruins",   "name":"古代遺跡", "emoji":"🏛️", "min":1500,  "lore":"古代學者在牆上刻滿筆記，最後一行寫著：堅持。"},
    {"key":"map_oasis",   "name":"沙漠綠洲", "emoji":"🏜️", "min":3000,  "lore":"走過最乾的一段路，水特別甜。"},
    {"key":"map_tundra",  "name":"冰封雪原", "emoji":"❄️", "min":4800,  "lore":"雪原很安靜，安靜到聽得見自己的心跳。"},
    {"key":"map_volcano", "name":"烈焰火山", "emoji":"🌋", "min":7200,  "lore":"熱情不會熄滅的人，才能站上火山口。"},
    {"key":"map_peak",    "name":"星之山脈", "emoji":"⛰️", "min":10200, "lore":"在這裡，星星近得伸手就碰得到。"},
    {"key":"map_temple",  "name":"海底神殿", "emoji":"🐚", "min":13800, "lore":"深海裡的神殿，只為耐得住寂寞的人打開。"},
    {"key":"map_sky",     "name":"天空之城", "emoji":"🏰", "min":18000, "lore":"雲端上的城市，國王在等你。"},
    {"key":"map_end",     "name":"世界盡頭", "emoji":"🌅", "min":24000, "lore":"走到這裡的人，已經不需要地圖了。"}
  ]'::jsonb
$$;

create or replace function public.map_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  c jsonb := public.map_catalog();
  v_focus integer; v_tasks integer; v_dist integer;
  v_reached integer := 0;
  v_new jsonb := '[]'::jsonb;
  i integer;
  r jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select coalesce(sum(duration_seconds), 0) / 60 into v_focus from public.focus_sessions where user_id = v_user;
  select count(*) into v_tasks from public.tasks where user_id = v_user and completed;
  v_dist := v_focus + v_tasks * 10;

  for i in 0..jsonb_array_length(c) - 1 loop
    if v_dist >= (c->i->>'min')::int then
      v_reached := i;
      if i > 0 then
        r := case
          when i <= 2 then jsonb_build_object('stardust', 3 * i, 'chest_wood', 1)
          when i <= 5 then jsonb_build_object('stardust', 4 * i, 'chest_iron', 1, 'gacha_coin', 1)
          when i <= 8 then jsonb_build_object('stardust', 5 * i, 'chest_gold', 1, 'gacha_coin', 2)
          else jsonb_build_object('stardust', 6 * i, 'chest_star', 1, 'ticket_special', 1) end;
        if public.grant_item(v_user, 'map_mark', 1, 'map:' || i) then
          perform public.fun_give(v_user, r, 'map-reward:' || i);
          v_new := v_new || jsonb_build_object('idx', i, 'reward', r);
          perform public.feed_post(v_user, 'map', jsonb_build_object('idx', i, 'name', c->i->>'name'));
        end if;
      end if;
    end if;
  end loop;

  return json_build_object('regions', c, 'dist', v_dist, 'focus_min', v_focus, 'tasks', v_tasks,
                           'reached', v_reached, 'new', v_new);
end;
$function$;
revoke all on function public.map_status() from public, anon;
grant execute on function public.map_status() to authenticated;


-- =========================================================
-- 🔒 壞習慣封印
-- =========================================================
create table if not exists public.seals (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '🔒',
  started date not null,
  prev_started date,
  broken_at date,
  breaks integer not null default 0,
  best integer not null default 0,
  repaired_at date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists seals_user on public.seals (user_id);
alter table public.seals enable row level security;
revoke all on public.seals from anon, authenticated;

create or replace function public.seal_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  s record;
  m integer;
  ms integer[] := array[3, 7, 14, 30, 60, 100];
  v_days integer;
  v_r jsonb;
  v_new jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  for s in select * from public.seals where user_id = v_user and active loop
    v_days := v_today - s.started;
    if v_days > s.best then update public.seals set best = v_days where id = s.id; end if;
    foreach m in array ms loop
      if v_days >= m then
        v_r := case m when 3 then '{"stardust":2}'::jsonb when 7 then '{"chest_wood":1,"stardust":3}'::jsonb
                      when 14 then '{"chest_iron":1,"stardust":5}'::jsonb when 30 then '{"chest_gold":1,"stardust":8}'::jsonb
                      when 60 then '{"chest_gold":1,"stardust":15,"gacha_coin":2}'::jsonb else '{"chest_star":1,"stardust":25}'::jsonb end;
        if public.grant_item(v_user, 'seal_mark', 1, 'seal:' || s.id || ':' || m) then
          perform public.fun_give(v_user, v_r, 'seal-reward:' || s.id || ':' || m);
          v_new := v_new || jsonb_build_object('seal', s.name, 'days', m, 'reward', v_r);
          if m >= 30 then perform public.feed_post(v_user, 'seal', jsonb_build_object('name', s.name, 'days', m)); end if;
        end if;
      end if;
    end loop;
  end loop;

  return json_build_object(
    'today', v_today,
    'seals', coalesce((select json_agg(json_build_object('id', id, 'name', name, 'emoji', emoji, 'days', v_today - started,
              'started', started, 'breaks', breaks, 'best', greatest(best, v_today - started),
              'can_repair', broken_at is not null and broken_at >= v_today - 2 and prev_started is not null
                            and (repaired_at is null or repaired_at < v_today - 30)) order by created_at)
              from public.seals where user_id = v_user and active), '[]'::json),
    'stardust', public.fun_qty(v_user, 'stardust'),
    'new', v_new);
end;
$function$;
revoke all on function public.seal_status() from public, anon;
grant execute on function public.seal_status() to authenticated;

create or replace function public.seal_add(p_name text, p_emoji text default '🔒')
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_name text := left(trim(coalesce(p_name, '')), 20);
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if v_name = '' then raise exception '寫下想封印的壞習慣'; end if;
  if (select count(*) from public.seals where user_id = v_user and active) >= 5 then raise exception '最多同時封印 5 個'; end if;
  insert into public.seals (user_id, name, emoji, started) values (v_user, v_name, coalesce(nullif(p_emoji, ''), '🔒'), public.app_today());
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.seal_add(text, text) from public, anon;
grant execute on function public.seal_add(text, text) to authenticated;

create or replace function public.seal_break(p_id bigint)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); s public.seals%rowtype;
begin
  select * into s from public.seals where id = p_id and user_id = v_user and active for update;
  if not found then raise exception '找不到這個封印'; end if;
  update public.seals set prev_started = started, started = public.app_today(), broken_at = public.app_today(),
         breaks = breaks + 1, best = greatest(best, public.app_today() - started)
    where id = p_id;
  return json_build_object('success', true, 'lost', public.app_today() - s.started);
end;
$function$;
revoke all on function public.seal_break(bigint) from public, anon;
grant execute on function public.seal_break(bigint) to authenticated;

create or replace function public.seal_repair(p_id bigint)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_today date := public.app_today(); s public.seals%rowtype;
begin
  select * into s from public.seals where id = p_id and user_id = v_user and active for update;
  if not found then raise exception '找不到這個封印'; end if;
  if s.broken_at is null or s.broken_at < v_today - 2 or s.prev_started is null then raise exception '只能修補 2 天內的裂痕'; end if;
  if s.repaired_at is not null and s.repaired_at >= v_today - 30 then raise exception '這個封印 30 天內已經修補過了'; end if;
  perform public.fun_take(v_user, 'stardust', 5, 'seal-repair:' || p_id || ':' || v_today);
  update public.seals set started = prev_started, prev_started = null, broken_at = null, repaired_at = v_today where id = p_id;
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.seal_repair(bigint) from public, anon;
grant execute on function public.seal_repair(bigint) to authenticated;

create or replace function public.seal_remove(p_id bigint)
returns json language plpgsql security definer set search_path to 'public'
as $function$
begin
  update public.seals set active = false where id = p_id and user_id = auth.uid();
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.seal_remove(bigint) from public, anon;
grant execute on function public.seal_remove(bigint) to authenticated;


-- =========================================================
-- 🐣 會長大的小夥伴
-- =========================================================
create table if not exists public.buddies (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  form text,                       -- 成年時決定：wise / strong / lively / guard
  adopted_at timestamptz not null default now(),
  petted date
);
alter table public.buddies enable row level security;
revoke all on public.buddies from anon, authenticated;

-- 從領養那天起的真實行動換成成長點數
create or replace function public.buddy_points(p_user uuid, p_since timestamptz)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare d date := ((p_since at time zone 'Asia/Taipei') - interval '2 hours')::date;
  f integer; t integer; e integer; h integer; c integer;
begin
  select coalesce(sum(duration_seconds), 0) / 600 into f from public.focus_sessions where user_id = p_user and session_date >= d;
  select count(*) * 3 into t from public.tasks where user_id = p_user and completed and completed_at >= p_since;
  select coalesce(sum(minutes), 0) / 5 into e from public.exercise_logs where user_id = p_user and log_date >= d;
  select count(*) * 2 into h from public.habit_logs where user_id = p_user and log_date >= d;
  select count(*) * 2 into c from public.checkins where user_id = p_user and checkin_date >= d;
  return jsonb_build_object('focus', f, 'tasks', t, 'exercise', e, 'guard', h + c, 'total', f + t + e + h + c);
end;
$function$;
revoke all on function public.buddy_points(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.buddy_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  b public.buddies%rowtype;
  p jsonb;
  v_total integer;
  v_stage integer;
  v_form text;
  v_active boolean;
  v_today_act boolean;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select * into b from public.buddies where user_id = v_user;
  if not found then return json_build_object('buddy', null); end if;

  p := public.buddy_points(v_user, b.adopted_at);
  v_total := (p->>'total')::int;
  v_stage := case when v_total >= 2500 then 4 when v_total >= 1000 then 3 when v_total >= 400 then 2 when v_total >= 100 then 1 else 0 end;

  -- 成年那一刻決定型態，之後不會變
  v_form := b.form;
  if v_stage >= 3 and v_form is null then
    v_form := case greatest((p->>'focus')::int, (p->>'tasks')::int, (p->>'exercise')::int, (p->>'guard')::int)
                when (p->>'focus')::int then 'wise' when (p->>'tasks')::int then 'strong'
                when (p->>'exercise')::int then 'lively' else 'guard' end;
    update public.buddies set form = v_form where user_id = v_user;
    perform public.feed_post(v_user, 'buddy', jsonb_build_object('name', b.name, 'form', v_form, 'stage', 3));
  end if;
  if v_stage = 4 then
    perform public.grant_item(v_user, 'buddy_mark', 1, 'buddy-legend');
  end if;

  v_today_act := exists (select 1 from public.focus_sessions where user_id = v_user and session_date = v_today)
              or exists (select 1 from public.tasks where user_id = v_user and completed and ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date = v_today)
              or exists (select 1 from public.checkins where user_id = v_user and checkin_date = v_today);
  v_active := v_today_act
              or exists (select 1 from public.focus_sessions where user_id = v_user and session_date >= v_today - 1)
              or exists (select 1 from public.tasks where user_id = v_user and completed and completed_at >= now() - interval '2 days');

  return json_build_object('buddy', json_build_object(
    'name', b.name, 'stage', v_stage, 'form', v_form, 'points', p, 'adopted_at', b.adopted_at,
    'mood', case when v_today_act then 'happy' when v_active then 'calm' else 'sleep' end,
    'petted', b.petted = v_today,
    'next', case v_stage when 0 then 100 when 1 then 400 when 2 then 1000 when 3 then 2500 else null end));
end;
$function$;
revoke all on function public.buddy_status() from public, anon;
grant execute on function public.buddy_status() to authenticated;

create or replace function public.buddy_adopt(p_name text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_name text := left(trim(coalesce(p_name, '')), 12);
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if v_name = '' then v_name := '小光'; end if;
  insert into public.buddies (user_id, name) values (v_user, v_name)
    on conflict (user_id) do update set name = excluded.name;
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.buddy_adopt(text) from public, anon;
grant execute on function public.buddy_adopt(text) to authenticated;

create or replace function public.buddy_pet()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_today date := public.app_today(); v_ok boolean;
begin
  update public.buddies set petted = v_today where user_id = v_user and (petted is null or petted < v_today);
  if not found then raise exception '今天已經摸過了，明天再來'; end if;
  v_ok := public.grant_item(v_user, 'stardust', 1, 'pet:' || v_today);
  return json_build_object('success', true, 'dust', v_ok);
end;
$function$;
revoke all on function public.buddy_pet() from public, anon;
grant execute on function public.buddy_pet() to authenticated;


-- =========================================================
-- 🏷️ 怪怪稱號
-- =========================================================
create table if not exists public.user_titles (
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, title)
);
alter table public.user_titles enable row level security;
revoke all on public.user_titles from anon, authenticated;

create or replace function public.title_catalog()
returns jsonb language sql immutable as $$
  select '[
    {"key":"night_owl",   "name":"夜行者",     "emoji":"🦉", "how":"凌晨 0～4 點開始專注過"},
    {"key":"early_bird",  "name":"晨型戰士",   "emoji":"🌅", "how":"有 7 天在早上 7 點前完成任務"},
    {"key":"focus_demon", "name":"專注魔人",   "emoji":"🔥", "how":"一天專注超過 6 小時"},
    {"key":"marathon",    "name":"馬拉松選手", "emoji":"🏃", "how":"一次連續專注 3 小時以上"},
    {"key":"attendance",  "name":"全勤王",     "emoji":"📅", "how":"連續簽到 30 天"},
    {"key":"harvester",   "name":"任務收割機", "emoji":"🌾", "how":"一天完成 20 個任務"},
    {"key":"slayer",      "name":"屠龍者",     "emoji":"🐉", "how":"打倒第 3 階以上的每週王"},
    {"key":"lucky_king",  "name":"歐皇",       "emoji":"👑", "how":"抽到 3 件傳說裝備"},
    {"key":"unlucky",     "name":"非洲酋長",   "emoji":"🥁", "how":"召喚 50 次還沒抽到傳說"},
    {"key":"collector",   "name":"收藏家",     "emoji":"🗃️", "how":"擁有 30 件不同的裝備"},
    {"key":"butterfly",   "name":"社交蝴蝶",   "emoji":"🦋", "how":"幫好友加油 30 次"},
    {"key":"daikichi",    "name":"大吉體質",   "emoji":"🎋", "how":"抽到 5 次大吉"},
    {"key":"crow_friend", "name":"烏鴉之友",   "emoji":"🐦‍⬛", "how":"刮刮樂刮到 10 次烏鴉"},
    {"key":"explorer",    "name":"天空旅人",   "emoji":"🏰", "how":"專注遠征走到天空之城"},
    {"key":"sealer",      "name":"封印大師",   "emoji":"🔒", "how":"一個壞習慣封印 30 天"},
    {"key":"parent",      "name":"夥伴之親",   "emoji":"🐣", "how":"小夥伴長到成年"},
    {"key":"ghostbuster", "name":"捉鬼大師",   "emoji":"👻", "how":"抓到 30 隻萬聖節幽靈"},
    {"key":"wanderer",    "name":"世界盡頭",   "emoji":"🌅", "how":"大地圖走到世界盡頭"},
    {"key":"gambler",     "name":"說到做到",   "emoji":"🤝", "how":"贏下 3 次好友賭約"}
  ]'::jsonb
$$;

create or replace function public.title_check(p_user uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  got text[] := array[]::text[];
  t text;
  v_new jsonb := '[]'::jsonb;
begin
  if exists (select 1 from public.focus_sessions where user_id = p_user and extract(hour from started_at at time zone 'Asia/Taipei') < 4) then got := array_append(got, 'night_owl'); end if;
  if (select count(distinct (completed_at at time zone 'Asia/Taipei')::date) from public.tasks
      where user_id = p_user and completed and extract(hour from completed_at at time zone 'Asia/Taipei') between 4 and 6) >= 7 then got := array_append(got, 'early_bird'); end if;
  if exists (select 1 from public.focus_sessions where user_id = p_user group by session_date having sum(duration_seconds) >= 21600) then got := array_append(got, 'focus_demon'); end if;
  if exists (select 1 from public.focus_sessions where user_id = p_user and duration_seconds >= 10800) then got := array_append(got, 'marathon'); end if;
  if exists (select 1 from public.checkins where user_id = p_user and streak >= 30) then got := array_append(got, 'attendance'); end if;
  if exists (select 1 from public.tasks where user_id = p_user and completed
             group by ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date having count(*) >= 20) then got := array_append(got, 'harvester'); end if;
  if exists (select 1 from public.rpg_boss_runs where user_id = p_user and killed_at is not null and tier >= 3) then got := array_append(got, 'slayer'); end if;
  if (select count(*) from public.rpg_summon_log where user_id = p_user and tier = 's') >= 3 then got := array_append(got, 'lucky_king'); end if;
  if (select count(*) from public.rpg_summon_log where user_id = p_user) >= 50
     and not exists (select 1 from public.rpg_summon_log where user_id = p_user and tier = 's') then got := array_append(got, 'unlucky'); end if;
  if (select count(*) from public.rpg_gear where user_id = p_user) >= 30 then got := array_append(got, 'collector'); end if;
  if (select count(*) from public.cheers where from_user = p_user) >= 30 then got := array_append(got, 'butterfly'); end if;
  if (select count(*) from public.fun_fortunes where user_id = p_user and kind = 'daikichi') >= 5 then got := array_append(got, 'daikichi'); end if;
  if (select count(*) from public.fun_scratch_log where user_id = p_user and prize = 'crow') >= 10 then got := array_append(got, 'crow_friend'); end if;
  if exists (select 1 from public.expeditions where user_id = p_user and place = 4) then got := array_append(got, 'explorer'); end if;
  if exists (select 1 from public.seals where user_id = p_user and active and (public.app_today() - started >= 30 or best >= 30)) then got := array_append(got, 'sealer'); end if;
  if exists (select 1 from public.buddies where user_id = p_user and form is not null) then got := array_append(got, 'parent'); end if;
  if (select count(*) from public.hw_ghosts where user_id = p_user and caught_at is not null) >= 30 then got := array_append(got, 'ghostbuster'); end if;
  if exists (select 1 from public.item_events where user_id = p_user and source_key = 'map:10') then got := array_append(got, 'wanderer'); end if;
  if (select count(*) from public.bets where status = 'settled' and ((a = p_user and a_done) or (b = p_user and b_done))) >= 3 then got := array_append(got, 'gambler'); end if;

  foreach t in array got loop
    insert into public.user_titles (user_id, title) values (p_user, t) on conflict do nothing;
    if found then
      v_new := v_new || to_jsonb(t);
      perform public.feed_post(p_user, 'title', jsonb_build_object('title', t));
    end if;
  end loop;
  return v_new;
end;
$function$;
revoke all on function public.title_check(uuid) from public, anon, authenticated;

create or replace function public.title_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_new jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  v_new := public.title_check(v_user);
  return json_build_object(
    'catalog', public.title_catalog(),
    'earned', coalesce((select json_agg(title order by earned_at) from public.user_titles where user_id = v_user), '[]'::json),
    'equipped', (select title from public.fun_profile where user_id = v_user),
    'new', v_new);
end;
$function$;
revoke all on function public.title_status() from public, anon;
grant execute on function public.title_status() to authenticated;

create or replace function public.title_equip(p_title text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid();
begin
  if p_title is not null and not exists (select 1 from public.user_titles where user_id = v_user and title = p_title) then
    raise exception '還沒拿到這個稱號';
  end if;
  insert into public.fun_profile (user_id, title) values (v_user, p_title)
    on conflict (user_id) do update set title = excluded.title;
  return json_build_object('success', true, 'title', p_title);
end;
$function$;
revoke all on function public.title_equip(text) from public, anon;
grant execute on function public.title_equip(text) to authenticated;


-- =========================================================
-- 🤝 好友賭約
-- =========================================================
create table if not exists public.bets (
  id bigserial primary key,
  a uuid not null references auth.users(id) on delete cascade,   -- 發起人
  b uuid not null references auth.users(id) on delete cascade,   -- 對手
  week_start date not null,
  goal_type text not null check (goal_type in ('focus', 'tasks', 'checkin')),
  goal integer not null,
  stake integer not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'declined', 'cancelled', 'settled')),
  a_done boolean,
  b_done boolean,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists bets_a on public.bets (a);
create index if not exists bets_b on public.bets (b);
alter table public.bets enable row level security;
revoke all on public.bets from anon, authenticated;

-- 某人某週某目標的進度
create or replace function public.bet_progress(p_user uuid, p_week date, p_type text)
returns integer language sql stable security definer set search_path to 'public' as $$
  select case p_type
    when 'focus' then (select coalesce(sum(duration_seconds), 0) / 60 from public.focus_sessions
                       where user_id = p_user and session_date between p_week and p_week + 6)::int
    when 'tasks' then (select count(*) from public.tasks where user_id = p_user and completed
                       and ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date between p_week and p_week + 6)::int
    else (select count(*) from public.checkins where user_id = p_user and checkin_date between p_week and p_week + 6)::int end
$$;
revoke all on function public.bet_progress(uuid, date, text) from public, anon, authenticated;

-- 週末過了就結算（任何一方打開時都會結算）
create or replace function public.bet_settle(p_user uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  x record;
  ad boolean; bd boolean;
  v_week date := public.fun_week_start();
  pay_a integer; pay_b integer;
begin
  -- 沒人接的：退回發起人
  for x in select * from public.bets where status = 'pending' and week_start < v_week and (a = p_user or b = p_user) for update loop
    update public.bets set status = 'cancelled', settled_at = now() where id = x.id;
    perform public.grant_item(x.a, 'stardust', x.stake, 'bet-refund:' || x.id);
  end loop;

  for x in select * from public.bets where status = 'active' and week_start < v_week and (a = p_user or b = p_user) for update loop
    ad := public.bet_progress(x.a, x.week_start, x.goal_type) >= x.goal;
    bd := public.bet_progress(x.b, x.week_start, x.goal_type) >= x.goal;
    if ad and bd then pay_a := x.stake + x.stake / 2; pay_b := pay_a;
    elsif ad then pay_a := x.stake * 2; pay_b := 0;
    elsif bd then pay_a := 0; pay_b := x.stake * 2;
    else pay_a := x.stake / 2; pay_b := x.stake / 2; end if;
    update public.bets set status = 'settled', a_done = ad, b_done = bd, settled_at = now() where id = x.id;
    if pay_a > 0 then perform public.grant_item(x.a, 'stardust', pay_a, 'bet-pay:' || x.id || ':a'); end if;
    if pay_b > 0 then perform public.grant_item(x.b, 'stardust', pay_b, 'bet-pay:' || x.id || ':b'); end if;
  end loop;
end;
$function$;
revoke all on function public.bet_settle(uuid) from public, anon, authenticated;

create or replace function public.bet_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception '尚未登入'; end if;
  perform public.bet_settle(v_user);
  return json_build_object(
    'week', public.fun_week_start(),
    'stardust', public.fun_qty(v_user, 'stardust'),
    'bets', coalesce((select json_agg(json_build_object(
        'id', x.id, 'mine', x.a = v_user, 'status', x.status, 'week', x.week_start,
        'goal_type', x.goal_type, 'goal', x.goal, 'stake', x.stake,
        'other', case when x.a = v_user then x.b else x.a end,
        'other_name', public.team_name_of(case when x.a = v_user then x.b else x.a end),
        'me_now', public.bet_progress(v_user, x.week_start, x.goal_type),
        'other_now', public.bet_progress(case when x.a = v_user then x.b else x.a end, x.week_start, x.goal_type),
        'me_done', case when x.a = v_user then x.a_done else x.b_done end,
        'other_done', case when x.a = v_user then x.b_done else x.a_done end
      ) order by x.created_at desc)
      from (select * from public.bets where (a = v_user or b = v_user)
              and (status in ('pending', 'active') or settled_at >= now() - interval '10 days')
            order by created_at desc limit 12) x), '[]'::json));
end;
$function$;
revoke all on function public.bet_status() from public, anon;
grant execute on function public.bet_status() to authenticated;

create or replace function public.bet_create(p_friend uuid, p_type text, p_goal integer, p_stake integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_week date := public.fun_week_start(); v_id bigint;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if not public.team_is_friend(v_user, p_friend) then raise exception '只能跟好友打賭'; end if;
  if p_type not in ('focus', 'tasks', 'checkin') then raise exception '沒有這種目標'; end if;
  if p_stake not in (10, 30, 50) then raise exception '押注只能是 10、30 或 50 星屑'; end if;
  if p_goal < 1 or (p_type = 'checkin' and p_goal > 7) or (p_type = 'focus' and p_goal > 6000) or (p_type = 'tasks' and p_goal > 300) then
    raise exception '目標不合理'; end if;
  if exists (select 1 from public.bets where week_start = v_week and status in ('pending', 'active')
             and ((a = v_user and b = p_friend) or (a = p_friend and b = v_user))) then
    raise exception '這週你們已經有一個賭約了'; end if;
  insert into public.bets (a, b, week_start, goal_type, goal, stake) values (v_user, p_friend, v_week, p_type, p_goal, p_stake) returning id into v_id;
  perform public.fun_take(v_user, 'stardust', p_stake, 'bet-stake:' || v_id || ':a');
  return json_build_object('success', true, 'id', v_id);
end;
$function$;
revoke all on function public.bet_create(uuid, text, integer, integer) from public, anon;
grant execute on function public.bet_create(uuid, text, integer, integer) to authenticated;

create or replace function public.bet_answer(p_id bigint, p_accept boolean)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); x public.bets%rowtype;
begin
  select * into x from public.bets where id = p_id and b = v_user and status = 'pending' for update;
  if not found then raise exception '這個賭約已經失效了'; end if;
  if x.week_start < public.fun_week_start() then raise exception '這個賭約已經過期了'; end if;
  if p_accept then
    perform public.fun_take(v_user, 'stardust', x.stake, 'bet-stake:' || p_id || ':b');
    update public.bets set status = 'active' where id = p_id;
    perform public.feed_post(v_user, 'bet', jsonb_build_object('with', public.team_name_of(x.a), 'type', x.goal_type, 'goal', x.goal, 'stake', x.stake));
  else
    update public.bets set status = 'declined', settled_at = now() where id = p_id;
    perform public.grant_item(x.a, 'stardust', x.stake, 'bet-refund:' || p_id);
  end if;
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.bet_answer(bigint, boolean) from public, anon;
grant execute on function public.bet_answer(bigint, boolean) to authenticated;

create or replace function public.bet_cancel(p_id bigint)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); x public.bets%rowtype;
begin
  select * into x from public.bets where id = p_id and a = v_user and status = 'pending' for update;
  if not found then raise exception '只能取消對方還沒接受的賭約'; end if;
  update public.bets set status = 'cancelled', settled_at = now() where id = p_id;
  perform public.grant_item(v_user, 'stardust', x.stake, 'bet-refund:' || p_id);
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.bet_cancel(bigint) from public, anon;
grant execute on function public.bet_cancel(bigint) to authenticated;



-- =========================================================
-- 名字旁邊顯示稱號：小隊、排行、動態牆
-- =========================================================
create or replace function public.team_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_week date := public.fun_week_start();
  v_team bigint;
  t public.teams%rowtype;
  r public.team_raids%rowtype;
  v_members jsonb := '[]'::jsonb;
  v_invites jsonb;
  v_friends jsonb;
  v_quests jsonb := null;
  v_cheered_me integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  v_team := public.team_of(v_user);

  if v_team is not null then
    select * into t from public.teams where id = v_team;
    r := public.team_raid_ensure(v_team);
    v_quests := public.team_quests(v_team, v_user);

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.user_id, 'me', m.user_id = v_user, 'owner', m.user_id = t.owner,
        'name', public.team_name_of(m.user_id),
        'class', h.class, 'frame', fp.frame, 'title', fp.title,
        'focus_min', (select coalesce(sum(duration_seconds), 0) / 60 from public.focus_sessions where user_id = m.user_id and session_date = v_today),
        'tasks', (select count(*) from public.tasks where user_id = m.user_id and completed
                    and ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date = v_today),
        'attacks', (select count(*) from public.rpg_boss_hits where user_id = m.user_id and hit_day = v_today),
        'raid_dmg', (select coalesce(sum(dmg), 0) from public.team_raid_hits where team_id = v_team and week_start = v_week and user_id = m.user_id)
      ) order by m.joined_at), '[]'::jsonb)
      into v_members
      from public.team_members m
      left join public.rpg_heroes h on h.user_id = m.user_id
      left join public.fun_profile fp on fp.user_id = m.user_id
      where m.team_id = v_team;
  end if;

  -- 別人邀請我
  select coalesce(jsonb_agg(jsonb_build_object('team', i.team_id, 'name', tt.name, 'emblem', tt.emblem,
           'by', public.team_name_of(i.invited_by),
           'count', (select count(*) from public.team_members where team_id = i.team_id))), '[]'::jsonb)
    into v_invites
    from public.team_invites i join public.teams tt on tt.id = i.team_id
    where i.user_id = v_user;

  -- 好友（加油、邀請用）
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.other, 'name', public.team_name_of(f.other),
      'class', h.class, 'frame', fp.frame, 'title', fp.title,
      'team', public.team_of(f.other),
      'invited', v_team is not null and exists (select 1 from public.team_invites where team_id = v_team and user_id = f.other),
      'cheered', exists (select 1 from public.cheers where from_user = v_user and to_user = f.other and day = v_today)
    ) order by public.team_name_of(f.other)), '[]'::jsonb)
    into v_friends
    from (select case when user_a = v_user then user_b else user_a end as other
          from public.friendships where status = 'accepted' and (user_a = v_user or user_b = v_user)) f
    left join public.rpg_heroes h on h.user_id = f.other
    left join public.fun_profile fp on fp.user_id = f.other;

  select count(*) into v_cheered_me from public.cheers where to_user = v_user and day = v_today;

  return json_build_object(
    'team', case when v_team is null then null else jsonb_build_object(
      'id', t.id, 'name', t.name, 'emblem', t.emblem, 'owner', t.owner = v_user, 'bonus', public.team_bonus(v_team)) end,
    'members', v_members,
    'raid', case when v_team is null then null else to_jsonb(r) end,
    'raid_bosses', public.raid_catalog(),
    'quests', v_quests,
    'invites', v_invites,
    'friends', v_friends,
    'cheers_today', v_cheered_me,
    'cheers_unused', (select count(*) from public.cheers where to_user = v_user and day = v_today and not used),
    'cheers_given', (select count(*) from public.cheers where from_user = v_user and day = v_today),
    'week_end', v_week + 7);
end;
$function$;
revoke all on function public.team_status() from public, anon;
grant execute on function public.team_status() to authenticated;

create or replace function public.feed_list()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception '尚未登入'; end if;
  return coalesce((
    select json_agg(x order by x.at desc) from (
      select e.id, e.kind, e.data, e.created_at as at, e.user_id = v_user as me,
             public.team_name_of(e.user_id) as name, h.class, fp.frame, fp.title,
             (select count(*) from public.feed_likes l where l.event_id = e.id) as likes,
             exists (select 1 from public.feed_likes l where l.event_id = e.id and l.user_id = v_user) as liked
      from public.feed_events e
      left join public.rpg_heroes h on h.user_id = e.user_id
      left join public.fun_profile fp on fp.user_id = e.user_id
      where e.created_at >= now() - interval '7 days'
        and (e.user_id = v_user or public.team_is_friend(v_user, e.user_id))
      order by e.created_at desc limit 40) x), '[]'::json);
end;
$function$;
revoke all on function public.feed_list() from public, anon;
grant execute on function public.feed_list() to authenticated;

create or replace function public.rpg_boss_rank()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_week date := public.app_today() - (extract(isodow from public.app_today())::int - 1);
begin
  if v_user is null then raise exception '尚未登入'; end if;
  return coalesce((
    select json_agg(row_to_json(x) order by x.dmg desc, x.name)
    from (
      select u.id = v_user as me,
             coalesce(p.username, '冒險者') as name,
             h.class,
             fp.frame,
             fp.title,
             coalesce(r.dmg, 0) as dmg,
             r.tier,
             r.killed_at is not null as killed
      from (select v_user as id
            union select case when f.user_a = v_user then f.user_b else f.user_a end
            from public.friendships f
            where f.status = 'accepted' and (f.user_a = v_user or f.user_b = v_user)) u
      left join public.profiles p on p.id = u.id
      left join public.rpg_heroes h on h.user_id = u.id
      left join public.fun_profile fp on fp.user_id = u.id
      left join public.rpg_boss_runs r on r.user_id = u.id and r.week_start = v_week
    ) x), '[]'::json);
end;
$function$;
revoke all on function public.rpg_boss_rank() from public, anon;
grant execute on function public.rpg_boss_rank() to authenticated;

notify pgrst, 'reload schema';

select case
  when exists (select 1 from pg_proc where proname = 'bet_status' and pronamespace = 'public'::regnamespace)
    then '✅ 大地圖、封印、小夥伴、稱號、好友賭約設定完成'
  else '⚠️ 設定失敗'
end as 檢查結果;
