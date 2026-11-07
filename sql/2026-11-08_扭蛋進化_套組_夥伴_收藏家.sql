-- =========================================================
-- 序光計畫：🥚 扭蛋大改版
--   ✨ 閃亮版（每抽 3%）  🥇 同一隻 5 隻→金色、10 隻→彩虹（看數量自動進化）
--   🎯 保底：連續 9 抽沒出新角色，第 10 抽一定是沒有的
--   🔟 十連抽：保證至少一隻新角色或閃亮版
--   📅 每月限定卡池（6 隻，只有那個月抽得到）
--   🍀 每天一個幸運時段（隱藏版機率 ×2）
--   🧩 圖鑑套組 → 稱號＋星屑
--   🏘️ 村民收藏品：每週每位村民想要一隻，送了好感 +3＋回禮
--   🐾 夥伴隊伍：選 3 隻跟你專注，專注越久長越大
--   🏅 收藏家等級：升級送扭蛋幣、展示櫃格子
-- 可以重複執行。
-- =========================================================

create table if not exists public.fun_shiny (
  user_id uuid not null references auth.users(id) on delete cascade,
  monster_key text not null,
  count integer not null default 1,
  first_at timestamptz not null default now(),
  primary key (user_id, monster_key)
);
create table if not exists public.fun_gacha_pity (
  user_id uuid not null references auth.users(id) on delete cascade,
  series text not null,
  since_new integer not null default 0,
  pulls integer not null default 0,
  primary key (user_id, series)
);
create table if not exists public.fun_party (
  user_id uuid not null references auth.users(id) on delete cascade,
  monster_key text not null,
  slot integer not null check (slot between 1 and 3),
  joined_at timestamptz not null default now(),
  primary key (user_id, slot)
);
create table if not exists public.fun_party_xp (
  user_id uuid not null references auth.users(id) on delete cascade,
  monster_key text not null,
  minutes integer not null default 0,
  primary key (user_id, monster_key)
);
create table if not exists public.fun_showcase (
  user_id uuid primary key references auth.users(id) on delete cascade,
  keys text[] not null default '{}'
);
create table if not exists public.fun_village_gifts (
  user_id uuid not null references auth.users(id) on delete cascade,
  week date not null,
  villager text not null,
  monster_key text not null,
  given_at timestamptz not null default now(),
  primary key (user_id, week, villager)
);
do $$ declare t text; begin
  foreach t in array array['fun_shiny', 'fun_gacha_pity', 'fun_party', 'fun_party_xp', 'fun_showcase', 'fun_village_gifts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own select" on public.%I', t);
    execute format('create policy "own select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end $$;

-- 📅 每月限定卡池
create or replace function public.gacha_limited_defs() returns jsonb language sql immutable as $$ select $j${
 "01":{"name":"新春福氣","emoji":"🧧","chars":[["L01_lion","舞獅寶寶","🦁"],["L01_redenv","紅包精靈","🧧"],["L01_lantern","燈籠娃娃","🏮"],["L01_cracker","鞭炮小子","🧨"],["L01_orange","大吉橘子","🍊"],["L01_dragon","迎春小龍","🐉"]]},
 "02":{"name":"甜蜜心意","emoji":"💝","chars":[["L02_heart","愛心糖","💝"],["L02_choco","巧克力騎士","🍫"],["L02_rose","玫瑰公主","🌹"],["L02_letter","情書信差","💌"],["L02_cupid","邱比特寶寶","💘"],["L02_tangyuan","湯圓兄弟","🥣"]]},
 "03":{"name":"春天發芽","emoji":"🌱","chars":[["L03_sprout","小嫩芽","🌱"],["L03_ladybug","瓢蟲點點","🐞"],["L03_butterfly","蝴蝶翩翩","🦋"],["L03_tulip","鬱金香","🌷"],["L03_rainbow","彩虹精靈","🌈"],["L03_frog","青蛙呱呱","🐸"]]},
 "04":{"name":"春雨綿綿","emoji":"☔","chars":[["L04_umbrella","小雨傘","☂️"],["L04_snail","雨天蝸牛","🐌"],["L04_cloud","雨雲寶寶","🌧️"],["L04_duck","黃色小鴨","🦆"],["L04_mushroom","蘑菇帽","🍄"],["L04_boot","雨鞋踏踏","👢"]]},
 "05":{"name":"花季","emoji":"🌸","chars":[["L05_sakura","櫻花妹妹","🌸"],["L05_bee","蜜蜂嗡嗡","🐝"],["L05_sunflower","向日葵","🌻"],["L05_bouquet","花束精靈","💐"],["L05_bird","蜂鳥","🐦"],["L05_clover","幸運草","🍀"]]},
 "06":{"name":"夏日海灘","emoji":"🏖️","chars":[["L06_shell","貝殼公主","🐚"],["L06_crab","螃蟹橫橫","🦀"],["L06_dolphin","海豚跳跳","🐬"],["L06_melon","西瓜頭","🍉"],["L06_surf","衝浪小子","🏄"],["L06_sun","太陽公公","☀️"]]},
 "07":{"name":"夏夜祭典","emoji":"🎆","chars":[["L07_firework","煙火球","🎆"],["L07_goldfish","金魚撈撈","🐠"],["L07_yukata","浴衣娃娃","👘"],["L07_ice","剉冰山","🍧"],["L07_firefly","螢火蟲","✨"],["L07_chime","風鈴叮叮","🎐"]]},
 "08":{"name":"星際夏令營","emoji":"🚀","chars":[["L08_rocket","小火箭","🚀"],["L08_ufo","飛碟咻咻","🛸"],["L08_comet","彗星尾巴","☄️"],["L08_astro","太空人","🧑‍🚀"],["L08_planet","土星環環","🪐"],["L08_moon","月亮兔","🌙"]]},
 "09":{"name":"開學季","emoji":"🎒","chars":[["L09_bag","書包包","🎒"],["L09_apple","老師的蘋果","🍎"],["L09_globe","地球儀","🌍"],["L09_bell","上課鐘","🔔"],["L09_books","書堆疊疊","📚"],["L09_cap","學士帽","🎓"]]},
 "10":{"name":"萬聖夜","emoji":"🎃","chars":[["L10_pumpkin","南瓜燈","🎃"],["L10_ghost","小幽靈","👻"],["L10_bat","蝙蝠倒掛","🦇"],["L10_witch","小魔女","🧙"],["L10_candy","糖果怪","🍬"],["L10_cat","黑貓喵","🐈‍⬛"]]},
 "11":{"name":"秋日豐收","emoji":"🍁","chars":[["L11_maple","楓葉精靈","🍁"],["L11_squirrel","松鼠囤囤","🐿️"],["L11_chestnut","糖炒栗子","🌰"],["L11_potato","稻草小妖","🌾"],["L11_pie","感恩之樹","🌳"],["L11_turkey","火雞咕咕","🦃"]]},
 "12":{"name":"星夜聖誕","emoji":"🎄","chars":[["L12_santa","聖誕老人","🎅"],["L12_snowman","雪花精靈","❄️"],["L12_deer","麋鹿魯魯","🦌"],["L12_gift","薑餅士兵","🍪"],["L12_tree","聖誕國王","👑"],["L12_star","樹頂星星","⭐"]]}
}$j$::jsonb $$;

create or replace function public.gacha_series_keys(p_series text, out mons text[], out secret text)
language plpgsql stable as $$
declare m text := to_char(public.app_today(), 'MM');
begin
  if p_series = 'z' then mons := array['z_aries','z_taurus','z_gemini','z_cancer','z_leo','z_virgo','z_libra','z_scorpio','z_sagittarius','z_capricorn','z_aquarius','z_pisces']; secret := 'z_polaris';
  elsif p_series = 'm' then mons := array['m_owl','m_pillow','m_kappa','m_snail','m_hamster','m_fly','m_drop','m_rooster','m_tomato','m_chick','m_bookworm','m_hedgehog']; secret := 'm_secret';
  elsif p_series = 's' then mons := array['s_macaron','s_pudding','s_donut','s_mochi','s_croissant','s_taiyaki','s_bubbletea','s_cupcake','s_icecream','s_pancake','s_dango','s_cookie']; secret := 's_starcake';
  elsif p_series = 'w' then mons := array['w_pencil','w_eraser','w_ruler','w_highlighter','w_stapler','w_notebook','w_clip','w_sticky','w_compass','w_scissors','w_glue','w_calculator']; secret := 'w_fountainpen';
  elsif p_series = 'L' then mons := array(select c->>0 from jsonb_array_elements(public.gacha_limited_defs()->m->'chars') c); secret := null;
  else raise exception '沒有這個扭蛋系列'; end if;
end; $$;

-- 🍀 今天的幸運時段（台北時間 9～22 點之間的某一小時）
create or replace function public.gacha_lucky_hour(u uuid) returns integer language sql stable as $$
  select 9 + abs(hashtext(u::text || ':lucky:' || public.app_today())) % 14 $$;

-- 抽一顆（內部用）
create or replace function public.gacha_one(u uuid, p_series text, p_force text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare mons text[]; v_secret text; owned text[]; missing text[]; v_key text; v_count integer; v_dust integer := 0; v_shiny boolean; v_new boolean;
  lucky boolean; v_id text := gen_random_uuid()::text; pity integer; total integer; done_key text;
begin
  select g.mons, g.secret into mons, v_secret from public.gacha_series_keys(p_series) g;
  select coalesce(array_agg(monster_key), '{}') into owned from public.fun_monsters where user_id = u and monster_key = any(mons || coalesce(v_secret, ''));
  missing := array(select k from unnest(mons || case when v_secret is null then '{}'::text[] else array[v_secret] end) k where not (k = any(owned)));
  insert into public.fun_gacha_pity (user_id, series) values (u, p_series) on conflict do nothing;
  select since_new into pity from public.fun_gacha_pity where user_id = u and series = p_series;
  lucky := extract(hour from now() at time zone 'Asia/Taipei')::int = public.gacha_lucky_hour(u);
  if (coalesce(p_force, '') = 'new' or pity >= 9) and array_length(missing, 1) > 0 then
    v_key := missing[1 + floor(random() * array_length(missing, 1))::int];
  elsif v_secret is not null and random() < (case when lucky then 0.08 else 0.04 end) then
    v_key := v_secret;
  else
    v_key := mons[1 + floor(random() * array_length(mons, 1))::int];
  end if;
  v_shiny := coalesce(p_force, '') = 'shiny' or random() < 0.03;
  v_new := not (v_key = any(owned));
  insert into public.fun_monsters (user_id, monster_key) values (u, v_key)
    on conflict (user_id, monster_key) do update set count = public.fun_monsters.count + 1 returning count into v_count;
  if v_shiny then
    insert into public.fun_shiny (user_id, monster_key) values (u, v_key) on conflict (user_id, monster_key) do update set count = public.fun_shiny.count + 1;
  end if;
  update public.fun_gacha_pity set since_new = case when v_new then 0 else since_new + 1 end, pulls = pulls + 1 where user_id = u and series = p_series;
  if v_count > 1 and v_count not in (5, 10) then
    v_dust := case when v_key = v_secret then 10 else 2 end;
    perform public.grant_item(u, 'stardust', v_dust, 'gacha-dup:' || v_id);
  end if;
  return jsonb_build_object('key', v_key, 'count', v_count, 'dust', v_dust, 'new', v_new, 'shiny', v_shiny, 'lucky', lucky,
    'evolve', case v_count when 5 then 'gold' when 10 then 'rainbow' end);
end; $$;
revoke all on function public.gacha_one(uuid, text, text) from public, anon, authenticated;

-- 集滿一個系列的大禮
create or replace function public.gacha_set_check(u uuid, p_series text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare mons text[]; v_secret text; need integer; have integer; v_set boolean := false; m text := to_char(public.app_today(), 'YYYY-MM');
begin
  select g.mons, g.secret into mons, v_secret from public.gacha_series_keys(p_series) g;
  need := array_length(mons, 1) + case when v_secret is null then 0 else 1 end;
  select count(*) into have from public.fun_monsters where user_id = u and monster_key = any(mons || coalesce(v_secret, ''));
  if have >= need then
    if p_series = 'L' then
      v_set := public.grant_item(u, 'ticket_limited', 1, 'limited-set:' || m);
      if v_set then perform public.grant_item(u, 'stardust', 50, 'limited-set-dust:' || m); end if;
    else
      v_set := public.grant_item(u, 'ticket_limited', 1, case p_series when 'm' then 'monster-set:1' when 'z' then 'zodiac-set:1' else p_series || '-gacha-set:1' end);
      if v_set then
        perform public.grant_item(u, 'stardust', 30, case p_series when 'm' then 'monster-set-dust:1' when 'z' then 'zodiac-set-dust:1' else p_series || '-gacha-set-dust:1' end);
        perform public.fun_frame_grant(u, case p_series when 'm' then 'frame_monster' when 'z' then 'frame_zodiac' when 's' then 'frame_sweets' else 'frame_stationery' end);
      end if;
    end if;
  end if;
  return v_set;
end; $$;
revoke all on function public.gacha_set_check(uuid, text) from public, anon, authenticated;

create or replace function public.fun_gacha_pull(p_series text default 'm')
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); r jsonb; v_set boolean;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  perform public.gacha_series_keys(p_series);
  perform public.fun_take(v_user, 'gacha_coin', 1, 'gacha-use:' || gen_random_uuid());
  r := public.gacha_one(v_user, p_series, null);
  v_set := public.gacha_set_check(v_user, p_series);
  return (r || jsonb_build_object('success', true, 'set_done', v_set))::json;
end; $$;
revoke all on function public.fun_gacha_pull(text) from public, anon;
grant execute on function public.fun_gacha_pull(text) to authenticated;

-- 🔟 十連抽
create or replace function public.fun_gacha_pull10(p_series text default 'm')
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); res jsonb := '[]'::jsonb; r jsonb; good boolean := false; i integer; v_set boolean; force text;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  perform public.gacha_series_keys(p_series);
  perform public.fun_take(v_user, 'gacha_coin', 10, 'gacha-use10:' || gen_random_uuid());
  for i in 1..10 loop
    force := null;
    if i = 10 and not good then
      force := case when exists (select 1 from unnest((select g.mons || coalesce(g.secret, '') from public.gacha_series_keys(p_series) g)) k
        where k <> '' and not exists (select 1 from public.fun_monsters f where f.user_id = v_user and f.monster_key = k)) then 'new' else 'shiny' end;
    end if;
    r := public.gacha_one(v_user, p_series, force);
    if (r->>'new')::boolean or (r->>'shiny')::boolean then good := true; end if;
    res := res || jsonb_build_array(r);
  end loop;
  v_set := public.gacha_set_check(v_user, p_series);
  return json_build_object('success', true, 'results', res, 'set_done', v_set);
end; $$;
revoke all on function public.fun_gacha_pull10(text) from public, anon;
grant execute on function public.fun_gacha_pull10(text) to authenticated;


-- 🧩 圖鑑套組
create or replace function public.gacha_sets() returns jsonb language sql immutable as $$ select '[
 {"k":"breakfast","name":"早餐組","emoji":"🥐","items":["s_croissant","s_pancake","s_bubbletea","m_rooster"],"title":"早餐店常客"},
 {"k":"study","name":"讀書組","emoji":"📚","items":["m_owl","m_bookworm","w_notebook","w_highlighter"],"title":"圖書館之主"},
 {"k":"sleepy","name":"賴床組","emoji":"😴","items":["m_pillow","m_snail","s_mochi","z_taurus"],"title":"再睡五分鐘"},
 {"k":"night","name":"夜空組","emoji":"🌌","items":["z_polaris","z_aquarius","z_pisces","s_starcake"],"title":"追星的人"},
 {"k":"fixer","name":"修正組","emoji":"🧽","items":["w_eraser","w_glue","w_clip","w_stapler"],"title":"錯了就改"},
 {"k":"sweet","name":"下午茶組","emoji":"🍰","items":["s_macaron","s_cupcake","s_cookie","s_icecream","s_pudding"],"title":"下午茶鑑賞家"},
 {"k":"measure","name":"精準組","emoji":"📏","items":["w_ruler","w_compass","w_calculator","z_libra"],"title":"一絲不苟"},
 {"k":"brave","name":"勇者組","emoji":"⚔️","items":["z_leo","z_aries","z_sagittarius","w_scissors"],"title":"衝第一的勇者"},
 {"k":"water","name":"喝水組","emoji":"💧","items":["m_drop","z_aquarius","s_bubbletea","m_kappa"],"title":"多喝水沒事"},
 {"k":"legend","name":"隱藏版大集合","emoji":"🌟","items":["m_secret","z_polaris","s_starcake","w_fountainpen"],"title":"傳說收藏家"}
]'::jsonb $$;

-- 🏘️ 這週每位村民想要哪一隻（從他們喜歡的系列裡挑）
create or replace function public.gacha_wants(u uuid) returns jsonb language plpgsql stable as $$
declare w date := public.life_week(public.app_today()); pref jsonb := '{"baker":"s","grandpa":"z","florist":"m","kid":"m","librarian":"w","barista":"s","astronomer":"z","musician":"w"}'::jsonb;
  res jsonb := '{}'::jsonb; k text; mons text[];
begin
  for k in select jsonb_object_keys(pref) loop
    select g.mons into mons from public.gacha_series_keys(pref->>k) g;
    res := res || jsonb_build_object(k, mons[1 + abs(hashtext(u::text || k || w)) % array_length(mons, 1)]);
  end loop;
  return res;
end; $$;

create or replace function public.gacha_give(p_villager text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); w date := public.life_week(public.app_today()); want text; n integer; gifts jsonb := '{"baker":{"stardust":60},"grandpa":{"wish_rare":1},"florist":{"gacha_coin":3},"kid":{"gacha_coin":3},"librarian":{"stardust":60},"barista":{"gacha_coin":3},"astronomer":{"wish_rare":1},"musician":{"stardust":60}}'::jsonb;
  k text; v integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  want := public.gacha_wants(u)->>p_villager;
  if want is null then raise exception '沒有這位村民'; end if;
  if exists (select 1 from public.fun_village_gifts where user_id = u and week = w and villager = p_villager) then raise exception '這週已經送過了'; end if;
  select count into n from public.fun_monsters where user_id = u and monster_key = want for update;
  if coalesce(n, 0) < 2 then raise exception '要有 2 隻以上才能送（自己留一隻）'; end if;
  update public.fun_monsters set count = count - 1 where user_id = u and monster_key = want;
  insert into public.fun_village_gifts (user_id, week, villager, monster_key) values (u, w, p_villager, want);
  insert into public.village_aff (user_id, villager, aff) values (u, p_villager, 3) on conflict (user_id, villager) do update set aff = public.village_aff.aff + 3;
  for k, v in select key, value::int from jsonb_each_text(gifts->p_villager) loop perform public.grant_item(u, k, v, 'vgift:' || w || ':' || p_villager || ':' || k); end loop;
  return json_build_object('ok', true, 'gift', gifts->p_villager, 'key', want);
end; $$;

-- 🐾 夥伴隊伍：每隻的經驗 = 存下的分鐘 ＋ 加入後的專注分鐘
create or replace function public.gacha_party(u uuid) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slot', p.slot, 'key', p.monster_key,
    'minutes', coalesce((select minutes from public.fun_party_xp x where x.user_id = u and x.monster_key = p.monster_key), 0)
      + coalesce((select sum(coalesce(duration_seconds, 0)) / 60 from public.focus_sessions f where f.user_id = u and f.started_at >= p.joined_at), 0)::int) order by p.slot), '[]'::jsonb)
  from public.fun_party p where p.user_id = u $$;

create or replace function public.gacha_party_set(p_slot integer, p_key text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); old public.fun_party; gained integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_slot not between 1 and 3 then raise exception '只有 3 個位置'; end if;
  if p_key is not null and not exists (select 1 from public.fun_monsters where user_id = u and monster_key = p_key) then raise exception '你還沒有這隻'; end if;
  if p_key is not null and exists (select 1 from public.fun_party where user_id = u and monster_key = p_key and slot <> p_slot) then raise exception '牠已經在隊伍裡了'; end if;
  select * into old from public.fun_party where user_id = u and slot = p_slot;
  if found then
    select coalesce(sum(coalesce(duration_seconds, 0)) / 60, 0) into gained from public.focus_sessions where user_id = u and started_at >= old.joined_at;
    insert into public.fun_party_xp (user_id, monster_key, minutes) values (u, old.monster_key, gained)
      on conflict (user_id, monster_key) do update set minutes = public.fun_party_xp.minutes + excluded.minutes;
    delete from public.fun_party where user_id = u and slot = p_slot;
  end if;
  if p_key is not null then insert into public.fun_party (user_id, monster_key, slot) values (u, p_key, p_slot); end if;
  return public.gacha_meta();
end; $$;

create or replace function public.gacha_showcase_set(p_keys text[])
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); lv integer;
begin
  lv := (public.gacha_meta()::jsonb->'collector'->>'lv')::int;
  if array_length(p_keys, 1) > 2 + lv then raise exception '展示櫃只有 % 格', 2 + lv; end if;
  insert into public.fun_showcase (user_id, keys) values (u, coalesce(p_keys, '{}')) on conflict (user_id) do update set keys = excluded.keys;
  return public.gacha_meta();
end; $$;

-- 📖 全部資料：保底、幸運時段、限定池、閃亮、套組、村民想要、夥伴、收藏家等級
create or replace function public.gacha_meta()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); m text := to_char(public.app_today(), 'MM'); mons jsonb; shiny jsonb; sets jsonb := '[]'::jsonb; s jsonb;
  uniq integer; gold integer; rainbow integer; nshiny integer; nsets integer := 0; pts integer; lv integer := 1; th integer[] := array[0, 50, 120, 220, 350, 520, 740, 1000, 1300, 1650, 2050, 2500];
  i integer; got_lv integer[] := '{}';
begin
  if u is null then raise exception '尚未登入'; end if;
  select coalesce(jsonb_object_agg(monster_key, count), '{}') into mons from public.fun_monsters where user_id = u;
  select coalesce(jsonb_object_agg(monster_key, count), '{}') into shiny from public.fun_shiny where user_id = u;
  for s in select * from jsonb_array_elements(public.gacha_sets()) loop
    s := s || jsonb_build_object('have', (select count(*) from jsonb_array_elements_text(s->'items') k where mons ? k));
    if (s->>'have')::int >= jsonb_array_length(s->'items') then
      nsets := nsets + 1;
      if public.grant_item(u, 'stardust', 40, 'gset:' || (s->>'k')) then
        insert into public.user_titles (user_id, title) select u, s->>'title' where not exists (select 1 from public.user_titles where user_id = u and title = s->>'title');
      end if;
      s := s || '{"done":true}'::jsonb;
    end if;
    sets := sets || jsonb_build_array(s);
  end loop;
  select count(*), count(*) filter (where count >= 5), count(*) filter (where count >= 10) into uniq, gold, rainbow from public.fun_monsters where user_id = u;
  select count(*) into nshiny from public.fun_shiny where user_id = u;
  pts := uniq * 10 + gold * 5 + rainbow * 10 + nshiny * 15 + nsets * 20;
  while lv < 12 and pts >= th[lv + 1] loop lv := lv + 1; end loop;
  for i in 2..lv loop
    if public.grant_item(u, 'gacha_coin', 2 + i / 2, 'collector-lv:' || i) then got_lv := got_lv || i; end if;
  end loop;
  return json_build_object(
    'pity', coalesce((select jsonb_object_agg(series, jsonb_build_object('since', since_new, 'pulls', pulls)) from public.fun_gacha_pity where user_id = u), '{}'),
    'lucky_hour', public.gacha_lucky_hour(u),
    'lucky_now', extract(hour from now() at time zone 'Asia/Taipei')::int = public.gacha_lucky_hour(u),
    'limited', public.gacha_limited_defs()->m || jsonb_build_object('month', m, 'next', public.gacha_limited_defs()->to_char(t + interval '1 month', 'MM')->'name'),
    'shiny', shiny, 'sets', sets,
    'wants', public.gacha_wants(u),
    'given', coalesce((select jsonb_object_agg(villager, monster_key) from public.fun_village_gifts where user_id = u and week = public.life_week(t)), '{}'),
    'party', public.gacha_party(u),
    'showcase', coalesce((select to_jsonb(keys) from public.fun_showcase where user_id = u), '[]'),
    'collector', jsonb_build_object('lv', lv, 'pts', pts, 'cur', th[lv], 'next', case when lv < 12 then th[lv + 1] end, 'slots', 2 + lv,
      'uniq', uniq, 'gold', gold, 'rainbow', rainbow, 'shiny', nshiny, 'sets', nsets, 'new_levels', got_lv));
end; $$;

do $$ declare f text; begin
  foreach f in array array['gacha_meta()', 'gacha_give(text)', 'gacha_party_set(integer,text)', 'gacha_showcase_set(text[])'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
