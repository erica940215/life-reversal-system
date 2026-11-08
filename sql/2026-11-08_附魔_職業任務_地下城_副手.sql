-- =========================================================
-- 序光計畫：⚔️ 冒險加強
--   ✨ 裝備附魔：每週達成真實目標拿附魔卷軸，掛在指定裝備上（換裝也帶著走）
--   📜 職業專屬任務線：每個職業 5 關，全破送職業傳說裝
--   🏰 每日地下城：每天 3 層，每層一個真實小任務，底層有寶箱
--   🐾 副手：孵出的寵物或扭蛋夥伴帶進冒險，戰力加成
-- 可以重複執行。
-- =========================================================
create table if not exists public.rpg_enchants (
  user_id uuid not null references auth.users(id) on delete cascade,
  gear_key text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, gear_key)
);
create table if not exists public.rpg_quests (
  user_id uuid not null references auth.users(id) on delete cascade,
  class text not null,
  stage integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, class)
);
create table if not exists public.rpg_sidekick (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kind text not null check (kind in ('pet', 'mon')),
  key text not null,
  set_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['rpg_enchants', 'rpg_quests', 'rpg_sidekick'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own select" on public.%I', t);
    execute format('create policy "own select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end $$;

-- ✨ 附魔種類
create or replace function public.rpg_ench_defs() returns jsonb language sql immutable as $$ select '{
 "int":{"name":"智慧附魔","emoji":"🧠","stat":{"int":15},"goal":"這週專注滿 20 小時"},
 "str":{"name":"力量附魔","emoji":"💪","stat":{"str":15},"goal":"這週完成 20 個任務"},
 "wil":{"name":"意志附魔","emoji":"🔥","stat":{"wil":15},"goal":"生活打卡連續 7 天"},
 "vit":{"name":"活力附魔","emoji":"❤️","stat":{"vit":15},"goal":"這週記錄睡眠 5 晚"},
 "all":{"name":"博學附魔","emoji":"📖","stat":{"str":5,"int":5,"vit":5,"wil":5},"goal":"這週複習單字 150 次"}}'::jsonb $$;

create or replace function public.rpg_ench_progress(u uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare t date := public.app_today(); w date := public.life_week(public.app_today()); fh numeric; td integer; ls integer; sl integer; vr integer;
begin
  select coalesce(sum(duration_seconds), 0) / 3600.0 into fh from public.focus_sessions where user_id = u and session_date between w and w + 6;
  select count(*) into td from public.tasks where user_id = u and completed and task_date between w and w + 6;
  select (public.streak_best(array(select distinct day from public.project_step_logs where user_id = u and done order by 1), t)).cur into ls;
  select count(*) into sl from public.sleep_logs where user_id = u and night_date between w - 1 and w + 6 and bed_at is not null;
  select count(*) into vr from public.vocab_log where user_id = u and day between w and w + 6;
  return jsonb_build_object('week', w,
    'int', jsonb_build_object('v', round(fh, 1), 'need', 20), 'str', jsonb_build_object('v', td, 'need', 20),
    'wil', jsonb_build_object('v', ls, 'need', 7), 'vit', jsonb_build_object('v', sl, 'need', 5), 'all', jsonb_build_object('v', vr, 'need', 150));
end; $$;

-- 📜 職業任務線
create or replace function public.rpg_quest_defs() returns jsonb language sql immutable as $$ select $j${
 "scholar":{"reward":["no_word_tome","astrolabe","ink_abyss_brush"],"stages":[
   {"k":"s1","goal":"單次專注 60 分鐘","story":"圖書館最深處有一本沒有字的書。老館長說：「能安靜坐一個小時的人，才看得見第一行字。」"},
   {"k":"s2","goal":"一天專注 4 小時","story":"書頁浮出了模糊的星圖。要看清楚，得在同一天裡把心沉得更久。"},
   {"k":"s3","goal":"單次專注 3 小時","story":"你一次坐了三小時。星圖上的第一顆星亮了，指向北方的天文台。"},
   {"k":"s4","goal":"一週專注 25 小時","story":"天文台的星盤開始轉動。每一圈，都是你這週累積的時間。"},
   {"k":"s5","goal":"「今天學到什麼」累積寫 20 則","story":"無字天書終於寫滿了字——全部都是你自己的筆跡。學者的傳說，是自己寫出來的。"}]},
 "warrior":{"reward":["warlord_axe","ruin_shield","dawn_fist"],"stages":[
   {"k":"w1","goal":"一天完成 5 個任務","story":"訓練場的教官丟給你一把木劍：「先證明你能把一天的事做完。」"},
   {"k":"w2","goal":"打倒 1 隻頑固怪物（拖延的任務）","story":"城外出現了一隻被你拖了好久的怪物。戰士不逃避。"},
   {"k":"w3","goal":"限時挑戰成功 5 次","story":"戰場上沒有無限的時間。在時限內完成，才是真正的力量。"},
   {"k":"w4","goal":"一週完成 25 個任務","story":"你的名字開始在軍營裡流傳。將軍想見見這個做事從不拖延的人。"},
   {"k":"w5","goal":"一天完成 10 個任務","story":"將軍把破軍戰斧交給你：「這把斧頭，只給一天能打十場仗的人。」"}]},
 "guardian":{"reward":["oath_aegis","oak_heart","moonlight_candle"],"stages":[
   {"k":"g1","goal":"生活打卡連續 3 天","story":"古老的橡樹下有一盞熄滅的蠟燭。守護者說：「每天點一次，連續三天，它就會記得你。」"},
   {"k":"g2","goal":"生活打卡連續 7 天","story":"蠟燭第一次自己亮了。光照到的地方，長出了新芽。"},
   {"k":"g3","goal":"單字連續複習 14 天","story":"守護不只是保護別人，也是每天守住對自己的承諾。"},
   {"k":"g4","goal":"生活打卡連續 14 天","story":"橡樹的心臟開始跳動。你的堅持，成了別人可以依靠的東西。"},
   {"k":"g5","goal":"生活打卡連續 30 天","story":"三十個夜晚，蠟燭從沒熄過。聖誓巨盾在月光下浮現，上面刻著你的名字。"}]},
 "ranger":{"reward":["sky_bow","mist_cloak","wind_boots"],"stages":[
   {"k":"r1","goal":"同一天：專注 1 小時＋完成 3 個任務＋生活打卡","story":"遊俠什麼都會一點。山腳的老獵人說：「先證明你一天能顧好三件事。」"},
   {"k":"r2","goal":"一週每天都有專注","story":"你連續七天都走進了森林。風開始認得你的腳步。"},
   {"k":"r3","goal":"一週：專注 10 小時＋完成 15 個任務","story":"霧裡傳來弓弦的聲音。只有走得夠遠的人，才看得見那把弓。"},
   {"k":"r4","goal":"一週複習單字 100 次","story":"旅途上你學會了各地的語言。迷霧斗篷，只披在見過世界的人身上。"},
   {"k":"r5","goal":"同一天：專注 3 小時＋完成 5 個任務＋生活打卡＋複習單字 30 次","story":"那一天，你把所有事都做到了。天穹長弓認你為主——遊俠，就是什麼都不放棄的人。"}]}
}$j$::jsonb $$;

create or replace function public.rpg_quest_check(u uuid, k text) returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare t date := public.app_today();
begin
  return case k
    when 's1' then exists (select 1 from public.focus_sessions where user_id = u and duration_seconds >= 3600)
    when 's2' then exists (select 1 from public.focus_sessions where user_id = u group by session_date having sum(duration_seconds) >= 4 * 3600)
    when 's3' then exists (select 1 from public.focus_sessions where user_id = u and duration_seconds >= 3 * 3600)
    when 's4' then exists (select 1 from public.focus_sessions where user_id = u group by public.life_week(session_date) having sum(duration_seconds) >= 25 * 3600)
    when 's5' then (select count(*) from public.learn_notes where user_id = u) >= 20
    when 'w1' then exists (select 1 from public.tasks where user_id = u and completed group by task_date having count(*) >= 5)
    when 'w2' then exists (select 1 from public.item_events where user_id = u and source_key like 'monster:%:stardust')
    when 'w3' then (select count(*) from public.task_challenges where user_id = u and success) >= 5
    when 'w4' then exists (select 1 from public.tasks where user_id = u and completed group by public.life_week(task_date) having count(*) >= 25)
    when 'w5' then exists (select 1 from public.tasks where user_id = u and completed group by task_date having count(*) >= 10)
    when 'g1' then (public.streak_best(array(select distinct day from public.project_step_logs where user_id = u and done order by 1), t)).best >= 3
    when 'g2' then (public.streak_best(array(select distinct day from public.project_step_logs where user_id = u and done order by 1), t)).best >= 7
    when 'g3' then (public.streak_best(array(select distinct day from public.vocab_log where user_id = u order by 1), t)).best >= 14
    when 'g4' then (public.streak_best(array(select distinct day from public.project_step_logs where user_id = u and done order by 1), t)).best >= 14
    when 'g5' then (public.streak_best(array(select distinct day from public.project_step_logs where user_id = u and done order by 1), t)).best >= 30
    when 'r1' then exists (select 1 from (select session_date d from public.focus_sessions where user_id = u group by 1 having sum(duration_seconds) >= 3600) f
                    where (select count(*) from public.tasks where user_id = u and completed and task_date = f.d) >= 3
                      and exists (select 1 from public.project_step_logs where user_id = u and done and day = f.d))
    when 'r2' then exists (select 1 from public.focus_sessions where user_id = u group by public.life_week(session_date) having count(distinct session_date) >= 7)
    when 'r3' then exists (select 1 from (select public.life_week(session_date) w from public.focus_sessions where user_id = u group by 1 having sum(duration_seconds) >= 10 * 3600) f
                    where (select count(*) from public.tasks where user_id = u and completed and task_date between f.w and f.w + 6) >= 15)
    when 'r4' then exists (select 1 from public.vocab_log where user_id = u group by public.life_week(day) having count(*) >= 100)
    when 'r5' then exists (select 1 from (select session_date d from public.focus_sessions where user_id = u group by 1 having sum(duration_seconds) >= 3 * 3600) f
                    where (select count(*) from public.tasks where user_id = u and completed and task_date = f.d) >= 5
                      and exists (select 1 from public.project_step_logs where user_id = u and done and day = f.d)
                      and (select count(*) from public.vocab_log where user_id = u and day = f.d) >= 30)
    else false end;
end; $$;

-- 🏰 每日地下城的題目池
create or replace function public.rpg_dungeon_pool() returns jsonb language sql immutable as $$ select '[
 {"k":"focus25","text":"專注 25 分鐘","emoji":"⏱️"},{"k":"focus60","text":"專注 1 小時","emoji":"⏳"},
 {"k":"vocab10","text":"複習 10 個單字","emoji":"📖"},{"k":"vocab30","text":"複習 30 個單字","emoji":"📚"},
 {"k":"learn1","text":"寫一則「今天學到什麼」","emoji":"✍️"},{"k":"task2","text":"完成 2 個任務","emoji":"✅"},
 {"k":"task4","text":"完成 4 個任務","emoji":"🏁"},{"k":"life3","text":"生活打卡 3 項","emoji":"🌱"},{"k":"life6","text":"生活打卡 6 項","emoji":"🌿"}]'::jsonb $$;

create or replace function public.rpg_dungeon_ok(u uuid, k text, d date) returns boolean language sql stable security definer set search_path to 'public' as $$
  select case k
    when 'focus25' then (select coalesce(sum(duration_seconds), 0) from public.focus_sessions where user_id = u and session_date = d) >= 25 * 60
    when 'focus60' then (select coalesce(sum(duration_seconds), 0) from public.focus_sessions where user_id = u and session_date = d) >= 60 * 60
    when 'vocab10' then (select count(*) from public.vocab_log where user_id = u and day = d) >= 10
    when 'vocab30' then (select count(*) from public.vocab_log where user_id = u and day = d) >= 30
    when 'learn1' then exists (select 1 from public.learn_notes where user_id = u and day = d)
    when 'task2' then (select count(*) from public.tasks where user_id = u and completed and task_date = d) >= 2
    when 'task4' then (select count(*) from public.tasks where user_id = u and completed and task_date = d) >= 4
    when 'life3' then (select count(*) from public.project_step_logs where user_id = u and done and day = d) >= 3
    when 'life6' then (select count(*) from public.project_step_logs where user_id = u and done and day = d) >= 6
    else false end $$;

-- 🐾 副手加成（％）
create or replace function public.rpg_sidekick_bonus(u uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare s public.rpg_sidekick; n integer; sh boolean; pct numeric := 0; label text;
begin
  select * into s from public.rpg_sidekick where user_id = u;
  if not found then return jsonb_build_object('pct', 0); end if;
  if s.kind = 'pet' then
    if exists (select 1 from public.habit_eggs where user_id = u and pet = s.key) then pct := 0.06; label := '孵出的寵物'; end if;
  else
    select count into n from public.fun_monsters where user_id = u and monster_key = s.key;
    sh := exists (select 1 from public.fun_shiny where user_id = u and monster_key = s.key);
    if n is not null then
      pct := case when n >= 10 then 0.05 when n >= 5 then 0.035 else 0.02 end + case when sh then 0.02 else 0 end;
      label := case when n >= 10 then '彩虹版' when n >= 5 then '金色版' else '一般' end || case when sh then '＋閃亮' else '' end;
    end if;
  end if;
  return jsonb_build_object('pct', pct, 'kind', s.kind, 'key', s.key, 'label', label);
end; $$;

-- 戰力：原本的計算＋附魔屬性＋副手加成
do $$ begin
  if to_regprocedure('public.rpg_power_of_base(uuid)') is null then alter function public.rpg_power_of(uuid) rename to rpg_power_of_base; end if;
end $$;
revoke all on function public.rpg_power_of_base(uuid) from public, anon, authenticated;
create or replace function public.rpg_power_of(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare b jsonb := public.rpg_power_of_base(p_user); h public.rpg_heroes; e record; st jsonb; k text; v numeric; add jsonb := '{"str":0,"int":0,"vit":0,"wil":0}'; pw numeric; sk jsonb;
begin
  select * into h from public.rpg_heroes where user_id = p_user;
  for e in select en.kind from public.rpg_enchants en where en.user_id = p_user and h.equip is not null and en.gear_key in (h.equip->>'weapon', h.equip->>'armor', h.equip->>'accessory') loop
    st := public.rpg_ench_defs()->e.kind->'stat';
    for k, v in select key, value::numeric from jsonb_each_text(st) loop add := jsonb_set(add, array[k], to_jsonb((add->>k)::numeric + v)); end loop;
  end loop;
  sk := public.rpg_sidekick_bonus(p_user);
  pw := (b->>'power')::numeric + ((add->>'str')::numeric + (add->>'int')::numeric + (add->>'vit')::numeric + (add->>'wil')::numeric) * 1.25;
  pw := pw * (1 + (sk->>'pct')::numeric);
  return b || jsonb_build_object('power', round(pw)::int, 'ench', add, 'sidekick', sk,
    'str', (b->>'str')::numeric + (add->>'str')::numeric, 'int', (b->>'int')::numeric + (add->>'int')::numeric,
    'vit', (b->>'vit')::numeric + (add->>'vit')::numeric, 'wil', (b->>'wil')::numeric + (add->>'wil')::numeric);
end; $$;

-- 📦 全部狀態
create or replace function public.rpg_plus_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); h public.rpg_heroes; prog jsonb; qd jsonb; q public.rpg_quests; pool jsonb := public.rpg_dungeon_pool(); fl jsonb := '[]'::jsonb; i integer; it jsonb; prev_ok boolean := true; ok boolean;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into h from public.rpg_heroes where user_id = u;
  prog := public.rpg_ench_progress(u);
  if h.class is not null then
    insert into public.rpg_quests (user_id, class) values (u, h.class) on conflict do nothing;
    select * into q from public.rpg_quests where user_id = u and class = h.class;
  end if;
  for i in 0..2 loop
    it := pool->(abs(hashtext(u::text || ':dng:' || t || ':' || i)) % jsonb_array_length(pool));
    if i > 0 and it->>'k' = fl->(i - 1)->>'k' then it := pool->((abs(hashtext(u::text || ':dng:' || t || ':' || i)) + 1) % jsonb_array_length(pool)); end if;
    ok := public.rpg_dungeon_ok(u, it->>'k', t);
    fl := fl || jsonb_build_array(it || jsonb_build_object('ok', ok, 'cleared', exists (select 1 from public.item_events where user_id = u and source_key like 'dng:' || t || ':' || (i + 1) || ':%')));
  end loop;
  return json_build_object('class', h.class,
    'ench_defs', public.rpg_ench_defs(), 'ench_prog', prog,
    'ench_claimed', coalesce((select jsonb_agg(split_part(source_key, ':', 2)) from public.item_events where user_id = u and source_key like 'ench:%:' || (prog->>'week')), '[]'),
    'scrolls', coalesce((select jsonb_object_agg(replace(item_key, 'ench_', ''), qty) from public.player_items where user_id = u and item_key like 'ench\_%' and qty > 0), '{}'),
    'enchants', coalesce((select jsonb_object_agg(gear_key, kind) from public.rpg_enchants where user_id = u), '{}'),
    'quest', case when h.class is not null then jsonb_build_object('stage', q.stage, 'def', public.rpg_quest_defs()->h.class,
       'ready', q.stage < 5 and public.rpg_quest_check(u, public.rpg_quest_defs()->h.class->'stages'->q.stage->>'k')) end,
    'dungeon', jsonb_build_object('day', t, 'floors', fl),
    'sidekick', public.rpg_sidekick_bonus(u),
    'pets', coalesce((select jsonb_agg(distinct pet) from public.habit_eggs where user_id = u and pet is not null), '[]'),
    'mons', coalesce((select jsonb_object_agg(monster_key, count) from public.fun_monsters where user_id = u), '{}'),
    'shiny', coalesce((select jsonb_object_agg(monster_key, count) from public.fun_shiny where user_id = u), '{}'),
    'power', public.rpg_power_of(u));
end; $$;

create or replace function public.rpg_ench_claim(p_kind text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); p jsonb := public.rpg_ench_progress(auth.uid());
begin
  if public.rpg_ench_defs()->p_kind is null then raise exception '沒有這種附魔'; end if;
  if (p->p_kind->>'v')::numeric < (p->p_kind->>'need')::numeric then raise exception '還沒達成：%', public.rpg_ench_defs()->p_kind->>'goal'; end if;
  if not public.grant_item(u, 'ench_' || p_kind, 1, 'ench:' || p_kind || ':' || (p->>'week')) then raise exception '這週已經領過了'; end if;
  return public.rpg_plus_status();
end; $$;

create or replace function public.rpg_ench_apply(p_kind text, p_gear text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid();
begin
  if not exists (select 1 from public.rpg_gear where user_id = u and gear_key = p_gear) then raise exception '你沒有這件裝備'; end if;
  perform public.fun_take(u, 'ench_' || p_kind, 1, 'ench-use:' || gen_random_uuid());
  insert into public.rpg_enchants (user_id, gear_key, kind) values (u, p_gear, p_kind)
    on conflict (user_id, gear_key) do update set kind = excluded.kind, created_at = now();
  return public.rpg_plus_status();
end; $$;

create or replace function public.rpg_quest_advance()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); h public.rpg_heroes; q public.rpg_quests; d jsonb; g text; reward text := null;
begin
  select * into h from public.rpg_heroes where user_id = u;
  if h.class is null then raise exception '先選職業'; end if;
  select * into q from public.rpg_quests where user_id = u and class = h.class for update;
  d := public.rpg_quest_defs()->h.class;
  if q.stage >= 5 then raise exception '這條任務線已經全破了'; end if;
  if not public.rpg_quest_check(u, d->'stages'->q.stage->>'k') then raise exception '還沒達成：%', d->'stages'->q.stage->>'goal'; end if;
  update public.rpg_quests set stage = stage + 1, updated_at = now() where user_id = u and class = h.class;
  perform public.grant_item(u, 'stardust', 50 + 30 * q.stage, 'quest:' || h.class || ':' || (q.stage + 1));
  if q.stage + 1 = 5 then
    select x into g from jsonb_array_elements_text(d->'reward') x where not exists (select 1 from public.rpg_gear where user_id = u and gear_key = x) limit 1;
    g := coalesce(g, d->'reward'->>0);
    insert into public.rpg_gear (user_id, gear_key, level) values (u, g, 1) on conflict (user_id, gear_key) do update set level = least(public.rpg_gear.level + 1, 5);
    reward := g;
  end if;
  return json_build_object('stage', q.stage + 1, 'story', d->'stages'->q.stage->>'story', 'gear', reward, 'gear_name', public.rpg_catalog()->'gear'->reward->>'name');
end; $$;

create or replace function public.rpg_dungeon_clear(p_floor integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); st jsonb := public.rpg_plus_status()::jsonb; f jsonb; r numeric := random(); got jsonb;
begin
  if p_floor not between 1 and 3 then raise exception '沒有這一層'; end if;
  f := st->'dungeon'->'floors'->(p_floor - 1);
  if p_floor > 1 and not (st->'dungeon'->'floors'->(p_floor - 2)->>'cleared')::boolean then raise exception '先打通上一層'; end if;
  if not (f->>'ok')::boolean then raise exception '還沒達成：%', f->>'text'; end if;
  if p_floor < 3 then
    if not public.grant_item(u, 'stardust', 10 * p_floor, 'dng:' || t || ':' || p_floor || ':stardust') then raise exception '這層已經打通了'; end if;
    got := jsonb_build_object('stardust', 10 * p_floor);
  else
    if not public.grant_item(u, 'stardust', 40, 'dng:' || t || ':3:stardust') then raise exception '寶箱已經開過了'; end if;
    if r < 0.15 then perform public.grant_item(u, 'ticket_special', 1, 'dng:' || t || ':3:ticket'); got := '{"stardust":40,"ticket_special":1}';
    elsif r < 0.55 then perform public.grant_item(u, 'ticket_normal', 1, 'dng:' || t || ':3:ticket'); got := '{"stardust":40,"ticket_normal":1}';
    else perform public.grant_item(u, 'gacha_coin', 2, 'dng:' || t || ':3:coin'); got := '{"stardust":40,"gacha_coin":2}'; end if;
  end if;
  return json_build_object('floor', p_floor, 'got', got);
end; $$;

create or replace function public.rpg_sidekick_set(p_kind text, p_key text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid();
begin
  if p_key is null then delete from public.rpg_sidekick where user_id = u; return public.rpg_plus_status(); end if;
  if p_kind = 'pet' and not exists (select 1 from public.habit_eggs where user_id = u and pet = p_key) then raise exception '還沒孵出這隻寵物'; end if;
  if p_kind = 'mon' and not exists (select 1 from public.fun_monsters where user_id = u and monster_key = p_key) then raise exception '還沒有這隻'; end if;
  insert into public.rpg_sidekick (user_id, kind, key) values (u, p_kind, p_key) on conflict (user_id) do update set kind = excluded.kind, key = excluded.key, set_at = now();
  return public.rpg_plus_status();
end; $$;

do $$ declare f text; begin
  foreach f in array array['rpg_plus_status()', 'rpg_ench_claim(text)', 'rpg_ench_apply(text,text)', 'rpg_quest_advance()', 'rpg_dungeon_clear(integer)', 'rpg_sidekick_set(text,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
