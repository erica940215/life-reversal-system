-- =========================================================
-- 序光計畫：🌠 2027 年 2～4 月的每月限定（星露島、冒險）
-- 可以重複執行。要先跑過「2026-10-27_限定瓶.sql」「2026-10-24_新裝備.sql」「2026-10-30_復刻池.sql」。
--
--   星露島：2 月燈花情書（燈籠兔）、3 月櫻花季（櫻花狐）、4 月雨季森林（苔蘚小屋）
--   冒險：2 月花燈劍／情書披風／月老紅線、3 月櫻花太刀／花見羽織／櫻之髮簪、4 月雨傘法杖／苔蘚斗篷／雨滴吊墜
--   過了這個月就自動進復刻池
-- =========================================================

-- ---------- 🏝️ 星露島：把新的月份加進限定池 ----------
do $do$ begin
  if to_regprocedure('public.farm_wish_catalog_v2()') is null then
    alter function public.farm_wish_catalog() rename to farm_wish_catalog_v2;
  end if;
end $do$;

create or replace function public.farm_wish_catalog()
returns jsonb language sql immutable
as $function$
  select c || jsonb_build_object('months', (c->'months') || (n->'months'), 'kind', (c->'kind') || (n->'kind'))
  from (select public.farm_wish_catalog_v2() as c) b,
       (select $json${"months": {"2027-02": {"name": "燈花情書", "hero": "p_lanternbunny", "s": ["p_lanternbunny"], "x": ["f_lovemailbox", "s_lanternground", "s_lanternbarn"], "l": ["f_heartballoon", "f_tangyuanstall", "f_rosearch", "r_strawberrychoco"]}, "2027-03": {"name": "櫻花季", "hero": "p_sakurafox", "s": ["p_sakurafox"], "x": ["f_torii", "s_petalground", "s_sakurabarn"], "l": ["f_hanamimat", "f_sakuralantern", "f_teaseat", "r_sakuramochi"]}, "2027-04": {"name": "雨季森林", "hero": "s_mosscabin", "s": ["s_mosscabin"], "x": ["f_umbrellatree", "f_snailpost"], "l": ["s_puddleground", "f_mushroomlamp", "f_froggauge", "r_mushroomsoup"]}}, "kind": {"p_lanternbunny": "pet", "f_lovemailbox": "deco", "s_lanternground": "skin", "s_lanternbarn": "skin", "f_heartballoon": "deco", "f_tangyuanstall": "deco", "f_rosearch": "deco", "r_strawberrychoco": "recipe", "p_sakurafox": "pet", "f_torii": "deco", "s_petalground": "skin", "s_sakurabarn": "skin", "f_hanamimat": "deco", "f_sakuralantern": "deco", "f_teaseat": "deco", "r_sakuramochi": "recipe", "s_mosscabin": "skin", "f_umbrellatree": "deco", "f_snailpost": "deco", "s_puddleground": "skin", "f_mushroomlamp": "deco", "f_froggauge": "deco", "r_mushroomsoup": "recipe"}}$json$::jsonb as n) x;
$function$;
grant execute on function public.farm_wish_catalog() to authenticated;

-- ---------- ⚔️ 冒險：新的限定裝備和月份系列 ----------
do $do$ begin
  if to_regprocedure('public.rpg_catalog_v2()') is null then
    alter function public.rpg_catalog() rename to rpg_catalog_v2;
  end if;
end $do$;

create or replace function public.rpg_catalog()
returns jsonb language sql immutable
as $function$
  select c || jsonb_build_object(
      'gear', (c->'gear') || (n->'gear'),
      'series', coalesce(c->'series', '{}'::jsonb) || (n->'series'),
      'series_name', coalesce(c->'series_name', '{}'::jsonb) || (n->'series_name'))
  from (select public.rpg_catalog_v2() as c) b,
       (select $json${"gear": {"lantern_blade": {"name": "花燈劍", "slot": "weapon", "tier": "x", "pool": "limited", "series": "lantern", "emoji": "🏮", "stat": {"str": 15, "wil": 10}}, "letter_cape": {"name": "情書披風", "slot": "armor", "tier": "x", "pool": "limited", "series": "lantern", "emoji": "💌", "stat": {"vit": 12, "wil": 12}}, "red_thread": {"name": "月老紅線", "slot": "accessory", "tier": "s", "pool": "limited", "series": "lantern", "emoji": "🧶", "stat": {"str": 14, "int": 14, "vit": 14, "wil": 14}}, "hanami_katana": {"name": "櫻花太刀", "slot": "weapon", "tier": "x", "pool": "limited", "series": "sakura_fest", "emoji": "🌸", "stat": {"str": 16, "int": 9}}, "hanami_haori": {"name": "花見羽織", "slot": "armor", "tier": "x", "pool": "limited", "series": "sakura_fest", "emoji": "👘", "stat": {"vit": 12, "int": 12}}, "sakura_hairpin": {"name": "櫻之髮簪", "slot": "accessory", "tier": "s", "pool": "limited", "series": "sakura_fest", "emoji": "🌺", "stat": {"str": 14, "int": 14, "vit": 14, "wil": 14}}, "umbrella_staff": {"name": "雨傘法杖", "slot": "weapon", "tier": "x", "pool": "limited", "series": "rainforest", "emoji": "☂️", "stat": {"int": 15, "wil": 10}}, "moss_cloak": {"name": "苔蘚斗篷", "slot": "armor", "tier": "x", "pool": "limited", "series": "rainforest", "emoji": "🌿", "stat": {"vit": 14, "wil": 10}}, "rain_pendant": {"name": "雨滴吊墜", "slot": "accessory", "tier": "s", "pool": "limited", "series": "rainforest", "emoji": "💧", "stat": {"str": 14, "int": 14, "vit": 14, "wil": 14}}}, "series": {"2027-02": "lantern", "2027-03": "sakura_fest", "2027-04": "rainforest"}, "series_name": {"lantern": "燈花情書", "sakura_fest": "櫻花季", "rainforest": "雨季森林"}}$json$::jsonb as n) x;
$function$;
grant execute on function public.rpg_catalog() to authenticated;
