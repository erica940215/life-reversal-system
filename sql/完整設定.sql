-- =========================================================
-- 🔧 完整設定（可以重複執行：已經有的不會動，缺的會補上）
-- 整份貼到 Supabase SQL Editor → Run
-- 最下面會顯示檢查結果
-- =========================================================


-- ---------- 🕑 一天從凌晨 2 點開始（凌晨 0:00–1:59 還算前一天） ----------
create or replace function public.app_today()
returns date language sql stable
as $$
  select ((now() at time zone 'Asia/Taipei') - interval '2 hours')::date
$$;

grant execute on function public.app_today() to authenticated, anon;



-- ---------- 🌙 每日結算 ----------
create table if not exists public.daily_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  report_date date not null default (public.app_today()),
  tasks_total integer not null default 0,
  tasks_done integer not null default 0,
  completion_rate integer not null default 0,
  exp_gained integer not null default 0,
  gold_gained integer not null default 0,
  self_rating text check (self_rating in ('good', 'normal', 'bad')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, report_date)
);

alter table public.daily_reports
  add column if not exists morning_done integer not null default 0,
  add column if not exists morning_total integer not null default 0,
  add column if not exists focus_seconds integer not null default 0,
  add column if not exists focus_by_subject jsonb not null default '{}'::jsonb,
  add column if not exists ideas_added integer not null default 0,
  add column if not exists ideas_converted integer not null default 0,
  add column if not exists mainline_title text,
  add column if not exists mainline_done boolean not null default false,
  add column if not exists bonus_exp integer not null default 0,
  add column if not exists bonus_gold integer not null default 0,
  add column if not exists habits_done integer not null default 0,
  add column if not exists habits_total integer not null default 0,
  add column if not exists wake_time text,
  add column if not exists bed_time text,
  add column if not exists sleep_minutes integer,
  add column if not exists meals_count integer not null default 0,
  add column if not exists meal_cost integer not null default 0,
  add column if not exists fortune_level text;


-- ---------- 🌅 晨間 / ⏱️ 專注 / 💡 想法 ----------
create table if not exists public.morning_items (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.morning_checkins (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id bigint not null references public.morning_items(id) on delete cascade,
  check_date date not null default (public.app_today()),
  checked_at timestamptz not null default now(),
  unique (user_id, item_id, check_date)
);

create table if not exists public.focus_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject text not null,
  mode text not null check (mode in ('up', 'down')),
  planned_minutes integer,
  duration_seconds integer not null check (duration_seconds >= 0),
  started_at timestamptz not null,
  ended_at timestamptz not null default now(),
  session_date date not null default (public.app_today()),
  created_at timestamptz not null default now()
);

-- 專注：補記 / 修改的標記，單筆最長 12 小時
alter table public.focus_sessions
  add column if not exists is_manual boolean not null default false,
  add column if not exists edited_at timestamptz;

alter table public.focus_sessions drop constraint if exists focus_duration_max;
alter table public.focus_sessions
  add constraint focus_duration_max check (duration_seconds <= 43200) not valid;

create table if not exists public.ideas (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content text not null,
  category text not null default 'other'
    check (category in ('todo', 'idea', 'study', 'mainline', 'shopping', 'important', 'other')),
  status text not null default 'inbox' check (status in ('inbox', 'done', 'converted')),
  task_id bigint references public.tasks(id) on delete set null,
  idea_date date not null default (public.app_today()),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);


-- ---------- 🔄 重複任務：跳過今天 / 順延 ----------
alter table public.tasks
  add column if not exists skipped boolean not null default false,
  add column if not exists original_date date;

do $$
declare r record;
begin
  for r in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.tasks'::regclass and con.contype = 'f'
      and con.confrelid = 'public.task_templates'::regclass
  loop
    execute format('alter table public.tasks drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.tasks
  add constraint tasks_template_id_fkey foreign key (template_id)
  references public.task_templates(id) on delete set null not valid;


-- ---------- 🎯 主線 / 📍 長期目標 / ⏳ 倒數 / 🎁 獎勵帳本 ----------
create table if not exists public.goals (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'active' check (status in ('active', 'done')),
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create table if not exists public.mainlines (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  main_date date not null default (public.app_today()),
  title text not null,
  goal_id bigint references public.goals(id) on delete set null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, main_date)
);

create table if not exists public.countdowns (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  target_date date not null,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reward_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  reward_date date not null,
  exp integer not null default 0,
  gold integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_key)
);


-- ---------- 📅 習慣 ----------
create table if not exists public.habits (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  repeat_type text not null default 'daily' check (repeat_type in ('daily', 'weekly')),
  repeat_days integer[] not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 0,
  start_date date not null default (public.app_today()),
  created_at timestamptz not null default now()
);

create table if not exists public.habit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id bigint not null references public.habits(id) on delete cascade,
  log_date date not null,
  is_makeup boolean not null default false,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);


-- ---------- 😴 作息（一晚一筆：凌晨 0–6 點睡的算前一晚） ----------
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  bed_target time not null default '23:30',
  wake_target time not null default '07:30',
  updated_at timestamptz not null default now()
);

create table if not exists public.sleep_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  night_date date not null,
  bed_at timestamptz,
  wake_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, night_date)
);


-- ---------- 🍱 三餐（一天每一餐一筆） ----------
create table if not exists public.meal_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null default (public.app_today()),
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  content text not null default '' check (char_length(content) <= 200),
  eaten_at time,
  skipped boolean not null default false,
  cost integer check (cost is null or (cost >= 0 and cost <= 100000)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date, meal_type)
);


-- ---------- 🏷️ 任務分類（可以自己新增 / 改名 / 刪除） ----------
create table if not exists public.task_categories (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null check (char_length(key) between 1 and 40),
  label text not null check (char_length(label) between 1 and 20),
  emoji text not null default '📌' check (char_length(emoji) <= 16),
  color text not null default '#5865f2' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

-- ---------- 🎴 每日抽籤（一天一支，結果由資料庫決定，不能重抽） ----------
create table if not exists public.fortune_draws (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  draw_date date not null,
  seed integer not null,
  level text not null check (level in ('great', 'good', 'small', 'fair', 'late', 'headwind')),
  exp integer not null default 0,
  gold integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, draw_date)
);

-- 任務 / 重複任務的分類如果有限定選項，拿掉（自訂分類才存得進去）
do $$
declare r record;
begin
  for r in
    select con.conrelid::regclass as tbl, con.conname
    from pg_constraint con
    where con.contype = 'c'
      and con.conrelid in ('public.tasks'::regclass, 'public.task_templates'::regclass)
      and pg_get_constraintdef(con.oid) ilike '%category%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;


-- ---------- 🔒 門鎖（每次都重新設定一遍） ----------
do $$
declare
  t text;
  p text;
begin

  -- 先把舊的規則清掉（包含早期每日結算用的名稱）
  foreach t in array array['daily_reports', 'morning_items', 'morning_checkins', 'focus_sessions',
                           'ideas', 'goals', 'mainlines', 'countdowns', 'reward_events',
                           'habits', 'habit_logs', 'user_settings', 'sleep_logs', 'meal_logs',
                           'task_categories', 'fortune_draws'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p, t);
    end loop;
  end loop;

  -- 一般的表：本人可以看 / 新增 / 修改 / 刪除
  foreach t in array array['daily_reports', 'morning_items', 'morning_checkins', 'focus_sessions',
                           'ideas', 'goals', 'countdowns', 'habits', 'user_settings', 'sleep_logs',
                           'meal_logs', 'task_categories'] loop
    execute format('create policy "own select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "own insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "own update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "own delete" on public.%I for delete using (auth.uid() = user_id)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;

  -- 主線：已完成的不能刪
  create policy "own select" on public.mainlines for select using (auth.uid() = user_id);
  create policy "own insert" on public.mainlines for insert with check (auth.uid() = user_id);
  create policy "own update" on public.mainlines for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "own delete unfinished" on public.mainlines for delete using (auth.uid() = user_id and completed = false);
  grant select, insert, update, delete on public.mainlines to authenticated;

  -- 打卡紀錄：只能新增和刪除
  create policy "own select" on public.habit_logs for select using (auth.uid() = user_id);
  create policy "own insert" on public.habit_logs for insert with check (auth.uid() = user_id);
  create policy "own delete" on public.habit_logs for delete using (auth.uid() = user_id);
  revoke update on public.habit_logs from authenticated;
  grant select, insert, delete on public.habit_logs to authenticated;

  -- 抽籤紀錄：只能看（抽籤要透過 draw_fortune）
  create policy "own select" on public.fortune_draws for select using (auth.uid() = user_id);
  revoke insert, update, delete on public.fortune_draws from authenticated;
  grant select on public.fortune_draws to authenticated;

  -- 獎勵帳本：只能看
  create policy "own select" on public.reward_events for select using (auth.uid() = user_id);
  revoke insert, update, delete on public.reward_events from authenticated;
  grant select on public.reward_events to authenticated;

end $$;


-- ---------- ↩ 取消完成任務：扣回 EXP / 金幣 ----------
create or replace function public.uncomplete_task(p_task_id bigint)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_profile public.profiles%rowtype;
  v_new_level integer;
  v_new_exp integer;
  v_new_gold integer;
begin
  if v_user_id is null then raise exception '尚未登入'; end if;
  select * into v_task from public.tasks where id = p_task_id and user_id = v_user_id for update;
  if not found then raise exception '找不到這個任務'; end if;
  if not v_task.completed then
    return json_build_object('success', false, 'message', '這個任務尚未完成');
  end if;
  select * into v_profile from public.profiles where id = v_user_id for update;
  if not found then raise exception '找不到玩家資料'; end if;
  v_new_exp   := v_profile.exp  - coalesce(v_task.exp_reward, 0);
  v_new_gold  := v_profile.gold - coalesce(v_task.gold_reward, 0);
  v_new_level := v_profile.level;
  while v_new_exp < 0 and v_new_level > 1 loop
    v_new_level := v_new_level - 1;
    v_new_exp   := v_new_exp + (100 + (v_new_level - 1) * 50);
    v_new_gold  := v_new_gold - 100;
  end loop;
  if v_new_exp < 0 then v_new_exp := 0; end if;
  update public.tasks set completed = false, completed_at = null where id = v_task.id and user_id = v_user_id;
  update public.profiles set level = v_new_level, exp = v_new_exp, gold = v_new_gold, updated_at = now() where id = v_user_id;
  return json_build_object('success', true, 'task_id', v_task.id, 'level', v_new_level, 'exp', v_new_exp, 'gold', v_new_gold);
end;
$function$;


-- ---------- ⏩ 沒完成的單次任務移到今天 ----------
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


-- ---------- 🎁 加 / 扣經驗（含升降級），網頁不能直接呼叫 ----------
create or replace function public.apply_reward(p_user uuid, p_exp integer, p_gold integer)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_level integer;
  v_exp integer;
  v_gold integer;
begin
  select level, exp, gold into v_level, v_exp, v_gold from public.profiles where id = p_user for update;
  if not found then raise exception '找不到玩家資料'; end if;
  v_level := coalesce(v_level, 1);
  v_exp   := coalesce(v_exp, 0) + p_exp;
  v_gold  := coalesce(v_gold, 0) + p_gold;
  while v_exp >= 100 + (v_level - 1) * 50 loop
    v_exp := v_exp - (100 + (v_level - 1) * 50);
    v_level := v_level + 1;
    v_gold := v_gold + 100;
  end loop;
  while v_exp < 0 and v_level > 1 loop
    v_level := v_level - 1;
    v_exp := v_exp + (100 + (v_level - 1) * 50);
    v_gold := v_gold - 100;
  end loop;
  if v_exp < 0 then v_exp := 0; end if;
  update public.profiles set level = v_level, exp = v_exp, gold = v_gold, updated_at = now() where id = p_user;
end;
$function$;

create or replace function public.set_reward(p_user uuid, p_key text, p_date date, p_exp integer, p_gold integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_old_exp integer;
  v_old_gold integer;
begin
  perform 1 from public.profiles where id = p_user for update;
  select exp, gold into v_old_exp, v_old_gold from public.reward_events where user_id = p_user and source_key = p_key;
  v_old_exp := coalesce(v_old_exp, 0);
  v_old_gold := coalesce(v_old_gold, 0);
  if p_exp = 0 and p_gold = 0 then
    delete from public.reward_events where user_id = p_user and source_key = p_key;
  else
    insert into public.reward_events (user_id, source_key, reward_date, exp, gold)
    values (p_user, p_key, p_date, p_exp, p_gold)
    on conflict (user_id, source_key) do update
      set exp = excluded.exp, gold = excluded.gold, reward_date = excluded.reward_date, updated_at = now();
  end if;
  if p_exp <> v_old_exp or p_gold <> v_old_gold then
    perform public.apply_reward(p_user, p_exp - v_old_exp, p_gold - v_old_gold);
  end if;
  return json_build_object('exp', p_exp, 'gold', p_gold, 'delta_exp', p_exp - v_old_exp, 'delta_gold', p_gold - v_old_gold);
end;
$function$;

revoke all on function public.apply_reward(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.set_reward(uuid, text, date, integer, integer) from public, anon, authenticated;


-- ---------- 🌅 晨間全部完成 +20 / +10 ----------
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


-- ---------- ⏱️ 專注每滿 25 分鐘 +10 / +5（只有今天的會變動，前幾天的修改 / 補記不影響獎勵） ----------
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


-- ---------- 🎯 主線完成 +50 / +30 ----------
create or replace function public.complete_mainline(p_mainline_id bigint)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_main public.mainlines%rowtype;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select * into v_main from public.mainlines where id = p_mainline_id and user_id = v_user for update;
  if not found then raise exception '找不到這條主線'; end if;
  update public.mainlines set completed = true, completed_at = now(), updated_at = now() where id = p_mainline_id;
  return public.set_reward(v_user, 'mainline:' || p_mainline_id, v_main.main_date, 50, 30);
end;
$function$;

create or replace function public.uncomplete_mainline(p_mainline_id bigint)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_main public.mainlines%rowtype;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select * into v_main from public.mainlines where id = p_mainline_id and user_id = v_user for update;
  if not found then raise exception '找不到這條主線'; end if;
  update public.mainlines set completed = false, completed_at = null, updated_at = now() where id = p_mainline_id;
  return public.set_reward(v_user, 'mainline:' || p_mainline_id, v_main.main_date, 0, 0);
end;
$function$;


-- ---------- 📅 習慣：打卡規則 + 當天打卡 +5 / +3 ----------
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

drop trigger if exists habit_log_rules on public.habit_logs;
create trigger habit_log_rules before insert on public.habit_logs
  for each row execute function public.habit_log_rules();

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


-- ---------- 😴 作息：時間規則 ----------
-- 睡覺：那一晚 06:00 ～ 隔天 06:00；起床：隔天 00:00 ～ 23:59；都不能是未來
create or replace function public.sleep_log_rules()
returns trigger language plpgsql set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_bed timestamp := new.bed_at at time zone 'Asia/Taipei';
  v_wake timestamp := new.wake_at at time zone 'Asia/Taipei';
begin
  if new.night_date > v_today then raise exception '不能記錄未來的日子'; end if;
  if new.bed_at > now() + interval '5 minutes' or new.wake_at > now() + interval '5 minutes' then
    raise exception '不能記錄未來的時間';
  end if;
  if v_bed is not null and (v_bed < new.night_date + time '06:00' or v_bed >= new.night_date + 1 + time '06:00') then
    raise exception '睡覺時間要在那一晚（凌晨 0–6 點算前一晚）';
  end if;
  if v_wake is not null and v_wake::date <> new.night_date + 1 then
    raise exception '起床時間要在那一晚的隔天';
  end if;
  if new.bed_at is not null and new.wake_at is not null and new.wake_at <= new.bed_at then
    raise exception '起床時間要比睡覺時間晚';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists sleep_log_rules on public.sleep_logs;
create trigger sleep_log_rules before insert or update on public.sleep_logs
  for each row execute function public.sleep_log_rules();


-- ---------- 🍱 三餐：不能記未來的日子 ----------
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

drop trigger if exists meal_log_rules on public.meal_logs;
create trigger meal_log_rules before insert or update on public.meal_logs
  for each row execute function public.meal_log_rules();


-- ---------- 😴 早睡 / 早起 達標各 +10 EXP（只有昨晚、今晚的會變動） ----------
create or replace function public.sync_sleep_reward(p_night date)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_bed_target time;
  v_wake_target time;
  v_log public.sleep_logs%rowtype;
  v_bed_ok boolean := false;
  v_wake_ok boolean := false;
  v_bed json;
  v_wake json;
  v_exp integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  select bed_target, wake_target into v_bed_target, v_wake_target
    from public.user_settings where user_id = v_user;
  v_bed_target := coalesce(v_bed_target, time '23:30');
  v_wake_target := coalesce(v_wake_target, time '07:30');

  select * into v_log from public.sleep_logs where user_id = v_user and night_date = p_night;
  if found then
    -- 目標在中午以前（例如 00:30）= 隔天凌晨
    v_bed_ok := v_log.bed_at is not null and (v_log.bed_at at time zone 'Asia/Taipei')
      <= (p_night + case when v_bed_target < time '12:00' then 1 else 0 end) + v_bed_target;
    v_wake_ok := v_log.wake_at is not null and (v_log.wake_at at time zone 'Asia/Taipei')
      <= (p_night + 1) + v_wake_target;
  end if;

  if p_night not in (v_today, v_today - 1) then
    select coalesce(sum(exp), 0) into v_exp from public.reward_events
      where user_id = v_user and source_key in ('bed:' || p_night, 'wake:' || (p_night + 1));
    return json_build_object('exp', v_exp, 'gold', 0, 'delta_exp', 0, 'delta_gold', 0,
                             'bed_ok', v_bed_ok, 'wake_ok', v_wake_ok, 'bed_delta', 0, 'wake_delta', 0);
  end if;

  v_bed := public.set_reward(v_user, 'bed:' || p_night, p_night,
    case when v_bed_ok then 10 else 0 end, 0);
  v_wake := public.set_reward(v_user, 'wake:' || (p_night + 1), p_night + 1,
    case when v_wake_ok then 10 else 0 end, 0);

  return json_build_object(
    'exp', (v_bed->>'exp')::int + (v_wake->>'exp')::int,
    'gold', 0,
    'delta_exp', (v_bed->>'delta_exp')::int + (v_wake->>'delta_exp')::int,
    'delta_gold', 0,
    'bed_ok', v_bed_ok,
    'wake_ok', v_wake_ok,
    'bed_delta', (v_bed->>'delta_exp')::int,
    'wake_delta', (v_wake->>'delta_exp')::int);
end;
$function$;


-- ---------- 🎴 每日抽籤：一天一次，籤由「帳號 + 日期」決定（重抽也一樣） ----------
-- 大吉 8%・中吉 20%・小吉 25%・吉 25%・末吉 15%・逆風 7%（逆風給最多：逆襲補給）
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


-- ---------- 誰可以呼叫 ----------
revoke all on function public.sync_morning_reward() from public, anon;
revoke all on function public.sync_focus_reward(date) from public, anon;
revoke all on function public.complete_mainline(bigint) from public, anon;
revoke all on function public.uncomplete_mainline(bigint) from public, anon;
revoke all on function public.sync_habit_reward(bigint) from public, anon;
revoke all on function public.sync_sleep_reward(date) from public, anon;
revoke all on function public.draw_fortune() from public, anon;
grant execute on function public.draw_fortune() to authenticated;
grant execute on function public.sync_sleep_reward(date) to authenticated;
grant execute on function public.uncomplete_task(bigint) to authenticated;
grant execute on function public.carry_over_tasks() to authenticated;
grant execute on function public.sync_morning_reward() to authenticated;
grant execute on function public.sync_focus_reward(date) to authenticated;
grant execute on function public.complete_mainline(bigint) to authenticated;
grant execute on function public.uncomplete_mainline(bigint) to authenticated;
grant execute on function public.sync_habit_reward(bigint) to authenticated;


-- ---------- 任務獎勵表（重複任務範本） ----------
update public.task_templates set
  exp_reward = case difficulty when 'easy' then 15 when 'hard' then 50 when 'epic' then 80 else 30 end,
  gold_reward = case difficulty when 'easy' then 10 when 'hard' then 35 when 'epic' then 55 else 20 end;


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



-- ---------- 📅 每日簽到 ----------


-- ---------- 💰 補簽 ----------
-- 只能補這個月、今天以前沒簽的日子；這個月第 1 次 30 金幣，之後每次多 20
-- 補簽不給當天的簽到獎勵，但會接回連續天數、算進每月累計

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



-- =========================================================
-- 🏝️ 星露島（生活線農場）
-- =========================================================

-- ---------- 💾 農場存檔 ----------
create table if not exists public.farm_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  rev integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.farm_saves enable row level security;
drop policy if exists "own select" on public.farm_saves;
create policy "own select" on public.farm_saves for select using (auth.uid() = user_id);
revoke insert, update, delete on public.farm_saves from authenticated;
grant select on public.farm_saves to authenticated;


create or replace function public.farm_save(p_state jsonb, p_rev integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_rev integer;
  v_lv integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then raise exception '存檔格式不對'; end if;
  if pg_column_size(p_state) > 500000 then raise exception '存檔太大'; end if;

  v_lv := coalesce((p_state->>'lv')::integer, 1);
  if v_lv < 1 or v_lv > 70 then raise exception '島嶼等級不正確'; end if;

  select rev into v_rev from public.farm_saves where user_id = v_user for update;

  if not found then
    insert into public.farm_saves (user_id, state, rev) values (v_user, p_state, 1);
    return json_build_object('ok', true, 'rev', 1);
  end if;

  if p_rev is distinct from v_rev then
    return json_build_object('ok', false, 'conflict', true, 'rev', v_rev);
  end if;

  update public.farm_saves
    set state = p_state, rev = v_rev + 1, updated_at = now()
    where user_id = v_user;

  return json_build_object('ok', true, 'rev', v_rev + 1);
end;
$function$;


-- ---------- 🌠 開星願瓶 ----------
create or replace function public.farm_open_wish(p_item text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_qty integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_item not in ('wish_normal', 'wish_rare', 'wish_limited') then raise exception '這不是星願瓶'; end if;

  select qty into v_qty from public.player_items
    where user_id = v_user and item_key = p_item for update;

  if coalesce(v_qty, 0) < 1 then raise exception '星願瓶不夠'; end if;

  update public.player_items set qty = qty - 1, updated_at = now()
    where user_id = v_user and item_key = p_item;

  insert into public.item_events (user_id, item_key, delta, source_key)
    values (v_user, p_item, -1, 'farm-wish:' || gen_random_uuid());

  return json_build_object('roll', random(), 'left', v_qty - 1);
end;
$function$;


-- ---------- 🎁 島嶼等級的星願瓶（看存檔裡的等級，每一級只發一次） ----------
create or replace function public.farm_claim_levels()
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_lv integer;
  v_items jsonb := '[]'::jsonb;
  v_key text;
  v_qty integer;
  l integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  select least(coalesce((state->>'lv')::integer, 1), 50) into v_lv
    from public.farm_saves where user_id = v_user;

  if not found or v_lv < 5 then return v_items; end if;

  for l in 5..v_lv by 5 loop
    if l = 50 then v_key := 'wish_rare'; v_qty := 3;
    elsif l % 10 = 0 then v_key := 'wish_rare'; v_qty := 1;
    else v_key := 'wish_normal'; v_qty := 1;
    end if;

    if public.grant_item(v_user, v_key, v_qty, 'farm-lv:' || l) then
      v_items := v_items || jsonb_build_object('key', v_key, 'qty', v_qty, 'lv', l);
    end if;
  end loop;

  return v_items;
end;
$function$;


revoke all on function public.farm_save(jsonb, integer) from public, anon;
revoke all on function public.farm_open_wish(text) from public, anon;
revoke all on function public.farm_claim_levels() from public, anon;
grant execute on function public.farm_save(jsonb, integer) to authenticated;
grant execute on function public.farm_open_wish(text) to authenticated;
grant execute on function public.farm_claim_levels() to authenticated;


-- =========================================================
-- 🌠 星願池（星露島的抽獎）
-- =========================================================

-- ---------- 🌠 抽獎狀態（一人一列，網頁只能讀自己的） ----------
create table if not exists public.farm_wish (
  user_id uuid primary key references auth.users(id) on delete cascade,
  luck_bonus integer not null default 0,          -- 幸運草、瞭望台加的幸運值（中大獎歸零）
  big_date date,                                  -- 普通池上次中大獎（華品、仙品）是哪一天
  rare_n integer not null default 1,              -- 稀有池：距離上次大獎第幾瓶
  limited_n integer not null default 1,           -- 限定池：距離上次抽到主角第幾瓶
  free_date date,
  free_used integer not null default 0,           -- 今天用掉幾次免費抽
  observe_date date,                              -- 今天看過流星了沒
  owned jsonb not null default '{}'::jsonb,       -- 拿到的收藏：夥伴、工具、造型、稱號、食譜卡、解鎖的作物（1），家具（數量）
  updated_at timestamptz not null default now()
);

create table if not exists public.farm_wish_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  pool text not null,
  tier text not null,
  reward text not null,
  dup boolean not null default false,
  dust integer not null default 0,
  amount integer,
  created_at timestamptz not null default now()
);

create index if not exists farm_wish_log_user on public.farm_wish_log (user_id, id desc);

alter table public.farm_wish enable row level security;
alter table public.farm_wish_log enable row level security;
drop policy if exists "own select" on public.farm_wish;
drop policy if exists "own select" on public.farm_wish_log;
create policy "own select" on public.farm_wish for select using (auth.uid() = user_id);
create policy "own select" on public.farm_wish_log for select using (auth.uid() = user_id);
revoke insert, update, delete on public.farm_wish from authenticated;
revoke insert, update, delete on public.farm_wish_log from authenticated;
grant select on public.farm_wish to authenticated;
grant select on public.farm_wish_log to authenticated;


-- ---------- 📜 獎池目錄（由遊戲資料自動產生，跟網頁上的 farm-data.js 一致） ----------
create or replace function public.farm_wish_catalog()
returns jsonb language sql immutable
as $catalog$
  select $json${"tiers":{"c":["dew_s","fert3","feed10","bucket1","crop5","stardust3","page1","clover","f_fence","f_stonelamp","f_flowerpot","f_haystack"],"r":["c_blueberry","c_colorpepper","c_cherryradish","c_purplepotato","a_goose","f_bench","f_streetlamp","f_scarecrow","f_swing","speedglass","bucket3","fert8","dew_m","makeupcard","page2","t_novice"],"l":["c_goldrice","c_rainbowcorn","c_whitestrawberry","c_blacktomato","tree_persimmon","a_turkey","a_blacksheep","p_calico","p_shiba","f_gazebo","f_birdhouse","f_picnicmat","f_wishlantern","tool_copperwater","tool_bigbasket","raincloud","harvestticket","fourclover","rarebottle","t_greenthumb"],"x":["c_starherb","c_amberpumpkin","c_cottoncandy","tree_goldapple","a_goldhen","a_rainbowalpaca","p_fox","p_owl","f_fountain","f_sakura","f_balloon","s_starfield","s_candybarn","tool_goldsickle","tool_magicpot","limitedbottle","t_goldchef"],"s":["c_moonlotus","c_phoenixpepper","tree_immortalpeach","tree_auroragrape","a_moonrabbit","a_cloudsheep","p_phoenix","p_dragon","f_observatory","f_startree","s_moonbridge","s_nightmode","s_rainbowfall","tool_timeglass","t_immortal"]},"months":{"2026-11":{"name":"金秋豐收","hero":"s_harvestbarn","s":["s_harvestbarn"],"x":["f_pumpkinlamp","c_amberpumpkin"],"l":["s_mapleground","f_mapletree","f_harvestwreath","r_grainrice"]},"2026-12":{"name":"星夜慶典","hero":"p_starspirit","s":["p_starspirit"],"x":["s_gingerhouse","s_snowground"],"l":["f_snowman","f_cocoastall","f_fairylights","r_gingerbread"]},"2027-01":{"name":"新春","hero":"s_luckykoi","s":["s_luckykoi"],"x":["f_liondance","f_redlanterns"],"l":["s_couplets","f_fumat","r_turnipcake","r_fagao"]}},"default":{"s":["c_moonlotus","c_phoenixpepper","tree_immortalpeach","tree_auroragrape","a_moonrabbit","a_cloudsheep","p_phoenix","p_dragon","f_observatory","f_startree","s_moonbridge","s_nightmode","s_rainbowfall","tool_timeglass","t_immortal"],"x":["c_starherb","c_amberpumpkin","c_cottoncandy","tree_goldapple","a_goldhen","a_rainbowalpaca","p_fox","p_owl","f_fountain","f_sakura","f_balloon","s_starfield","s_candybarn","tool_goldsickle","tool_magicpot","limitedbottle","t_goldchef"],"l":["c_goldrice","c_rainbowcorn","c_whitestrawberry","c_blacktomato","tree_persimmon","a_turkey","a_blacksheep","p_calico","p_shiba","f_gazebo","f_birdhouse","f_picnicmat","f_wishlantern","tool_copperwater","tool_bigbasket","raincloud","harvestticket","fourclover","rarebottle","t_greenthumb"]},"tier":{"dew_s":"c","fert3":"c","feed10":"c","bucket1":"c","crop5":"c","stardust3":"c","page1":"c","clover":"c","f_fence":"c","f_stonelamp":"c","f_flowerpot":"c","f_haystack":"c","c_blueberry":"r","c_colorpepper":"r","c_cherryradish":"r","c_purplepotato":"r","a_goose":"r","f_bench":"r","f_streetlamp":"r","f_scarecrow":"r","f_swing":"r","speedglass":"r","bucket3":"r","fert8":"r","dew_m":"r","makeupcard":"r","page2":"r","t_novice":"r","c_goldrice":"l","c_rainbowcorn":"l","c_whitestrawberry":"l","c_blacktomato":"l","tree_persimmon":"l","a_turkey":"l","a_blacksheep":"l","p_calico":"l","p_shiba":"l","f_gazebo":"l","f_birdhouse":"l","f_picnicmat":"l","f_wishlantern":"l","tool_copperwater":"l","tool_bigbasket":"l","raincloud":"l","harvestticket":"l","fourclover":"l","rarebottle":"l","t_greenthumb":"l","c_starherb":"x","c_amberpumpkin":"x","c_cottoncandy":"x","tree_goldapple":"x","a_goldhen":"x","a_rainbowalpaca":"x","p_fox":"x","p_owl":"x","f_fountain":"x","f_sakura":"x","f_balloon":"x","s_starfield":"x","s_candybarn":"x","tool_goldsickle":"x","tool_magicpot":"x","limitedbottle":"x","t_goldchef":"x","c_moonlotus":"s","c_phoenixpepper":"s","tree_immortalpeach":"s","tree_auroragrape":"s","a_moonrabbit":"s","a_cloudsheep":"s","p_phoenix":"s","p_dragon":"s","f_observatory":"s","f_startree":"s","s_moonbridge":"s","s_nightmode":"s","s_rainbowfall":"s","tool_timeglass":"s","t_immortal":"s","s_harvestbarn":"s","f_pumpkinlamp":"x","s_mapleground":"l","f_mapletree":"l","f_harvestwreath":"l","r_grainrice":"l","p_starspirit":"s","s_gingerhouse":"x","s_snowground":"x","f_snowman":"l","f_cocoastall":"l","f_fairylights":"l","r_gingerbread":"l","s_luckykoi":"s","f_liondance":"x","f_redlanterns":"x","s_couplets":"l","f_fumat":"l","r_turnipcake":"l","r_fagao":"l","f_ancienttree":"s","t_diligent":"r","t_hundred":"x","f_blackrug":"l","f_rainbowhammock":"x","f_cloudsofa":"s"},"kind":{"dew_s":"dew","fert3":"item","feed10":"item","bucket1":"item","crop5":"crop5","stardust3":"dust","page1":"page","clover":"luck","f_fence":"deco","f_stonelamp":"deco","f_flowerpot":"deco","f_haystack":"deco","c_blueberry":"crop","c_colorpepper":"crop","c_cherryradish":"crop","c_purplepotato":"crop","a_goose":"animal","f_bench":"deco","f_streetlamp":"deco","f_scarecrow":"deco","f_swing":"deco","speedglass":"item","bucket3":"item","fert8":"item","dew_m":"dew","makeupcard":"makeup","page2":"page","t_novice":"title","c_goldrice":"crop","c_rainbowcorn":"crop","c_whitestrawberry":"crop","c_blacktomato":"crop","tree_persimmon":"tree","a_turkey":"animal","a_blacksheep":"animal","p_calico":"pet","p_shiba":"pet","f_gazebo":"deco","f_birdhouse":"deco","f_picnicmat":"deco","f_wishlantern":"deco","tool_copperwater":"tool","tool_bigbasket":"tool","raincloud":"item","harvestticket":"item","fourclover":"luck","rarebottle":"bottle","t_greenthumb":"title","c_starherb":"crop","c_amberpumpkin":"crop","c_cottoncandy":"crop","tree_goldapple":"tree","a_goldhen":"animal","a_rainbowalpaca":"animal","p_fox":"pet","p_owl":"pet","f_fountain":"deco","f_sakura":"deco","f_balloon":"deco","s_starfield":"skin","s_candybarn":"skin","tool_goldsickle":"tool","tool_magicpot":"tool","limitedbottle":"bottle","t_goldchef":"title","c_moonlotus":"crop","c_phoenixpepper":"crop","tree_immortalpeach":"tree","tree_auroragrape":"tree","a_moonrabbit":"animal","a_cloudsheep":"animal","p_phoenix":"pet","p_dragon":"pet","f_observatory":"deco","f_startree":"deco","s_moonbridge":"skin","s_nightmode":"skin","s_rainbowfall":"skin","tool_timeglass":"tool","t_immortal":"title","s_harvestbarn":"skin","f_pumpkinlamp":"deco","s_mapleground":"skin","f_mapletree":"deco","f_harvestwreath":"deco","r_grainrice":"recipe","p_starspirit":"pet","s_gingerhouse":"skin","s_snowground":"skin","f_snowman":"deco","f_cocoastall":"deco","f_fairylights":"deco","r_gingerbread":"recipe","s_luckykoi":"skin","f_liondance":"deco","f_redlanterns":"deco","s_couplets":"skin","f_fumat":"deco","r_turnipcake":"recipe","r_fagao":"recipe","f_ancienttree":"deco","t_diligent":"title","t_hundred":"title","f_blackrug":"deco","f_rainbowhammock":"deco","f_cloudsofa":"deco"},"unique":["p_","tool_","s_","t_","r_"],"dust":{"c":1,"r":5,"l":20,"x":80,"s":300},"shop":{"wish_normal":20,"wish_rare":120,"wish_limited":300,"makeupcard":30,"page":15},"pick":{"r":40,"l":150,"x":500,"s":1800},"expired":{"l":200,"x":600,"s":2000},"luck":{"clover":1,"fourclover":5},"dustq":{"stardust3":3},"dew":{"dew_s":[50,150],"dew_m":[300,300]},"bottle":{"rarebottle":"wish_rare","limitedbottle":"wish_limited"},"yarn":{"f_blackrug":"blackyarn","f_rainbowhammock":"rainbowyarn","f_cloudsofa":"cloudcotton"}}$json$::jsonb
$catalog$;


-- ---------- 🍀 幸運值：上次中大獎之後連續簽到幾天，再加上幸運草這類加成，最高 30 ----------
create or replace function public.farm_wish_luck(p_user uuid, p_big date, p_bonus integer)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_today date := public.app_today();
  v_last date;
  v_streak integer;
  v_first date;
  v_from date;
  v_n integer := 0;
begin
  select checkin_date, streak into v_last, v_streak
    from public.checkins
    where user_id = p_user and checkin_date between v_today - 1 and v_today
    order by checkin_date desc
    limit 1;

  if v_last is null then
    v_streak := 0;
  else
    v_first := v_last - v_streak + 1;
    v_from := greatest(v_first, coalesce(p_big + 1, v_first));
    v_n := greatest(0, v_last - v_from + 1);
  end if;

  return jsonb_build_object(
    'streak', coalesce(v_streak, 0),
    'first', v_first,
    'checked', exists (select 1 from public.checkins where user_id = p_user and checkin_date = v_today),
    'n', v_n,
    'luck', least(30, greatest(1, v_n + coalesce(p_bonus, 0))));
end;
$function$;


-- ---------- 📊 狀態（給網頁畫畫面用） ----------
create or replace function public.farm_wish_status_of(p_user uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_today date := public.app_today();
  v_month text := to_char(public.app_today(), 'YYYY-MM');
  cat jsonb := public.farm_wish_catalog();
  w public.farm_wish%rowtype;
  v_luck jsonb;
  v_items jsonb;
begin
  select * into w from public.farm_wish where user_id = p_user;
  if not found then
    w.luck_bonus := 0; w.rare_n := 1; w.limited_n := 1; w.free_used := 0; w.owned := '{}'::jsonb;
  end if;

  v_luck := public.farm_wish_luck(p_user, w.big_date, w.luck_bonus);

  select coalesce(jsonb_object_agg(item_key, qty), '{}'::jsonb) into v_items
    from public.player_items
    where user_id = p_user and item_key in ('wish_normal', 'wish_rare', 'wish_limited', 'stardust', 'makeup_card');

  return jsonb_build_object(
    'today', v_today,
    'luck', v_luck->'luck', 'streak', v_luck->'streak', 'checked', v_luck->'checked', 'n', v_luck->'n',
    'bonus', w.luck_bonus, 'big_date', w.big_date,
    'free_total', 1 + (case when w.owned ? 'p_owl' then 1 else 0 end),
    'free_used', case when w.free_date = v_today then w.free_used else 0 end,
    'rare_n', w.rare_n, 'limited_n', w.limited_n,
    'owned', w.owned, 'items', v_items,
    'month', v_month, 'has_theme', (cat->'months') ? v_month,
    'theme', coalesce(cat->'months'->v_month, cat->'default'),
    'days_left', ((date_trunc('month', v_today) + interval '1 month')::date - v_today),
    'observed', coalesce(w.observe_date = v_today, false));
end;
$function$;


create or replace function public.farm_wish_status()
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  w public.farm_wish%rowtype;
  v_luck jsonb;
  v_streak integer;
  v_first date;
  v_new jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  insert into public.farm_wish (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into w from public.farm_wish where user_id = v_user for update;

  /* 連續簽到里程碑：14 天補簽卡（每一段連續只發一次）、30 天和 100 天稱號、365 天年輪神木 */
  v_luck := public.farm_wish_luck(v_user, w.big_date, w.luck_bonus);
  v_streak := (v_luck->>'streak')::integer;
  v_first := (v_luck->>'first')::date;

  if v_streak >= 14 and v_first is not null then
    if public.grant_item(v_user, 'makeup_card', 1, 'farm-ms14:' || v_first) then v_new := v_new || '"makeupcard"'::jsonb; end if;
  end if;
  if v_streak >= 30 and not (w.owned ? 't_diligent') then
    w.owned := w.owned || '{"t_diligent": 1}'::jsonb; v_new := v_new || '"t_diligent"'::jsonb;
  end if;
  if v_streak >= 100 and not (w.owned ? 't_hundred') then
    w.owned := w.owned || '{"t_hundred": 1}'::jsonb; v_new := v_new || '"t_hundred"'::jsonb;
  end if;
  if v_streak >= 365 and not (w.owned ? 'f_ancienttree') then
    w.owned := w.owned || '{"f_ancienttree": 1}'::jsonb; v_new := v_new || '"f_ancienttree"'::jsonb;
  end if;

  if jsonb_array_length(v_new) > 0 then
    update public.farm_wish set owned = w.owned, updated_at = now() where user_id = v_user;
  end if;

  return public.farm_wish_status_of(v_user) || jsonb_build_object('milestones', v_new);
end;
$function$;


-- ---------- 🎰 抽獎：free（每日免費，要先簽到）／ wish_normal ／ wish_rare ／ wish_limited ----------
create or replace function public.farm_wish_draw(p_pool text, p_count integer default 1)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  cat jsonb := public.farm_wish_catalog();
  w public.farm_wish%rowtype;
  v_theme jsonb;
  v_qty integer;
  v_allow integer;
  v_luck jsonb;
  i integer;
  k numeric;
  r numeric;
  ps numeric; px numeric; pl numeric; pr numeric;
  v_n integer;
  v_tier text;
  v_key text;
  v_kind text;
  arr jsonb;
  v_unique boolean;
  v_dup boolean;
  v_dust integer;
  v_amount integer;
  v_big boolean;
  v_any boolean := false;
  v_total_dust integer := 0;
  v_id bigint;
  v_results jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_pool not in ('free', 'wish_normal', 'wish_rare', 'wish_limited') then raise exception '沒有這個獎池'; end if;
  if p_count is null or p_count < 1 or p_count > 10 then raise exception '一次最多抽 10 次'; end if;

  insert into public.farm_wish (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into w from public.farm_wish where user_id = v_user for update;

  v_theme := coalesce(cat->'months'->to_char(v_today, 'YYYY-MM'), cat->'default');

  if p_pool = 'free' then
    if not exists (select 1 from public.checkins where user_id = v_user and checkin_date = v_today) then
      raise exception '今天還沒簽到：先簽到才能免費抽';
    end if;
    if w.free_date is distinct from v_today then
      w.free_used := 0;
      w.free_date := v_today;
    end if;
    v_allow := 1 + (case when w.owned ? 'p_owl' then 1 else 0 end);
    if w.free_used + p_count > v_allow then raise exception '今天的免費抽用完了'; end if;
    w.free_used := w.free_used + p_count;
  else
    select qty into v_qty from public.player_items where user_id = v_user and item_key = p_pool for update;
    if coalesce(v_qty, 0) < p_count then raise exception '星願瓶不夠'; end if;
    update public.player_items set qty = qty - p_count, updated_at = now() where user_id = v_user and item_key = p_pool;
    insert into public.item_events (user_id, item_key, delta, source_key)
      values (v_user, p_pool, -p_count, 'farm-wish:' || gen_random_uuid());
  end if;

  for i in 1..p_count loop

    r := random() * 100;

    if p_pool in ('free', 'wish_normal') then
      /* 幸運值每 1 點：珍 +1%、華 +0.5%、仙 +0.1%，從凡品扣 */
      v_luck := public.farm_wish_luck(v_user, w.big_date, w.luck_bonus);
      k := (v_luck->>'luck')::integer - 1;
      ps := 0.1 + 0.1 * k; px := 0.9 + 0.5 * k; pl := 5 + k; pr := 24;
      v_tier := case when r < ps then 's' when r < ps + px then 'x' when r < ps + px + pl then 'l' when r < ps + px + pl + pr then 'r' else 'c' end;
      /* 一次開十個普通瓶，至少一個普品以上 */
      if p_pool = 'wish_normal' and p_count = 10 and i = 10 and not v_any and v_tier = 'c' then v_tier := 'r'; end if;
      arr := cat->'tiers'->v_tier;
    elsif p_pool = 'wish_rare' then
      /* 每開一瓶沒中大獎：華 +1.5%、仙 +0.5%，從普品扣；第 20 瓶一定中 */
      v_n := w.rare_n;
      if v_n >= 20 then
        v_tier := case when r < 25 then 's' else 'x' end;
      else
        ps := 3 + 0.5 * (v_n - 1); px := 12 + 1.5 * (v_n - 1); pl := 35;
        v_tier := case when r < ps then 's' when r < ps + px then 'x' when r < ps + px + pl then 'l' else 'r' end;
      end if;
      arr := cat->'tiers'->v_tier;
    else
      /* 每開一瓶沒中主角：仙 +5%，從珍品扣；第 10 瓶一定中 */
      v_n := w.limited_n;
      if v_n >= 10 then
        v_tier := 's';
      else
        ps := 15 + 5 * (v_n - 1); px := 35;
        v_tier := case when r < ps then 's' when r < ps + px then 'x' else 'l' end;
      end if;
      arr := v_theme->v_tier;
    end if;

    if v_tier <> 'c' then v_any := true; end if;

    v_key := arr->>(floor(random() * jsonb_array_length(arr)))::integer;
    v_kind := cat->'kind'->>v_key;
    v_unique := exists (select 1 from jsonb_array_elements_text(cat->'unique') p(x) where left(v_key, length(p.x)) = p.x);
    v_dup := false;
    v_dust := 0;
    v_amount := null;

    if v_unique then
      if w.owned ? v_key then
        v_dup := true;
        v_dust := (cat->'dust'->>v_tier)::integer;
      else
        w.owned := w.owned || jsonb_build_object(v_key, 1);
      end if;
    elsif v_kind in ('crop', 'tree') then
      if not (w.owned ? v_key) then w.owned := w.owned || jsonb_build_object(v_key, 1); end if;
    elsif v_kind = 'deco' then
      w.owned := w.owned || jsonb_build_object(v_key, coalesce((w.owned->>v_key)::integer, 0) + 1);
    elsif v_kind = 'dust' then
      v_dust := (cat->'dustq'->>v_key)::integer;
    elsif v_kind = 'luck' then
      w.luck_bonus := w.luck_bonus + (cat->'luck'->>v_key)::integer;
    elsif v_kind = 'dew' then
      v_amount := (cat->'dew'->v_key->>0)::integer
        + floor(random() * ((cat->'dew'->v_key->>1)::integer - (cat->'dew'->v_key->>0)::integer + 1))::integer;
    elsif v_kind = 'bottle' then
      perform public.grant_item(v_user, cat->'bottle'->>v_key, 1, 'farm-wish:' || gen_random_uuid());
    elsif v_kind = 'makeup' then
      perform public.grant_item(v_user, 'makeup_card', 1, 'farm-wish:' || gen_random_uuid());
    end if;

    v_big := false;
    if p_pool in ('free', 'wish_normal') then
      if v_tier in ('x', 's') then w.big_date := v_today; w.luck_bonus := 0; v_big := true; end if;
    elsif p_pool = 'wish_rare' then
      if v_tier in ('x', 's') then w.rare_n := 1; v_big := true; else w.rare_n := w.rare_n + 1; end if;
    else
      if v_tier = 's' then w.limited_n := 1; v_big := true; else w.limited_n := w.limited_n + 1; end if;
    end if;

    v_total_dust := v_total_dust + v_dust;

    insert into public.farm_wish_log (user_id, pool, tier, reward, dup, dust, amount)
      values (v_user, p_pool, v_tier, v_key, v_dup, v_dust, v_amount)
      returning id into v_id;

    v_results := v_results || jsonb_build_object('id', v_id, 'tier', v_tier, 'key', v_key, 'dup', v_dup,
      'dust', v_dust, 'amount', v_amount, 'big', v_big);

  end loop;

  if v_total_dust > 0 then
    perform public.grant_item(v_user, 'stardust', v_total_dust, 'farm-wish:' || gen_random_uuid());
  end if;

  update public.farm_wish set
    luck_bonus = w.luck_bonus, big_date = w.big_date, rare_n = w.rare_n, limited_n = w.limited_n,
    free_date = w.free_date, free_used = w.free_used, owned = w.owned, updated_at = now()
    where user_id = v_user;

  return jsonb_build_object('results', v_results, 'status', public.farm_wish_status_of(v_user));
end;
$function$;


-- ---------- 🛒 星屑商店 ----------
-- p_item：wish_normal / wish_rare / wish_limited / makeupcard / page
--         pick:<獎項>（指定一個普品以上，或過期的每月限定）／ yarn:<家具>（用毛線換，不花星屑）
create or replace function public.farm_wish_buy(p_item text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_month text := to_char(public.app_today(), 'YYYY-MM');
  cat jsonb := public.farm_wish_catalog();
  w public.farm_wish%rowtype;
  v_key text := p_item;
  v_tier text;
  v_kind text;
  v_price integer;
  v_have integer;
  v_unique boolean;
  v_found boolean := false;
  v_m text;
  v_id bigint;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  insert into public.farm_wish (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into w from public.farm_wish where user_id = v_user for update;

  if p_item in ('wish_normal', 'wish_rare', 'wish_limited', 'makeupcard', 'page') then
    v_price := (cat->'shop'->>p_item)::integer;
    v_tier := 'c';
  elsif p_item like 'pick:%' then
    v_key := substr(p_item, 6);
    v_tier := cat->'tier'->>v_key;
    if v_tier is null then raise exception '沒有這個東西'; end if;
    if (cat->'tiers'->v_tier) ? v_key then
      v_price := (cat->'pick'->>v_tier)::integer;
    else
      for v_m in select jsonb_object_keys(cat->'months') loop
        if v_m < v_month and ((cat->'months'->v_m->'s') ? v_key or (cat->'months'->v_m->'x') ? v_key or (cat->'months'->v_m->'l') ? v_key) then
          v_found := true;
        end if;
      end loop;
      if not v_found then raise exception '這個現在還不能換'; end if;
      v_price := (cat->'expired'->>v_tier)::integer;
    end if;
    if v_price is null then raise exception '這個不能換'; end if;
  elsif p_item like 'yarn:%' then
    v_key := substr(p_item, 6);
    if not ((cat->'yarn') ? v_key) then raise exception '不能用毛線換這個'; end if;
    v_tier := cat->'tier'->>v_key;
    v_price := 0;
  else
    raise exception '沒有這個商品';
  end if;

  v_unique := exists (select 1 from jsonb_array_elements_text(cat->'unique') p(x) where left(v_key, length(p.x)) = p.x);
  if v_unique and w.owned ? v_key then raise exception '已經有了'; end if;

  if v_price > 0 then
    select qty into v_have from public.player_items where user_id = v_user and item_key = 'stardust' for update;
    if coalesce(v_have, 0) < v_price then
      raise exception '星屑不夠：需要 %，你有 %', v_price, coalesce(v_have, 0);
    end if;
    update public.player_items set qty = qty - v_price, updated_at = now() where user_id = v_user and item_key = 'stardust';
    insert into public.item_events (user_id, item_key, delta, source_key)
      values (v_user, 'stardust', -v_price, 'farm-shop:' || gen_random_uuid());
  end if;

  if p_item in ('wish_normal', 'wish_rare', 'wish_limited') then
    perform public.grant_item(v_user, p_item, 1, 'farm-shop:' || gen_random_uuid());
  elsif p_item = 'makeupcard' then
    perform public.grant_item(v_user, 'makeup_card', 1, 'farm-shop:' || gen_random_uuid());
  elsif p_item <> 'page' then
    v_kind := cat->'kind'->>v_key;
    if v_unique or v_kind in ('crop', 'tree') then
      w.owned := w.owned || jsonb_build_object(v_key, 1);
    elsif v_kind = 'deco' then
      w.owned := w.owned || jsonb_build_object(v_key, coalesce((w.owned->>v_key)::integer, 0) + 1);
    elsif v_kind = 'bottle' then
      perform public.grant_item(v_user, cat->'bottle'->>v_key, 1, 'farm-shop:' || gen_random_uuid());
    elsif v_kind = 'makeup' then
      perform public.grant_item(v_user, 'makeup_card', 1, 'farm-shop:' || gen_random_uuid());
    end if;
    update public.farm_wish set owned = w.owned, updated_at = now() where user_id = v_user;
  end if;

  insert into public.farm_wish_log (user_id, pool, tier, reward, dup, dust)
    values (v_user, 'shop', v_tier, v_key, false, -v_price)
    returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'key', v_key, 'tier', v_tier, 'price', v_price,
    'status', public.farm_wish_status_of(v_user));
end;
$function$;


-- ---------- 🔭 星空瞭望台：每天看一次流星，普通池幸運值 +1 ----------
create or replace function public.farm_wish_observe()
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  w public.farm_wish%rowtype;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select * into w from public.farm_wish where user_id = v_user for update;
  if not found or coalesce((w.owned->>'f_observatory')::integer, 0) < 1 then raise exception '還沒有星空瞭望台'; end if;
  if w.observe_date = v_today then raise exception '今天已經看過流星了'; end if;
  update public.farm_wish set observe_date = v_today, luck_bonus = luck_bonus + 1, updated_at = now() where user_id = v_user;
  return public.farm_wish_status_of(v_user);
end;
$function$;


-- ---------- 🎫 補簽卡：免費補簽這個月的一天（連續天數和幸運值一起接回） ----------
create or replace function public.farm_wish_makeup(p_date date)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_start date := date_trunc('month', public.app_today())::date;
  v_qty integer;
  v_prev integer;
  v_streak integer;
  v_day date;
  v_month json;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_date is null or p_date >= v_today then raise exception '只能補簽今天以前的日子'; end if;
  if p_date < v_start then raise exception '只能補簽這個月的日子'; end if;

  perform 1 from public.profiles where id = v_user for update;

  if exists (select 1 from public.checkins where user_id = v_user and checkin_date = p_date) then
    raise exception '這天已經簽到過了';
  end if;

  select qty into v_qty from public.player_items where user_id = v_user and item_key = 'makeup_card' for update;
  if coalesce(v_qty, 0) < 1 then raise exception '沒有補簽卡'; end if;

  update public.player_items set qty = qty - 1, updated_at = now() where user_id = v_user and item_key = 'makeup_card';
  insert into public.item_events (user_id, item_key, delta, source_key)
    values (v_user, 'makeup_card', -1, 'farm-makeup:' || p_date || ':' || gen_random_uuid());

  select streak into v_prev from public.checkins where user_id = v_user and checkin_date = p_date - 1;
  v_streak := coalesce(v_prev, 0) + 1;

  insert into public.checkins (user_id, checkin_date, streak, crit, crit_chance, exp, gold, is_makeup, cost)
    values (v_user, p_date, v_streak, false, 0, 0, 0, true, 0);

  v_day := p_date + 1;
  loop
    update public.checkins set streak = v_streak + 1 where user_id = v_user and checkin_date = v_day;
    exit when not found;
    v_streak := v_streak + 1;
    v_day := v_day + 1;
  end loop;

  v_month := public.checkin_month_bonus(v_user, p_date);

  return jsonb_build_object('ok', true, 'month', v_month, 'status', public.farm_wish_status_of(v_user));
end;
$function$;


revoke all on function public.farm_wish_catalog() from public, anon, authenticated;
revoke all on function public.farm_wish_luck(uuid, date, integer) from public, anon, authenticated;
revoke all on function public.farm_wish_status_of(uuid) from public, anon, authenticated;
revoke all on function public.farm_wish_status() from public, anon;
revoke all on function public.farm_wish_draw(text, integer) from public, anon;
revoke all on function public.farm_wish_buy(text) from public, anon;
revoke all on function public.farm_wish_observe() from public, anon;
revoke all on function public.farm_wish_makeup(date) from public, anon;
grant execute on function public.farm_wish_status() to authenticated;
grant execute on function public.farm_wish_draw(text, integer) to authenticated;
grant execute on function public.farm_wish_buy(text) to authenticated;
grant execute on function public.farm_wish_observe() to authenticated;
grant execute on function public.farm_wish_makeup(date) to authenticated;


-- =========================================================
-- 📈 累積（各科時數＋健康）
-- =========================================================

-- ---------- 💧 喝水（按一下記一筆：水壺 750、馬克杯 250） ----------
create table if not exists public.water_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null default (public.app_today()),
  ml integer not null check (ml > 0 and ml <= 3000),
  created_at timestamptz not null default now()
);

create index if not exists water_logs_user_date on public.water_logs (user_id, log_date);


-- ---------- 🏃 運動（種類＋分鐘） ----------
create table if not exists public.exercise_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null default (public.app_today()),
  kind text not null check (char_length(kind) between 1 and 20),
  minutes integer not null check (minutes > 0 and minutes <= 600),
  created_at timestamptz not null default now()
);

create index if not exists exercise_logs_user_date on public.exercise_logs (user_id, log_date);


-- ---------- 🍱 三餐：有沒有蔬菜、蛋白質 ----------
alter table public.meal_logs
  add column if not exists has_veg boolean not null default false,
  add column if not exists has_protein boolean not null default false;


-- ---------- ⏱️ 專注：這次完成了什麼（選填） ----------
alter table public.focus_sessions
  add column if not exists note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'focus_sessions_note_len') then
    alter table public.focus_sessions
      add constraint focus_sessions_note_len check (note is null or char_length(note) <= 200);
  end if;
end $$;


-- ---------- ⚙️ 累積規則（幾分鐘加一點、幾點升一級、每天目標） ----------
alter table public.user_settings
  add column if not exists accum jsonb not null default '{}'::jsonb;


-- ---------- 💧🏃 不能記未來的日子 ----------
create or replace function public.health_log_rules()
returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if new.log_date > public.app_today() then
    raise exception '不能記錄未來的日子';
  end if;
  return new;
end;
$function$;

drop trigger if exists water_log_rules on public.water_logs;
create trigger water_log_rules before insert or update on public.water_logs
  for each row execute function public.health_log_rules();

drop trigger if exists exercise_log_rules on public.exercise_logs;
create trigger exercise_log_rules before insert or update on public.exercise_logs
  for each row execute function public.health_log_rules();


-- ---------- 🔒 門鎖：本人可以看 / 新增 / 修改 / 刪除 ----------
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['water_logs', 'exercise_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p, t);
    end loop;
    execute format('create policy "own select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "own insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "own update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "own delete" on public.%I for delete using (auth.uid() = user_id)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;


-- ---------- 讓網站馬上看到新的表 ----------
notify pgrst, 'reload schema';


-- ---------- ✅ 檢查結果（顯示在下方） ----------
select coalesce(string_agg(missing, '、'), '✅ 全部設定完成') as 檢查結果
from (
  select '缺少表 ' || t as missing
  from unnest(array['daily_reports', 'morning_items', 'morning_checkins', 'focus_sessions', 'ideas',
                    'goals', 'mainlines', 'countdowns', 'reward_events', 'habits', 'habit_logs',
                    'user_settings', 'sleep_logs', 'meal_logs', 'task_categories', 'fortune_draws',
                    'checkins', 'daily_reflections', 'player_items', 'item_events', 'farm_saves',
                    'farm_wish', 'farm_wish_log', 'water_logs', 'exercise_logs']) t
  where to_regclass('public.' || t) is null
  union all
  select '缺少欄位 daily_reports.' || c
  from unnest(array['bonus_exp', 'mainline_title', 'habits_done', 'focus_seconds', 'ideas_added',
                    'wake_time', 'sleep_minutes', 'meals_count', 'meal_cost', 'fortune_level']) c
  where not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'daily_reports' and column_name = c)
  union all
  select '缺少欄位 ' || x
  from unnest(array['meal_logs.has_veg', 'meal_logs.has_protein', 'focus_sessions.note', 'user_settings.accum']) x
  where not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = split_part(x, '.', 1) and column_name = split_part(x, '.', 2))
  union all
  select '缺少欄位 user_settings.game_mode'
  where not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'user_settings' and column_name = 'game_mode')
  union all
  select '缺少函式 ' || f
  from unnest(array['uncomplete_task', 'carry_over_tasks', 'apply_reward', 'set_reward',
                    'sync_morning_reward', 'sync_focus_reward', 'complete_mainline',
                    'uncomplete_mainline', 'sync_habit_reward', 'sync_sleep_reward', 'draw_fortune',
                    'generate_daily_tasks', 'complete_task', 'daily_checkin', 'makeup_checkin',
                    'checkin_month_bonus', 'app_today', 'grant_item', 'checkin_ticket_rewards',
                    'farm_save', 'farm_open_wish', 'farm_claim_levels',
                    'farm_wish_catalog', 'farm_wish_luck', 'farm_wish_status_of', 'farm_wish_status', 'farm_wish_draw', 'farm_wish_buy', 'farm_wish_observe', 'farm_wish_makeup']) f
  where not exists (select 1 from pg_proc where proname = f and pronamespace = 'public'::regnamespace)
) x;
