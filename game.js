-- =========================================================
-- 序光計畫：🕑 凌晨 2 點換日 ＋ 📅 每月簽到獎勵 ＋ 💰 補簽 ＋ 🪞 每日反省
-- 整段貼到 Supabase 的 SQL Editor 按 Run，可以重複執行。
-- 已經包含「遊戲_每日簽到.sql」的內容，之前沒執行過也沒關係。
-- =========================================================


-- ---------- 🕑 一天從凌晨 2 點開始（凌晨 0:00–1:59 還算前一天） ----------
create or replace function public.app_today()
returns date language sql stable
as $$
  select ((now() at time zone 'Asia/Taipei') - interval '2 hours')::date
$$;

grant execute on function public.app_today() to authenticated, anon;


-- 新增資料時的預設日期也改成 2 點換日
alter table public.daily_reports    alter column report_date  set default public.app_today();
alter table public.morning_checkins alter column check_date   set default public.app_today();
alter table public.focus_sessions   alter column session_date set default public.app_today();
alter table public.ideas            alter column idea_date    set default public.app_today();
alter table public.mainlines        alter column main_date    set default public.app_today();
alter table public.habits           alter column start_date   set default public.app_today();
alter table public.meal_logs        alter column log_date     set default public.app_today();

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'tasks' and column_name = 'task_date') then
    alter table public.tasks alter column task_date set default public.app_today();
  end if;
end $$;


-- ---------- 🎲 遊戲模式開關 ----------
alter table public.user_settings
  add column if not exists game_mode boolean not null default false;


-- ---------- 📅 簽到紀錄：一天一筆 ----------
create table if not exists public.checkins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  streak integer not null check (streak >= 1),
  crit boolean not null default false,
  crit_chance integer not null default 0,
  exp integer not null default 0,
  gold integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, checkin_date)
);

alter table public.checkins add column if not exists is_makeup boolean not null default false;  -- 補簽的
alter table public.checkins add column if not exists cost integer not null default 0;            -- 補簽花了多少金幣

alter table public.checkins enable row level security;
drop policy if exists "own select" on public.checkins;
create policy "own select" on public.checkins for select using (auth.uid() = user_id);
revoke insert, update, delete on public.checkins from authenticated;
grant select on public.checkins to authenticated;


-- ---------- 🪞 每日反省 ＋ 改善 ----------
create table if not exists public.daily_reflections (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reflect_date date not null default public.app_today(),
  reflection text not null default '' check (char_length(reflection) <= 2000),
  improvement text not null default '' check (char_length(improvement) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, reflect_date)
);

alter table public.daily_reflections enable row level security;
drop policy if exists "own select" on public.daily_reflections;
drop policy if exists "own insert" on public.daily_reflections;
drop policy if exists "own update" on public.daily_reflections;
drop policy if exists "own delete" on public.daily_reflections;
create policy "own select" on public.daily_reflections for select using (auth.uid() = user_id);
create policy "own insert" on public.daily_reflections for insert with check (auth.uid() = user_id);
create policy "own update" on public.daily_reflections for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own delete" on public.daily_reflections for delete using (auth.uid() = user_id);
grant select, insert, update, delete on public.daily_reflections to authenticated;


-- ---------- 🕑 用到「今天」的函式改成 2 點換日（內容和原本一樣，只換日期） ----------
-- 😴 作息維持原本的「凌晨 0–6 點睡算前一晚」，不受影響

create or replace function public.carry_over_tasks()
returns integer language plpgsql security invoker set search_path to 'public'
as $function$
declare
  v_today date := public.app_today();
  v_count integer;
begin
  update public.tasks
  set original_date = coalesce(original_date, task_date), task_date = v_today
  where user_id = auth.uid() and completed = false and skipped = false
    and template_id is null and coalesce(repeat_type, 'none') = 'none'
    and task_date < v_today;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function public.sync_morning_reward()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_total integer;
  v_done integer;
  v_all boolean;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select count(*) into v_total from public.morning_items where user_id = v_user and enabled;
  select count(*) into v_done from public.morning_items i
    join public.morning_checkins c on c.item_id = i.id and c.user_id = v_user and c.check_date = v_today
    where i.user_id = v_user and i.enabled;
  v_all := v_total > 0 and v_done >= v_total;
  return public.set_reward(v_user, 'morning:' || v_today, v_today,
    case when v_all then 20 else 0 end, case when v_all then 10 else 0 end);
end;
$function$;

create or replace function public.sync_focus_reward(p_date date)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_seconds integer;
  v_units integer;
  v_old record;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_date <> v_today then
    select exp, gold into v_old from public.reward_events
      where user_id = v_user and source_key = 'focus:' || p_date;
    return json_build_object('exp', coalesce(v_old.exp, 0), 'gold', coalesce(v_old.gold, 0),
                             'delta_exp', 0, 'delta_gold', 0);
  end if;
  select coalesce(sum(duration_seconds), 0) into v_seconds
    from public.focus_sessions where user_id = v_user and session_date = p_date;
  v_units := v_seconds / 1500;
  return public.set_reward(v_user, 'focus:' || p_date, p_date, v_units * 10, v_units * 5);
end;
$function$;

create or replace function public.habit_log_rules()
returns trigger language plpgsql set search_path to 'public'
as $function$
declare
  v_today date := public.app_today();
begin
  if new.log_date > v_today then raise exception '不能幫未來的日子打卡'; end if;
  if not exists (select 1 from public.habits where id = new.habit_id and user_id = new.user_id) then
    raise exception '找不到這個習慣';
  end if;
  new.is_makeup := new.log_date < v_today;
  return new;
end;
$function$;

create or replace function public.sync_habit_reward(p_habit_id bigint)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_done boolean;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select exists (
    select 1 from public.habit_logs
    where user_id = v_user and habit_id = p_habit_id and log_date = v_today and is_makeup = false
  ) into v_done;
  return public.set_reward(v_user, 'habit:' || p_habit_id || ':' || v_today, v_today,
    case when v_done then 5 else 0 end, case when v_done then 3 else 0 end);
end;
$function$;

create or replace function public.meal_log_rules()
returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if new.log_date > public.app_today() then
    raise exception '不能記錄未來的日子';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function public.draw_fortune()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_row public.fortune_draws%rowtype;
  v_seed integer;
  v_roll integer;
  v_level text;
  v_exp integer;
  v_gold integer;
  v_reward json;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  select * into v_row from public.fortune_draws where user_id = v_user and draw_date = v_today;
  if found then
    return json_build_object('already', true, 'draw_date', v_row.draw_date, 'seed', v_row.seed,
      'level', v_row.level, 'exp', v_row.exp, 'gold', v_row.gold, 'delta_exp', 0, 'delta_gold', 0);
  end if;

  v_seed := ('x' || substr(md5(v_user::text || ':' || v_today::text || ':fortune'), 1, 7))::bit(28)::integer;
  v_roll := v_seed % 100;
  v_level := case
    when v_roll < 8 then 'great'
    when v_roll < 28 then 'good'
    when v_roll < 53 then 'small'
    when v_roll < 78 then 'fair'
    when v_roll < 93 then 'late'
    else 'headwind' end;
  v_exp := case v_level when 'great' then 20 when 'good' then 15 when 'small' then 12
                        when 'fair' then 10 when 'late' then 8 else 25 end;
  v_gold := case v_level when 'great' then 10 when 'headwind' then 10 else 5 end;

  insert into public.fortune_draws (user_id, draw_date, seed, level, exp, gold)
  values (v_user, v_today, v_seed, v_level, v_exp, v_gold)
  on conflict (user_id, draw_date) do nothing;

  v_reward := public.set_reward(v_user, 'fortune:' || v_today, v_today, v_exp, v_gold);

  return json_build_object('already', false, 'draw_date', v_today, 'seed', v_seed,
    'level', v_level, 'exp', v_exp, 'gold', v_gold,
    'delta_exp', (v_reward->>'delta_exp')::int, 'delta_gold', (v_reward->>'delta_gold')::int);
end;
$function$;


-- ---------- 📅 簽到規則 ----------
-- 爆擊機率：第 1 天 5%，之後每天 +2%，最高 35%；每連續 7 天必定爆擊
-- 獎勵：+5 EXP、金幣 10 起跳，連續每多一天 +1，最多 20；爆擊 ×2
-- 斷簽（昨天沒簽）就從第 1 天重新開始
create or replace function public.checkin_crit_chance(p_streak integer)
returns integer language sql immutable
as $$
  select case
    when p_streak % 7 = 0 then 100
    else least(5 + 2 * (p_streak - 1), 35)
  end
$$;


-- ---------- 📅 每月簽到獎勵（當月累計，不用連續） ----------
-- 累計 7 天：+20 EXP / +50 金幣；當月每天都簽（含補簽）：+100 EXP / +300 金幣
-- 每個月各領一次，網頁不能直接呼叫
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

  if v_count >= v_days and not exists (
    select 1 from public.reward_events where user_id = p_user and source_key = 'checkin-mall:' || v_month
  ) then
    perform public.set_reward(p_user, 'checkin-mall:' || v_month, v_today, 100, 300);
    v_got_all := true;
    v_exp := v_exp + 100;
    v_gold := v_gold + 300;
  end if;

  return json_build_object('month_count', v_count, 'month_days', v_days,
    'bonus7', v_got7, 'bonus_all', v_got_all, 'bonus_exp', v_exp, 'bonus_gold', v_gold);
end;
$function$;

revoke all on function public.checkin_month_bonus(uuid, date) from public, anon, authenticated;


-- ---------- 📅 每日簽到 ----------
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
begin
  if v_user is null then raise exception '尚未登入'; end if;

  -- 鎖住玩家資料，連按兩次也只會簽到一次
  perform 1 from public.profiles where id = v_user for update;

  select * into v_row from public.checkins where user_id = v_user and checkin_date = v_today;
  if found then
    return json_build_object('already', true, 'checkin_date', v_row.checkin_date,
      'streak', v_row.streak, 'crit', v_row.crit, 'crit_chance', v_row.crit_chance,
      'exp', v_row.exp, 'gold', v_row.gold, 'delta_exp', 0, 'delta_gold', 0);
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
  v_month := public.checkin_month_bonus(v_user, v_today);

  return json_build_object('already', false, 'checkin_date', v_today,
    'streak', v_streak, 'crit', v_crit, 'crit_chance', v_chance,
    'exp', v_exp, 'gold', v_gold,
    'month_count', (v_month->>'month_count')::int, 'month_days', (v_month->>'month_days')::int,
    'bonus7', (v_month->>'bonus7')::boolean, 'bonus_all', (v_month->>'bonus_all')::boolean,
    'delta_exp', (v_reward->>'delta_exp')::int + (v_month->>'bonus_exp')::int,
    'delta_gold', (v_reward->>'delta_gold')::int + (v_month->>'bonus_gold')::int);
end;
$function$;


-- ---------- 💰 補簽 ----------
-- 只能補這個月、今天以前沒簽的日子；這個月第 1 次 30 金幣，之後每次多 20
-- 補簽不給當天的簽到獎勵，但會接回連續天數、算進每月累計
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
    'delta_exp', (v_month->>'bonus_exp')::int, 'delta_gold', (v_month->>'bonus_gold')::int - v_cost);
end;
$function$;

revoke all on function public.daily_checkin() from public, anon;
revoke all on function public.makeup_checkin(date) from public, anon;
grant execute on function public.daily_checkin() to authenticated;
grant execute on function public.makeup_checkin(date) to authenticated;
grant execute on function public.checkin_crit_chance(integer) to authenticated;


-- ---------- 🕑 自動改寫「產生每日任務」「完成任務」裡的日期 ----------
-- 這兩個函式是早期在 Supabase 建的，這裡直接把裡面「台灣今天」的寫法換成 app_today()
-- 換不到的會在最下面的檢查結果提醒
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  for v_oid in
    select p.oid from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('generate_daily_tasks', 'complete_task')
  loop
    v_def := pg_get_functiondef(v_oid);
    v_new := v_def;
    v_new := regexp_replace(v_new, '\(\s*\(\s*now\(\)\s+at\s+time\s+zone\s+''Asia/Taipei''\s*\)\s*::\s*date\s*\)', 'public.app_today()', 'gi');
    v_new := regexp_replace(v_new, '\(\s*now\(\)\s+at\s+time\s+zone\s+''Asia/Taipei''\s*\)\s*::\s*date', 'public.app_today()', 'gi');
    v_new := regexp_replace(v_new, '\(\s*timezone\(\s*''Asia/Taipei''\s*,\s*now\(\)\s*\)\s*\)\s*::\s*date', 'public.app_today()', 'gi');
    v_new := regexp_replace(v_new, 'timezone\(\s*''Asia/Taipei''\s*,\s*now\(\)\s*\)\s*::\s*date', 'public.app_today()', 'gi');
    v_new := regexp_replace(v_new, '\mcurrent_date\M', 'public.app_today()', 'gi');
    v_new := regexp_replace(v_new, '\mnow\(\)\s*::\s*date', 'public.app_today()', 'gi');
    if v_new <> v_def then
      execute v_new;
    end if;
  end loop;
end $$;


-- ---------- 誰可以呼叫 ----------
revoke all on function public.sync_morning_reward() from public, anon;
revoke all on function public.sync_focus_reward(date) from public, anon;
revoke all on function public.sync_habit_reward(bigint) from public, anon;
revoke all on function public.draw_fortune() from public, anon;
grant execute on function public.carry_over_tasks() to authenticated;
grant execute on function public.sync_morning_reward() to authenticated;
grant execute on function public.sync_focus_reward(date) to authenticated;
grant execute on function public.sync_habit_reward(bigint) to authenticated;
grant execute on function public.draw_fortune() to authenticated;


-- ---------- 讓網站馬上看到新的表 ----------
notify pgrst, 'reload schema';


-- ---------- ✅ 檢查結果 ----------
select coalesce(string_agg(missing, '、'), '✅ 2 點換日＋每月獎勵＋補簽＋每日反省 設定完成') as 檢查結果
from (
  select '缺少函式 ' || f as missing
  from unnest(array['app_today', 'daily_checkin', 'makeup_checkin', 'checkin_month_bonus']) f
  where not exists (select 1 from pg_proc where proname = f and pronamespace = 'public'::regnamespace)
  union all
  select '缺少表 ' || t
  from unnest(array['checkins', 'daily_reflections']) t
  where to_regclass('public.' || t) is null
  union all
  select '缺少欄位 checkins.is_makeup'
  where not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'checkins' and column_name = 'is_makeup')
  union all
  select '⚠️ ' || p.proname || ' 裡還有台灣時間的寫法沒改到，請把它的內容貼給我'
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('generate_daily_tasks', 'complete_task')
    and pg_get_functiondef(p.oid) ilike '%Asia/Taipei%'
  union all
  select '⚠️ generate_daily_tasks 沒找到日期的寫法，請把它的內容貼給我'
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname = 'generate_daily_tasks'
    and pg_get_functiondef(p.oid) not ilike '%app_today%'
) x;
