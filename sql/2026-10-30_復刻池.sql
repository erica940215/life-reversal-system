-- =========================================================
-- 序光計畫：🔁 復刻池（星露島、冒險）
-- 可以重複執行。要先跑過「2026-10-27_限定瓶.sql」和「2026-10-24_季節與彩蛋.sql」。
--
--   🌠 星露島「復刻池」：用限定星願瓶開，只會開出「已經過去的每月限定」裡你還沒有的東西
--       仙品 25% 起，每瓶沒中 +15%，第 6 瓶一定中（跟限定池一樣，但保底分開算）
--   ⚔️ 冒險「復刻召喚」：用限定召喚券，只會出過去月份／季節的限定裝備（還沒有的優先）
--       稀有以上；史詩 35%、傳說 15%，十連保底一件史詩以上
--   每過一個月，上個月的限定就自動加進復刻池，不會因為過期就收集不到
-- =========================================================

alter table public.farm_wish add column if not exists retro_n integer not null default 1;

-- 過去月份的限定（某個品階、扣掉已經有的）
create or replace function public.farm_wish_retro_pool(p_owned jsonb, p_tier text)
returns jsonb language sql stable set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(distinct k), '[]'::jsonb)
  from jsonb_each(public.farm_wish_catalog()->'months') m(mon, th),
       jsonb_array_elements_text(th->p_tier) k
  where mon < to_char(public.app_today(), 'YYYY-MM') and not (coalesce(p_owned, '{}'::jsonb) ? k);
$function$;

create or replace function public.farm_wish_retro(p_count integer default 1)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  cat jsonb := public.farm_wish_catalog();
  w public.farm_wish%rowtype;
  v_qty integer; i integer; r numeric; ps numeric; px numeric; v_tier text; v_key text; v_kind text; arr jsonb; t text;
  v_unique boolean; v_dup boolean; v_dust integer; v_amount integer; v_big boolean; v_total_dust integer := 0; v_id bigint;
  v_results jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_count is null or p_count < 1 or p_count > 10 then raise exception '一次最多抽 10 次'; end if;
  insert into public.farm_wish (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into w from public.farm_wish where user_id = v_user for update;
  if jsonb_array_length(public.farm_wish_retro_pool(w.owned, 's')) + jsonb_array_length(public.farm_wish_retro_pool(w.owned, 'x'))
     + jsonb_array_length(public.farm_wish_retro_pool(w.owned, 'l')) = 0 then
    raise exception '復刻池現在是空的：過去月份的限定你都有了（或還沒有過期的月份）';
  end if;
  select qty into v_qty from public.player_items where user_id = v_user and item_key = 'wish_limited' for update;
  if coalesce(v_qty, 0) < p_count then raise exception '限定星願瓶不夠'; end if;
  update public.player_items set qty = qty - p_count, updated_at = now() where user_id = v_user and item_key = 'wish_limited';
  insert into public.item_events (user_id, item_key, delta, source_key) values (v_user, 'wish_limited', -p_count, 'farm-retro:' || gen_random_uuid());

  for i in 1..p_count loop
    r := random() * 100;
    if w.retro_n >= 6 then v_tier := 's';
    else
      ps := 25 + 15 * (w.retro_n - 1); px := least(35, 100 - ps);
      v_tier := case when r < ps then 's' when r < ps + px then 'x' else 'l' end;
    end if;
    arr := public.farm_wish_retro_pool(w.owned, v_tier);
    -- 這個品階都有了：往其他品階找（先高後低）
    if jsonb_array_length(arr) = 0 then
      foreach t in array array['s', 'x', 'l'] loop
        arr := public.farm_wish_retro_pool(w.owned, t);
        if jsonb_array_length(arr) > 0 then v_tier := t; exit; end if;
      end loop;
    end if;
    -- 全部都有了（這次十連抽完了）：換星屑
    if jsonb_array_length(arr) = 0 then
      v_key := 'stardust3'; v_tier := 'l'; v_kind := 'dust'; v_dust := 30; v_dup := true; v_amount := null;
    else
      v_key := arr->>(floor(random() * jsonb_array_length(arr)))::integer;
      v_kind := cat->'kind'->>v_key;
      v_unique := exists (select 1 from jsonb_array_elements_text(cat->'unique') p(x) where left(v_key, length(p.x)) = p.x);
      v_dup := false; v_dust := 0; v_amount := null;
      if v_unique or v_kind in ('crop', 'tree') then
        w.owned := w.owned || jsonb_build_object(v_key, 1);
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
        perform public.grant_item(v_user, cat->'bottle'->>v_key, 1, 'farm-retro:' || gen_random_uuid());
      else
        -- 食譜卡等：記成擁有
        w.owned := w.owned || jsonb_build_object(v_key, 1);
      end if;
    end if;
    v_big := v_tier = 's';
    if v_tier = 's' then w.retro_n := 1; else w.retro_n := w.retro_n + 1; end if;
    v_total_dust := v_total_dust + coalesce(v_dust, 0);
    insert into public.farm_wish_log (user_id, pool, tier, reward, dup, dust, amount)
      values (v_user, 'wish_retro', v_tier, v_key, v_dup, coalesce(v_dust, 0), v_amount) returning id into v_id;
    v_results := v_results || jsonb_build_object('id', v_id, 'tier', v_tier, 'key', v_key, 'dup', v_dup,
      'dust', coalesce(v_dust, 0), 'amount', v_amount, 'big', v_big);
  end loop;

  if v_total_dust > 0 then perform public.grant_item(v_user, 'stardust', v_total_dust, 'farm-retro:' || gen_random_uuid()); end if;
  update public.farm_wish set luck_bonus = w.luck_bonus, retro_n = w.retro_n, owned = w.owned, updated_at = now() where user_id = v_user;
  return jsonb_build_object('results', v_results, 'status', public.farm_wish_status_of(v_user));
end;
$function$;
grant execute on function public.farm_wish_retro(integer) to authenticated;

-- 狀態多帶復刻池的保底
do $do$ begin
  if to_regprocedure('public.farm_wish_status_of_base(uuid)') is null then
    alter function public.farm_wish_status_of(uuid) rename to farm_wish_status_of_base;
  end if;
end $do$;
create or replace function public.farm_wish_status_of(p_user uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
begin
  return public.farm_wish_status_of_base(p_user)
    || jsonb_build_object('retro_n', coalesce((select retro_n from public.farm_wish where user_id = p_user), 1));
end;
$function$;
revoke all on function public.farm_wish_status_of(uuid) from public, anon, authenticated;


-- ---------- ⚔️ 冒險：復刻召喚 ----------
-- 過去的系列：月份系列（比這個月早、而且不是這個月的系列）＋已經過去的季節
create or replace function public.rpg_retro_series()
returns text[] language sql stable set search_path to 'public'
as $function$
  with cur as (
    select to_char(public.app_today(), 'YYYY-MM') as m,
           public.rpg_catalog()->'series'->>to_char(public.app_today(), 'YYYY-MM') as s,
           case ((extract(month from public.app_today())::integer - 1) / 3)
             when 0 then 'winter_solstice' when 1 then 'spring_equinox' when 2 then 'moon_view' else 'frost_descent' end as season)
  select coalesce(array_agg(distinct x), '{}') from (
    select e.value #>> '{}' as x from cur, jsonb_each(public.rpg_catalog()->'series') e
      where e.key < cur.m and (e.value #>> '{}') is distinct from cur.s
    union all
    -- 季節：從 2026 年 10 月（霜降）開始，過去的季節
    select q.season from cur, (values ('2026-10', 'frost_descent'), ('2027-01', 'winter_solstice'), ('2027-04', 'spring_equinox'),
      ('2027-07', 'moon_view'), ('2027-10', 'frost_descent'), ('2028-01', 'winter_solstice')) q(start, season)
      where q.start < cur.m and q.season <> cur.season and (q.start::text || '-01')::date + interval '3 months' <= (cur.m || '-01')::date
  ) z where x is not null;
$function$;

create or replace function public.rpg_retro_list()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); cat jsonb := public.rpg_catalog(); ser text[] := public.rpg_retro_series();
begin
  return json_build_object('series', ser, 'gear', (select coalesce(jsonb_agg(jsonb_build_object('key', k, 'tier', v->>'tier', 'series', v->>'series',
      'owned', exists (select 1 from public.rpg_gear g where g.user_id = u and g.gear_key = k)) order by v->>'series', v->>'tier'), '[]'::jsonb)
    from jsonb_each(cat->'gear') e(k, v) where v->>'pool' = 'limited' and v->>'series' = any(ser)));
end;
$function$;
grant execute on function public.rpg_retro_list() to authenticated;

create or replace function public.rpg_summon_retro(p_count integer default 1)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  cat jsonb := public.rpg_catalog();
  ser text[] := public.rpg_retro_series();
  v_results jsonb := '[]'::jsonb; v_gold_total integer := 0; i integer; r numeric; v_tier text; v_cands text[]; v_key text;
  v_level integer; v_result text; v_gold integer; v_best boolean := false;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_count not in (1, 10) then raise exception '一次只能抽 1 或 10 次'; end if;
  if not exists (select 1 from jsonb_each(cat->'gear') e(k, v) where v->>'pool' = 'limited' and v->>'series' = any(ser)) then
    raise exception '復刻池現在是空的：還沒有過去的限定系列';
  end if;
  update public.player_items set qty = qty - p_count, updated_at = now()
    where user_id = v_user and item_key = 'ticket_limited' and qty >= p_count;
  if not found then raise exception '限定召喚券不夠'; end if;
  insert into public.item_events (user_id, item_key, delta, source_key) values (v_user, 'ticket_limited', -p_count, 'rpg-retro:' || gen_random_uuid()::text);

  for i in 1..p_count loop
    r := random() * 100;
    v_tier := case when r < 15 then 's' when r < 50 then 'x' else 'l' end;
    if p_count = 10 and i = 10 and not v_best and v_tier = 'l' then v_tier := 'x'; end if;
    -- 過去的限定裝備：還沒有的優先
    select array_agg(k) into v_cands from jsonb_each(cat->'gear') e(k, v)
      where v->>'pool' = 'limited' and v->>'series' = any(ser) and v->>'tier' in ('x', 's')
        and (v_tier <> 'l' and v->>'tier' = v_tier or v_tier = 'l')
        and not exists (select 1 from public.rpg_gear g where g.user_id = v_user and g.gear_key = k);
    if v_tier <> 'l' and v_cands is null then
      select array_agg(k) into v_cands from jsonb_each(cat->'gear') e(k, v)
        where v->>'pool' = 'limited' and v->>'series' = any(ser) and v->>'tier' = v_tier;
    end if;
    -- 稀有（l）：一般稀有裝備，但有 30% 換成還沒有的過去限定
    if v_tier = 'l' then
      if v_cands is null or random() >= 0.3 then
        select array_agg(k) into v_cands from jsonb_each(cat->'gear') e(k, v) where v->>'tier' = 'l' and v->>'pool' = 'base';
      end if;
    end if;
    if v_cands is null then
      select array_agg(k) into v_cands from jsonb_each(cat->'gear') e(k, v) where v->>'pool' = 'limited' and v->>'series' = any(ser);
    end if;
    v_key := v_cands[1 + floor(random() * array_length(v_cands, 1))::integer];
    v_tier := cat->'gear'->v_key->>'tier';
    if v_tier in ('x', 's') then v_best := true; end if;

    select level into v_level from public.rpg_gear where user_id = v_user and gear_key = v_key for update;
    v_gold := 0;
    if not found then
      insert into public.rpg_gear (user_id, gear_key) values (v_user, v_key);
      v_result := 'new'; v_level := 1;
    elsif v_level < 5 then
      update public.rpg_gear set level = level + 1 where user_id = v_user and gear_key = v_key;
      v_result := 'up'; v_level := v_level + 1;
    else
      v_gold := (cat->'gold'->>v_tier)::integer; v_gold_total := v_gold_total + v_gold; v_result := 'gold';
    end if;
    insert into public.rpg_summon_log (user_id, pool, gear_key, tier, result) values (v_user, 'retro', v_key, v_tier, v_result);
    v_results := v_results || jsonb_build_object('key', v_key, 'tier', v_tier, 'result', v_result, 'level', v_level, 'gold', v_gold);
  end loop;
  if v_gold_total > 0 then update public.profiles set gold = gold + v_gold_total, updated_at = now() where id = v_user; end if;
  return json_build_object('success', true, 'results', v_results, 'gold', v_gold_total);
end;
$function$;
grant execute on function public.rpg_summon_retro(integer) to authenticated;
