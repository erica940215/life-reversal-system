-- =========================================================
-- 🌠 每月限定池調整
--   限定星願瓶：星屑商店 300 → 150
--   主角機率：25% 起，每瓶沒中 +15%，第 6 瓶一定中（原本 15% 起 +5%，第 10 瓶保底）
--   仙品優先給還沒擁有的
-- 可以重複執行。
-- =========================================================

do $$
begin
  if to_regprocedure('public.farm_wish_catalog_base()') is null then
    alter function public.farm_wish_catalog() rename to farm_wish_catalog_base;
  end if;
end $$;

create or replace function public.farm_wish_catalog()
returns jsonb language sql immutable
as $$
  select c || jsonb_build_object('shop', (c->'shop') || '{"wish_limited":150}'::jsonb)
  from (select public.farm_wish_catalog_base() as c) b;
$$;
grant execute on function public.farm_wish_catalog() to authenticated;

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
  v_free jsonb;
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
      /* 主角 25% 起，每開一瓶沒中 +15%；第 6 瓶一定中 */
      v_n := w.limited_n;
      if v_n >= 6 then
        v_tier := 's';
      else
        ps := 25 + 15 * (v_n - 1); px := least(35, 100 - ps);
        v_tier := case when r < ps then 's' when r < ps + px then 'x' else 'l' end;
      end if;
      arr := v_theme->v_tier;
      /* 仙品優先給還沒有的（沒有主題的月份仙品有很多種，避免一直抽到重複） */
      if v_tier = 's' then
        select coalesce(jsonb_agg(x), '[]'::jsonb) into v_free from jsonb_array_elements_text(arr) x where not (w.owned ? x);
        if jsonb_array_length(v_free) > 0 then arr := v_free; end if;
      end if;
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
