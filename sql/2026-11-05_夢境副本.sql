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
