-- =========================================================
-- 序光計畫：🌠 星願池（星露島的抽獎）
-- 可以重複執行。要先執行過「簽到發券與背包」和「星露島」那兩份。
--
--   farm_wish            每個人的抽獎狀態：幸運值加成、上次大獎、稀有／限定池第幾瓶、今天的免費抽、拿到的收藏
--   farm_wish_log        抽獎紀錄
--   farm_wish_status()   目前狀態（幸運值、連續簽到、星屑、補簽卡、本月主題…）
--   farm_wish_draw()     抽獎：每日免費（要先簽到）、普通／稀有／限定星願瓶，一次最多 10 抽
--   farm_wish_buy()      星屑商店
--   farm_wish_observe()  星空瞭望台：每天看一次流星，普通池幸運值 +1
--   farm_wish_makeup()   補簽卡：免費補簽這個月的一天
-- =========================================================


-- ---------- 🌠 抽獎狀態（一人一列，網頁只能讀自己的） ----------
create table if not exists public.farm_wish (
  user_id uuid primary key references auth.users(id) on delete cascade,
  luck_bonus integer not null default 0,          -- 幸運草、瞭望台加的幸運值（中大獎歸零）
  big_date date,                                  -- 普通池上次中大獎（華品、仙品）是哪一天
  rare_n integer not null default 1,              -- 稀有池：距離上次大獎第幾瓶
  limited_n integer not null default 1,           -- 限定池：距離上次抽到主角第幾瓶
  free_date date,
  free_used integer not null default 0,           -- 今天用掉幾次免費抽
  observe_date date,                              -- 今天看過流星了沒
  owned jsonb not null default '{}'::jsonb,       -- 拿到的收藏：夥伴、工具、造型、稱號、食譜卡、解鎖的作物（1），家具（數量）
  updated_at timestamptz not null default now()
);

create table if not exists public.farm_wish_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  pool text not null,
  tier text not null,
  reward text not null,
  dup boolean not null default false,
  dust integer not null default 0,
  amount integer,
  created_at timestamptz not null default now()
);

create index if not exists farm_wish_log_user on public.farm_wish_log (user_id, id desc);

alter table public.farm_wish enable row level security;
alter table public.farm_wish_log enable row level security;
drop policy if exists "own select" on public.farm_wish;
drop policy if exists "own select" on public.farm_wish_log;
create policy "own select" on public.farm_wish for select using (auth.uid() = user_id);
create policy "own select" on public.farm_wish_log for select using (auth.uid() = user_id);
revoke insert, update, delete on public.farm_wish from authenticated;
revoke insert, update, delete on public.farm_wish_log from authenticated;
grant select on public.farm_wish to authenticated;
grant select on public.farm_wish_log to authenticated;


-- ---------- 📜 獎池目錄（由遊戲資料自動產生，跟網頁上的 farm-data.js 一致） ----------
create or replace function public.farm_wish_catalog()
returns jsonb language sql immutable
as $catalog$
  select $json${"tiers":{"c":["dew_s","fert3","feed10","bucket1","crop5","stardust3","page1","clover","f_fence","f_stonelamp","f_flowerpot","f_haystack"],"r":["c_blueberry","c_colorpepper","c_cherryradish","c_purplepotato","a_goose","f_bench","f_streetlamp","f_scarecrow","f_swing","speedglass","bucket3","fert8","dew_m","makeupcard","page2","t_novice"],"l":["c_goldrice","c_rainbowcorn","c_whitestrawberry","c_blacktomato","tree_persimmon","a_turkey","a_blacksheep","p_calico","p_shiba","f_gazebo","f_birdhouse","f_picnicmat","f_wishlantern","tool_copperwater","tool_bigbasket","raincloud","harvestticket","fourclover","rarebottle","t_greenthumb"],"x":["c_starherb","c_amberpumpkin","c_cottoncandy","tree_goldapple","a_goldhen","a_rainbowalpaca","p_fox","p_owl","f_fountain","f_sakura","f_balloon","s_starfield","s_candybarn","tool_goldsickle","tool_magicpot","limitedbottle","t_goldchef"],"s":["c_moonlotus","c_phoenixpepper","tree_immortalpeach","tree_auroragrape","a_moonrabbit","a_cloudsheep","p_phoenix","p_dragon","f_observatory","f_startree","s_moonbridge","s_nightmode","s_rainbowfall","tool_timeglass","t_immortal"]},"months":{"2026-11":{"name":"金秋豐收","hero":"s_harvestbarn","s":["s_harvestbarn"],"x":["f_pumpkinlamp","c_amberpumpkin"],"l":["s_mapleground","f_mapletree","f_harvestwreath","r_grainrice"]},"2026-12":{"name":"星夜慶典","hero":"p_starspirit","s":["p_starspirit"],"x":["s_gingerhouse","s_snowground"],"l":["f_snowman","f_cocoastall","f_fairylights","r_gingerbread"]},"2027-01":{"name":"新春","hero":"s_luckykoi","s":["s_luckykoi"],"x":["f_liondance","f_redlanterns"],"l":["s_couplets","f_fumat","r_turnipcake","r_fagao"]}},"default":{"s":["c_moonlotus","c_phoenixpepper","tree_immortalpeach","tree_auroragrape","a_moonrabbit","a_cloudsheep","p_phoenix","p_dragon","f_observatory","f_startree","s_moonbridge","s_nightmode","s_rainbowfall","tool_timeglass","t_immortal"],"x":["c_starherb","c_amberpumpkin","c_cottoncandy","tree_goldapple","a_goldhen","a_rainbowalpaca","p_fox","p_owl","f_fountain","f_sakura","f_balloon","s_starfield","s_candybarn","tool_goldsickle","tool_magicpot","limitedbottle","t_goldchef"],"l":["c_goldrice","c_rainbowcorn","c_whitestrawberry","c_blacktomato","tree_persimmon","a_turkey","a_blacksheep","p_calico","p_shiba","f_gazebo","f_birdhouse","f_picnicmat","f_wishlantern","tool_copperwater","tool_bigbasket","raincloud","harvestticket","fourclover","rarebottle","t_greenthumb"]},"tier":{"dew_s":"c","fert3":"c","feed10":"c","bucket1":"c","crop5":"c","stardust3":"c","page1":"c","clover":"c","f_fence":"c","f_stonelamp":"c","f_flowerpot":"c","f_haystack":"c","c_blueberry":"r","c_colorpepper":"r","c_cherryradish":"r","c_purplepotato":"r","a_goose":"r","f_bench":"r","f_streetlamp":"r","f_scarecrow":"r","f_swing":"r","speedglass":"r","bucket3":"r","fert8":"r","dew_m":"r","makeupcard":"r","page2":"r","t_novice":"r","c_goldrice":"l","c_rainbowcorn":"l","c_whitestrawberry":"l","c_blacktomato":"l","tree_persimmon":"l","a_turkey":"l","a_blacksheep":"l","p_calico":"l","p_shiba":"l","f_gazebo":"l","f_birdhouse":"l","f_picnicmat":"l","f_wishlantern":"l","tool_copperwater":"l","tool_bigbasket":"l","raincloud":"l","harvestticket":"l","fourclover":"l","rarebottle":"l","t_greenthumb":"l","c_starherb":"x","c_amberpumpkin":"x","c_cottoncandy":"x","tree_goldapple":"x","a_goldhen":"x","a_rainbowalpaca":"x","p_fox":"x","p_owl":"x","f_fountain":"x","f_sakura":"x","f_balloon":"x","s_starfield":"x","s_candybarn":"x","tool_goldsickle":"x","tool_magicpot":"x","limitedbottle":"x","t_goldchef":"x","c_moonlotus":"s","c_phoenixpepper":"s","tree_immortalpeach":"s","tree_auroragrape":"s","a_moonrabbit":"s","a_cloudsheep":"s","p_phoenix":"s","p_dragon":"s","f_observatory":"s","f_startree":"s","s_moonbridge":"s","s_nightmode":"s","s_rainbowfall":"s","tool_timeglass":"s","t_immortal":"s","s_harvestbarn":"s","f_pumpkinlamp":"x","s_mapleground":"l","f_mapletree":"l","f_harvestwreath":"l","r_grainrice":"l","p_starspirit":"s","s_gingerhouse":"x","s_snowground":"x","f_snowman":"l","f_cocoastall":"l","f_fairylights":"l","r_gingerbread":"l","s_luckykoi":"s","f_liondance":"x","f_redlanterns":"x","s_couplets":"l","f_fumat":"l","r_turnipcake":"l","r_fagao":"l","f_ancienttree":"s","t_diligent":"r","t_hundred":"x","f_blackrug":"l","f_rainbowhammock":"x","f_cloudsofa":"s"},"kind":{"dew_s":"dew","fert3":"item","feed10":"item","bucket1":"item","crop5":"crop5","stardust3":"dust","page1":"page","clover":"luck","f_fence":"deco","f_stonelamp":"deco","f_flowerpot":"deco","f_haystack":"deco","c_blueberry":"crop","c_colorpepper":"crop","c_cherryradish":"crop","c_purplepotato":"crop","a_goose":"animal","f_bench":"deco","f_streetlamp":"deco","f_scarecrow":"deco","f_swing":"deco","speedglass":"item","bucket3":"item","fert8":"item","dew_m":"dew","makeupcard":"makeup","page2":"page","t_novice":"title","c_goldrice":"crop","c_rainbowcorn":"crop","c_whitestrawberry":"crop","c_blacktomato":"crop","tree_persimmon":"tree","a_turkey":"animal","a_blacksheep":"animal","p_calico":"pet","p_shiba":"pet","f_gazebo":"deco","f_birdhouse":"deco","f_picnicmat":"deco","f_wishlantern":"deco","tool_copperwater":"tool","tool_bigbasket":"tool","raincloud":"item","harvestticket":"item","fourclover":"luck","rarebottle":"bottle","t_greenthumb":"title","c_starherb":"crop","c_amberpumpkin":"crop","c_cottoncandy":"crop","tree_goldapple":"tree","a_goldhen":"animal","a_rainbowalpaca":"animal","p_fox":"pet","p_owl":"pet","f_fountain":"deco","f_sakura":"deco","f_balloon":"deco","s_starfield":"skin","s_candybarn":"skin","tool_goldsickle":"tool","tool_magicpot":"tool","limitedbottle":"bottle","t_goldchef":"title","c_moonlotus":"crop","c_phoenixpepper":"crop","tree_immortalpeach":"tree","tree_auroragrape":"tree","a_moonrabbit":"animal","a_cloudsheep":"animal","p_phoenix":"pet","p_dragon":"pet","f_observatory":"deco","f_startree":"deco","s_moonbridge":"skin","s_nightmode":"skin","s_rainbowfall":"skin","tool_timeglass":"tool","t_immortal":"title","s_harvestbarn":"skin","f_pumpkinlamp":"deco","s_mapleground":"skin","f_mapletree":"deco","f_harvestwreath":"deco","r_grainrice":"recipe","p_starspirit":"pet","s_gingerhouse":"skin","s_snowground":"skin","f_snowman":"deco","f_cocoastall":"deco","f_fairylights":"deco","r_gingerbread":"recipe","s_luckykoi":"skin","f_liondance":"deco","f_redlanterns":"deco","s_couplets":"skin","f_fumat":"deco","r_turnipcake":"recipe","r_fagao":"recipe","f_ancienttree":"deco","t_diligent":"title","t_hundred":"title","f_blackrug":"deco","f_rainbowhammock":"deco","f_cloudsofa":"deco"},"unique":["p_","tool_","s_","t_","r_"],"dust":{"c":1,"r":5,"l":20,"x":80,"s":300},"shop":{"wish_normal":20,"wish_rare":120,"wish_limited":300,"makeupcard":30,"page":15},"pick":{"r":40,"l":150,"x":500,"s":1800},"expired":{"l":200,"x":600,"s":2000},"luck":{"clover":1,"fourclover":5},"dustq":{"stardust3":3},"dew":{"dew_s":[50,150],"dew_m":[300,300]},"bottle":{"rarebottle":"wish_rare","limitedbottle":"wish_limited"},"yarn":{"f_blackrug":"blackyarn","f_rainbowhammock":"rainbowyarn","f_cloudsofa":"cloudcotton"}}$json$::jsonb
$catalog$;


-- ---------- 🍀 幸運值：上次中大獎之後連續簽到幾天，再加上幸運草這類加成，最高 30 ----------
create or replace function public.farm_wish_luck(p_user uuid, p_big date, p_bonus integer)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_today date := public.app_today();
  v_last date;
  v_streak integer;
  v_first date;
  v_from date;
  v_n integer := 0;
begin
  select checkin_date, streak into v_last, v_streak
    from public.checkins
    where user_id = p_user and checkin_date between v_today - 1 and v_today
    order by checkin_date desc
    limit 1;

  if v_last is null then
    v_streak := 0;
  else
    v_first := v_last - v_streak + 1;
    v_from := greatest(v_first, coalesce(p_big + 1, v_first));
    v_n := greatest(0, v_last - v_from + 1);
  end if;

  return jsonb_build_object(
    'streak', coalesce(v_streak, 0),
    'first', v_first,
    'checked', exists (select 1 from public.checkins where user_id = p_user and checkin_date = v_today),
    'n', v_n,
    'luck', least(30, greatest(1, v_n + coalesce(p_bonus, 0))));
end;
$function$;


-- ---------- 📊 狀態（給網頁畫畫面用） ----------
create or replace function public.farm_wish_status_of(p_user uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_today date := public.app_today();
  v_month text := to_char(public.app_today(), 'YYYY-MM');
  cat jsonb := public.farm_wish_catalog();
  w public.farm_wish%rowtype;
  v_luck jsonb;
  v_items jsonb;
begin
  select * into w from public.farm_wish where user_id = p_user;
  if not found then
    w.luck_bonus := 0; w.rare_n := 1; w.limited_n := 1; w.free_used := 0; w.owned := '{}'::jsonb;
  end if;

  v_luck := public.farm_wish_luck(p_user, w.big_date, w.luck_bonus);

  select coalesce(jsonb_object_agg(item_key, qty), '{}'::jsonb) into v_items
    from public.player_items
    where user_id = p_user and item_key in ('wish_normal', 'wish_rare', 'wish_limited', 'stardust', 'makeup_card');

  return jsonb_build_object(
    'today', v_today,
    'luck', v_luck->'luck', 'streak', v_luck->'streak', 'checked', v_luck->'checked', 'n', v_luck->'n',
    'bonus', w.luck_bonus, 'big_date', w.big_date,
    'free_total', 1 + (case when w.owned ? 'p_owl' then 1 else 0 end),
    'free_used', case when w.free_date = v_today then w.free_used else 0 end,
    'rare_n', w.rare_n, 'limited_n', w.limited_n,
    'owned', w.owned, 'items', v_items,
    'month', v_month, 'has_theme', (cat->'months') ? v_month,
    'theme', coalesce(cat->'months'->v_month, cat->'default'),
    'days_left', ((date_trunc('month', v_today) + interval '1 month')::date - v_today),
    'observed', coalesce(w.observe_date = v_today, false));
end;
$function$;


create or replace function public.farm_wish_status()
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  w public.farm_wish%rowtype;
  v_luck jsonb;
  v_streak integer;
  v_first date;
  v_new jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  insert into public.farm_wish (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into w from public.farm_wish where user_id = v_user for update;

  /* 連續簽到里程碑：14 天補簽卡（每一段連續只發一次）、30 天和 100 天稱號、365 天年輪神木 */
  v_luck := public.farm_wish_luck(v_user, w.big_date, w.luck_bonus);
  v_streak := (v_luck->>'streak')::integer;
  v_first := (v_luck->>'first')::date;

  if v_streak >= 14 and v_first is not null then
    if public.grant_item(v_user, 'makeup_card', 1, 'farm-ms14:' || v_first) then v_new := v_new || '"makeupcard"'::jsonb; end if;
  end if;
  if v_streak >= 30 and not (w.owned ? 't_diligent') then
    w.owned := w.owned || '{"t_diligent": 1}'::jsonb; v_new := v_new || '"t_diligent"'::jsonb;
  end if;
  if v_streak >= 100 and not (w.owned ? 't_hundred') then
    w.owned := w.owned || '{"t_hundred": 1}'::jsonb; v_new := v_new || '"t_hundred"'::jsonb;
  end if;
  if v_streak >= 365 and not (w.owned ? 'f_ancienttree') then
    w.owned := w.owned || '{"f_ancienttree": 1}'::jsonb; v_new := v_new || '"f_ancienttree"'::jsonb;
  end if;

  if jsonb_array_length(v_new) > 0 then
    update public.farm_wish set owned = w.owned, updated_at = now() where user_id = v_user;
  end if;

  return public.farm_wish_status_of(v_user) || jsonb_build_object('milestones', v_new);
end;
$function$;


-- ---------- 🎰 抽獎：free（每日免費，要先簽到）／ wish_normal ／ wish_rare ／ wish_limited ----------
create or replace function public.farm_wish_draw(p_pool text, p_count integer default 1)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  cat jsonb := public.farm_wish_catalog();
  w public.farm_wish%rowtype;
  v_theme jsonb;
  v_qty integer;
  v_allow integer;
  v_luck jsonb;
  i integer;
  k numeric;
  r numeric;
  ps numeric; px numeric; pl numeric; pr numeric;
  v_n integer;
  v_tier text;
  v_key text;
  v_kind text;
  arr jsonb;
  v_unique boolean;
  v_dup boolean;
  v_dust integer;
  v_amount integer;
  v_big boolean;
  v_any boolean := false;
  v_total_dust integer := 0;
  v_id bigint;
  v_results jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_pool not in ('free', 'wish_normal', 'wish_rare', 'wish_limited') then raise exception '沒有這個獎池'; end if;
  if p_count is null or p_count < 1 or p_count > 10 then raise exception '一次最多抽 10 次'; end if;

  insert into public.farm_wish (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into w from public.farm_wish where user_id = v_user for update;

  v_theme := coalesce(cat->'months'->to_char(v_today, 'YYYY-MM'), cat->'default');

  if p_pool = 'free' then
    if not exists (select 1 from public.checkins where user_id = v_user and checkin_date = v_today) then
      raise exception '今天還沒簽到：先簽到才能免費抽';
    end if;
    if w.free_date is distinct from v_today then
      w.free_used := 0;
      w.free_date := v_today;
    end if;
    v_allow := 1 + (case when w.owned ? 'p_owl' then 1 else 0 end);
    if w.free_used + p_count > v_allow then raise exception '今天的免費抽用完了'; end if;
    w.free_used := w.free_used + p_count;
  else
    select qty into v_qty from public.player_items where user_id = v_user and item_key = p_pool for update;
    if coalesce(v_qty, 0) < p_count then raise exception '星願瓶不夠'; end if;
    update public.player_items set qty = qty - p_count, updated_at = now() where user_id = v_user and item_key = p_pool;
    insert into public.item_events (user_id, item_key, delta, source_key)
      values (v_user, p_pool, -p_count, 'farm-wish:' || gen_random_uuid());
  end if;

  for i in 1..p_count loop

    r := random() * 100;

    if p_pool in ('free', 'wish_normal') then
      /* 幸運值每 1 點：珍 +1%、華 +0.5%、仙 +0.1%，從凡品扣 */
      v_luck := public.farm_wish_luck(v_user, w.big_date, w.luck_bonus);
      k := (v_luck->>'luck')::integer - 1;
      ps := 0.1 + 0.1 * k; px := 0.9 + 0.5 * k; pl := 5 + k; pr := 24;
      v_tier := case when r < ps then 's' when r < ps + px then 'x' when r < ps + px + pl then 'l' when r < ps + px + pl + pr then 'r' else 'c' end;
      /* 一次開十個普通瓶，至少一個普品以上 */
      if p_pool = 'wish_normal' and p_count = 10 and i = 10 and not v_any and v_tier = 'c' then v_tier := 'r'; end if;
      arr := cat->'tiers'->v_tier;
    elsif p_pool = 'wish_rare' then
      /* 每開一瓶沒中大獎：華 +1.5%、仙 +0.5%，從普品扣；第 20 瓶一定中 */
      v_n := w.rare_n;
      if v_n >= 20 then
        v_tier := case when r < 25 then 's' else 'x' end;
      else
        ps := 3 + 0.5 * (v_n - 1); px := 12 + 1.5 * (v_n - 1); pl := 35;
        v_tier := case when r < ps then 's' when r < ps + px then 'x' when r < ps + px + pl then 'l' else 'r' end;
      end if;
      arr := cat->'tiers'->v_tier;
    else
      /* 每開一瓶沒中主角：仙 +5%，從珍品扣；第 10 瓶一定中 */
      v_n := w.limited_n;
      if v_n >= 10 then
        v_tier := 's';
      else
        ps := 15 + 5 * (v_n - 1); px := 35;
        v_tier := case when r < ps then 's' when r < ps + px then 'x' else 'l' end;
      end if;
      arr := v_theme->v_tier;
    end if;

    if v_tier <> 'c' then v_any := true; end if;

    v_key := arr->>(floor(random() * jsonb_array_length(arr)))::integer;
    v_kind := cat->'kind'->>v_key;
    v_unique := exists (select 1 from jsonb_array_elements_text(cat->'unique') p(x) where left(v_key, length(p.x)) = p.x);
    v_dup := false;
    v_dust := 0;
    v_amount := null;

    if v_unique then
      if w.owned ? v_key then
        v_dup := true;
        v_dust := (cat->'dust'->>v_tier)::integer;
      else
        w.owned := w.owned || jsonb_build_object(v_key, 1);
      end if;
    elsif v_kind in ('crop', 'tree') then
      if not (w.owned ? v_key) then w.owned := w.owned || jsonb_build_object(v_key, 1); end if;
    elsif v_kind = 'deco' then
      w.owned := w.owned || jsonb_build_object(v_key, coalesce((w.owned->>v_key)::integer, 0) + 1);
    elsif v_kind = 'dust' then
      v_dust := (cat->'dustq'->>v_key)::integer;
    elsif v_kind = 'luck' then
      w.luck_bonus := w.luck_bonus + (cat->'luck'->>v_key)::integer;
    elsif v_kind = 'dew' then
      v_amount := (cat->'dew'->v_key->>0)::integer
        + floor(random() * ((cat->'dew'->v_key->>1)::integer - (cat->'dew'->v_key->>0)::integer + 1))::integer;
    elsif v_kind = 'bottle' then
      perform public.grant_item(v_user, cat->'bottle'->>v_key, 1, 'farm-wish:' || gen_random_uuid());
    elsif v_kind = 'makeup' then
      perform public.grant_item(v_user, 'makeup_card', 1, 'farm-wish:' || gen_random_uuid());
    end if;

    v_big := false;
    if p_pool in ('free', 'wish_normal') then
      if v_tier in ('x', 's') then w.big_date := v_today; w.luck_bonus := 0; v_big := true; end if;
    elsif p_pool = 'wish_rare' then
      if v_tier in ('x', 's') then w.rare_n := 1; v_big := true; else w.rare_n := w.rare_n + 1; end if;
    else
      if v_tier = 's' then w.limited_n := 1; v_big := true; else w.limited_n := w.limited_n + 1; end if;
    end if;

    v_total_dust := v_total_dust + v_dust;

    insert into public.farm_wish_log (user_id, pool, tier, reward, dup, dust, amount)
      values (v_user, p_pool, v_tier, v_key, v_dup, v_dust, v_amount)
      returning id into v_id;

    v_results := v_results || jsonb_build_object('id', v_id, 'tier', v_tier, 'key', v_key, 'dup', v_dup,
      'dust', v_dust, 'amount', v_amount, 'big', v_big);

  end loop;

  if v_total_dust > 0 then
    perform public.grant_item(v_user, 'stardust', v_total_dust, 'farm-wish:' || gen_random_uuid());
  end if;

  update public.farm_wish set
    luck_bonus = w.luck_bonus, big_date = w.big_date, rare_n = w.rare_n, limited_n = w.limited_n,
    free_date = w.free_date, free_used = w.free_used, owned = w.owned, updated_at = now()
    where user_id = v_user;

  return jsonb_build_object('results', v_results, 'status', public.farm_wish_status_of(v_user));
end;
$function$;


-- ---------- 🛒 星屑商店 ----------
-- p_item：wish_normal / wish_rare / wish_limited / makeupcard / page
--         pick:<獎項>（指定一個普品以上，或過期的每月限定）／ yarn:<家具>（用毛線換，不花星屑）
create or replace function public.farm_wish_buy(p_item text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_month text := to_char(public.app_today(), 'YYYY-MM');
  cat jsonb := public.farm_wish_catalog();
  w public.farm_wish%rowtype;
  v_key text := p_item;
  v_tier text;
  v_kind text;
  v_price integer;
  v_have integer;
  v_unique boolean;
  v_found boolean := false;
  v_m text;
  v_id bigint;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  insert into public.farm_wish (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into w from public.farm_wish where user_id = v_user for update;

  if p_item in ('wish_normal', 'wish_rare', 'wish_limited', 'makeupcard', 'page') then
    v_price := (cat->'shop'->>p_item)::integer;
    v_tier := 'c';
  elsif p_item like 'pick:%' then
    v_key := substr(p_item, 6);
    v_tier := cat->'tier'->>v_key;
    if v_tier is null then raise exception '沒有這個東西'; end if;
    if (cat->'tiers'->v_tier) ? v_key then
      v_price := (cat->'pick'->>v_tier)::integer;
    else
      for v_m in select jsonb_object_keys(cat->'months') loop
        if v_m < v_month and ((cat->'months'->v_m->'s') ? v_key or (cat->'months'->v_m->'x') ? v_key or (cat->'months'->v_m->'l') ? v_key) then
          v_found := true;
        end if;
      end loop;
      if not v_found then raise exception '這個現在還不能換'; end if;
      v_price := (cat->'expired'->>v_tier)::integer;
    end if;
    if v_price is null then raise exception '這個不能換'; end if;
  elsif p_item like 'yarn:%' then
    v_key := substr(p_item, 6);
    if not ((cat->'yarn') ? v_key) then raise exception '不能用毛線換這個'; end if;
    v_tier := cat->'tier'->>v_key;
    v_price := 0;
  else
    raise exception '沒有這個商品';
  end if;

  v_unique := exists (select 1 from jsonb_array_elements_text(cat->'unique') p(x) where left(v_key, length(p.x)) = p.x);
  if v_unique and w.owned ? v_key then raise exception '已經有了'; end if;

  if v_price > 0 then
    select qty into v_have from public.player_items where user_id = v_user and item_key = 'stardust' for update;
    if coalesce(v_have, 0) < v_price then
      raise exception '星屑不夠：需要 %，你有 %', v_price, coalesce(v_have, 0);
    end if;
    update public.player_items set qty = qty - v_price, updated_at = now() where user_id = v_user and item_key = 'stardust';
    insert into public.item_events (user_id, item_key, delta, source_key)
      values (v_user, 'stardust', -v_price, 'farm-shop:' || gen_random_uuid());
  end if;

  if p_item in ('wish_normal', 'wish_rare', 'wish_limited') then
    perform public.grant_item(v_user, p_item, 1, 'farm-shop:' || gen_random_uuid());
  elsif p_item = 'makeupcard' then
    perform public.grant_item(v_user, 'makeup_card', 1, 'farm-shop:' || gen_random_uuid());
  elsif p_item <> 'page' then
    v_kind := cat->'kind'->>v_key;
    if v_unique or v_kind in ('crop', 'tree') then
      w.owned := w.owned || jsonb_build_object(v_key, 1);
    elsif v_kind = 'deco' then
      w.owned := w.owned || jsonb_build_object(v_key, coalesce((w.owned->>v_key)::integer, 0) + 1);
    elsif v_kind = 'bottle' then
      perform public.grant_item(v_user, cat->'bottle'->>v_key, 1, 'farm-shop:' || gen_random_uuid());
    elsif v_kind = 'makeup' then
      perform public.grant_item(v_user, 'makeup_card', 1, 'farm-shop:' || gen_random_uuid());
    end if;
    update public.farm_wish set owned = w.owned, updated_at = now() where user_id = v_user;
  end if;

  insert into public.farm_wish_log (user_id, pool, tier, reward, dup, dust)
    values (v_user, 'shop', v_tier, v_key, false, -v_price)
    returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'key', v_key, 'tier', v_tier, 'price', v_price,
    'status', public.farm_wish_status_of(v_user));
end;
$function$;


-- ---------- 🔭 星空瞭望台：每天看一次流星，普通池幸運值 +1 ----------
create or replace function public.farm_wish_observe()
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  w public.farm_wish%rowtype;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select * into w from public.farm_wish where user_id = v_user for update;
  if not found or coalesce((w.owned->>'f_observatory')::integer, 0) < 1 then raise exception '還沒有星空瞭望台'; end if;
  if w.observe_date = v_today then raise exception '今天已經看過流星了'; end if;
  update public.farm_wish set observe_date = v_today, luck_bonus = luck_bonus + 1, updated_at = now() where user_id = v_user;
  return public.farm_wish_status_of(v_user);
end;
$function$;


-- ---------- 🎫 補簽卡：免費補簽這個月的一天（連續天數和幸運值一起接回） ----------
create or replace function public.farm_wish_makeup(p_date date)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_start date := date_trunc('month', public.app_today())::date;
  v_qty integer;
  v_prev integer;
  v_streak integer;
  v_day date;
  v_month json;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_date is null or p_date >= v_today then raise exception '只能補簽今天以前的日子'; end if;
  if p_date < v_start then raise exception '只能補簽這個月的日子'; end if;

  perform 1 from public.profiles where id = v_user for update;

  if exists (select 1 from public.checkins where user_id = v_user and checkin_date = p_date) then
    raise exception '這天已經簽到過了';
  end if;

  select qty into v_qty from public.player_items where user_id = v_user and item_key = 'makeup_card' for update;
  if coalesce(v_qty, 0) < 1 then raise exception '沒有補簽卡'; end if;

  update public.player_items set qty = qty - 1, updated_at = now() where user_id = v_user and item_key = 'makeup_card';
  insert into public.item_events (user_id, item_key, delta, source_key)
    values (v_user, 'makeup_card', -1, 'farm-makeup:' || p_date || ':' || gen_random_uuid());

  select streak into v_prev from public.checkins where user_id = v_user and checkin_date = p_date - 1;
  v_streak := coalesce(v_prev, 0) + 1;

  insert into public.checkins (user_id, checkin_date, streak, crit, crit_chance, exp, gold, is_makeup, cost)
    values (v_user, p_date, v_streak, false, 0, 0, 0, true, 0);

  v_day := p_date + 1;
  loop
    update public.checkins set streak = v_streak + 1 where user_id = v_user and checkin_date = v_day;
    exit when not found;
    v_streak := v_streak + 1;
    v_day := v_day + 1;
  end loop;

  v_month := public.checkin_month_bonus(v_user, p_date);

  return jsonb_build_object('ok', true, 'month', v_month, 'status', public.farm_wish_status_of(v_user));
end;
$function$;


revoke all on function public.farm_wish_catalog() from public, anon, authenticated;
revoke all on function public.farm_wish_luck(uuid, date, integer) from public, anon, authenticated;
revoke all on function public.farm_wish_status_of(uuid) from public, anon, authenticated;
revoke all on function public.farm_wish_status() from public, anon;
revoke all on function public.farm_wish_draw(text, integer) from public, anon;
revoke all on function public.farm_wish_buy(text) from public, anon;
revoke all on function public.farm_wish_observe() from public, anon;
revoke all on function public.farm_wish_makeup(date) from public, anon;
grant execute on function public.farm_wish_status() to authenticated;
grant execute on function public.farm_wish_draw(text, integer) to authenticated;
grant execute on function public.farm_wish_buy(text) to authenticated;
grant execute on function public.farm_wish_observe() to authenticated;
grant execute on function public.farm_wish_makeup(date) to authenticated;


-- ---------- 讓網站馬上看到新的表 ----------
notify pgrst, 'reload schema';


-- ---------- ✅ 檢查結果 ----------
select coalesce(string_agg(missing, '、'), '✅ 星願池 設定完成') as 檢查結果
from (
  select '缺少表 ' || t as missing
  from unnest(array['farm_wish', 'farm_wish_log']) t
  where to_regclass('public.' || t) is null
  union all
  select '缺少函式 ' || f
  from unnest(array['farm_wish_catalog', 'farm_wish_luck', 'farm_wish_status_of', 'farm_wish_status', 'farm_wish_draw', 'farm_wish_buy', 'farm_wish_observe', 'farm_wish_makeup']) f
  where not exists (select 1 from pg_proc where proname = f and pronamespace = 'public'::regnamespace)
) x;
