-- =========================================================
-- 🎁 驚喜系統：晨間籤詩、刮刮樂、冒險寶箱、序光扭蛋機、週末流浪商人
-- 需要先跑過：2026-10-16_簽到發券與背包.sql（grant_item）、2026-10-20_專注星屑與抽獎.sql、
--             2026-10-22_冒險.sql、2026-10-22_每週王.sql
-- 可以重複執行。
--
--   晨間籤詩：每天簽到後抽一支（大吉 8%、中吉 15%、小吉 20%、吉 25%、末吉 20%、凶 10%、大凶 2%）
--     大吉：今天專注拿到的星屑 ×2　　中吉：每週王今天多 1 次出擊　　小吉：農場入場卷 1 張
--     吉：星願瓶 1　　末吉：星屑 1　　凶：今天完成 2 個任務可以化解成吉＋刮刮樂 1 張
--     大凶：化解後直接變大吉＋刮刮樂 1 張
--   刮刮樂：當天排的任務全部完成拿 1 張；凶化解也送 1 張；商人有賣
--   寶箱：每週王每次出擊 25% 掉寶箱、打倒王必掉金寶箱、完成史詩任務必掉鐵寶箱
--   扭蛋：扭蛋幣從寶箱、商人來；序光小怪獸 12 隻＋隱藏版 1 隻，重複換星屑，集滿送大禮
--   商人：每週六、日出現，用金幣買 4 樣東西，其中一樣 7 折
--   頭像框：木 / 鐵 / 金 / 星光寶箱有機會開出對應的框；打倒第 5 階、第 10 階的每週王；扭蛋集滿；累計 10 次大吉
--           戴著的框會顯示在每週王的好友排行
-- =========================================================


-- ---------- 資料表 ----------
create table if not exists public.fun_fortunes (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kind text not null,
  poem integer not null default 0,
  resolved_from text,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.fun_scratch_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  prize text not null,
  line integer not null,
  reward jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.fun_chest_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  chest text not null,
  reward jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.fun_monsters (
  user_id uuid not null references auth.users(id) on delete cascade,
  monster_key text not null,
  count integer not null default 1,
  first_at timestamptz not null default now(),
  primary key (user_id, monster_key)
);

create table if not exists public.fun_shop_buys (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  item text not null,
  price integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start, item)
);

create table if not exists public.fun_frames (
  user_id uuid not null references auth.users(id) on delete cascade,
  frame_key text not null,
  obtained_at timestamptz not null default now(),
  primary key (user_id, frame_key)
);

create table if not exists public.fun_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  frame text
);

do $$
declare t text;
begin
  foreach t in array array['fun_fortunes', 'fun_scratch_log', 'fun_chest_log', 'fun_monsters', 'fun_shop_buys', 'fun_frames', 'fun_profile'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own select" on public.%I', t);
    execute format('create policy "own select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end $$;


-- ---------- 小工具：本週一、物品數量、扣物品 ----------
create or replace function public.fun_week_start()
returns date language sql stable as $$
  select public.app_today() - (extract(isodow from public.app_today())::int - 1)
$$;

create or replace function public.fun_qty(p_user uuid, p_item text)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce((select qty from public.player_items where user_id = p_user and item_key = p_item), 0)
$$;
revoke all on function public.fun_qty(uuid, text) from public, anon, authenticated;

create or replace function public.fun_take(p_user uuid, p_item text, p_qty integer, p_source text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_have integer;
begin
  select qty into v_have from public.player_items where user_id = p_user and item_key = p_item for update;
  if coalesce(v_have, 0) < p_qty then raise exception '數量不夠'; end if;
  update public.player_items set qty = qty - p_qty where user_id = p_user and item_key = p_item;
  insert into public.item_events (user_id, item_key, delta, source_key) values (p_user, p_item, -p_qty, p_source);
end;
$function$;
revoke all on function public.fun_take(uuid, text, integer, text) from public, anon, authenticated;

-- 一次給一包獎勵：{"stardust":3,"gold":100,"ticket_normal":1,...}
create or replace function public.fun_give(p_user uuid, p_reward jsonb, p_source text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare k text; v integer;
begin
  for k, v in select key, value::int from jsonb_each_text(p_reward) loop
    continue when v <= 0;
    if k = 'gold' then
      update public.profiles set gold = gold + v, updated_at = now() where id = p_user;
    else
      perform public.grant_item(p_user, k, v, p_source || ':' || k);
    end if;
  end loop;
end;
$function$;
revoke all on function public.fun_give(uuid, jsonb, text) from public, anon, authenticated;

-- 今天完成幾個任務
create or replace function public.fun_tasks_done_today(p_user uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select count(*)::int from public.tasks
  where user_id = p_user and completed
    and ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date = public.app_today()
$$;
revoke all on function public.fun_tasks_done_today(uuid) from public, anon, authenticated;

-- 今天的籤
create or replace function public.fun_fortune_today(p_user uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select kind from public.fun_fortunes where user_id = p_user and day = public.app_today()
$$;
revoke all on function public.fun_fortune_today(uuid) from public, anon, authenticated;


-- ---------- 商人今天賣什麼（每週固定，週六日才開） ----------
create or replace function public.fun_shop_offers(p_week date)
returns jsonb language sql immutable as $$
  with items(item, name, price) as (values
    ('ticket_normal', '普通召喚券', 150),
    ('ticket_special', '特殊召喚券', 450),
    ('gacha_coin', '扭蛋幣', 120),
    ('scratch_card', '刮刮樂', 80),
    ('wish_normal', '普通星願瓶', 100),
    ('farmpass10', '農場入場卷', 60),
    ('chest_iron', '鐵寶箱', 220)
  ), picked as (
    select item, name, price, row_number() over (order by md5(p_week::text || item)) as n
    from items
  )
  select jsonb_agg(jsonb_build_object(
           'item', item, 'name', name,
           'price', case when n = 1 then round(price * 0.7)::int else price end,
           'was', price, 'sale', n = 1) order by n)
  from picked where n <= 4
$$;


-- ---------- 🖼️ 給頭像框（第一個框會自動戴上） ----------
create or replace function public.fun_frame_grant(p_user uuid, p_frame text)
returns boolean language plpgsql security definer set search_path to 'public'
as $function$
begin
  insert into public.fun_frames (user_id, frame_key) values (p_user, p_frame) on conflict do nothing;
  if not found then return false; end if;
  insert into public.fun_profile (user_id, frame) values (p_user, p_frame)
    on conflict (user_id) do update set frame = coalesce(public.fun_profile.frame, excluded.frame);
  return true;
end;
$function$;
revoke all on function public.fun_frame_grant(uuid, text) from public, anon, authenticated;


-- ---------- 自動發：當天任務全清 → 刮刮樂；史詩任務 → 鐵寶箱；達成條件 → 頭像框 ----------
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
  if (select count(*) from public.fun_monsters where user_id = p_user) >= 13 then
    perform public.fun_frame_grant(p_user, 'frame_monster');
  end if;
  if (select count(*) from public.fun_fortunes where user_id = p_user and kind = 'daikichi') >= 10 then
    perform public.fun_frame_grant(p_user, 'frame_lucky');
  end if;
end;
$function$;
revoke all on function public.fun_auto_grants(uuid) from public, anon, authenticated;


-- ---------- 給網頁：全部狀態 ----------
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


-- ---------- 🎋 抽籤 ----------
create or replace function public.fun_fortune_draw()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  r numeric := random() * 100;
  v_kind text;
  v_poem integer := floor(random() * 4)::int;
  v_reward jsonb := '{}'::jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if not exists (select 1 from public.checkins where user_id = v_user and checkin_date = v_today) then
    raise exception '先簽到，才能抽今天的籤';
  end if;
  if exists (select 1 from public.fun_fortunes where user_id = v_user and day = v_today) then
    raise exception '今天已經抽過籤了';
  end if;

  v_kind := case
    when r < 8  then 'daikichi'
    when r < 23 then 'chukichi'
    when r < 43 then 'shokichi'
    when r < 68 then 'kichi'
    when r < 88 then 'suekichi'
    when r < 98 then 'kyo'
    else 'daikyo' end;

  insert into public.fun_fortunes (user_id, day, kind, poem) values (v_user, v_today, v_kind, v_poem);

  v_reward := case v_kind
    when 'shokichi' then '{"farmpass10":1}'::jsonb
    when 'kichi'    then '{"wish_normal":1}'::jsonb
    when 'suekichi' then '{"stardust":1}'::jsonb
    else '{}'::jsonb end;
  perform public.fun_give(v_user, v_reward, 'fortune:' || v_today);

  return json_build_object('success', true, 'kind', v_kind, 'poem', v_poem, 'reward', v_reward);
end;
$function$;
revoke all on function public.fun_fortune_draw() from public, anon;
grant execute on function public.fun_fortune_draw() to authenticated;


-- ---------- 🎋 化解凶籤：今天完成 2 個任務 ----------
create or replace function public.fun_fortune_resolve()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  f public.fun_fortunes%rowtype;
  v_new text;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select * into f from public.fun_fortunes where user_id = v_user and day = v_today for update;
  if not found or f.kind not in ('kyo', 'daikyo') then raise exception '今天的籤不用化解'; end if;
  if public.fun_tasks_done_today(v_user) < 2 then raise exception '今天再完成任務，滿 2 個就能化解'; end if;

  v_new := case f.kind when 'daikyo' then 'daikichi' else 'kichi' end;
  update public.fun_fortunes set kind = v_new, resolved_from = f.kind where user_id = v_user and day = v_today;

  perform public.grant_item(v_user, 'scratch_card', 1, 'fortune-resolve:' || v_today);
  if v_new = 'kichi' then
    perform public.fun_give(v_user, '{"wish_normal":1}'::jsonb, 'fortune:' || v_today);
  end if;

  return json_build_object('success', true, 'kind', v_new, 'from', f.kind);
end;
$function$;
revoke all on function public.fun_fortune_resolve() from public, anon;
grant execute on function public.fun_fortune_resolve() to authenticated;


-- ---------- 🎫 刮刮樂 ----------
-- 中獎的那一條線放 3 個一樣的圖案，其他格子網頁自己填（保證不會再連成線）
create or replace function public.fun_scratch_open()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  r numeric := random() * 100;
  v_prize text;
  v_reward jsonb;
  v_line integer := floor(random() * 8)::int;
  v_id bigint;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  perform public.fun_take(v_user, 'scratch_card', 1, 'scratch-use:' || gen_random_uuid());

  v_prize := case
    when r < 30 then 'crow'
    when r < 55 then 'stardust'
    when r < 70 then 'gold'
    when r < 78 then 'clover'
    when r < 86 then 'ticket'
    when r < 94 then 'wish'
    when r < 99 then 'pass'
    else 'crown' end;

  v_reward := case v_prize
    when 'crow'     then '{"stardust":1}'::jsonb
    when 'stardust' then '{"stardust":4}'::jsonb
    when 'gold'     then '{"gold":120}'::jsonb
    when 'clover'   then '{"stardust":6,"gold":60}'::jsonb
    when 'ticket'   then '{"ticket_normal":1}'::jsonb
    when 'wish'     then '{"wish_normal":2}'::jsonb
    when 'pass'     then '{"farmpass10":2}'::jsonb
    else '{"ticket_special":1,"stardust":20,"gold":300}'::jsonb end;

  insert into public.fun_scratch_log (user_id, prize, line, reward) values (v_user, v_prize, v_line, v_reward)
    returning id into v_id;
  perform public.fun_give(v_user, v_reward, 'scratch:' || v_id);

  return json_build_object('success', true, 'prize', v_prize, 'line', v_line, 'reward', v_reward);
end;
$function$;
revoke all on function public.fun_scratch_open() from public, anon;
grant execute on function public.fun_scratch_open() to authenticated;


-- ---------- 🎁 開寶箱 ----------
create or replace function public.fun_chest_open(p_chest text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_reward jsonb;
  v_id bigint;
  v_frame text;
  v_got_frame text := null;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_chest not in ('chest_wood', 'chest_iron', 'chest_gold', 'chest_star') then raise exception '沒有這種寶箱'; end if;
  perform public.fun_take(v_user, p_chest, 1, 'chest-use:' || gen_random_uuid());

  v_reward := case p_chest
    when 'chest_wood' then jsonb_build_object(
      'stardust', 1 + floor(random() * 2)::int,
      'gold', 20 + floor(random() * 21)::int,
      'gacha_coin', (random() < 0.12)::int)
    when 'chest_iron' then jsonb_build_object(
      'stardust', 3 + floor(random() * 2)::int,
      'gold', 50 + floor(random() * 41)::int,
      'gacha_coin', (random() < 0.35)::int,
      'ticket_normal', (random() < 0.25)::int)
    when 'chest_gold' then jsonb_build_object(
      'stardust', 6 + floor(random() * 4)::int,
      'gold', 150 + floor(random() * 101)::int,
      'gacha_coin', 1,
      'ticket_special', (random() < 0.25)::int)
    else jsonb_build_object(
      'stardust', 12 + floor(random() * 9)::int,
      'gold', 300,
      'gacha_coin', 2,
      'ticket_special', 1,
      'wish_rare', (random() < 0.3)::int) end;

  -- 數量是 0 的拿掉，網頁比較好顯示
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_reward
    from jsonb_each(v_reward) where value::text::int > 0;

  -- 頭像框：木 6%、鐵 10%、金 20%、星光 60%（已經有了就不會再出）
  v_frame := case p_chest when 'chest_wood' then 'frame_wood' when 'chest_iron' then 'frame_leaf'
                          when 'chest_gold' then 'frame_gold' else 'frame_star' end;
  if random() < (case p_chest when 'chest_wood' then 0.06 when 'chest_iron' then 0.10
                              when 'chest_gold' then 0.20 else 0.60 end)
     and public.fun_frame_grant(v_user, v_frame) then
    v_got_frame := v_frame;
  end if;

  insert into public.fun_chest_log (user_id, chest, reward)
    values (v_user, p_chest, v_reward || case when v_got_frame is null then '{}'::jsonb else jsonb_build_object('frame', v_got_frame) end)
    returning id into v_id;
  perform public.fun_give(v_user, v_reward, 'chest:' || v_id);

  return json_build_object('success', true, 'chest', p_chest, 'reward', v_reward, 'frame', v_got_frame);
end;
$function$;
revoke all on function public.fun_chest_open(text) from public, anon;
grant execute on function public.fun_chest_open(text) to authenticated;


-- ---------- 🥚 扭蛋 ----------
create or replace function public.fun_gacha_pull()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  mons text[] := array['m_owl', 'm_pillow', 'm_kappa', 'm_snail', 'm_hamster', 'm_fly',
                       'm_drop', 'm_rooster', 'm_tomato', 'm_chick', 'm_bookworm', 'm_hedgehog'];
  v_key text;
  v_count integer;
  v_dust integer := 0;
  v_set boolean := false;
  v_id text := gen_random_uuid()::text;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  perform public.fun_take(v_user, 'gacha_coin', 1, 'gacha-use:' || v_id);

  v_key := case when random() < 0.04 then 'm_secret'
                else mons[1 + floor(random() * array_length(mons, 1))::int] end;

  insert into public.fun_monsters (user_id, monster_key) values (v_user, v_key)
  on conflict (user_id, monster_key) do update set count = public.fun_monsters.count + 1
  returning count into v_count;

  if v_count > 1 then
    v_dust := case when v_key = 'm_secret' then 10 else 2 end;
    perform public.grant_item(v_user, 'stardust', v_dust, 'gacha-dup:' || v_id);
  end if;

  -- 13 隻都到齊：送一次大禮
  if (select count(*) from public.fun_monsters where user_id = v_user) >= 13 then
    v_set := public.grant_item(v_user, 'ticket_limited', 1, 'monster-set:1');
    if v_set then
      perform public.grant_item(v_user, 'stardust', 30, 'monster-set-dust:1');
    end if;
  end if;

  return json_build_object('success', true, 'key', v_key, 'count', v_count, 'dust', v_dust, 'set_done', v_set);
end;
$function$;
revoke all on function public.fun_gacha_pull() from public, anon;
grant execute on function public.fun_gacha_pull() to authenticated;


-- ---------- 🧳 跟商人買東西 ----------
create or replace function public.fun_shop_buy(p_item text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_week date := public.fun_week_start();
  o jsonb;
  v_price integer;
  v_gold integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if extract(isodow from public.app_today()) not in (6, 7) then raise exception '商人週末才會來'; end if;

  select x into o from jsonb_array_elements(public.fun_shop_offers(v_week)) x where x->>'item' = p_item;
  if o is null then raise exception '商人這週沒有賣這個'; end if;
  if exists (select 1 from public.fun_shop_buys where user_id = v_user and week_start = v_week and item = p_item) then
    raise exception '這個這週已經買過了';
  end if;

  v_price := (o->>'price')::int;
  select gold into v_gold from public.profiles where id = v_user for update;
  if coalesce(v_gold, 0) < v_price then raise exception '金幣不夠（需要 %）', v_price; end if;

  update public.profiles set gold = gold - v_price, updated_at = now() where id = v_user;
  insert into public.fun_shop_buys (user_id, week_start, item, price) values (v_user, v_week, p_item, v_price);
  perform public.grant_item(v_user, p_item, 1, 'shop:' || v_week || ':' || p_item);

  return json_build_object('success', true, 'item', p_item, 'price', v_price, 'gold', v_gold - v_price);
end;
$function$;
revoke all on function public.fun_shop_buy(text) from public, anon;
grant execute on function public.fun_shop_buy(text) to authenticated;


-- ---------- 🖼️ 換頭像框（傳 null 就是拿下來） ----------
create or replace function public.fun_frame_equip(p_frame text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_frame is not null and not exists (select 1 from public.fun_frames where user_id = v_user and frame_key = p_frame) then
    raise exception '還沒有這個頭像框';
  end if;
  insert into public.fun_profile (user_id, frame) values (v_user, p_frame)
    on conflict (user_id) do update set frame = excluded.frame;
  return json_build_object('success', true, 'frame', p_frame);
end;
$function$;
revoke all on function public.fun_frame_equip(text) from public, anon;
grant execute on function public.fun_frame_equip(text) to authenticated;


-- =========================================================
-- 接上原本的系統
-- =========================================================

-- 🎋 大吉：今天專注拿到的星屑 ×2（每 20 分鐘多 1 星屑）
create or replace function public.claim_focus_rewards(p_date date default null)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_day date := coalesce(p_date, public.app_today());
  v_seconds integer;
  v_half integer;
  v_hours integer;
  v_dust integer := 0;
  v_tickets integer := 0;
  v_lucky boolean;
  i integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  if v_day <> v_today then
    return json_build_object('success', true, 'dust', 0, 'tickets', 0, 'skipped', true);
  end if;

  select coalesce(sum(duration_seconds), 0) into v_seconds
    from public.focus_sessions
    where user_id = v_user and session_date = v_today;

  v_half  := v_seconds / 1200;
  v_hours := v_seconds / 3600;
  v_lucky := public.fun_fortune_today(v_user) = 'daikichi';

  for i in 1..v_half loop
    if public.grant_item(v_user, 'stardust', 1, 'focus-30:' || v_today || ':' || i) then
      v_dust := v_dust + 1;
    end if;
    if v_lucky and public.grant_item(v_user, 'stardust', 1, 'focus-30x:' || v_today || ':' || i) then
      v_dust := v_dust + 1;
    end if;
  end loop;

  for i in 1..v_hours loop
    if public.grant_item(v_user, 'wish_normal', 1, 'focus-hour:' || v_today || ':' || i) then
      v_tickets := v_tickets + 1;
    end if;
    perform public.grant_item(v_user, 'farmpass10', 1, 'focus-pass:' || v_today || ':' || i);
  end loop;

  return json_build_object('success', true, 'dust', v_dust, 'tickets', v_tickets,
                           'focus_seconds', v_seconds, 'lucky', v_lucky);
end;
$function$;
revoke all on function public.claim_focus_rewards(date) from public, anon;
grant execute on function public.claim_focus_rewards(date) to authenticated;


-- ⚔️ 中吉：每週王今天多 1 次出擊
create or replace function public.rpg_boss_attacks_today(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_today date := public.app_today();
  v_focus integer; v_tasks integer; v_ex boolean; v_used integer; v_luck boolean;
begin
  select coalesce(sum(duration_seconds), 0) / 60 into v_focus from public.focus_sessions
    where user_id = p_user and session_date = v_today;
  select count(*) into v_tasks from public.tasks
    where user_id = p_user and completed
      and ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date = v_today;
  select exists (select 1 from public.exercise_logs where user_id = p_user and log_date = v_today) into v_ex;
  select count(*) into v_used from public.rpg_boss_hits where user_id = p_user and hit_day = v_today;
  v_luck := coalesce(public.fun_fortune_today(p_user) = 'chukichi', false);

  return jsonb_build_object(
    'focus_min', v_focus, 'tasks', v_tasks, 'exercise', v_ex, 'fortune', v_luck,
    'total', 1 + (v_focus >= 60)::int + (v_tasks >= 3)::int + v_ex::int + v_luck::int,
    'used', v_used);
end;
$function$;
revoke all on function public.rpg_boss_attacks_today(uuid) from public, anon, authenticated;


-- 🎁 每週王出擊：25% 掉寶箱，打倒王必掉金寶箱
create or replace function public.rpg_boss_attack()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  h public.rpg_heroes%rowtype;
  r public.rpg_boss_runs%rowtype;
  a jsonb;
  v_power integer;
  v_weak text;
  v_mult numeric := 1;
  v_crit boolean;
  v_dmg integer;
  v_killed boolean := false;
  v_gold integer := 5;
  v_reward jsonb := null;
  v_hit bigint;
  v_chest text := null;
  v_roll numeric;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select * into h from public.rpg_heroes where user_id = v_user;
  if h.class is null then raise exception '先選一個職業才能出擊'; end if;

  perform public.rpg_boss_ensure(v_user);
  select * into r from public.rpg_boss_runs
    where user_id = v_user and week_start = v_today - (extract(isodow from v_today)::int - 1) for update;
  if r.killed_at is not null then raise exception '這週的王已經打倒了，下週一再來'; end if;

  a := public.rpg_boss_attacks_today(v_user);
  if (a->>'used')::int >= (a->>'total')::int then
    raise exception '今天的出擊次數用完了（專注滿 60 分、完成 3 個任務、運動都能多 1 次）';
  end if;

  v_power := greatest(10, (public.rpg_power_of(v_user)->>'power')::integer);
  select b->>'weak' into v_weak from jsonb_array_elements(public.rpg_boss_catalog()) b where b->>'key' = r.boss_key;
  if v_weak = h.class then v_mult := 1.3; end if;
  v_crit := random() < case when h.class = 'ranger' then 0.2 else 0.1 end;
  if v_crit then v_mult := v_mult * 1.5; end if;
  v_dmg := round(v_power * (0.85 + random() * 0.3) * v_mult);

  insert into public.rpg_boss_hits (user_id, week_start, hit_day, dmg, crit)
    values (v_user, r.week_start, v_today, v_dmg, v_crit)
    returning id into v_hit;

  update public.rpg_boss_runs set dmg = dmg + v_dmg,
    killed_at = case when dmg + v_dmg >= hp then now() else null end
    where user_id = v_user and week_start = r.week_start
    returning * into r;

  if random() < 0.25 then
    v_roll := random() * 100;
    v_chest := case when v_roll < 60 then 'chest_wood' when v_roll < 90 then 'chest_iron'
                    when v_roll < 99 then 'chest_gold' else 'chest_star' end;
    perform public.grant_item(v_user, v_chest, 1, 'boss-chest:' || v_hit);
  end if;

  if r.killed_at is not null then
    v_killed := true;
    v_gold := v_gold + 150 + 50 * r.tier;
    perform public.grant_item(v_user, 'ticket_special', 1, 'boss:' || r.week_start);
    perform public.grant_item(v_user, 'stardust', 3 + r.tier, 'boss-dust:' || r.week_start);
    perform public.grant_item(v_user, 'chest_gold', 1, 'boss-kill-chest:' || r.week_start);
    v_reward := jsonb_build_object('ticket_special', 1, 'stardust', 3 + r.tier, 'chest_gold', 1);
  end if;

  update public.profiles set gold = gold + v_gold, updated_at = now() where id = v_user;

  return json_build_object('success', true, 'dmg', v_dmg, 'crit', v_crit, 'weak', v_mult >= 1.3 and v_weak = h.class,
    'killed', v_killed, 'gold', v_gold, 'reward', v_reward, 'chest', v_chest, 'run', to_jsonb(r));
end;
$function$;
revoke all on function public.rpg_boss_attack() from public, anon;
grant execute on function public.rpg_boss_attack() to authenticated;

-- 🖼️ 好友排行顯示頭像框
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
  when exists (select 1 from pg_proc where proname = 'fun_status' and pronamespace = 'public'::regnamespace)
    then '✅ 驚喜系統設定完成'
  else '⚠️ 設定失敗'
end as 檢查結果;
