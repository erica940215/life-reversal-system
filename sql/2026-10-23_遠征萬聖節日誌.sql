-- =========================================================
-- 🎃 萬聖節活動、🧭 專注遠征、📖 每週冒險日誌
-- 需要先跑過：2026-10-22_驚喜.sql、2026-10-23_裝備擴充.sql、2026-10-23_小隊.sql
-- 可以重複執行。
--
--   專注遠征：每次專注 10 分鐘以上（補記的不算），角色就去探險一趟
--     走多遠看專注多久：10 分晨光森林、25 分迷霧沼澤、50 分古代遺跡、90 分星之山脈、150 分天空之城
--     倒數計時提早結束（不到預定的 90%）：只拿星屑和金幣，寶箱和稀有東西沒有
--   萬聖節（10/23～11/1，糖果商店開到 11/3）：
--     完成任務 40% 遇到幽靈、專注 25 分鐘以上必遇到一隻、10/31 當天簽到送一隻大的
--     南瓜幽靈 1 糖果、糖果蝙蝠 2 糖果、黑貓巫師 5 糖果＋扭蛋幣 1
--     糖果商店：南瓜頭像框、南瓜燈杖、女巫帽、扭蛋幣、刮刮樂、星光寶箱
--   冒險日誌：任何一週的真實紀錄（網頁會把它寫成故事）
-- =========================================================


-- ---------- 🧭 專注遠征 ----------
create table if not exists public.expeditions (
  session_id bigint primary key references public.focus_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  minutes integer not null,
  place integer not null,
  early boolean not null default false,
  story integer not null default 0,
  reward jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists expeditions_user on public.expeditions (user_id, created_at desc);
alter table public.expeditions enable row level security;
drop policy if exists "own select" on public.expeditions;
create policy "own select" on public.expeditions for select using (auth.uid() = user_id);
revoke insert, update, delete on public.expeditions from authenticated, anon;

-- 走到哪裡：0 晨光森林、1 迷霧沼澤、2 古代遺跡、3 星之山脈、4 天空之城
create or replace function public.exp_place(p_min integer)
returns integer language sql immutable as $$
  select case when p_min >= 150 then 4 when p_min >= 90 then 3 when p_min >= 50 then 2 when p_min >= 25 then 1 else 0 end
$$;

create or replace function public.exp_claim()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  s record;
  v_min integer; v_place integer; v_early boolean;
  v_reward jsonb; v_out jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  for s in select f.* from public.focus_sessions f
           where f.user_id = v_user and not coalesce(f.is_manual, false)
             and f.duration_seconds >= 600 and f.session_date >= public.app_today() - 2
             and not exists (select 1 from public.expeditions e where e.session_id = f.id)
           order by f.id loop
    v_min := s.duration_seconds / 60;
    v_place := public.exp_place(v_min);
    v_early := s.mode = 'down' and coalesce(s.planned_minutes, 0) > 0 and s.duration_seconds < s.planned_minutes * 60 * 0.9;

    v_reward := case v_place
      when 0 then jsonb_build_object('stardust', 1, 'gold', 10 + floor(random() * 11)::int)
      when 1 then jsonb_build_object('stardust', 2, 'gold', 20 + floor(random() * 21)::int,
                    'chest_wood', (random() < 0.15)::int)
      when 2 then jsonb_build_object('stardust', 3, 'gold', 40 + floor(random() * 31)::int,
                    'chest_iron', (random() < 0.3)::int, 'gacha_coin', (random() < 0.1)::int)
      when 3 then jsonb_build_object('stardust', 5, 'gold', 80 + floor(random() * 41)::int,
                    'chest_iron', 1, 'gacha_coin', (random() < 0.2)::int, 'chest_gold', (random() < 0.1)::int)
      else jsonb_build_object('stardust', 8, 'gold', 150, 'chest_gold', 1,
                    'gacha_coin', (random() < 0.3)::int, 'chest_star', (random() < 0.05)::int) end;
    -- 沒有中獎的拿掉；提早回家只留星屑和金幣
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_reward
      from jsonb_each(v_reward) where value::text::int > 0 and (not v_early or key in ('stardust', 'gold'));

    insert into public.expeditions (session_id, user_id, minutes, place, early, story, reward)
      values (s.id, v_user, v_min, v_place, v_early, floor(random() * 4)::int, v_reward)
      on conflict do nothing;
    if found then
      perform public.fun_give(v_user, v_reward, 'exp:' || s.id);
      v_out := v_out || jsonb_build_object('session', s.id, 'subject', s.subject, 'minutes', v_min, 'place', v_place,
                                           'early', v_early, 'reward', v_reward,
                                           'story', (select story from public.expeditions where session_id = s.id));
    end if;
  end loop;

  return json_build_object('success', true, 'new', v_out);
end;
$function$;
revoke all on function public.exp_claim() from public, anon;
grant execute on function public.exp_claim() to authenticated;

create or replace function public.exp_list()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception '尚未登入'; end if;
  return json_build_object(
    'recent', coalesce((select json_agg(x order by x.created_at desc) from (
        select e.session_id, e.minutes, e.place, e.early, e.story, e.reward, e.created_at, f.subject
        from public.expeditions e join public.focus_sessions f on f.id = e.session_id
        where e.user_id = v_user order by e.created_at desc limit 8) x), '[]'::json),
    'count', (select count(*) from public.expeditions where user_id = v_user),
    'best', (select coalesce(max(place), -1) from public.expeditions where user_id = v_user),
    'total_min', (select coalesce(sum(minutes), 0) from public.expeditions where user_id = v_user));
end;
$function$;
revoke all on function public.exp_list() from public, anon;
grant execute on function public.exp_list() to authenticated;


-- ---------- 🎃 萬聖節 ----------
create table if not exists public.hw_ghosts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  source text not null,
  caught_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, source)
);
alter table public.hw_ghosts enable row level security;
drop policy if exists "own select" on public.hw_ghosts;
create policy "own select" on public.hw_ghosts for select using (auth.uid() = user_id);
revoke insert, update, delete on public.hw_ghosts from authenticated, anon;

create or replace function public.hw_catalog()
returns jsonb language sql immutable as $$
  select '{
    "start": "2026-10-23", "end": "2026-11-01", "shop_end": "2026-11-03",
    "ghosts": {
      "pumpkin":   {"name":"南瓜幽靈","emoji":"🎃","candy":1},
      "bat":       {"name":"糖果蝙蝠","emoji":"🦇","candy":2},
      "witch_cat": {"name":"黑貓巫師","emoji":"🐈‍⬛","candy":5,"bonus":{"gacha_coin":1}},
      "king":      {"name":"南瓜大王","emoji":"👑","candy":12,"bonus":{"chest_gold":1}}
    },
    "shop": [
      {"item":"frame_pumpkin","name":"南瓜頭像框","price":30,"limit":1,"kind":"frame"},
      {"item":"jack_staff","name":"南瓜燈杖","price":50,"limit":1,"kind":"gear"},
      {"item":"witch_hat","name":"女巫帽","price":50,"limit":1,"kind":"gear"},
      {"item":"chest_star","name":"星光寶箱","price":40,"limit":1,"kind":"item"},
      {"item":"gacha_coin","name":"扭蛋幣","price":8,"limit":5,"kind":"item"},
      {"item":"scratch_card","name":"刮刮樂","price":5,"limit":5,"kind":"item"}
    ]
  }'::jsonb
$$;

create or replace function public.hw_active()
returns boolean language sql stable as $$
  select public.app_today() between (public.hw_catalog()->>'start')::date and (public.hw_catalog()->>'end')::date
$$;

-- 決定遇到哪一種幽靈（用來源字串算，重新整理也不會變）
create or replace function public.hw_roll(p_src text)
returns text language sql immutable as $$
  select case when x < 0.07 then 'witch_cat' when x < 0.35 then 'bat' else 'pumpkin' end
  from (select (abs(hashtext('ghost:' || p_src)) % 10000) / 10000.0 as x) t
$$;

create or replace function public.hw_spawn(p_user uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  c jsonb := public.hw_catalog();
  v_start date := (c->>'start')::date;
  v_end date := (c->>'end')::date;
  t record;
begin
  if not public.hw_active() then return; end if;

  -- 完成任務：40% 遇到
  for t in select id from public.tasks
           where user_id = p_user and completed
             and ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date between v_start and v_end loop
    if (abs(hashtext('task-ghost:' || t.id)) % 10000) / 10000.0 < 0.4 then
      insert into public.hw_ghosts (user_id, kind, source) values (p_user, public.hw_roll('task:' || t.id), 'task:' || t.id)
        on conflict do nothing;
    end if;
  end loop;

  -- 專注 25 分鐘以上：一定遇到
  for t in select id from public.focus_sessions
           where user_id = p_user and not coalesce(is_manual, false) and duration_seconds >= 1500
             and session_date between v_start and v_end loop
    insert into public.hw_ghosts (user_id, kind, source) values (p_user, public.hw_roll('focus:' || t.id), 'focus:' || t.id)
      on conflict do nothing;
  end loop;

  -- 10/31 簽到：南瓜大王
  if exists (select 1 from public.checkins where user_id = p_user and checkin_date = date '2026-10-31') then
    insert into public.hw_ghosts (user_id, kind, source) values (p_user, 'king', 'halloween-1031') on conflict do nothing;
  end if;
end;
$function$;
revoke all on function public.hw_spawn(uuid) from public, anon, authenticated;

create or replace function public.hw_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); c jsonb := public.hw_catalog();
begin
  if v_user is null then raise exception '尚未登入'; end if;
  perform public.hw_spawn(v_user);
  return json_build_object(
    'active', public.hw_active(),
    'shop_open', public.app_today() between (c->>'start')::date and (c->>'shop_end')::date,
    'today', public.app_today(),
    'catalog', c,
    'candy', public.fun_qty(v_user, 'candy'),
    'waiting', coalesce((select json_agg(json_build_object('id', id, 'kind', kind) order by id)
                         from public.hw_ghosts where user_id = v_user and caught_at is null), '[]'::json),
    'caught', coalesce((select json_object_agg(kind, n) from (
                         select kind, count(*) n from public.hw_ghosts where user_id = v_user and caught_at is not null group by kind) x), '{}'::json),
    'bought', coalesce((select json_object_agg(item, n) from (
                         select split_part(source_key, ':', 2) item, count(*) n from public.item_events
                         where user_id = v_user and source_key like 'hw-buy:%' and item_key = 'candy' group by 1) x), '{}'::json));
end;
$function$;
revoke all on function public.hw_status() from public, anon;
grant execute on function public.hw_status() to authenticated;

-- 抓幽靈（p_id = null 就全部抓）
create or replace function public.hw_catch(p_id bigint default null)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  c jsonb := public.hw_catalog();
  g record;
  v_candy integer := 0;
  v_bonus jsonb := '{}'::jsonb;
  v_list jsonb := '[]'::jsonb;
  k text; v integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  for g in select * from public.hw_ghosts where user_id = v_user and caught_at is null and (p_id is null or id = p_id) for update loop
    update public.hw_ghosts set caught_at = now() where id = g.id;
    v_candy := v_candy + (c->'ghosts'->g.kind->>'candy')::int;
    perform public.grant_item(v_user, 'candy', (c->'ghosts'->g.kind->>'candy')::int, 'hw-catch:' || g.id);
    if c->'ghosts'->g.kind ? 'bonus' then
      perform public.fun_give(v_user, c->'ghosts'->g.kind->'bonus', 'hw-bonus:' || g.id);
      for k, v in select key, value::int from jsonb_each_text(c->'ghosts'->g.kind->'bonus') loop
        v_bonus := v_bonus || jsonb_build_object(k, coalesce((v_bonus->>k)::int, 0) + v);
      end loop;
    end if;
    v_list := v_list || jsonb_build_object('id', g.id, 'kind', g.kind);
  end loop;
  return json_build_object('success', true, 'candy', v_candy, 'bonus', v_bonus, 'caught', v_list);
end;
$function$;
revoke all on function public.hw_catch(bigint) from public, anon;
grant execute on function public.hw_catch(bigint) to authenticated;

create or replace function public.hw_buy(p_item text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  c jsonb := public.hw_catalog();
  o jsonb;
  v_n integer;
  v_lv integer;
  v_id text := gen_random_uuid()::text;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if public.app_today() not between (c->>'start')::date and (c->>'shop_end')::date then raise exception '糖果商店已經關了'; end if;
  select x into o from jsonb_array_elements(c->'shop') x where x->>'item' = p_item;
  if o is null then raise exception '沒有這個東西'; end if;
  select count(*) into v_n from public.item_events where user_id = v_user and item_key = 'candy' and source_key like 'hw-buy:' || p_item || ':%';
  if v_n >= (o->>'limit')::int then raise exception '這個已經換到上限了'; end if;

  perform public.fun_take(v_user, 'candy', (o->>'price')::int, 'hw-buy:' || p_item || ':' || v_id);

  if o->>'kind' = 'frame' then
    perform public.fun_frame_grant(v_user, p_item);
  elsif o->>'kind' = 'gear' then
    select level into v_lv from public.rpg_gear where user_id = v_user and gear_key = p_item for update;
    if v_lv is null then insert into public.rpg_gear (user_id, gear_key) values (v_user, p_item);
    elsif v_lv < 5 then update public.rpg_gear set level = level + 1 where user_id = v_user and gear_key = p_item;
    end if;
  else
    perform public.grant_item(v_user, p_item, 1, 'hw-buy-get:' || v_id);
  end if;

  return json_build_object('success', true, 'item', p_item, 'candy', public.fun_qty(v_user, 'candy'));
end;
$function$;
revoke all on function public.hw_buy(text) from public, anon;
grant execute on function public.hw_buy(text) to authenticated;


-- ---------- 📖 每週冒險日誌 ----------
-- p_week：那一週的星期一；不給就是上一週
create or replace function public.journal_week(p_week date default null)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_week date := coalesce(p_week, public.fun_week_start() - 7);
  v_end date;
  v_days jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  v_week := v_week - (extract(isodow from v_week)::int - 1);
  v_end := v_week + 6;

  select jsonb_agg(jsonb_build_object('day', d::date,
           'focus', (select coalesce(sum(duration_seconds), 0) / 60 from public.focus_sessions where user_id = v_user and session_date = d::date),
           'tasks', (select count(*) from public.tasks where user_id = v_user and completed
                       and ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date = d::date),
           'checkin', exists (select 1 from public.checkins where user_id = v_user and checkin_date = d::date)) order by d)
    into v_days from generate_series(v_week, v_end, interval '1 day') d;

  return json_build_object(
    'week', v_week, 'end', v_end,
    'name', public.team_name_of(v_user),
    'class', (select class from public.rpg_heroes where user_id = v_user),
    'days', v_days,
    'top_subject', (select subject from public.focus_sessions where user_id = v_user and session_date between v_week and v_end
                    group by subject order by sum(duration_seconds) desc limit 1),
    'longest', (select coalesce(max(duration_seconds), 0) / 60 from public.focus_sessions where user_id = v_user and session_date between v_week and v_end),
    'exercise', (select coalesce(sum(minutes), 0) from public.exercise_logs where user_id = v_user and log_date between v_week and v_end),
    'habits', (select count(*) from public.habit_logs where user_id = v_user and log_date between v_week and v_end),
    'boss', (select to_jsonb(r) - 'user_id' from public.rpg_boss_runs r where user_id = v_user and week_start = v_week),
    'raid', (select jsonb_build_object('boss', tr.boss_key, 'tier', tr.tier, 'killed', tr.killed_at is not null, 'team', t.name,
                       'my_dmg', (select coalesce(sum(dmg), 0) from public.team_raid_hits h where h.team_id = tr.team_id and h.week_start = v_week and h.user_id = v_user))
             from public.team_raid_hits h0 join public.team_raids tr on tr.team_id = h0.team_id and tr.week_start = h0.week_start
             join public.teams t on t.id = tr.team_id
             where h0.user_id = v_user and h0.week_start = v_week limit 1),
    'legends', (select coalesce(jsonb_agg(gear_key), '[]'::jsonb) from public.rpg_summon_log
                where user_id = v_user and tier = 's' and ((created_at at time zone 'Asia/Taipei') - interval '2 hours')::date between v_week and v_end),
    'summons', (select count(*) from public.rpg_summon_log
                where user_id = v_user and ((created_at at time zone 'Asia/Taipei') - interval '2 hours')::date between v_week and v_end),
    'expeditions', (select jsonb_build_object('count', count(*), 'best', coalesce(max(place), -1))
                    from public.expeditions e join public.focus_sessions f on f.id = e.session_id
                    where e.user_id = v_user and f.session_date between v_week and v_end),
    'ghosts', (select count(*) from public.hw_ghosts where user_id = v_user and caught_at is not null
               and ((caught_at at time zone 'Asia/Taipei') - interval '2 hours')::date between v_week and v_end),
    'fortunes', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (
                   select kind, count(*) n from public.fun_fortunes where user_id = v_user and day between v_week and v_end group by kind) x),
    'first_week', (select min(checkin_date) from public.checkins where user_id = v_user));
end;
$function$;
revoke all on function public.journal_week(date) from public, anon;
grant execute on function public.journal_week(date) to authenticated;


-- ---------- 📜 裝備目錄：加上萬聖節活動裝備（pool = event，召喚抽不到，只能用糖果換） ----------
create or replace function public.rpg_catalog()
returns jsonb language sql immutable
as $$
  select $json${
    "gear": {
      "wood_sword":      {"name":"木劍","slot":"weapon","tier":"c","pool":"base","emoji":"🗡️","stat":{"str":3}},
      "practice_book":   {"name":"練習用書","slot":"weapon","tier":"c","pool":"base","emoji":"📘","stat":{"int":3}},
      "cloth_shirt":     {"name":"布衣","slot":"armor","tier":"c","pool":"base","emoji":"👕","stat":{"vit":3}},
      "straw_bracer":    {"name":"草編護腕","slot":"armor","tier":"c","pool":"base","emoji":"🧶","stat":{"wil":3}},
      "old_watch":       {"name":"舊懷錶","slot":"accessory","tier":"c","pool":"base","emoji":"⏱️","stat":{"int":2,"wil":1}},
      "lucky_cord":      {"name":"幸運繩","slot":"accessory","tier":"c","pool":"base","emoji":"🪢","stat":{"str":2,"vit":1}},

      "iron_sword":      {"name":"鐵劍","slot":"weapon","tier":"r","pool":"base","emoji":"⚔️","stat":{"str":6}},
      "quill_pen":       {"name":"羽毛筆","slot":"weapon","tier":"r","pool":"base","emoji":"🪶","stat":{"int":6}},
      "hunter_bow":      {"name":"獵弓","slot":"weapon","tier":"r","pool":"base","emoji":"🏹","stat":{"str":3,"vit":3}},
      "leather_armor":   {"name":"皮甲","slot":"armor","tier":"r","pool":"base","emoji":"🦺","stat":{"vit":6}},
      "apprentice_robe": {"name":"學徒長袍","slot":"armor","tier":"r","pool":"base","emoji":"🥼","stat":{"int":4,"wil":2}},
      "night_cloak":     {"name":"守夜斗篷","slot":"armor","tier":"r","pool":"base","emoji":"🧥","stat":{"wil":6}},
      "focus_earring":   {"name":"專注耳環","slot":"accessory","tier":"r","pool":"base","emoji":"💠","stat":{"int":5}},
      "runner_shoes":    {"name":"晨跑鞋","slot":"accessory","tier":"r","pool":"base","emoji":"👟","stat":{"vit":5}},
      "oath_ring":       {"name":"誓約戒指","slot":"accessory","tier":"r","pool":"base","emoji":"💍","stat":{"wil":5}},

      "starsteel_blade": {"name":"星鋼大劍","slot":"weapon","tier":"l","pool":"base","emoji":"🗡️","stat":{"str":12}},
      "sage_staff":      {"name":"智者法杖","slot":"weapon","tier":"l","pool":"base","emoji":"🪄","stat":{"int":12}},
      "guardian_shield": {"name":"守護之盾","slot":"armor","tier":"l","pool":"base","emoji":"🛡️","stat":{"wil":8,"vit":4}},
      "moonlight_robe":  {"name":"月光法袍","slot":"armor","tier":"l","pool":"base","emoji":"🌙","stat":{"int":8,"wil":4}},
      "silverscale_mail":{"name":"銀鱗鎧","slot":"armor","tier":"l","pool":"base","emoji":"🐉","stat":{"vit":12}},
      "wind_boots":      {"name":"風行長靴","slot":"accessory","tier":"l","pool":"base","emoji":"🥾","stat":{"str":6,"vit":6}},
      "time_hourglass":  {"name":"時之沙漏","slot":"accessory","tier":"l","pool":"base","emoji":"⏳","stat":{"int":6,"wil":6}},

      "dawn_blade":      {"name":"破曉之刃","slot":"weapon","tier":"x","pool":"base","emoji":"🌅","stat":{"str":18,"vit":6}},
      "star_grimoire":   {"name":"星圖魔典","slot":"weapon","tier":"x","pool":"base","emoji":"📖","stat":{"int":20,"wil":4}},
      "dawn_plate":      {"name":"黎明聖鎧","slot":"armor","tier":"x","pool":"base","emoji":"🛡️","stat":{"vit":16,"wil":8}},
      "undying_heart":   {"name":"不滅之心","slot":"accessory","tier":"x","pool":"base","emoji":"❤️‍🔥","stat":{"wil":20}},
      "gale_wings":      {"name":"疾風之翼","slot":"accessory","tier":"x","pool":"base","emoji":"🪽","stat":{"str":8,"int":8,"vit":8}},

      "order_sword":     {"name":"序光聖劍","slot":"weapon","tier":"s","pool":"base","emoji":"✨","stat":{"str":30,"wil":10}},
      "eternal_book":    {"name":"永恆之書","slot":"weapon","tier":"s","pool":"base","emoji":"📜","stat":{"int":30,"wil":10}},
      "order_crown":     {"name":"秩序冠冕","slot":"accessory","tier":"s","pool":"base","emoji":"👑","stat":{"str":12,"int":12,"vit":12,"wil":12}},

      "dew_rapier":      {"name":"朝露細劍","slot":"weapon","tier":"l","pool":"base","set":"dew","emoji":"🗡️","stat":{"str":7,"vit":5}},
      "dew_mail":        {"name":"朝露輕甲","slot":"armor","tier":"l","pool":"base","set":"dew","emoji":"🌿","stat":{"vit":8,"wil":4}},
      "dew_wreath":      {"name":"朝露花冠","slot":"accessory","tier":"l","pool":"base","set":"dew","emoji":"🌸","stat":{"wil":7,"vit":5}},
      "academy_staff":   {"name":"書院羽杖","slot":"weapon","tier":"l","pool":"base","set":"academy","emoji":"🪄","stat":{"int":12}},
      "academy_robe":    {"name":"書院學袍","slot":"armor","tier":"l","pool":"base","set":"academy","emoji":"🎓","stat":{"int":8,"wil":4}},
      "academy_monocle": {"name":"書院單片眼鏡","slot":"accessory","tier":"l","pool":"base","set":"academy","emoji":"🧐","stat":{"int":9,"wil":3}},
      "bulwark_hammer":  {"name":"鐵壁戰錘","slot":"weapon","tier":"l","pool":"base","set":"bulwark","emoji":"🔨","stat":{"str":10,"vit":2}},
      "bulwark_plate":   {"name":"鐵壁重鎧","slot":"armor","tier":"l","pool":"base","set":"bulwark","emoji":"🛡️","stat":{"vit":10,"str":2}},
      "bulwark_badge":   {"name":"鐵壁徽章","slot":"accessory","tier":"l","pool":"base","set":"bulwark","emoji":"🎖️","stat":{"wil":6,"vit":6}},
      "meteor_bow":      {"name":"流星弓","slot":"weapon","tier":"l","pool":"base","set":"meteor","emoji":"🏹","stat":{"str":6,"int":6}},
      "meteor_cloak":    {"name":"流星斗篷","slot":"armor","tier":"l","pool":"base","set":"meteor","emoji":"🌌","stat":{"vit":6,"wil":6}},
      "meteor_earring":  {"name":"流星耳墜","slot":"accessory","tier":"l","pool":"base","set":"meteor","emoji":"💫","stat":{"int":6,"str":6}},

      "astrolabe":       {"name":"萬象星盤","slot":"accessory","tier":"s","pool":"base","class":"scholar","emoji":"🧭","stat":{"int":28,"wil":12}},
      "warlord_axe":     {"name":"破軍戰斧","slot":"weapon","tier":"s","pool":"base","class":"warrior","emoji":"🪓","stat":{"str":28,"vit":12}},
      "oath_aegis":      {"name":"聖誓巨盾","slot":"armor","tier":"s","pool":"base","class":"guardian","emoji":"🛡️","stat":{"wil":24,"vit":16}},
      "sky_bow":         {"name":"天穹長弓","slot":"weapon","tier":"s","pool":"base","class":"ranger","emoji":"🏹","stat":{"str":14,"int":14,"vit":6,"wil":6}},

      "harvest_scythe":  {"name":"金秋豐收鐮","slot":"weapon","tier":"x","pool":"limited","series":"harvest","emoji":"🌾","stat":{"str":15,"vit":10}},
      "maple_cape":      {"name":"楓紅披風","slot":"armor","tier":"x","pool":"limited","series":"harvest","emoji":"🍁","stat":{"wil":12,"vit":12}},
      "harvest_crown":   {"name":"豐收之冠","slot":"accessory","tier":"s","pool":"limited","series":"harvest","emoji":"🎃","stat":{"str":14,"int":14,"vit":14,"wil":14}},

      "snow_lantern_staff":{"name":"雪夜燈杖","slot":"weapon","tier":"x","pool":"limited","series":"starnight","emoji":"🏮","stat":{"int":15,"wil":10}},
      "starry_cloak":    {"name":"星夜毛斗篷","slot":"armor","tier":"x","pool":"limited","series":"starnight","emoji":"🧣","stat":{"vit":12,"wil":12}},
      "snow_crystal":    {"name":"雪花水晶","slot":"accessory","tier":"s","pool":"limited","series":"starnight","emoji":"❄️","stat":{"str":14,"int":14,"vit":14,"wil":14}},
      "koi_sword":       {"name":"錦鯉劍","slot":"weapon","tier":"x","pool":"limited","series":"newyear","emoji":"🎏","stat":{"str":15,"wil":10}},
      "red_brocade_robe":{"name":"紅錦袍","slot":"armor","tier":"x","pool":"limited","series":"newyear","emoji":"🧧","stat":{"vit":12,"int":12}},
      "jack_staff":      {"name":"南瓜燈杖","slot":"weapon","tier":"x","pool":"event","event":"halloween","emoji":"🎃","stat":{"int":16,"wil":8}},
      "witch_hat":       {"name":"女巫帽","slot":"accessory","tier":"x","pool":"event","event":"halloween","emoji":"🧙","stat":{"int":10,"wil":10,"vit":4}},
      "lucky_pouch":     {"name":"招財福袋","slot":"accessory","tier":"s","pool":"limited","series":"newyear","emoji":"💰","stat":{"str":14,"int":14,"vit":14,"wil":14}}
    },
    "rates": {
      "normal":  {"c":60,"r":30,"l":8,"x":1.8,"s":0.2},
      "special": {"c":0,"r":50,"l":35,"x":12,"s":3},
      "limited": {"c":0,"r":0,"l":60,"x":30,"s":10}
    },
    "ticket": {"normal":"ticket_normal","special":"ticket_special","limited":"ticket_limited"},
    "gold": {"c":10,"r":30,"l":100,"x":300,"s":1000},
    "sets": {
      "dew":     {"name":"朝露套","desc":"體力、意志 +15%","bonus":{"vit":0.15,"wil":0.15}},
      "academy": {"name":"書院套","desc":"智力 +20%","bonus":{"int":0.20}},
      "bulwark": {"name":"鐵壁套","desc":"力量、體力 +15%","bonus":{"str":0.15,"vit":0.15}},
      "meteor":  {"name":"流星套","desc":"全屬性 +10%","bonus":{"str":0.10,"int":0.10,"vit":0.10,"wil":0.10}}
    },
    "class_bonus": 0.2,
    "series": {"2026-10":"harvest","2026-11":"harvest","2026-12":"starnight","2027-01":"newyear"},
    "series_name": {"harvest":"金秋豐收","starnight":"星夜慶典","newyear":"新春"}
  }$json$::jsonb
$$;

grant execute on function public.rpg_catalog() to authenticated;

notify pgrst, 'reload schema';

select case
  when exists (select 1 from pg_proc where proname = 'journal_week' and pronamespace = 'public'::regnamespace)
    then '✅ 萬聖節、專注遠征、冒險日誌設定完成'
  else '⚠️ 設定失敗'
end as 檢查結果;
