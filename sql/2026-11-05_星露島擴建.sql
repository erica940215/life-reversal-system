-- =========================================================
-- 序光計畫：🏝️ 星露島擴建：等級上限 99、碼頭市場、島嶼評分週獎、Lv 51 以上的等級星願瓶
-- 要先跑過「2026-10-16_星露島.sql」。可以重複執行。
-- =========================================================

-- 存檔：等級上限 70 → 99
do $$ declare d text; begin
  d := pg_get_functiondef('public.farm_save(jsonb, integer)'::regprocedure);
  if position('v_lv > 70' in d) > 0 then execute replace(d, 'v_lv > 70', 'v_lv > 99'); end if;
end $$;

-- 等級星願瓶：Lv 50 以後每 5 級稀有 1、每 10 級限定 1、Lv 99 限定 2
create or replace function public.farm_claim_levels()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_lv integer; v_items jsonb := '[]'::jsonb; v_key text; v_qty integer; l integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select least(coalesce((state->>'lv')::integer, 1), 99) into v_lv from public.farm_saves where user_id = v_user;
  if not found or v_lv < 5 then return v_items; end if;
  for l in select generate_series(5, v_lv, 5) union all select 99 where v_lv >= 99 loop
    if l = 99 then v_key := 'wish_limited'; v_qty := 2;
    elsif l = 50 then v_key := 'wish_rare'; v_qty := 3;
    elsif l > 50 and l % 10 = 0 then v_key := 'wish_limited'; v_qty := 1;
    elsif l > 50 then v_key := 'wish_rare'; v_qty := 1;
    elsif l % 10 = 0 then v_key := 'wish_rare'; v_qty := 1;
    else v_key := 'wish_normal'; v_qty := 1; end if;
    if public.grant_item(v_user, v_key, v_qty, 'farm-lv:' || l) then
      v_items := v_items || jsonb_build_object('key', v_key, 'qty', v_qty, 'lv', l);
    end if;
  end loop;
  return v_items;
end; $$;
revoke all on function public.farm_claim_levels() from public, anon;
grant execute on function public.farm_claim_levels() to authenticated;

-- ⚓ 碼頭市場：用星露（網頁端先扣）換道具，每樣每天 1 個，要 Lv 80
create or replace function public.farm_dock_buy(p_item text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); lv integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_item not in ('wish_normal', 'gacha_coin', 'scratch_card', 'wish_rare', 'ticket_normal', 'chest_gold', 'ticket_special', 'wish_limited') then
    raise exception '碼頭沒有賣這個';
  end if;
  select (state->>'lv')::int into lv from public.farm_saves where user_id = u;
  if coalesce(lv, 0) < 80 then raise exception '島嶼 Lv 80 才開碼頭市場'; end if;
  if not public.grant_item(u, p_item, 1, 'farm-dock:' || public.app_today() || ':' || p_item) then
    return json_build_object('ok', false, 'msg', '這個今天已經買過了');
  end if;
  return json_build_object('ok', true);
end; $$;
revoke all on function public.farm_dock_buy(text) from public, anon;
grant execute on function public.farm_dock_buy(text) to authenticated;

-- 🏝️ 島嶼評分：每週依評分發一次（拿這週最高的那一級；升級了可以補領差額）
create or replace function public.farm_score_tiers()
returns jsonb language sql immutable as $$ select $j$[
  {"min":500, "g":"C", "reward":{"stardust":100}},
  {"min":1000,"g":"B", "reward":{"wish_rare":1}},
  {"min":2000,"g":"A", "reward":{"wish_rare":2,"gacha_coin":2}},
  {"min":3500,"g":"S", "reward":{"wish_limited":1,"chest_star":1}},
  {"min":6000,"g":"SS","reward":{"wish_limited":2,"ticket_limited":1}}
]$j$::jsonb $$;
grant execute on function public.farm_score_tiers() to authenticated;

create or replace function public.farm_score_claim(p_score integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); ws date := t - (extract(isodow from t)::int - 1); x jsonb; k text; v integer; got jsonb := '[]'::jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  for x in select * from jsonb_array_elements(public.farm_score_tiers()) loop
    exit when p_score < (x->>'min')::int;
    for k, v in select key, value::int from jsonb_each_text(x->'reward') loop
      if public.grant_item(u, k, v, 'farm-score:' || ws || ':' || (x->>'g') || ':' || k) then
        got := got || jsonb_build_object('g', x->>'g', 'item', k, 'qty', v);
      end if;
    end loop;
  end loop;
  return json_build_object('week', ws, 'got', got,
    'claimed', (select coalesce(jsonb_agg(distinct split_part(source_key, ':', 3)), '[]'::jsonb) from public.item_events where user_id = u and source_key like 'farm-score:' || ws || ':%'));
end; $$;
revoke all on function public.farm_score_claim(integer) from public, anon;
grant execute on function public.farm_score_claim(integer) to authenticated;
