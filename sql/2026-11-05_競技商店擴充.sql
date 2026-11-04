-- =========================================================
-- 序光計畫：🪙 競技商店擴充：稱號、頭像框、競技限定裝備
-- 要先跑過「2026-11-01_冒險_競技場.sql」「2026-10-23_成長系統.sql」「2026-10-22_驚喜.sql」。可以重複執行。
--
--   稱號（永久，買一次）：⚔️ 競技場常客 300、🔥 宿敵 500、🏆 競技傳說 1200
--   頭像框（永久）：🌿 月桂框 600、🔥 烈焰框 900、🏟️ 競技冠軍框 800（原本就有）
--   競技限定裝備（買到重複會升級，最多 +5，每月各 1 件）：
--     🗡️ 鬥士之劍 700、🛡️ 冠軍鎧甲 700、🏅 榮耀勳章 1500
--   原本的券、星願瓶、寶箱照舊（每月重置數量）
-- =========================================================

-- 稱號：加進稱號圖鑑
do $$ begin
  if to_regprocedure('public.title_catalog_arena()') is null then alter function public.title_catalog() rename to title_catalog_arena; end if;
end $$;
create or replace function public.title_catalog()
returns jsonb language sql immutable as $$
  select public.title_catalog_arena() || '[
    {"key":"arena_regular", "name":"競技場常客", "emoji":"⚔️", "how":"競技商店 300 競技幣"},
    {"key":"arena_rival",   "name":"宿敵",       "emoji":"🔥", "how":"競技商店 500 競技幣"},
    {"key":"arena_legend",  "name":"競技傳說",   "emoji":"🏆", "how":"競技商店 1200 競技幣"}
  ]'::jsonb
$$;

-- 裝備：加進裝備圖鑑（競技限定）
do $$ begin
  if to_regprocedure('public.rpg_catalog_arena()') is null then alter function public.rpg_catalog() rename to rpg_catalog_arena; end if;
end $$;
create or replace function public.rpg_catalog()
returns jsonb language sql immutable as $$
  select c || jsonb_build_object(
      'gear', (c->'gear') || $j${
        "arena_sword": {"name":"鬥士之劍","slot":"weapon","tier":"x","pool":"arena","emoji":"🗡️","stat":{"str":16,"vit":8}},
        "arena_armor": {"name":"冠軍鎧甲","slot":"armor","tier":"x","pool":"arena","emoji":"🛡️","stat":{"vit":16,"wil":8}},
        "arena_medal": {"name":"榮耀勳章","slot":"accessory","tier":"s","pool":"arena","emoji":"🏅","stat":{"str":15,"int":15,"vit":15,"wil":15}}
      }$j$::jsonb)
  from (select public.rpg_catalog_arena() c) b
$$;
grant execute on function public.rpg_catalog() to authenticated;

create or replace function public.arena_shop()
returns jsonb language sql immutable as $$ select $json$[
  {"item":"ticket_normal","name":"普通召喚券","emoji":"🎫","price":60,"limit":3},
  {"item":"ticket_special","name":"特殊召喚券","emoji":"🎟️","price":150,"limit":2},
  {"item":"ticket_limited","name":"限定召喚券","emoji":"🌟","price":300,"limit":1},
  {"item":"wish_limited","name":"限定星願瓶","emoji":"🌠","price":200,"limit":2},
  {"item":"gacha_coin","name":"扭蛋幣","emoji":"🪙","price":30,"limit":5},
  {"item":"chest_star","name":"星光寶箱","emoji":"✨","price":250,"limit":1},
  {"item":"arena_regular","name":"稱號：競技場常客","emoji":"⚔️","price":300,"limit":1,"kind":"title","sec":"look"},
  {"item":"arena_rival","name":"稱號：宿敵","emoji":"🔥","price":500,"limit":1,"kind":"title","sec":"look"},
  {"item":"arena_legend","name":"稱號：競技傳說","emoji":"🏆","price":1200,"limit":1,"kind":"title","sec":"look"},
  {"item":"frame_laurel","name":"月桂框","emoji":"🌿","price":600,"limit":1,"kind":"frame","sec":"look"},
  {"item":"frame_flame","name":"烈焰框","emoji":"🔥","price":900,"limit":1,"kind":"frame","sec":"look"},
  {"item":"frame_arena","name":"競技冠軍框","emoji":"🏟️","price":800,"limit":1,"kind":"frame","sec":"look"},
  {"item":"arena_sword","name":"鬥士之劍（武器）","emoji":"🗡️","price":700,"limit":1,"kind":"gear","sec":"gear"},
  {"item":"arena_armor","name":"冠軍鎧甲（防具）","emoji":"🛡️","price":700,"limit":1,"kind":"gear","sec":"gear"},
  {"item":"arena_medal","name":"榮耀勳章（飾品）","emoji":"🏅","price":1500,"limit":1,"kind":"gear","sec":"gear"}
]$json$::jsonb $$;
grant execute on function public.arena_shop() to authenticated;

-- 有沒有已經擁有（稱號、頭像框買過就不能再買；裝備滿 +5 就不能再買）
create or replace function public.arena_owned(u uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce((select jsonb_object_agg(title, true) from public.user_titles where user_id = u and title like 'arena_%'), '{}'::jsonb)
      || coalesce((select jsonb_object_agg(frame_key, true) from public.fun_frames where user_id = u and frame_key in ('frame_laurel', 'frame_flame', 'frame_arena')), '{}'::jsonb)
      || coalesce((select jsonb_object_agg(gear_key, level) from public.rpg_gear where user_id = u and gear_key like 'arena_%'), '{}'::jsonb)
$$;
revoke all on function public.arena_owned(uuid) from public, anon, authenticated;

create or replace function public.arena_buy(p_item text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); o jsonb; n integer; lv integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select x into o from jsonb_array_elements(public.arena_shop()) x where x->>'item' = p_item;
  if o is null then raise exception '沒有這個東西'; end if;
  if o->>'kind' = 'title' and exists (select 1 from public.user_titles where user_id = u and title = p_item) then raise exception '已經有這個稱號了'; end if;
  if o->>'kind' = 'frame' and exists (select 1 from public.fun_frames where user_id = u and frame_key = p_item) then raise exception '已經有這個頭像框了'; end if;
  if o->>'kind' = 'gear' then
    select level into lv from public.rpg_gear where user_id = u and gear_key = p_item;
    if lv >= 5 then raise exception '這件已經 +5 滿了'; end if;
  end if;
  select count(*) into n from public.item_events where user_id = u and source_key like 'arena-buy:' || p_item || ':%' and delta < 0 and created_at >= date_trunc('month', now());
  if n >= (o->>'limit')::int then raise exception '這個月已經換到上限了'; end if;
  perform public.fun_take(u, 'arena_coin', (o->>'price')::int, 'arena-buy:' || p_item || ':' || gen_random_uuid());
  if o->>'kind' = 'frame' then perform public.fun_frame_grant(u, p_item);
  elsif o->>'kind' = 'title' then insert into public.user_titles (user_id, title) values (u, p_item) on conflict do nothing;
  elsif o->>'kind' = 'gear' then
    if lv is null then insert into public.rpg_gear (user_id, gear_key) values (u, p_item);
    else update public.rpg_gear set level = level + 1 where user_id = u and gear_key = p_item; end if;
  else perform public.grant_item(u, p_item, 1, 'arena-get:' || gen_random_uuid()); end if;
  return json_build_object('success', true, 'kind', o->>'kind');
end; $$;
revoke all on function public.arena_buy(text) from public, anon;
grant execute on function public.arena_buy(text) to authenticated;

-- 狀態多帶「已擁有」
do $$ begin
  if to_regprocedure('public.arena_status_shop()') is null then alter function public.arena_status() rename to arena_status_shop; end if;
end $$;
revoke all on function public.arena_status_shop() from public, anon, authenticated;
create or replace function public.arena_status()
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  return (public.arena_status_shop()::jsonb || jsonb_build_object('owned', public.arena_owned(auth.uid())))::json;
end; $$;
revoke all on function public.arena_status() from public, anon;
grant execute on function public.arena_status() to authenticated;
