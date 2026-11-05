-- 序光計畫：夢境副本＋夢境收藏＋人生之樹，一次跑完
-- =========================================================
-- 序光計畫：🌙 夢境副本（晚上限定）
-- 要先跑過「2026-11-02_生活打卡.sql」。可以重複執行。
--
--   晚上 20:00～早上 6:00 之間，滿足其中一個就能入夢（每晚一次）：
--     ① 生活打卡 🌙 開頭的項目今天勾了 2 個以上
--     ② 按「😴 我要去睡了」
--   入夢：今晚的場景（6 種輪流）三扇門選一扇，開到的東西先「留在夢裡」
--   隔天早上 6:00～10:30 打開網站帶出來＝全部；10:30 以後才打開＝只帶得出一半（至少 1）
--   每晚多 1 片 🌙 夢之碎片；連續入夢第 7、14、21… 晚 2 片，第 30 晚 5 片
--   碎片 7 片換「夢境寶箱」：限定星願瓶 1＋星光寶箱 1＋星屑 200
-- =========================================================

create table if not exists public.dream_nights (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  slept_at timestamptz,
  entered_at timestamptz,
  scene text,
  door integer,
  reward jsonb,
  streak integer not null default 0,
  claimed_at timestamptz,
  half boolean,
  primary key (user_id, day)
);
alter table public.dream_nights enable row level security;
drop policy if exists "own select" on public.dream_nights;
create policy "own select" on public.dream_nights for select using (auth.uid() = user_id);
revoke insert, update, delete on public.dream_nights from authenticated, anon;

create or replace function public.dream_scenes()
returns jsonb language sql immutable as $$ select $j$[
  {"key":"library","name":"雲上圖書館","emoji":"📚","line":"書架一路延伸到雲裡，每本書都在輕輕翻頁。"},
  {"key":"sea","name":"星空之海","emoji":"🌌","line":"海面倒映著整片銀河，腳下踩的是星星。"},
  {"key":"candy","name":"糖果森林","emoji":"🍭","line":"樹上結滿棉花糖，小溪流著熱可可。"},
  {"key":"room","name":"童年的房間","emoji":"🧸","line":"小時候的書桌還在，抽屜裡好像藏著什麼。"},
  {"key":"train","name":"夜行列車","emoji":"🚂","line":"列車在雲上奔馳，窗外一站一站都是回憶。"},
  {"key":"garden","name":"月光花園","emoji":"🌙","line":"花在月光下發著微光，風裡有薰衣草的味道。"}
]$j$::jsonb $$;
grant execute on function public.dream_scenes() to authenticated;

-- 現在是不是晚上（台北 20:00～06:00）
create or replace function public.dream_is_night()
returns boolean language sql stable as $$
  select extract(hour from now() at time zone 'Asia/Taipei') >= 20 or extract(hour from now() at time zone 'Asia/Taipei') < 6
$$;

-- 今天勾了幾個 🌙 項目
create or replace function public.dream_moon_done(u uuid, d date)
returns integer language sql stable security definer set search_path to 'public' as $$
  select count(*)::int from public.project_step_logs l
    join public.project_steps s on s.id = l.step_id
    join public.projects p on p.id = l.project_id
   where l.user_id = u and l.day = d and l.done and p.domain is not null and s.title like '🌙%'
$$;
revoke all on function public.dream_moon_done(uuid, date) from public, anon, authenticated;

-- 早上把夢裡的東西帶出來（今天以前、還沒領的）
create or replace function public.dream_claim_of(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  t date := public.app_today(); r record; v_half boolean; k text; v integer; got jsonb := '[]'::jsonb;
  mins integer := (extract(hour from now() at time zone 'Asia/Taipei') * 60 + extract(minute from now() at time zone 'Asia/Taipei'))::int;
begin
  for r in select * from public.dream_nights where user_id = u and entered_at is not null and claimed_at is null and day < t order by day loop
    v_half := not (r.day = t - 1 and mins between 360 and 629);
    for k, v in select key, value::int from jsonb_each_text(r.reward) loop
      v := case when v_half and k <> 'dream_shard' then greatest(1, ceil(v / 2.0)::int) else v end;
      perform public.grant_item(u, k, v, 'dream:' || r.day || ':' || k);
    end loop;
    update public.dream_nights set claimed_at = now(), half = v_half where user_id = u and day = r.day;
    got := got || jsonb_build_object('day', r.day, 'scene', r.scene, 'reward', r.reward, 'half', v_half);
  end loop;
  return got;
end; $$;
revoke all on function public.dream_claim_of(uuid) from public, anon, authenticated;

create or replace function public.dream_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); t date := public.app_today(); n public.dream_nights%rowtype; claimed jsonb; moon integer; v_st integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  claimed := public.dream_claim_of(u);
  select * into n from public.dream_nights where user_id = u and day = t;
  moon := public.dream_moon_done(u, t);
  select coalesce((select d.streak from public.dream_nights d where d.user_id = u and d.day = t - 1 and d.entered_at is not null), 0) into v_st;
  return json_build_object(
    'today', t, 'night', public.dream_is_night(),
    'moon', moon, 'slept', n.slept_at is not null,
    'open', public.dream_is_night() and (moon >= 2 or n.slept_at is not null) and n.entered_at is null,
    'entered', case when n.entered_at is not null then jsonb_build_object('scene', n.scene, 'door', n.door, 'reward', n.reward, 'streak', n.streak) end,
    'next_streak', v_st + 1,
    'scene', public.dream_scenes()->(abs(hashtext(u::text || t)) % 6),
    'shards', coalesce((select qty from public.player_items where user_id = u and item_key = 'dream_shard'), 0),
    'nights', (select count(*) from public.dream_nights where user_id = u and entered_at is not null),
    'claimed', claimed);
end; $$;
revoke all on function public.dream_status() from public, anon;
grant execute on function public.dream_status() to authenticated;

create or replace function public.dream_sleep()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today();
begin
  if u is null then raise exception '尚未登入'; end if;
  if not public.dream_is_night() then raise exception '晚上 8 點以後才能去睡喔'; end if;
  insert into public.dream_nights (user_id, day, slept_at) values (u, t, now())
    on conflict (user_id, day) do update set slept_at = coalesce(public.dream_nights.slept_at, now());
  return public.dream_status();
end; $$;
revoke all on function public.dream_sleep() from public, anon;
grant execute on function public.dream_sleep() to authenticated;

create or replace function public.dream_enter(p_door integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); t date := public.app_today(); n public.dream_nights%rowtype; st integer; r double precision;
  rw jsonb; sh integer; sc jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_door not in (1, 2, 3) then raise exception '沒有這扇門'; end if;
  if not public.dream_is_night() then raise exception '夢境只在晚上 8 點到早上 6 點開'; end if;
  select * into n from public.dream_nights where user_id = u and day = t;
  if n.entered_at is not null then raise exception '今晚已經做過夢了'; end if;
  if public.dream_moon_done(u, t) < 2 and n.slept_at is null then raise exception '先勾 2 個 🌙 晚上的項目，或按「我要去睡了」'; end if;
  st := coalesce((select d.streak from public.dream_nights d where d.user_id = u and d.day = t - 1 and d.entered_at is not null), 0) + 1;
  sc := public.dream_scenes()->(abs(hashtext(u::text || t)) % 6);
  r := random();
  rw := case
    when r < 0.01 then '{"wish_limited":1}'
    when r < 0.05 then '{"ticket_special":1}'
    when r < 0.13 then '{"wish_rare":1}'
    when r < 0.23 then '{"scratch_card":1}'
    when r < 0.35 then '{"wish_normal":1}'
    when r < 0.50 then '{"gacha_coin":1}'
    else jsonb_build_object('stardust', 30 + floor(random() * 51)::int) end::jsonb;
  -- 連續入夢的特別夜
  if st % 30 = 0 then rw := rw || '{"wish_limited":2}'::jsonb;
  elsif st % 7 = 0 then rw := rw || '{"wish_rare":2}'::jsonb; end if;
  sh := case when st % 30 = 0 then 5 when st % 7 = 0 then 2 else 1 end;
  rw := rw || jsonb_build_object('dream_shard', sh);
  insert into public.dream_nights (user_id, day, entered_at, scene, door, reward, streak)
    values (u, t, now(), sc->>'key', p_door, rw, st)
    on conflict (user_id, day) do update set entered_at = now(), scene = excluded.scene, door = excluded.door, reward = excluded.reward, streak = excluded.streak;
  return json_build_object('scene', sc, 'door', p_door, 'reward', rw, 'streak', st);
end; $$;
revoke all on function public.dream_enter(integer) from public, anon;
grant execute on function public.dream_enter(integer) to authenticated;

-- 碎片 7 片換夢境寶箱
create or replace function public.dream_exchange()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); id text := gen_random_uuid()::text;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.fun_take(u, 'dream_shard', 7, 'dream-ex:' || id);
  perform public.grant_item(u, 'wish_limited', 1, 'dream-ex-w:' || id);
  perform public.grant_item(u, 'chest_star', 1, 'dream-ex-c:' || id);
  perform public.grant_item(u, 'stardust', 200, 'dream-ex-s:' || id);
  return json_build_object('ok', true);
end; $$;
revoke all on function public.dream_exchange() from public, anon;
grant execute on function public.dream_exchange() to authenticated;

-- =========================================================
-- 序光計畫：🌙 夢境收藏（夢境的獨立獎勵池）
-- 要先跑過「2026-11-05_夢境副本.sql」。可以重複執行。
--
--   每晚推開的門後面，會遇到一個「夢境收藏」（夢獸或夢裡的小東西），外加一點星屑和夢之碎片
--   四個池：
--     ⚪ 普通 66%：12 種　　🔵 稀有 24%：8 種　　🟣 限定 6%：4 種（永久）
--     🌟 當月限定 4%：每個月 1 種，只有那個月夢得到
--   連續入夢第 7、14…晚至少稀有；第 30、60…晚必定限定或當月限定
--   早上 6:00～10:30 醒來＝夢境收藏一定帶得出來；太晚醒＝一半機率「夢醒就忘了」，變成 1 片夢之碎片
--   重複的收藏自動變成夢之碎片：普通 1、稀有 3、限定 8、當月限定 8
--   收集里程碑：5／10／15／20／30 種、普通全收、稀有全收、全部收齊 → 星願瓶、稱號、頭像框
-- =========================================================

create table if not exists public.dream_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item text not null,
  n integer not null default 1,
  first_at timestamptz not null default now(),
  primary key (user_id, item)
);
alter table public.dream_items enable row level security;
drop policy if exists "own select" on public.dream_items;
create policy "own select" on public.dream_items for select using (auth.uid() = user_id);
revoke insert, update, delete on public.dream_items from authenticated, anon;

alter table public.dream_nights add column if not exists item text;
alter table public.dream_nights add column if not exists item_kept boolean;

create or replace function public.dream_catalog()
returns jsonb language sql immutable as $$ select $j$[
  {"key":"pillow_sheep","tier":"c","name":"枕頭羊","emoji":"🐑","kind":"夢獸","line":"毛軟得像枕頭，數到牠的時候你就睡著了。"},
  {"key":"yawn_moon","tier":"c","name":"打呵欠的月亮","emoji":"🌙","kind":"小物","line":"一彎小月亮，常常比你先睡著。"},
  {"key":"star_candy","tier":"c","name":"星星糖罐","emoji":"🫙","kind":"小物","line":"每顆糖都是一顆掉下來的星星，酸酸甜甜。"},
  {"key":"fly_slipper","tier":"c","name":"會飛的拖鞋","emoji":"🩴","kind":"小物","line":"晚上偷偷飛出去散步，早上又回到床邊。"},
  {"key":"lost_plane","tier":"c","name":"迷路的紙飛機","emoji":"✈️","kind":"小物","line":"上面寫著一個沒寄出去的願望。"},
  {"key":"nightcap_cat","tier":"c","name":"睡帽小貓","emoji":"🐱","kind":"夢獸","line":"戴著尖尖的睡帽，一天睡 20 個小時。"},
  {"key":"bubble_fish","tier":"c","name":"泡泡魚","emoji":"🐟","kind":"夢獸","line":"在空氣裡游泳，吐出來的泡泡裡有小小的夢。"},
  {"key":"cotton_cloud","tier":"c","name":"棉花糖雲","emoji":"☁️","kind":"小物","line":"可以抱著睡覺，也可以偷咬一口。"},
  {"key":"firefly_lantern","tier":"c","name":"螢火蟲燈籠","emoji":"🏮","kind":"小物","line":"裡面住著三隻螢火蟲，怕黑的時候會亮。"},
  {"key":"glow_mushroom","tier":"c","name":"夜光蘑菇","emoji":"🍄","kind":"小物","line":"只在夢裡發光，醒來就變回普通蘑菇。"},
  {"key":"sleepless_owl","tier":"c","name":"失眠的貓頭鷹","emoji":"🦉","kind":"夢獸","line":"每天晚上都在數羊，數到天亮。"},
  {"key":"sheep_counter","tier":"c","name":"數羊計數器","emoji":"🔢","kind":"小物","line":"按一下跳一隻羊，最高紀錄是 7 隻。"},
  {"key":"dream_tapir","tier":"r","name":"夢貘","emoji":"🐘","kind":"夢獸","line":"專吃惡夢的小貘，吃飽了會打一個彩色的嗝。"},
  {"key":"stardust_fox","tier":"r","name":"星塵狐","emoji":"🦊","kind":"夢獸","line":"尾巴拖過的地方會留下一條銀河。"},
  {"key":"moon_jelly","tier":"r","name":"月光水母","emoji":"🪼","kind":"夢獸","line":"在夜空裡漂浮，碰到牠會想起很久以前的事。"},
  {"key":"watch_rabbit","tier":"r","name":"懷錶兔","emoji":"🐇","kind":"夢獸","line":"抱著一只停住的懷錶，在夢裡時間不會走。"},
  {"key":"cloud_whale","tier":"r","name":"雲朵鯨","emoji":"🐋","kind":"夢獸","line":"背上長著一片小森林，慢慢游過整片天空。"},
  {"key":"sand_hourglass","tier":"r","name":"沙人的沙漏","emoji":"⏳","kind":"小物","line":"裡面的沙子一倒過來，就會讓人想睡覺。"},
  {"key":"memory_box","tier":"r","name":"記憶音樂盒","emoji":"🎶","kind":"小物","line":"打開會播你最喜歡的那首歌，只有你聽得到。"},
  {"key":"dreamcatcher","tier":"r","name":"捕夢網","emoji":"🕸️","kind":"小物","line":"把壞夢攔下來，只讓好夢穿過去。"},
  {"key":"galaxy_deer","tier":"l","name":"銀河鹿","emoji":"🦌","kind":"夢獸","line":"鹿角上掛著星座，走過的地方會開出星星花。"},
  {"key":"mist_dragon","tier":"l","name":"夜霧龍","emoji":"🐉","kind":"夢獸","line":"由夜霧凝成的龍，守護所有還沒做完的夢。"},
  {"key":"moon_phoenix","tier":"l","name":"月光鳳凰","emoji":"🕊️","kind":"夢獸","line":"每個滿月重生一次，羽毛是月光織成的。"},
  {"key":"dream_key","tier":"l","name":"夢境之鑰","emoji":"🗝️","kind":"小物","line":"傳說可以打開任何一扇夢裡的門。"},
  {"key":"m01_lantern_cat","tier":"m","month":1,"name":"新年燈籠貓","emoji":"🐈","kind":"夢獸","line":"提著紅燈籠來拜年，尾巴上綁著福字。"},
  {"key":"m02_heart_bunny","tier":"m","month":2,"name":"愛心兔","emoji":"🐰","kind":"夢獸","line":"耳朵彎成一顆愛心，會偷偷幫你送情書。"},
  {"key":"m03_sakura_fawn","tier":"m","month":3,"name":"櫻花小鹿","emoji":"🦌","kind":"夢獸","line":"走過的地方會飄下櫻花雨。"},
  {"key":"m04_umbrella_snail","tier":"m","month":4,"name":"雨傘蝸牛","emoji":"🐌","kind":"夢獸","line":"殼是一把小雨傘，下雨天最開心。"},
  {"key":"m05_carnation_bird","tier":"m","month":5,"name":"康乃馨蜂鳥","emoji":"🐦","kind":"夢獸","line":"叼著一朵康乃馨，要送給最重要的人。"},
  {"key":"m06_firefly_frog","tier":"m","month":6,"name":"螢火蛙","emoji":"🐸","kind":"夢獸","line":"肚子會發光，夏夜池塘的小燈泡。"},
  {"key":"m07_star_turtle","tier":"m","month":7,"name":"星空海龜","emoji":"🐢","kind":"夢獸","line":"龜殼上是整片夏夜星空。"},
  {"key":"m08_jade_rabbit","tier":"m","month":8,"name":"中秋玉兔","emoji":"🐇","kind":"夢獸","line":"從月亮上下來借住一晚，帶了一顆月餅。"},
  {"key":"m09_rice_sparrow","tier":"m","month":9,"name":"稻穗麻雀","emoji":"🐤","kind":"夢獸","line":"秋收的時候最忙，嘴裡永遠叼著稻穗。"},
  {"key":"m10_pumpkin_bat","tier":"m","month":10,"name":"南瓜蝙蝠","emoji":"🦇","kind":"夢獸","line":"住在南瓜燈裡，其實很怕鬼。"},
  {"key":"m11_maple_fox","tier":"m","month":11,"name":"楓葉小狐","emoji":"🦊","kind":"夢獸","line":"尾巴是一片大楓葉，秋風一吹就會飄起來。"},
  {"key":"m12_snow_penguin","tier":"m","month":12,"name":"雪人企鵝","emoji":"🐧","kind":"夢獸","line":"戴著毛線帽和圍巾，在雪地裡滑來滑去。"}
]$j$::jsonb $$;
grant execute on function public.dream_catalog() to authenticated;

create or replace function public.dream_milestones()
returns jsonb language sql immutable as $$ select $j$[
  {"key":"n5","need":5,"name":"收集 5 種","reward":{"wish_rare":1,"stardust":100}},
  {"key":"n10","need":10,"name":"收集 10 種","reward":{"wish_limited":1}},
  {"key":"n15","need":15,"name":"收集 15 種","reward":{"ticket_special":1,"chest_gold":1}},
  {"key":"n20","need":20,"name":"收集 20 種","reward":{"wish_limited":2}},
  {"key":"n30","need":30,"name":"收集 30 種","reward":{"ticket_limited":1,"chest_star":1}},
  {"key":"set_c","set":"c","name":"普通全收","reward":{"stardust":300},"title":"dream_maker"},
  {"key":"set_r","set":"r","name":"稀有全收","reward":{"wish_limited":1},"frame":"frame_dream"},
  {"key":"set_all","set":"all","name":"全部收齊","reward":{"ticket_limited":2,"wish_limited":3},"title":"dream_lord"}
]$j$::jsonb $$;
grant execute on function public.dream_milestones() to authenticated;

-- 稱號
do $$ begin
  if to_regprocedure('public.title_catalog_dream()') is null then alter function public.title_catalog() rename to title_catalog_dream; end if;
end $$;
create or replace function public.title_catalog()
returns jsonb language sql immutable as $$
  select public.title_catalog_dream() || '[
    {"key":"dream_maker","name":"造夢師","emoji":"🌙","how":"夢境收藏：普通全部收齊"},
    {"key":"dream_lord","name":"夢境之主","emoji":"👑","how":"夢境收藏：全部收齊"}
  ]'::jsonb
$$;

-- 抽一個收藏
create or replace function public.dream_roll(u uuid, st integer, d date)
returns text language plpgsql volatile security definer set search_path to 'public' as $$
declare r double precision := random(); tier text; m integer := extract(month from d)::int; k text;
begin
  tier := case when r < 0.04 then 'm' when r < 0.10 then 'l' when r < 0.34 then 'r' else 'c' end;
  if st % 30 = 0 then tier := case when random() < 0.5 then 'm' else 'l' end;
  elsif st % 7 = 0 and tier = 'c' then tier := 'r'; end if;
  if tier = 'm' then
    select e->>'key' into k from jsonb_array_elements(public.dream_catalog()) e where e->>'tier' = 'm' and (e->>'month')::int = m;
  else
    select e->>'key' into k from jsonb_array_elements(public.dream_catalog()) e where e->>'tier' = tier order by random() limit 1;
  end if;
  return k;
end; $$;
revoke all on function public.dream_roll(uuid, integer, date) from public, anon, authenticated;

-- 放進收藏（重複的變碎片），回傳是不是新的
create or replace function public.dream_add(u uuid, k text, src text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare tier text := (select e->>'tier' from jsonb_array_elements(public.dream_catalog()) e where e->>'key' = k); fresh boolean;
begin
  insert into public.dream_items (user_id, item) values (u, k) on conflict (user_id, item) do update set n = public.dream_items.n + 1 returning (xmax = 0) into fresh;
  if not fresh then
    perform public.grant_item(u, 'dream_shard', case tier when 'c' then 1 when 'r' then 3 else 8 end, 'dream-dup:' || src);
  end if;
  return fresh;
end; $$;
revoke all on function public.dream_add(uuid, text, text) from public, anon, authenticated;

-- 里程碑（每個只發一次）
create or replace function public.dream_ms_check(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare x jsonb; ok boolean; cnt integer; got jsonb := '[]'::jsonb; k text; v integer;
begin
  select count(*) into cnt from public.dream_items where user_id = u;
  for x in select * from jsonb_array_elements(public.dream_milestones()) loop
    if x ? 'need' then ok := cnt >= (x->>'need')::int;
    else ok := not exists (select 1 from jsonb_array_elements(public.dream_catalog()) e
                where (x->>'set' = 'all' or e->>'tier' = x->>'set')
                  and not exists (select 1 from public.dream_items i where i.user_id = u and i.item = e->>'key'));
    end if;
    continue when not ok;
    continue when not public.grant_item(u, 'stardust', 1, 'dream-ms:' || (x->>'key'));
    for k, v in select key, value::int from jsonb_each_text(x->'reward') loop
      perform public.grant_item(u, k, v, 'dream-ms:' || (x->>'key') || ':' || k);
    end loop;
    if x ? 'title' then insert into public.user_titles (user_id, title) values (u, x->>'title') on conflict do nothing; end if;
    if x ? 'frame' then begin perform public.fun_frame_grant(u, x->>'frame'); exception when others then null; end; end if;
    got := got || x;
  end loop;
  return got;
end; $$;
revoke all on function public.dream_ms_check(uuid) from public, anon, authenticated;

-- 入夢：收藏＋星屑＋碎片
create or replace function public.dream_enter(p_door integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); t date := public.app_today(); n public.dream_nights%rowtype; st integer; rw jsonb; sh integer; sc jsonb; k text; it jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_door not in (1, 2, 3) then raise exception '沒有這扇門'; end if;
  if not public.dream_is_night() then raise exception '夢境只在晚上 8 點到早上 6 點開'; end if;
  select * into n from public.dream_nights where user_id = u and day = t;
  if n.entered_at is not null then raise exception '今晚已經做過夢了'; end if;
  if public.dream_moon_done(u, t) < 2 and n.slept_at is null then raise exception '先勾 2 個 🌙 晚上的項目，或按「我要去睡了」'; end if;
  st := coalesce((select d.streak from public.dream_nights d where d.user_id = u and d.day = t - 1 and d.entered_at is not null), 0) + 1;
  sc := public.dream_scenes()->(abs(hashtext(u::text || t)) % 6);
  k := public.dream_roll(u, st, (now() at time zone 'Asia/Taipei')::date);
  select e into it from jsonb_array_elements(public.dream_catalog()) e where e->>'key' = k;
  sh := case when st % 30 = 0 then 5 when st % 7 = 0 then 2 else 1 end;
  rw := jsonb_build_object('stardust', 20 + floor(random() * 31)::int, 'dream_shard', sh);
  insert into public.dream_nights (user_id, day, entered_at, scene, door, reward, streak, item)
    values (u, t, now(), sc->>'key', p_door, rw, st, k)
    on conflict (user_id, day) do update set entered_at = now(), scene = excluded.scene, door = excluded.door, reward = excluded.reward, streak = excluded.streak, item = excluded.item;
  return json_build_object('scene', sc, 'door', p_door, 'reward', rw, 'streak', st, 'item', it,
    'have', exists (select 1 from public.dream_items where user_id = u and item = k));
end; $$;
revoke all on function public.dream_enter(integer) from public, anon;
grant execute on function public.dream_enter(integer) to authenticated;

-- 早上帶出來：太晚醒，收藏有一半機率忘掉（變 1 片碎片）
create or replace function public.dream_claim_of(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  t date := public.app_today(); r record; v_half boolean; k text; v integer; got jsonb := '[]'::jsonb; kept boolean; fresh boolean;
  mins integer := (extract(hour from now() at time zone 'Asia/Taipei') * 60 + extract(minute from now() at time zone 'Asia/Taipei'))::int;
begin
  for r in select * from public.dream_nights where user_id = u and entered_at is not null and claimed_at is null and day < t order by day loop
    v_half := not (r.day = t - 1 and mins between 360 and 629);
    for k, v in select key, value::int from jsonb_each_text(r.reward) loop
      v := case when v_half and k <> 'dream_shard' then greatest(1, ceil(v / 2.0)::int) else v end;
      perform public.grant_item(u, k, v, 'dream:' || r.day || ':' || k);
    end loop;
    kept := null; fresh := null;
    if r.item is not null then
      kept := not v_half or random() < 0.5;
      if kept then fresh := public.dream_add(u, r.item, r.day::text);
      else perform public.grant_item(u, 'dream_shard', 1, 'dream-forgot:' || r.day); end if;
    end if;
    update public.dream_nights set claimed_at = now(), half = v_half, item_kept = kept where user_id = u and day = r.day;
    got := got || jsonb_build_object('day', r.day, 'scene', r.scene, 'reward', r.reward, 'half', v_half,
      'item', (select e from jsonb_array_elements(public.dream_catalog()) e where e->>'key' = r.item), 'kept', kept, 'new', fresh);
  end loop;
  return got;
end; $$;
revoke all on function public.dream_claim_of(uuid) from public, anon, authenticated;

-- 狀態多帶收藏
do $$ begin
  if to_regprocedure('public.dream_status_base()') is null then alter function public.dream_status() rename to dream_status_base; end if;
end $$;
revoke all on function public.dream_status_base() from public, anon, authenticated;
create or replace function public.dream_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); b jsonb; n public.dream_nights%rowtype;
begin
  b := public.dream_status_base()::jsonb;
  select * into n from public.dream_nights where user_id = u and day = public.app_today();
  return (b || jsonb_build_object(
    'tonight_item', case when n.item is not null then (select e from jsonb_array_elements(public.dream_catalog()) e where e->>'key' = n.item) end,
    'catalog', public.dream_catalog(), 'milestones', public.dream_milestones(),
    'items', coalesce((select jsonb_object_agg(di.item, di.n) from public.dream_items di where di.user_id = u), '{}'::jsonb),
    'ms_got', coalesce((select jsonb_agg(split_part(source_key, ':', 2)) from public.item_events where user_id = u and source_key like 'dream-ms:%' and item_key = 'stardust' and delta = 1), '[]'::jsonb),
    'ms_new', public.dream_ms_check(u),
    'month', extract(month from now() at time zone 'Asia/Taipei')::int))::json;
end; $$;
revoke all on function public.dream_status() from public, anon;
grant execute on function public.dream_status() to authenticated;

-- =========================================================
-- 序光計畫：🌳 人生之樹
-- 要先跑過「2026-11-05_月報.sql」「2026-11-05_生活打卡_徽章熱力圖.sql」。可以重複執行。
--
--   從你開始用網站的那個月開始，每個月長一層：
--     🔵 藍葉＝專注時數、🟢 綠葉＝生活打卡全勤＋簽到、🌿 樹枝粗細＝任務完成率
--     🌸 花＝跟好友互動（競技決鬥、一起專注）、🍎 果實＝打倒每週王＋重要徽章
--     🍂 落葉＝那個月比較低迷（不會死，只是留下痕跡）
-- =========================================================

create or replace function public.life_tree()
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); m0 date; m date; t date := public.app_today(); out jsonb := '[]'::jsonb; st jsonb; t0 timestamptz; t1 timestamptz;
begin
  if u is null then raise exception '尚未登入'; end if;
  select date_trunc('month', least(
      coalesce((select (to_jsonb(p)->>'created_at')::timestamptz from public.profiles p where p.id = u), now()),
      coalesce((select min(started_at) from public.focus_sessions where user_id = u), now())) at time zone 'Asia/Taipei')::date into m0;
  m := m0;
  while m <= t loop
    st := public.month_stats(u, m);
    t0 := (m::timestamp + interval '6 hours') at time zone 'Asia/Taipei';
    t1 := ((m + interval '1 month')::timestamp + interval '6 hours') at time zone 'Asia/Taipei';
    out := out || (st || jsonb_build_object(
      'month', m,
      'current', m = date_trunc('month', t)::date,
      'social', (select count(*) from public.arena_duels where user_id = u and day >= m and day < (m + interval '1 month')::date)
              + coalesce((select count(*) * 3 from public.coop_claims where user_id = u and at >= t0 and at < t1), 0),
      'fruits', coalesce((st->>'boss_kills')::int, 0)
              + (select count(*) from public.life_badges where user_id = u and got_at >= t0 and got_at < t1
                   and (badge ~ ':s(14|30|60|100|8|12|26|52)$' or badge ~ ':lv(10|20|30|50)$')),
      'fruit_list', coalesce((select jsonb_agg(badge order by got_at) from public.life_badges where user_id = u and got_at >= t0 and got_at < t1
                   and (badge ~ ':s(14|30|60|100|8|12|26|52)$' or badge ~ ':lv(10|20|30|50)$')), '[]'::jsonb)));
    m := (m + interval '1 month')::date;
  end loop;
  return json_build_object('start', m0, 'months', out);
end; $$;
revoke all on function public.life_tree() from public, anon;
grant execute on function public.life_tree() to authenticated;
