-- =========================================================
-- 序光計畫：🌱 生活打卡（專案的六個領域）
-- 要先跑過「2026-10-26_專案.sql」「2026-11-01_農場早上要先完成任務.sql」「2026-10-22_驚喜.sql」。可以重複執行。
--
--   領域：🛏️ 作息 sleep、🧴 清潔保養 care、💧 健康 health、🍱 飲食 food、🧹 生活 life、📅 每週 weekly
--   每個領域是一個「每日重複」專案（每週那個是一週一次），各自升級
--   ☀️ 開頭的項目在早上 9 點前勾：經驗 ×1.5
--   加成：
--     🛏️ 作息等級：早上免費進農場 15 分鐘 → 每 2 級 +1 分鐘，最多 30 分鐘
--     💧 健康全勤：農場水車多裝水（1 桶，每 5 級多 1 桶，最多 5 桶）
--     🍱 飲食等級：農場、末世做料理有機率做出「豪華」「奇蹟」品種（收進品種圖鑑）
--     🧴 清潔全勤：多 1 張刮刮樂；Lv10 起再送 1 枚扭蛋幣
--     🧹 生活等級：農場加工、飼料機每級快 1%，最多快 30%
--     📅 每週全勤：每週王這週每天多 1 次出擊
--     🌟 五個每日領域同一天全勤：開生活寶箱；一週 5 天全勤：限定星願瓶
-- =========================================================

alter table public.projects add column if not exists domain text;
do $$ begin
  alter table public.projects add constraint projects_domain_check
    check (domain is null or domain in ('sleep', 'care', 'health', 'food', 'life', 'weekly'));
exception when duplicate_object then null; end $$;

create table if not exists public.life_dish_var (
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null,
  dish text not null,
  tier text not null,
  n integer not null default 0,
  first_at timestamptz not null default now(),
  primary key (user_id, game, dish, tier)
);
alter table public.life_dish_var enable row level security;
drop policy if exists "own select" on public.life_dish_var;
create policy "own select" on public.life_dish_var for select using (auth.uid() = user_id);
revoke insert, update, delete on public.life_dish_var from authenticated, anon;

-- ---------- 小工具 ----------
create or replace function public.life_week(d date)
returns date language sql immutable as $$ select d - (extract(isodow from d)::int - 1) $$;

create or replace function public.life_level(u uuid, dom text)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce(max(level), 0) from public.projects where user_id = u and domain = dom and status = 'active'
$$;

-- 那天（每週領域看那一週）這個領域是不是全部勾完
create or replace function public.life_clear(u uuid, dom text, d date)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(bool_and(ok), false) from (
    select pr.id, count(ps.id) > 0 and bool_and(coalesce(l.done, false)) ok
      from public.projects pr
      join public.project_steps ps on ps.project_id = pr.id
        and ((ps.created_at at time zone 'Asia/Taipei') - interval '3 hours')::date <= case when dom = 'weekly' then public.life_week(d) + 6 else d end
      left join public.project_step_logs l on l.step_id = ps.id and l.day = case when dom = 'weekly' then public.life_week(d) else d end
     where pr.user_id = u and pr.domain = dom and pr.status = 'active'
     group by pr.id) x
$$;

create or replace function public.life_all_clear(u uuid, d date)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.life_clear(u, 'sleep', d) and public.life_clear(u, 'care', d) and public.life_clear(u, 'health', d)
     and public.life_clear(u, 'food', d) and public.life_clear(u, 'life', d)
$$;

revoke all on function public.life_level(uuid, text) from public, anon, authenticated;
revoke all on function public.life_clear(uuid, text, date) from public, anon, authenticated;
revoke all on function public.life_all_clear(uuid, date) from public, anon, authenticated;

-- ---------- 全勤獎勵（今天、昨天都檢查，補打卡也算；每項只發一次） ----------
create or replace function public.life_check(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  t date := public.app_today(); d date; got jsonb := '[]'::jsonb; r double precision; k text; q integer; n integer;
begin
  foreach d in array array[t - 1, t] loop
    -- 🧴 清潔全勤：刮刮樂（Lv10 起再送扭蛋幣）
    if public.life_clear(u, 'care', d) and public.grant_item(u, 'scratch_card', 1, 'life-care:' || d) then
      got := got || jsonb_build_object('why', '🧴 清潔保養全勤', 'text', '刮刮樂 ×1');
      if public.life_level(u, 'care') >= 10 and public.grant_item(u, 'gacha_coin', 1, 'life-care-coin:' || d) then
        got := got || jsonb_build_object('why', '🧴 清潔保養 Lv10', 'text', '扭蛋幣 ×1');
      end if;
    end if;
    -- 🌟 五領域全勤：生活寶箱
    if public.life_all_clear(u, d) and public.grant_item(u, 'stardust', 50, 'life-all:' || d) then
      r := random();
      if r < 0.03 then k := 'wish_limited'; q := 1;
      elsif r < 0.13 then k := 'chest_star'; q := 1;
      elsif r < 0.33 then k := 'chest_gold'; q := 1;
      elsif r < 0.53 then k := 'wish_rare'; q := 1;
      elsif r < 0.75 then k := 'ticket_normal'; q := 1;
      else k := 'farmpass10'; q := 2; end if;
      perform public.grant_item(u, k, q, 'life-all-box:' || d);
      got := got || jsonb_build_object('why', '🌟 五個領域全勤', 'text', '生活寶箱：星屑 ×50＋' || k || ' ×' || q, 'item', k, 'qty', q, 'box', true);
    end if;
  end loop;
  -- 一週 5 天五領域全勤：限定星願瓶（這週、上週）
  foreach d in array array[public.life_week(t) - 7, public.life_week(t)] loop
    select count(*) into n from generate_series(d, least(d + 6, t), interval '1 day') x where public.life_all_clear(u, x::date);
    if n >= 5 and public.grant_item(u, 'wish_limited', 1, 'life-week5:' || d) then
      got := got || jsonb_build_object('why', '🏆 一週 5 天全勤', 'text', '限定星願瓶 ×1');
    end if;
  end loop;
  return got;
end; $$;
revoke all on function public.life_check(uuid) from public, anon, authenticated;

-- ---------- 🍱 料理品種：豪華、奇蹟 ----------
create or replace function public.life_dish_tier(u uuid)
returns text language plpgsql volatile security definer set search_path to 'public' as $$
declare lv integer := public.life_level(u, 'food'); r double precision := random();
begin
  if lv <= 0 then return null; end if;
  if r < least(0.05, 0.01 + 0.001 * lv) then return 'mir'; end if;
  if r < least(0.25, 0.06 + 0.005 * lv) then return 'lux'; end if;
  return null;
end; $$;
revoke all on function public.life_dish_tier(uuid) from public, anon, authenticated;

create or replace function public.life_dish_add(u uuid, p_game text, p_dish text, p_tier text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare fresh boolean;
begin
  insert into public.life_dish_var (user_id, game, dish, tier, n) values (u, p_game, p_dish, p_tier, 1)
    on conflict (user_id, game, dish, tier) do update set n = public.life_dish_var.n + 1
    returning (xmax = 0) into fresh;
  -- 第一次做出這個品種：星屑（奇蹟更多）
  if fresh then perform public.grant_item(u, 'stardust', case p_tier when 'mir' then 100 else 20 end, 'life-var:' || p_game || ':' || p_dish || ':' || p_tier); end if;
  return fresh;
end; $$;
revoke all on function public.life_dish_add(uuid, text, text, text) from public, anon, authenticated;

-- 農場做好一道菜就呼叫一次（網頁端）
create or replace function public.life_dish_roll(p_game text, p_dish text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); tier text;
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_game not in ('farm', 'doom') or length(p_dish) > 60 then raise exception '不認識的料理'; end if;
  tier := public.life_dish_tier(u);
  if tier is null then return json_build_object('tier', null); end if;
  return json_build_object('tier', tier, 'dish', p_dish, 'first', public.life_dish_add(u, p_game, p_dish, tier));
end; $$;
revoke all on function public.life_dish_roll(text, text) from public, anon;
grant execute on function public.life_dish_roll(text, text) to authenticated;

-- 末世做料理：做幾份就擲幾次
do $$ begin
  if to_regprocedure('public.doom_farm_cook_life(text, integer)') is null then
    alter function public.doom_farm_cook(text, integer) rename to doom_farm_cook_life;
  end if;
end $$;
revoke all on function public.doom_farm_cook_life(text, integer) from public, anon, authenticated;
create or replace function public.doom_farm_cook(p_out text, p_n integer default 1)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); res jsonb; i integer; tier text; vars jsonb := '[]'::jsonb;
begin
  res := public.doom_farm_cook_life(p_out, p_n)::jsonb;
  for i in 1..least(greatest(coalesce(p_n, 1), 1), 50) loop
    tier := public.life_dish_tier(u);
    if tier is not null then
      vars := vars || jsonb_build_object('tier', tier, 'first', public.life_dish_add(u, 'doom', p_out, tier));
    end if;
  end loop;
  if jsonb_typeof(res) = 'object' then res := res || jsonb_build_object('variants', vars); end if;
  return res::json;
end; $$;
revoke all on function public.doom_farm_cook(text, integer) from public, anon;
grant execute on function public.doom_farm_cook(text, integer) to authenticated;

-- ---------- 📅 每週全勤：每週王每天多 1 次出擊 ----------
do $$ begin
  if to_regprocedure('public.rpg_boss_attacks_today_life(uuid)') is null then
    alter function public.rpg_boss_attacks_today(uuid) rename to rpg_boss_attacks_today_life;
  end if;
end $$;
revoke all on function public.rpg_boss_attacks_today_life(uuid) from public, anon, authenticated;
create or replace function public.rpg_boss_attacks_today(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare b jsonb := public.rpg_boss_attacks_today_life(p_user); w boolean := public.life_clear(p_user, 'weekly', public.app_today());
begin
  return b || jsonb_build_object('life_week', w, 'total', (b->>'total')::int + w::int);
end; $$;
revoke all on function public.rpg_boss_attacks_today(uuid) from public, anon, authenticated;

-- ---------- 🛏️ 作息等級：早上免費進農場變長 ----------
create or replace function public.farm_enter(p_kind text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare res jsonb; extra integer; until timestamptz;
begin
  if public.farm_task_today(auth.uid()) < 1 then
    raise exception '先完成今天的 1 個任務，才能進農場';
  end if;
  res := public.farm_enter_base(p_kind)::jsonb;
  if p_kind = 'morning' then
    extra := least(15, public.life_level(auth.uid(), 'sleep') / 2);
    if extra > 0 then
      update public.farm_entries set expires_at = expires_at + make_interval(mins => extra), minutes = minutes + extra
        where user_id = auth.uid() and entry_day = public.app_today() and kind = 'morning'
        returning expires_at into until;
      res := res || jsonb_build_object('minutes', (res->>'minutes')::int + extra, 'active_until', until, 'sleep_bonus', extra);
    end if;
  end if;
  return res::json;
end; $$;
revoke all on function public.farm_enter(text) from public, anon;
grant execute on function public.farm_enter(text) to authenticated;

-- ---------- 打勾：每週領域用「這週」、☀️ 早上 9 點前 ×1.5、全勤獎勵 ----------
do $$ begin
  if to_regprocedure('public.project_step_toggle_life(uuid)') is null then
    alter function public.project_step_toggle(uuid) rename to project_step_toggle_life;
  end if;
end $$;
revoke all on function public.project_step_toggle_life(uuid) from public, anon, authenticated;

create or replace function public.project_step_toggle(p_step uuid)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); s public.project_steps%rowtype; pr public.projects%rowtype; lg public.project_step_logs%rowtype;
  wk date; res jsonb; total integer; done_n integer; ups jsonb; dust integer; bonus integer; hr integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into s from public.project_steps where id = p_step and user_id = u;
  if not found then raise exception '找不到這個步驟'; end if;
  select * into pr from public.projects where id = s.project_id;

  if pr.domain = 'weekly' and pr.kind = 'daily' and pr.status = 'active' then
    wk := public.life_week(public.app_today());
    select * into lg from public.project_step_logs where step_id = p_step and day = wk;
    if found then
      update public.project_step_logs set done = not lg.done where step_id = p_step and day = wk;
      res := jsonb_build_object('done', not lg.done, 'xp', 0, 'repeat', not lg.done);
    else
      insert into public.project_step_logs (step_id, project_id, user_id, day) values (p_step, pr.id, u, wk);
      res := public.project_award_step(u, pr.id);
      res := res || public.project_step_dust(u, p_step, wk, res->>'crit');
      select count(*), count(*) filter (where l.done) into total, done_n
        from public.project_steps ps left join public.project_step_logs l on l.step_id = ps.id and l.day = wk
        where ps.project_id = pr.id;
      dust := 40 + 10 * total;
      if total > 0 and done_n = total and public.grant_item(u, 'stardust', dust, 'proj-day:' || pr.id || ':' || wk) then
        ups := public.project_add_xp(u, pr.id, 60);
        res := res || jsonb_build_object('dayClear', jsonb_build_object('xp', 60, 'stardust', dust), 'levelUps', (res->'levelUps') || ups);
      end if;
    end if;
  else
    res := public.project_step_toggle_life(p_step)::jsonb;
  end if;

  -- ☀️ 早上 9 點前打勾：多 50% 經驗
  hr := extract(hour from now() at time zone 'Asia/Taipei')::int;
  if pr.domain is not null and coalesce((res->>'done')::boolean, false) and coalesce((res->>'xp')::int, 0) > 0
     and s.title like '☀️%' and hr between 3 and 8 then
    bonus := ceil((res->>'xp')::int * 0.5);
    ups := public.project_add_xp(u, pr.id, bonus);
    res := res || jsonb_build_object('morning', bonus, 'levelUps', coalesce(res->'levelUps', '[]'::jsonb) || ups);
  end if;

  if pr.domain is not null then res := res || jsonb_build_object('life', public.life_check(u)); end if;
  return res::json;
end; $$;
revoke all on function public.project_step_toggle(uuid) from public, anon;
grant execute on function public.project_step_toggle(uuid) to authenticated;

-- 補昨天的打卡之後也檢查全勤
do $$ begin
  if to_regprocedure('public.project_step_makeup_life(uuid)') is null then
    alter function public.project_step_makeup(uuid) rename to project_step_makeup_life;
  end if;
end $$;
revoke all on function public.project_step_makeup_life(uuid) from public, anon, authenticated;
create or replace function public.project_step_makeup(p_step uuid)
returns json language plpgsql security definer set search_path to 'public' as $$
declare res jsonb;
begin
  if exists (select 1 from public.project_steps s join public.projects p on p.id = s.project_id where s.id = p_step and p.domain = 'weekly') then
    raise exception '每週的項目這週內勾就好，不用補';
  end if;
  res := public.project_step_makeup_life(p_step)::jsonb;
  return (res || jsonb_build_object('life', public.life_check(auth.uid())))::json;
end; $$;
revoke all on function public.project_step_makeup(uuid) from public, anon;
grant execute on function public.project_step_makeup(uuid) to authenticated;

-- ---------- 狀態（專案頁、農場讀） ----------
create or replace function public.life_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); doms text[] := array['sleep', 'care', 'health', 'food', 'life', 'weekly']; d text; info jsonb := '{}'::jsonb; lv integer; wk integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  foreach d in array doms loop
    lv := public.life_level(u, d);
    info := info || jsonb_build_object(d, jsonb_build_object('level', lv, 'has', exists (select 1 from public.projects where user_id = u and domain = d and status = 'active'),
      'clear', public.life_clear(u, d, t)));
  end loop;
  select count(*) into wk from generate_series(public.life_week(t), t, interval '1 day') x where public.life_all_clear(u, x::date);
  return json_build_object(
    'today', t, 'domains', info, 'all_clear', public.life_all_clear(u, t), 'week_all', wk,
    'perks', jsonb_build_object(
      'morning_minutes', 15 + least(15, public.life_level(u, 'sleep') / 2),
      'water_buckets', case when public.life_clear(u, 'health', t) then least(5, 1 + public.life_level(u, 'health') / 5) else 0 end,
      'water_max', least(5, 1 + public.life_level(u, 'health') / 5),
      'lux', case when public.life_level(u, 'food') > 0 then round(least(0.25, 0.06 + 0.005 * public.life_level(u, 'food')) * 100 - least(0.05, 0.01 + 0.001 * public.life_level(u, 'food')) * 100, 1) else 0 end,
      'mir', case when public.life_level(u, 'food') > 0 then round(least(0.05, 0.01 + 0.001 * public.life_level(u, 'food')) * 100, 1) else 0 end,
      'speed', least(30, public.life_level(u, 'life')),
      'boss_extra', public.life_clear(u, 'weekly', t)),
    'vars', coalesce((select jsonb_agg(jsonb_build_object('game', game, 'dish', dish, 'tier', tier, 'n', n) order by first_at) from public.life_dish_var where user_id = u), '[]'::jsonb),
    'rewards', public.life_check(u));
end; $$;
revoke all on function public.life_status() from public, anon;
grant execute on function public.life_status() to authenticated;

-- ---------- 一鍵建立六個領域（已經有的領域不會重複建） ----------
create or replace function public.life_seed()
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); d jsonb; pid uuid; i integer; made integer := 0;
  plan jsonb := $j$[
    {"domain":"sleep","title":"🛏️ 作息","goal":"早睡早起、準時出門","steps":["☀️ 準時起床","☀️ 整理床鋪","☀️ 拉開窗簾曬光","☀️ 9:55 出門","🌙 整理隔天衣物、包包、保養品","🌙 準時就寢"]},
    {"domain":"care","title":"🧴 清潔保養","goal":"每天早晚照顧自己","steps":["☀️ 刷牙","☀️ 洗臉","☀️ 防曬","🌙 刷牙","🌙 保濕","🌙 貼疤痕貼"]},
    {"domain":"health","title":"💧 健康","goal":"喝水、運動、保健品","steps":["☀️ 起床一杯水","🍱 中午補水","🌙 晚上補水","🏃 運動（輕度也算）","💊 鐵","💊 維生素 C","💊 維生素 D","💊 蔓越莓"]},
    {"domain":"food","title":"🍱 飲食","goal":"好好吃兩餐","steps":["🍱 午餐（蛋白質＋蔬菜＋主食）","🌙 晚餐（蛋白質＋蔬菜＋主食）"]},
    {"domain":"life","title":"🧹 生活","goal":"環境整齊、事情有安排","steps":["☀️ 整理書桌","☀️ 確認今天的待辦","🌙 整理房間","🌙 整理衣物（有需要就洗）"]},
    {"domain":"weekly","title":"📅 每週生活","goal":"每週一次，這週內勾完就好","steps":["整理生活環境","規劃下週行程","回顧這週"]}
  ]$j$::jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  for d in select * from jsonb_array_elements(plan) loop
    continue when exists (select 1 from public.projects where user_id = u and domain = d->>'domain' and status = 'active');
    insert into public.projects (user_id, title, done_def, kind, category, domain, sort)
      values (u, d->>'title', d->>'goal', 'daily', '生活打卡', d->>'domain', made) returning id into pid;
    for i in 0..jsonb_array_length(d->'steps') - 1 loop
      insert into public.project_steps (project_id, user_id, title, sort) values (pid, u, d->'steps'->>i, i);
    end loop;
    made := made + 1;
  end loop;
  return json_build_object('made', made);
end; $$;
revoke all on function public.life_seed() from public, anon;
grant execute on function public.life_seed() to authenticated;

-- ---------- 🎰 領域升級抽獎（生活打卡的專案每升一級抽一次） ----------
--   普通 52%：星屑 50＋10×等級／農場入場卷 ×3／扭蛋幣 ×2／刮刮樂 ×2
--   稀有 30%：特殊召喚券／稀有星願瓶 ×2／金寶箱
--   史詩 13%：星光寶箱／限定召喚券／限定星願瓶
--   傳說  5%（每級 +0.2%，最多 10%）：限定召喚券＋限定星願瓶 ×2＋星屑 300
--   保底：每 5 級至少稀有、每 10 級至少史詩、每 25 級必定傳說
create or replace function public.life_lv_draw(u uuid, p_project uuid, lv integer)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r double precision := random(); tier text; pick jsonb; k text; v integer; src text := 'life-lv:' || p_project || ':' || lv;
  pool jsonb := $j${
    "c":[{"stardust":0},{"farmpass10":3},{"gacha_coin":2},{"scratch_card":2}],
    "r":[{"ticket_special":1},{"wish_rare":2},{"chest_gold":1}],
    "e":[{"chest_star":1},{"ticket_limited":1},{"wish_limited":1}],
    "l":[{"ticket_limited":1,"wish_limited":2,"stardust":300}]}$j$::jsonb;
  leg double precision := least(0.10, 0.05 + 0.002 * lv);
begin
  tier := case when r < leg then 'l' when r < leg + 0.13 then 'e' when r < leg + 0.43 then 'r' else 'c' end;
  if lv % 25 = 0 then tier := 'l';
  elsif lv % 10 = 0 and tier in ('c', 'r') then tier := 'e';
  elsif lv % 5 = 0 and tier = 'c' then tier := 'r'; end if;
  pick := pool->tier->(floor(random() * jsonb_array_length(pool->tier))::int);
  if pick ? 'stardust' and tier = 'c' then pick := jsonb_build_object('stardust', 50 + 10 * lv); end if;
  for k, v in select key, value::int from jsonb_each_text(pick) loop
    perform public.grant_item(u, k, v, src || ':' || k);
  end loop;
  return jsonb_build_object('tier', tier, 'items', pick);
end; $$;
revoke all on function public.life_lv_draw(uuid, uuid, integer) from public, anon, authenticated;

do $$ begin
  if to_regprocedure('public.project_add_xp_life(uuid, uuid, integer)') is null then
    alter function public.project_add_xp(uuid, uuid, integer) rename to project_add_xp_life;
  end if;
end $$;
revoke all on function public.project_add_xp_life(uuid, uuid, integer) from public, anon, authenticated;
create or replace function public.project_add_xp(p_user uuid, p_project uuid, p_xp integer)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare ups jsonb := public.project_add_xp_life(p_user, p_project, p_xp); out jsonb := '[]'::jsonb; x jsonb;
begin
  if jsonb_array_length(ups) = 0 or not exists (select 1 from public.projects where id = p_project and domain is not null) then return ups; end if;
  for x in select * from jsonb_array_elements(ups) loop
    out := out || (x || jsonb_build_object('draw', public.life_lv_draw(p_user, p_project, (x->>'level')::int),
                                           'domain', (select title from public.projects where id = p_project)));
  end loop;
  return out;
end; $$;
revoke all on function public.project_add_xp(uuid, uuid, integer) from public, anon, authenticated;
