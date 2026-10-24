-- =========================================================
-- 🌟 新裝備上線：5 套套裝、職業傳說 8 件、季節 4 件、彩蛋與奇幻 7 件
-- 需要先跑過：2026-10-23_裝備擴充.sql
-- 可以重複執行（若之後重跑 2026-10-23_裝備擴充.sql，請再跑一次這份）。
--
--   套裝：星海、工坊、山野藥師、櫻花劍道、書庫（各 3 件，進普通池／特殊池）
--   職業傳說：每職業 2 件，對應職業穿上戰力 +20%（進普通池／特殊池）
--   季節：月見、霜降、冬至、春分（限定池，每季輪替一件，見 2026-10-24_季節與彩蛋.sql）
--   彩蛋與奇幻：pool = 'event'，不會被召喚抽到，之後用行為發放
--
--   做法：把原本的 rpg_catalog() 改名為 rpg_catalog_base()，
--         新的 rpg_catalog() 把新裝備與新套裝合併進去。
-- =========================================================

do $$
begin
  if to_regprocedure('public.rpg_catalog_base()') is null
     and to_regprocedure('public.rpg_catalog()') is not null then
    alter function public.rpg_catalog() rename to rpg_catalog_base;
  end if;
end $$;

create or replace function public.rpg_catalog()
returns jsonb language sql immutable
as $$
  select b.c
         || jsonb_build_object(
              'gear', (b.c->'gear') || (p.p->'gear'),
              'sets', (b.c->'sets') || (p.p->'sets'))
  from (select public.rpg_catalog_base() as c) b,
       (select $json${
  "gear": {
    "starsea_sword":     {"name":"星海眠劍","slot":"weapon","tier":"l","pool":"base","set":"starsea","emoji":"🗡️","stat":{"str":12,"wil":4}},
    "starsea_garb":      {"name":"星海睡袍","slot":"armor","tier":"l","pool":"base","set":"starsea","emoji":"🌌","stat":{"int":8,"wil":6}},
    "starsea_crown":     {"name":"星海夜冠","slot":"accessory","tier":"l","pool":"base","set":"starsea","emoji":"🌙","stat":{"int":8,"str":4}},
    "mecha_hammer":      {"name":"工坊機關錘","slot":"weapon","tier":"l","pool":"base","set":"mecha","emoji":"🔨","stat":{"str":10,"vit":3}},
    "mecha_gear_mail":   {"name":"工坊齒輪甲","slot":"armor","tier":"l","pool":"base","set":"mecha","emoji":"⚙️","stat":{"vit":9,"str":3}},
    "mecha_goggles":     {"name":"工坊精靈鏡","slot":"accessory","tier":"l","pool":"base","set":"mecha","emoji":"🥽","stat":{"int":6,"str":4}},
    "herbal_sickle":     {"name":"山野採藥鐮","slot":"weapon","tier":"l","pool":"base","set":"herbal","emoji":"🌿","stat":{"str":6,"vit":6}},
    "herbal_coat":       {"name":"山野藥師袍","slot":"armor","tier":"l","pool":"base","set":"herbal","emoji":"🧪","stat":{"vit":8,"wil":4}},
    "herbal_basket":     {"name":"山野背藥籠","slot":"accessory","tier":"l","pool":"base","set":"herbal","emoji":"🧺","stat":{"vit":5,"wil":5}},
    "sakura_katana":     {"name":"櫻花斬魔刀","slot":"weapon","tier":"l","pool":"base","set":"sakura","emoji":"🌸","stat":{"str":12}},
    "sakura_gi":         {"name":"櫻花劍道服","slot":"armor","tier":"l","pool":"base","set":"sakura","emoji":"👘","stat":{"wil":8,"int":4}},
    "sakura_men":        {"name":"櫻花劍道面","slot":"accessory","tier":"l","pool":"base","set":"sakura","emoji":"🎭","stat":{"str":4,"vit":4,"wil":4}},
    "library_tome":      {"name":"書庫封印書","slot":"weapon","tier":"l","pool":"base","set":"library","emoji":"📕","stat":{"int":12}},
    "library_mantle":    {"name":"書庫守護袍","slot":"armor","tier":"l","pool":"base","set":"library","emoji":"🧥","stat":{"int":6,"wil":6}},
    "library_key":       {"name":"書庫千重鑰","slot":"accessory","tier":"l","pool":"base","set":"library","emoji":"🗝️","stat":{"wil":6,"int":4}},

    "no_word_tome":      {"name":"無字天書","slot":"weapon","tier":"s","pool":"base","class":"scholar","emoji":"📘","stat":{"int":24,"wil":8}},
    "ink_abyss_brush":   {"name":"墨淵筆","slot":"accessory","tier":"s","pool":"base","class":"scholar","emoji":"🖌️","stat":{"int":18,"wil":12}},
    "dawn_fist":         {"name":"破曉鐵拳","slot":"weapon","tier":"s","pool":"base","class":"warrior","emoji":"🥊","stat":{"str":26,"vit":10}},
    "ruin_shield":       {"name":"殘壁盾","slot":"armor","tier":"s","pool":"base","class":"warrior","emoji":"🛡️","stat":{"vit":20,"wil":8}},
    "moonlight_candle":  {"name":"月光蠟燭","slot":"accessory","tier":"s","pool":"base","class":"guardian","emoji":"🕯️","stat":{"wil":22,"int":8}},
    "oak_heart":         {"name":"橡樹之心","slot":"armor","tier":"s","pool":"base","class":"guardian","emoji":"💚","stat":{"vit":18,"wil":10}},
    "wind_boots":        {"name":"風之靴","slot":"accessory","tier":"s","pool":"base","class":"ranger","emoji":"👢","stat":{"str":14,"vit":12}},
    "mist_cloak":        {"name":"迷霧斗篷","slot":"armor","tier":"s","pool":"base","class":"ranger","emoji":"🌫️","stat":{"wil":14,"int":10}},

    "moon_view":         {"name":"月見","slot":"accessory","tier":"x","pool":"limited","series":"moon_view","emoji":"🥮","stat":{"wil":10,"vit":6}},
    "frost_descent":     {"name":"霜降","slot":"armor","tier":"x","pool":"limited","series":"frost_descent","emoji":"🍁","stat":{"vit":12,"wil":6}},
    "winter_solstice":   {"name":"冬至","slot":"accessory","tier":"x","pool":"limited","series":"winter_solstice","emoji":"🍲","stat":{"int":8,"wil":8,"vit":4}},
    "spring_equinox":    {"name":"春分","slot":"weapon","tier":"x","pool":"limited","series":"spring_equinox","emoji":"🌸","stat":{"str":10,"int":6}},

    "midnight_lamp":     {"name":"深夜的燈","slot":"accessory","tier":"x","pool":"event","emoji":"🏮","stat":{"int":10,"wil":10}},
    "consecutive_medal": {"name":"連續 30 天勳章","slot":"accessory","tier":"x","pool":"event","emoji":"🏅","stat":{"str":8,"vit":8,"wil":8}},
    "self_written_badge":{"name":"自己寫的歌徽章","slot":"accessory","tier":"r","pool":"event","emoji":"🎵","stat":{"wil":8}},
    "failed_souvenir":   {"name":"失敗的紀念品","slot":"accessory","tier":"x","pool":"event","emoji":"🧸","stat":{"str":6,"vit":6,"int":6,"wil":6}},
    "paper_lantern_ghost":{"name":"紙燈籠鬼面","slot":"armor","tier":"x","pool":"event","emoji":"🎃","stat":{"vit":10,"int":6}},
    "talking_skeleton_staff":{"name":"會說話的骷髏手杖","slot":"weapon","tier":"x","pool":"event","emoji":"💀","stat":{"int":14,"wil":6}},
    "under_moon_fox_tail":{"name":"月下狐尾","slot":"accessory","tier":"s","pool":"event","emoji":"🦊","stat":{"str":10,"int":10,"vit":10,"wil":10}}
  },
  "sets": {
    "starsea": {"name":"星海套","desc":"智力 +15%、意志 +10%","bonus":{"int":0.15,"wil":0.10}},
    "mecha":   {"name":"工坊套","desc":"力量 +15%、智力 +10%","bonus":{"str":0.15,"int":0.10}},
    "herbal":  {"name":"山野藥師套","desc":"體力 +20%","bonus":{"vit":0.20}},
    "sakura":  {"name":"櫻花劍道套","desc":"力量 +15%、意志 +10%","bonus":{"str":0.15,"wil":0.10}},
    "library": {"name":"書庫套","desc":"智力、意志 +15%","bonus":{"int":0.15,"wil":0.15}}
  }
}$json$::jsonb as p) p;
$$;

grant execute on function public.rpg_catalog() to authenticated;
