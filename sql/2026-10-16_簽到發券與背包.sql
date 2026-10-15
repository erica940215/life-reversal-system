-- =========================================================
-- 序光計畫：🎫 簽到發券 ＋ 🎒 背包
-- 可以重複執行
--
-- 物品代號：
--   ticket_normal / ticket_special / ticket_limited   召喚券（冒險線）
--   wish_normal   / wish_rare      / wish_limited     星願瓶（生活線）
-- =========================================================


-- ---------- 🎒 背包：每種物品有幾個 ----------
create table if not exists public.player_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  qty integer not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

-- ---------- 🧾 物品帳本：每一筆進出都有來源，同一個來源同一種物品只會發一次 ----------
create table if not exists public.item_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  delta integer not null,
  source_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, source_key, item_key)
);

-- 門鎖：只能看自己的，增減一定要透過資料庫函式
alter table public.player_items enable row level security;
alter table public.item_events enable row level security;
drop policy if exists "own select" on public.player_items;
drop policy if exists "own select" on public.item_events;
create policy "own select" on public.player_items for select using (auth.uid() = user_id);
create policy "own select" on public.item_events for select using (auth.uid() = user_id);
revoke insert, update, delete on public.player_items from authenticated;
revoke insert, update, delete on public.item_events from authenticated;
grant select on public.player_items to authenticated;
grant select on public.item_events to authenticated;


-- ---------- 發物品（同一個來源只會發一次），網頁不能直接呼叫 ----------
create or replace function public.grant_item(p_user uuid, p_item text, p_qty integer, p_source text)
returns boolean language plpgsql security definer set search_path to 'public'
as $function$
begin
  if p_qty <= 0 then return false; end if;

  insert into public.item_events (user_id, item_key, delta, source_key)
  values (p_user, p_item, p_qty, p_source)
  on conflict (user_id, source_key, item_key) do nothing;

  if not found then return false; end if;

  insert into public.player_items (user_id, item_key, qty)
  values (p_user, p_item, p_qty)
  on conflict (user_id, item_key) do update
    set qty = public.player_items.qty + excluded.qty, updated_at = now();

  return true;
end;
$function$;

revoke all on function public.grant_item(uuid, text, integer, text) from public, anon, authenticated;


-- ---------- 🎫 簽到發券 ----------
-- 新手保護期（前 7 次簽到，不含補簽）：第 2、4、6 次各發普通，第 7 次發特殊／稀有
-- 之後：連續每滿 3 天發普通，連續每滿 7 天發特殊／稀有（第 21 天兩種都發）
-- 每次都同時發兩條線：召喚券 ＋ 星願瓶
create or replace function public.checkin_ticket_rewards(p_user uuid, p_date date, p_streak integer)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_index integer;
  v_normal boolean := false;
  v_special boolean := false;
  v_items jsonb := '[]'::jsonb;
  v_source text := 'checkin:' || p_date;
begin
  select count(*) into v_index from public.checkins
    where user_id = p_user and not is_makeup and checkin_date <= p_date;

  if v_index <= 7 then
    v_normal := v_index in (2, 4, 6);
    v_special := v_index = 7;
  else
    v_normal := p_streak % 3 = 0;
    v_special := p_streak % 7 = 0;
  end if;

  if v_normal then
    if public.grant_item(p_user, 'ticket_normal', 1, v_source) then
      v_items := v_items || jsonb_build_object('key', 'ticket_normal', 'qty', 1);
    end if;
    if public.grant_item(p_user, 'wish_normal', 1, v_source) then
      v_items := v_items || jsonb_build_object('key', 'wish_normal', 'qty', 1);
    end if;
  end if;

  if v_special then
    if public.grant_item(p_user, 'ticket_special', 1, v_source) then
      v_items := v_items || jsonb_build_object('key', 'ticket_special', 'qty', 1);
    end if;
    if public.grant_item(p_user, 'wish_rare', 1, v_source) then
      v_items := v_items || jsonb_build_object('key', 'wish_rare', 'qty', 1);
    end if;
  end if;

  return v_items;
end;
$function$;

revoke all on function public.checkin_ticket_rewards(uuid, date, integer) from public, anon, authenticated;


-- ---------- 📅 每月簽到獎勵（當月累計，不用連續） ----------
-- 累計 7 天：+20 EXP / +50 金幣 ＋ 限定召喚券 1 ＋ 限定星願瓶 1
-- 當月全勤（含補簽）：+100 EXP / +300 金幣 ＋ 限定召喚券 2 ＋ 限定星願瓶 2
create or replace function public.checkin_month_bonus(p_user uuid, p_date date)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_start date := date_trunc('month', p_date)::date;
  v_days integer := extract(day from (date_trunc('month', p_date) + interval '1 month - 1 day'))::integer;
  v_month text := to_char(date_trunc('month', p_date), 'YYYY-MM');
  v_today date := public.app_today();
  v_count integer;
  v_got7 boolean := false;
  v_got_all boolean := false;
  v_exp integer := 0;
  v_gold integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  select count(*) into v_count from public.checkins
    where user_id = p_user and checkin_date >= v_start and checkin_date < v_start + v_days;

  if v_count >= 7 and not exists (
    select 1 from public.reward_events where user_id = p_user and source_key = 'checkin-m7:' || v_month
  ) then
    perform public.set_reward(p_user, 'checkin-m7:' || v_month, v_today, 20, 50);
    v_got7 := true;
    v_exp := v_exp + 20;
    v_gold := v_gold + 50;
  end if;

  if v_count >= 7 then
    if public.grant_item(p_user, 'ticket_limited', 1, 'checkin-m7:' || v_month) then
      v_items := v_items || jsonb_build_object('key', 'ticket_limited', 'qty', 1);
    end if;
    if public.grant_item(p_user, 'wish_limited', 1, 'checkin-m7:' || v_month) then
      v_items := v_items || jsonb_build_object('key', 'wish_limited', 'qty', 1);
    end if;
  end if;

  if v_count >= v_days and not exists (
    select 1 from public.reward_events where user_id = p_user and source_key = 'checkin-mall:' || v_month
  ) then
    perform public.set_reward(p_user, 'checkin-mall:' || v_month, v_today, 100, 300);
    v_got_all := true;
    v_exp := v_exp + 100;
    v_gold := v_gold + 300;
  end if;

  if v_count >= v_days then
    if public.grant_item(p_user, 'ticket_limited', 2, 'checkin-mall:' || v_month) then
      v_items := v_items || jsonb_build_object('key', 'ticket_limited', 'qty', 2);
    end if;
    if public.grant_item(p_user, 'wish_limited', 2, 'checkin-mall:' || v_month) then
      v_items := v_items || jsonb_build_object('key', 'wish_limited', 'qty', 2);
    end if;
  end if;

  return json_build_object('month_count', v_count, 'month_days', v_days,
    'bonus7', v_got7, 'bonus_all', v_got_all, 'bonus_exp', v_exp, 'bonus_gold', v_gold,
    'items', v_items);
end;
$function$;

revoke all on function public.checkin_month_bonus(uuid, date) from public, anon, authenticated;


-- ---------- 📅 每日簽到（加上發券） ----------
create or replace function public.daily_checkin()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_row public.checkins%rowtype;
  v_prev integer;
  v_streak integer;
  v_chance integer;
  v_crit boolean;
  v_exp integer;
  v_gold integer;
  v_reward json;
  v_month json;
  v_items jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  -- 鎖住玩家資料，連按兩次也只會簽到一次
  perform 1 from public.profiles where id = v_user for update;

  select * into v_row from public.checkins where user_id = v_user and checkin_date = v_today;
  if found then
    return json_build_object('already', true, 'checkin_date', v_row.checkin_date,
      'streak', v_row.streak, 'crit', v_row.crit, 'crit_chance', v_row.crit_chance,
      'exp', v_row.exp, 'gold', v_row.gold, 'items', '[]'::jsonb, 'delta_exp', 0, 'delta_gold', 0);
  end if;

  select streak into v_prev from public.checkins
    where user_id = v_user and checkin_date = v_today - 1;

  v_streak := coalesce(v_prev, 0) + 1;
  v_chance := public.checkin_crit_chance(v_streak);
  v_crit := random() * 100 < v_chance;
  v_exp := 5;
  v_gold := 10 + least(v_streak - 1, 10);
  if v_crit then
    v_exp := v_exp * 2;
    v_gold := v_gold * 2;
  end if;

  insert into public.checkins (user_id, checkin_date, streak, crit, crit_chance, exp, gold)
  values (v_user, v_today, v_streak, v_crit, v_chance, v_exp, v_gold);

  v_reward := public.set_reward(v_user, 'checkin:' || v_today, v_today, v_exp, v_gold);
  v_items := public.checkin_ticket_rewards(v_user, v_today, v_streak);
  v_month := public.checkin_month_bonus(v_user, v_today);
  v_items := v_items || coalesce((v_month->'items')::jsonb, '[]'::jsonb);

  return json_build_object('already', false, 'checkin_date', v_today,
    'streak', v_streak, 'crit', v_crit, 'crit_chance', v_chance,
    'exp', v_exp, 'gold', v_gold,
    'month_count', (v_month->>'month_count')::int, 'month_days', (v_month->>'month_days')::int,
    'bonus7', (v_month->>'bonus7')::boolean, 'bonus_all', (v_month->>'bonus_all')::boolean,
    'items', v_items,
    'delta_exp', (v_reward->>'delta_exp')::int + (v_month->>'bonus_exp')::int,
    'delta_gold', (v_reward->>'delta_gold')::int + (v_month->>'bonus_gold')::int);
end;
$function$;


-- ---------- 💰 補簽（不發簽到券；每月獎勵的限定券照常） ----------
create or replace function public.makeup_checkin(p_date date)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_start date := date_trunc('month', public.app_today())::date;
  v_gold integer;
  v_used integer;
  v_cost integer;
  v_prev integer;
  v_streak integer;
  v_day date;
  v_month json;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_date is null or p_date >= v_today then raise exception '只能補簽今天以前的日子'; end if;
  if p_date < v_start then raise exception '只能補簽這個月的日子'; end if;

  select gold into v_gold from public.profiles where id = v_user for update;
  if not found then raise exception '找不到玩家資料'; end if;

  if exists (select 1 from public.checkins where user_id = v_user and checkin_date = p_date) then
    raise exception '這天已經簽到過了';
  end if;

  select count(*) into v_used from public.checkins
    where user_id = v_user and is_makeup and checkin_date >= v_start;

  v_cost := 30 + 20 * v_used;

  if coalesce(v_gold, 0) < v_cost then
    raise exception '金幣不夠：補簽要 % 金幣，你現在有 % 金幣', v_cost, coalesce(v_gold, 0);
  end if;

  update public.profiles set gold = gold - v_cost, updated_at = now() where id = v_user;

  select streak into v_prev from public.checkins
    where user_id = v_user and checkin_date = p_date - 1;

  v_streak := coalesce(v_prev, 0) + 1;

  insert into public.checkins (user_id, checkin_date, streak, crit, crit_chance, exp, gold, is_makeup, cost)
  values (v_user, p_date, v_streak, false, 0, 0, 0, true, v_cost);

  -- 接回後面的連續天數（補了中間斷掉的那天，後面每天都 +）
  v_day := p_date + 1;
  loop
    update public.checkins set streak = v_streak + 1
      where user_id = v_user and checkin_date = v_day;
    exit when not found;
    v_streak := v_streak + 1;
    v_day := v_day + 1;
  end loop;

  v_month := public.checkin_month_bonus(v_user, p_date);

  return json_build_object('checkin_date', p_date, 'cost', v_cost, 'next_cost', v_cost + 20,
    'gold_left', coalesce(v_gold, 0) - v_cost,
    'month_count', (v_month->>'month_count')::int, 'month_days', (v_month->>'month_days')::int,
    'bonus7', (v_month->>'bonus7')::boolean, 'bonus_all', (v_month->>'bonus_all')::boolean,
    'items', coalesce((v_month->'items')::jsonb, '[]'::jsonb),
    'delta_exp', (v_month->>'bonus_exp')::int, 'delta_gold', (v_month->>'bonus_gold')::int - v_cost);
end;
$function$;

revoke all on function public.daily_checkin() from public, anon;
revoke all on function public.makeup_checkin(date) from public, anon;
grant execute on function public.daily_checkin() to authenticated;
grant execute on function public.makeup_checkin(date) to authenticated;


-- ---------- 讓網站馬上看到新的表 ----------
notify pgrst, 'reload schema';


-- ---------- ✅ 檢查結果 ----------
select coalesce(string_agg(missing, '、'), '✅ 簽到發券＋背包 設定完成') as 檢查結果
from (
  select '缺少表 ' || t as missing
  from unnest(array['player_items', 'item_events']) t
  where to_regclass('public.' || t) is null
  union all
  select '缺少函式 ' || f
  from unnest(array['grant_item', 'checkin_ticket_rewards']) f
  where not exists (select 1 from pg_proc where proname = f and pronamespace = 'public'::regnamespace)
) x;
