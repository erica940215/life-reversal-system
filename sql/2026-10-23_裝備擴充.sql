-- =========================================================
-- ⚔️ 裝備擴充＋扭蛋系列二
-- 需要先跑過：2026-10-22_冒險.sql、2026-10-22_每週王.sql、2026-10-22_驚喜.sql
-- 可以重複執行。
--
--   新裝備：4 套套裝（各 3 件，稀有）、4 件職業專屬傳說、2 個月份的限定裝備（12 月星夜慶典、1 月新春）
--   套裝：武器、防具、飾品都是同一套 → 套裝效果
--   職業專屬傳說：對應的職業穿上，戰力 +20%
--   每月限定池：只出這個月系列的限定裝備（10、11 月金秋，12 月星夜慶典，1 月新春）
--   扭蛋系列二：星座寶寶 12 隻＋隱藏版北極星精靈，集滿送限定召喚券、星屑 30、星座框
-- =========================================================

-- ---------- 📜 裝備目錄 ----------
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


-- ---------- 🎰 召喚（限定池依月份出系列） ----------
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
  v_series text;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_pool not in ('normal', 'special', 'limited') then raise exception '沒有這個召喚池'; end if;
  if p_count not in (1, 10) then raise exception '一次只能抽 1 或 10 次'; end if;

  v_series := cat->'series'->>to_char(public.app_today(), 'YYYY-MM');
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

    v_cands := null;
    -- 限定裝備：先找這個月的系列，沒有就任何限定
    if v_use_limited then
      select array_agg(k) into v_cands from jsonb_each(cat->'gear') e(k, v)
        where v->>'tier' = v_tier and v->>'pool' = 'limited' and v->>'series' = v_series;
      if v_cands is null then
        select array_agg(k) into v_cands from jsonb_each(cat->'gear') e(k, v)
          where v->>'tier' = v_tier and v->>'pool' = 'limited';
      end if;
    end if;
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


-- ---------- 💪 戰力（加上套裝效果、職業專屬加成） ----------
create or replace function public.rpg_power_of(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_today date := public.app_today();
  v_from date := public.app_today() - 6;
  h public.rpg_heroes%rowtype;
  v_lv integer;
  v_tasks integer; v_focus integer; v_ex integer; v_sleep integer; v_habits integer; v_streak integer;
  s_str numeric; s_int numeric; s_vit numeric; s_wil numeric;
  cat jsonb := public.rpg_catalog();
  v_slot text; v_key text; v_level integer; g jsonb; k text; v numeric;
  v_sum numeric; v_power numeric;
  v_sets text[] := array[]::text[];
  v_class_hit boolean := false;
  v_set text;
  sb jsonb;
begin
  select * into h from public.rpg_heroes where user_id = p_user;
  select coalesce(level, 1) into v_lv from public.profiles where id = p_user;
  v_lv := coalesce(v_lv, 1);

  select count(*) into v_tasks from public.tasks
    where user_id = p_user and completed and completed_at >= now() - interval '7 days';
  select coalesce(sum(duration_seconds), 0) / 60 into v_focus from public.focus_sessions
    where user_id = p_user and session_date between v_from and v_today;
  select coalesce(sum(minutes), 0) into v_ex from public.exercise_logs
    where user_id = p_user and log_date between v_from and v_today;
  select count(*) into v_sleep from public.sleep_logs
    where user_id = p_user and night_date between v_from - 1 and v_today and bed_at is not null and wake_at is not null;
  select count(*) into v_habits from public.habit_logs
    where user_id = p_user and log_date between v_from and v_today;
  v_streak := coalesce((select streak from public.checkins
                         where user_id = p_user and checkin_date >= v_today - 1
                         order by checkin_date desc limit 1), 0);

  s_str := v_tasks * 5 + v_lv * 2;
  s_int := floor(v_focus / 6.0) + v_lv * 2;
  s_vit := floor(v_ex / 3.0) + v_sleep * 2 + v_lv * 2;
  s_wil := v_habits * 3 + least(v_streak, 30) * 2 + v_lv * 2;

  if h.equip is not null then
    for v_slot in select unnest(array['weapon', 'armor', 'accessory']) loop
      v_key := h.equip->>v_slot;
      continue when v_key is null;
      select level into v_level from public.rpg_gear where user_id = p_user and gear_key = v_key;
      continue when v_level is null;
      g := cat->'gear'->v_key;
      continue when g is null;
      v_sets := v_sets || coalesce(g->>'set', '-');
      if g->>'class' is not null and g->>'class' = h.class then v_class_hit := true; end if;
      for k, v in select key, value::numeric from jsonb_each_text(g->'stat') loop
        v := round(v * (1 + 0.2 * (v_level - 1)));
        if k = 'str' then s_str := s_str + v;
        elsif k = 'int' then s_int := s_int + v;
        elsif k = 'vit' then s_vit := s_vit + v;
        elsif k = 'wil' then s_wil := s_wil + v;
        end if;
      end loop;
    end loop;
  end if;

  -- 三件都是同一套：套裝效果
  v_set := null;
  if array_length(v_sets, 1) = 3 and v_sets[1] <> '-' and v_sets[1] = v_sets[2] and v_sets[2] = v_sets[3] then
    v_set := v_sets[1];
    sb := cat->'sets'->v_set->'bonus';
    s_str := round(s_str * (1 + coalesce((sb->>'str')::numeric, 0)));
    s_int := round(s_int * (1 + coalesce((sb->>'int')::numeric, 0)));
    s_vit := round(s_vit * (1 + coalesce((sb->>'vit')::numeric, 0)));
    s_wil := round(s_wil * (1 + coalesce((sb->>'wil')::numeric, 0)));
  end if;

  v_sum := s_str + s_int + s_vit + s_wil;
  v_power := case h.class
    when 'scholar'  then v_sum + s_int
    when 'warrior'  then v_sum + (s_str + s_vit) * 0.5
    when 'guardian' then v_sum + s_wil
    when 'ranger'   then v_sum * 1.25
    else v_sum end;

  -- 職業專屬傳說：對應職業穿上，戰力 +20%
  if v_class_hit then v_power := v_power * (1 + (cat->>'class_bonus')::numeric); end if;

  return jsonb_build_object('power', round(v_power)::integer, 'class', h.class, 'set', v_set, 'class_hit', v_class_hit,
    'str', s_str, 'int', s_int, 'vit', s_vit, 'wil', s_wil);
end;
$function$;
revoke all on function public.rpg_power_of(uuid) from public, anon, authenticated;


-- ---------- 🥚 扭蛋：可以選系列（m 序光小怪獸、z 星座寶寶） ----------
drop function if exists public.fun_gacha_pull();
create or replace function public.fun_gacha_pull(p_series text default 'm')
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  mons text[];
  v_secret text;
  v_key text;
  v_count integer;
  v_dust integer := 0;
  v_set boolean := false;
  v_id text := gen_random_uuid()::text;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_series = 'z' then
    mons := array['z_aries', 'z_taurus', 'z_gemini', 'z_cancer', 'z_leo', 'z_virgo',
                  'z_libra', 'z_scorpio', 'z_sagittarius', 'z_capricorn', 'z_aquarius', 'z_pisces'];
    v_secret := 'z_polaris';
  elsif p_series = 'm' then
    mons := array['m_owl', 'm_pillow', 'm_kappa', 'm_snail', 'm_hamster', 'm_fly',
                  'm_drop', 'm_rooster', 'm_tomato', 'm_chick', 'm_bookworm', 'm_hedgehog'];
    v_secret := 'm_secret';
  else
    raise exception '沒有這個扭蛋系列';
  end if;
  perform public.fun_take(v_user, 'gacha_coin', 1, 'gacha-use:' || v_id);

  v_key := case when random() < 0.04 then v_secret
                else mons[1 + floor(random() * array_length(mons, 1))::int] end;

  insert into public.fun_monsters (user_id, monster_key) values (v_user, v_key)
  on conflict (user_id, monster_key) do update set count = public.fun_monsters.count + 1
  returning count into v_count;

  if v_count > 1 then
    v_dust := case when v_key = v_secret then 10 else 2 end;
    perform public.grant_item(v_user, 'stardust', v_dust, 'gacha-dup:' || v_id);
  end if;

  -- 13 隻都到齊：送一次大禮
  if (select count(*) from public.fun_monsters where user_id = v_user and monster_key like p_series || '\_%') >= 13 then
    v_set := public.grant_item(v_user, 'ticket_limited', 1, case p_series when 'm' then 'monster-set:1' else 'zodiac-set:1' end);
    if v_set then
      perform public.grant_item(v_user, 'stardust', 30, case p_series when 'm' then 'monster-set-dust:1' else 'zodiac-set-dust:1' end);
      perform public.fun_frame_grant(v_user, case p_series when 'm' then 'frame_monster' else 'frame_zodiac' end);
    end if;
  end if;

  return json_build_object('success', true, 'key', v_key, 'count', v_count, 'dust', v_dust, 'set_done', v_set);
end;
$function$;
revoke all on function public.fun_gacha_pull(text) from public, anon;
grant execute on function public.fun_gacha_pull(text) to authenticated;


-- ---------- 🎁 自動發（加上星座框） ----------
create or replace function public.fun_auto_grants(p_user uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_today date := public.app_today();
  v_total integer; v_done integer;
  t record;
begin
  select count(*) filter (where not coalesce(skipped, false)),
         count(*) filter (where completed and not coalesce(skipped, false))
    into v_total, v_done
    from public.tasks where user_id = p_user and task_date = v_today;
  if v_total > 0 and v_done = v_total then
    perform public.grant_item(p_user, 'scratch_card', 1, 'scratch-day:' || v_today);
  end if;

  for t in select id from public.tasks
           where user_id = p_user and completed and difficulty = 'epic'
             and completed_at >= now() - interval '2 days' loop
    perform public.grant_item(p_user, 'chest_iron', 1, 'chest-epic:' || t.id);
  end loop;

  if exists (select 1 from public.rpg_boss_runs where user_id = p_user and killed_at is not null and tier >= 5) then
    perform public.fun_frame_grant(p_user, 'frame_dragon');
  end if;
  if exists (select 1 from public.rpg_boss_runs where user_id = p_user and killed_at is not null and tier >= 10) then
    perform public.fun_frame_grant(p_user, 'frame_crown');
  end if;
  if (select count(*) from public.fun_monsters where user_id = p_user and monster_key like 'm\_%') >= 13 then
    perform public.fun_frame_grant(p_user, 'frame_monster');
  end if;
  if (select count(*) from public.fun_monsters where user_id = p_user and monster_key like 'z\_%') >= 13 then
    perform public.fun_frame_grant(p_user, 'frame_zodiac');
  end if;
  if (select count(*) from public.fun_fortunes where user_id = p_user and kind = 'daikichi') >= 10 then
    perform public.fun_frame_grant(p_user, 'frame_lucky');
  end if;
end;
$function$;
revoke all on function public.fun_auto_grants(uuid) from public, anon, authenticated;


-- ---------- 📊 驚喜狀態（加上星座寶寶集滿） ----------
create or replace function public.fun_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_week date := public.fun_week_start();
  f public.fun_fortunes%rowtype;
  v_items jsonb;
  v_mon jsonb;
  v_bought jsonb;
  v_weekend boolean := extract(isodow from public.app_today()) in (6, 7);
  v_total integer; v_done integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  perform public.fun_auto_grants(v_user);

  select * into f from public.fun_fortunes where user_id = v_user and day = v_today;

  select coalesce(jsonb_object_agg(item_key, qty), '{}'::jsonb) into v_items
    from public.player_items
    where user_id = v_user and item_key in ('scratch_card', 'gacha_coin', 'chest_wood', 'chest_iron', 'chest_gold', 'chest_star', 'stardust');

  select coalesce(jsonb_object_agg(monster_key, count), '{}'::jsonb) into v_mon
    from public.fun_monsters where user_id = v_user;

  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_bought
    from public.fun_shop_buys where user_id = v_user and week_start = v_week;

  select count(*) filter (where not coalesce(skipped, false)),
         count(*) filter (where completed and not coalesce(skipped, false))
    into v_total, v_done
    from public.tasks where user_id = v_user and task_date = v_today;

  return json_build_object(
    'today', v_today,
    'checked_in', exists (select 1 from public.checkins where user_id = v_user and checkin_date = v_today),
    'fortune', case when f.user_id is null then null else jsonb_build_object('kind', f.kind, 'poem', f.poem, 'resolved_from', f.resolved_from) end,
    'tasks_done_today', public.fun_tasks_done_today(v_user),
    'tasks_plan', jsonb_build_object('total', v_total, 'done', v_done),
    'items', v_items,
    'monsters', v_mon,
    'set_done', exists (select 1 from public.item_events where user_id = v_user and source_key like 'monster-set%'),
    'zodiac_done', exists (select 1 from public.item_events where user_id = v_user and source_key like 'zodiac-set%'),
    'gold', coalesce((select gold from public.profiles where id = v_user), 0),
    'weekend', v_weekend,
    'shop', case when v_weekend then public.fun_shop_offers(v_week) else null end,
    'bought', v_bought,
    'class', (select class from public.rpg_heroes where user_id = v_user),
    'frame', (select frame from public.fun_profile where user_id = v_user),
    'frames', coalesce((select jsonb_agg(frame_key order by obtained_at) from public.fun_frames where user_id = v_user), '[]'::jsonb),
    'daikichi_count', (select count(*) from public.fun_fortunes where user_id = v_user and kind = 'daikichi'));
end;
$function$;
revoke all on function public.fun_status() from public, anon;
grant execute on function public.fun_status() to authenticated;

notify pgrst, 'reload schema';

select case
  when public.rpg_catalog()->'gear' ? 'sky_bow' then '✅ 裝備擴充設定完成'
  else '⚠️ 設定失敗'
end as 檢查結果;
