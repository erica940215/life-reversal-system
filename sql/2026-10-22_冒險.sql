-- =========================================================
-- 序光計畫：⚔️ 冒險線（第一階段：職業、裝備召喚、角色屬性）
-- 可以重複執行。要先執行過「簽到發券與背包」（需要 player_items、item_events）。
--
--   職業：學者 / 戰士 / 守護者 / 遊俠（第一次選免費，之後每 7 天可以換一次）
--   召喚：用簽到累積的召喚券抽裝備
--         普通池 ticket_normal、特殊池 ticket_special、每月限定池 ticket_limited
--   重複抽到：裝備 +1 級（最高 5 級）；滿級再抽到會換成金幣
--   屬性：看最近 7 天的真實紀錄（任務、專注、運動、睡眠、習慣、簽到）
-- =========================================================


-- ---------- 📦 資料表 ----------
create table if not exists public.rpg_heroes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  class text,
  class_set_at timestamptz,
  equip jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rpg_gear (
  user_id uuid not null references auth.users(id) on delete cascade,
  gear_key text not null,
  level integer not null default 1 check (level between 1 and 5),
  obtained_at timestamptz not null default now(),
  primary key (user_id, gear_key)
);

create table if not exists public.rpg_summon_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  pool text not null,
  gear_key text not null,
  tier text not null,
  result text not null,
  created_at timestamptz not null default now()
);

alter table public.rpg_heroes enable row level security;
alter table public.rpg_gear enable row level security;
alter table public.rpg_summon_log enable row level security;

drop policy if exists "own select" on public.rpg_heroes;
create policy "own select" on public.rpg_heroes for select using (auth.uid() = user_id);
drop policy if exists "own select" on public.rpg_gear;
create policy "own select" on public.rpg_gear for select using (auth.uid() = user_id);
drop policy if exists "own select" on public.rpg_summon_log;
create policy "own select" on public.rpg_summon_log for select using (auth.uid() = user_id);

revoke insert, update, delete on public.rpg_heroes, public.rpg_gear, public.rpg_summon_log from authenticated;
grant select on public.rpg_heroes, public.rpg_gear, public.rpg_summon_log to authenticated;


-- ---------- 📖 裝備圖鑑（改這裡就能加裝備） ----------
-- tier：c 普通、r 精良、l 稀有、x 史詩、s 傳說
-- slot：weapon 武器、armor 防具、accessory 飾品
-- pool：base 一般池都會出、limited 只在每月限定池（一般池的史詩／傳說有很小機率出）
-- stat：str 力量、int 智力、vit 體力、wil 意志
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

      "harvest_scythe":  {"name":"金秋豐收鐮","slot":"weapon","tier":"x","pool":"limited","emoji":"🌾","stat":{"str":15,"vit":10}},
      "maple_cape":      {"name":"楓紅披風","slot":"armor","tier":"x","pool":"limited","emoji":"🍁","stat":{"wil":12,"vit":12}},
      "harvest_crown":   {"name":"豐收之冠","slot":"accessory","tier":"s","pool":"limited","emoji":"🎃","stat":{"str":14,"int":14,"vit":14,"wil":14}}
    },
    "rates": {
      "normal":  {"c":60,"r":30,"l":8,"x":1.8,"s":0.2},
      "special": {"c":0,"r":50,"l":35,"x":12,"s":3},
      "limited": {"c":0,"r":0,"l":60,"x":30,"s":10}
    },
    "ticket": {"normal":"ticket_normal","special":"ticket_special","limited":"ticket_limited"},
    "gold": {"c":10,"r":30,"l":100,"x":300,"s":1000}
  }$json$::jsonb
$$;

grant execute on function public.rpg_catalog() to authenticated;


-- ---------- 📊 狀態：角色、裝備、召喚券、最近 7 天的真實紀錄 ----------
create or replace function public.rpg_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_from date := public.app_today() - 6;
  h public.rpg_heroes%rowtype;
  v_src jsonb;
  v_gear jsonb;
  v_tickets jsonb;
  v_prof public.profiles%rowtype;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  insert into public.rpg_heroes (user_id) values (v_user) on conflict do nothing;
  select * into h from public.rpg_heroes where user_id = v_user;
  select * into v_prof from public.profiles where id = v_user;

  v_src := jsonb_build_object(
    'tasks', (select count(*) from public.tasks
               where user_id = v_user and completed and completed_at >= now() - interval '7 days'),
    'focus_min', (select coalesce(sum(duration_seconds), 0) / 60 from public.focus_sessions
                   where user_id = v_user and session_date between v_from and v_today),
    'exercise_min', (select coalesce(sum(minutes), 0) from public.exercise_logs
                      where user_id = v_user and log_date between v_from and v_today),
    'sleep_nights', (select count(*) from public.sleep_logs
                      where user_id = v_user and night_date between v_from - 1 and v_today and bed_at is not null and wake_at is not null),
    'habits', (select count(*) from public.habit_logs
                where user_id = v_user and log_date between v_from and v_today),
    'streak', coalesce((select streak from public.checkins
                         where user_id = v_user and checkin_date >= v_today - 1
                         order by checkin_date desc limit 1), 0)
  );

  select coalesce(jsonb_agg(jsonb_build_object('key', gear_key, 'level', level) order by obtained_at), '[]'::jsonb)
    into v_gear from public.rpg_gear where user_id = v_user;

  select jsonb_build_object(
    'normal',  coalesce(max(case when item_key = 'ticket_normal' then qty end), 0),
    'special', coalesce(max(case when item_key = 'ticket_special' then qty end), 0),
    'limited', coalesce(max(case when item_key = 'ticket_limited' then qty end), 0))
    into v_tickets from public.player_items
    where user_id = v_user and item_key in ('ticket_normal', 'ticket_special', 'ticket_limited');

  return json_build_object(
    'class', h.class,
    'class_set_at', h.class_set_at,
    'equip', h.equip,
    'gear', v_gear,
    'tickets', v_tickets,
    'src', v_src,
    'level', coalesce(v_prof.level, 1),
    'gold', coalesce(v_prof.gold, 0),
    'catalog', public.rpg_catalog()
  );
end;
$function$;

revoke all on function public.rpg_status() from public, anon;
grant execute on function public.rpg_status() to authenticated;


-- ---------- 🎓 選職業：第一次免費，之後每 7 天可以換一次 ----------
create or replace function public.rpg_set_class(p_class text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  h public.rpg_heroes%rowtype;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_class not in ('scholar', 'warrior', 'guardian', 'ranger') then raise exception '沒有這個職業'; end if;

  insert into public.rpg_heroes (user_id) values (v_user) on conflict do nothing;
  select * into h from public.rpg_heroes where user_id = v_user for update;

  if h.class = p_class then
    return json_build_object('success', true, 'class', p_class);
  end if;
  if h.class is not null and h.class_set_at > now() - interval '7 days' then
    raise exception '職業每 7 天才能換一次（下次可以換：%）',
      to_char((h.class_set_at + interval '7 days') at time zone 'Asia/Taipei', 'MM/DD HH24:MI');
  end if;

  update public.rpg_heroes set class = p_class, class_set_at = now() where user_id = v_user;
  return json_build_object('success', true, 'class', p_class);
end;
$function$;

revoke all on function public.rpg_set_class(text) from public, anon;
grant execute on function public.rpg_set_class(text) to authenticated;


-- ---------- 🧥 穿裝備：p_key 傳 null 代表卸下 ----------
create or replace function public.rpg_equip(p_slot text, p_key text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  cat jsonb := public.rpg_catalog();
  v_equip jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_slot not in ('weapon', 'armor', 'accessory') then raise exception '沒有這個裝備欄'; end if;

  insert into public.rpg_heroes (user_id) values (v_user) on conflict do nothing;

  if p_key is null then
    update public.rpg_heroes set equip = equip - p_slot where user_id = v_user returning equip into v_equip;
  else
    if cat->'gear'->p_key is null or cat->'gear'->p_key->>'slot' <> p_slot then raise exception '這件裝備不能放在這一欄'; end if;
    if not exists (select 1 from public.rpg_gear where user_id = v_user and gear_key = p_key) then
      raise exception '還沒有這件裝備';
    end if;
    update public.rpg_heroes set equip = equip || jsonb_build_object(p_slot, p_key)
      where user_id = v_user returning equip into v_equip;
  end if;

  return json_build_object('success', true, 'equip', v_equip);
end;
$function$;

revoke all on function public.rpg_equip(text, text) from public, anon;
grant execute on function public.rpg_equip(text, text) to authenticated;


-- ---------- 🎰 召喚：p_pool = normal / special / limited，p_count = 1 或 10 ----------
create or replace function public.rpg_summon(p_pool text, p_count integer default 1)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  cat jsonb := public.rpg_catalog();
  v_ticket text;
  v_rates jsonb;
  v_tiers text[] := array['c', 'r', 'l', 'x', 's'];
  v_results jsonb := '[]'::jsonb;
  v_gold_total integer := 0;
  v_best integer := 0;
  i integer;
  t text;
  v_roll numeric;
  v_acc numeric;
  v_tier text;
  v_use_limited boolean;
  v_cands text[];
  v_key text;
  v_level integer;
  v_result text;
  v_gold integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_pool not in ('normal', 'special', 'limited') then raise exception '沒有這個召喚池'; end if;
  if p_count not in (1, 10) then raise exception '一次只能抽 1 或 10 次'; end if;

  v_ticket := cat->'ticket'->>p_pool;
  v_rates := cat->'rates'->p_pool;

  update public.player_items set qty = qty - p_count, updated_at = now()
    where user_id = v_user and item_key = v_ticket and qty >= p_count;
  if not found then raise exception '召喚券不夠'; end if;
  insert into public.item_events (user_id, item_key, delta, source_key)
    values (v_user, v_ticket, -p_count, 'rpg-summon:' || gen_random_uuid()::text);

  for i in 1..p_count loop
    -- 抽稀有度
    v_roll := random() * 100;
    v_acc := 0;
    v_tier := 'c';
    foreach t in array v_tiers loop
      v_acc := v_acc + coalesce((v_rates->>t)::numeric, 0);
      if v_roll < v_acc then v_tier := t; exit; end if;
    end loop;
    if (v_rates->>v_tier)::numeric = 0 then v_tier := 'r'; end if;

    -- 普通池十連：最後一抽保底精良以上
    if p_pool = 'normal' and p_count = 10 and i = 10 and v_best < 2 and v_tier = 'c' then v_tier := 'r'; end if;
    v_best := greatest(v_best, array_position(v_tiers, v_tier));

    -- 限定池一半機率出限定裝備；一般池的史詩、傳說有 5% 機率出限定裝備
    v_use_limited := (p_pool = 'limited' and random() < 0.5)
                  or (p_pool <> 'limited' and v_tier in ('x', 's') and random() < 0.05);

    select array_agg(k) into v_cands from jsonb_each(cat->'gear') e(k, v)
      where v->>'tier' = v_tier and v->>'pool' = case when v_use_limited then 'limited' else 'base' end;
    if v_cands is null then
      select array_agg(k) into v_cands from jsonb_each(cat->'gear') e(k, v)
        where v->>'tier' = v_tier and v->>'pool' = 'base';
    end if;

    v_key := v_cands[1 + floor(random() * array_length(v_cands, 1))::integer];

    -- 新的、升級、或滿級換金幣
    select level into v_level from public.rpg_gear where user_id = v_user and gear_key = v_key for update;
    v_gold := 0;
    if not found then
      insert into public.rpg_gear (user_id, gear_key) values (v_user, v_key);
      v_result := 'new'; v_level := 1;
    elsif v_level < 5 then
      update public.rpg_gear set level = level + 1 where user_id = v_user and gear_key = v_key;
      v_result := 'up'; v_level := v_level + 1;
    else
      v_gold := (cat->'gold'->>v_tier)::integer;
      v_gold_total := v_gold_total + v_gold;
      v_result := 'gold';
    end if;

    insert into public.rpg_summon_log (user_id, pool, gear_key, tier, result)
      values (v_user, p_pool, v_key, v_tier, v_result);

    v_results := v_results || jsonb_build_object('key', v_key, 'tier', v_tier, 'result', v_result,
                                                 'level', v_level, 'gold', v_gold);
  end loop;

  if v_gold_total > 0 then
    update public.profiles set gold = gold + v_gold_total, updated_at = now() where id = v_user;
  end if;

  return json_build_object('success', true, 'results', v_results, 'gold', v_gold_total);
end;
$function$;

revoke all on function public.rpg_summon(text, integer) from public, anon;
grant execute on function public.rpg_summon(text, integer) to authenticated;

notify pgrst, 'reload schema';


-- ---------- ✅ 檢查結果 ----------
select case
  when exists (select 1 from pg_proc where proname = 'rpg_summon' and pronamespace = 'public'::regnamespace)
    then '✅ 冒險線第一階段設定完成'
  else '⚠️ 設定失敗'
end as 檢查結果;
