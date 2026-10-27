-- =========================================================
-- 🎯 專案：等級、經驗、連擊、爆擊＋簽到幸運抽
-- 需要先跑過：2026-10-16_簽到發券與背包.sql（grant_item）、2026-10-16_2點換日_補簽_反省.sql（checkins、app_today）
-- 可以重複執行。
--
--   每個步驟第一次打勾：10 EXP × 連擊加成（每天 +5%，最多 +50%）
--     爆擊 10%：×2　超級爆擊 2%：×5
--   每次打勾 5 星屑（爆擊 10、超級爆擊 25）
--   專案升級：第 L 級升到 L+1 要 50×L EXP；升級給 20×L 星屑，每 5 級加召喚券＋星願瓶
--   完成專案：額外 EXP＋依步驟數給獎勵（每天前 10 個完成有物品獎勵）
--   連擊：每天至少完成一個步驟就 +1，斷一天歸零（凌晨 2 點換日）
--   幸運抽：每天簽到後抽一次，可能什麼都沒有，也可能中限定券
--
--   兩種專案：
--     任務制（once）：步驟打完就能「完成專案」
--     每日重複（daily）：步驟每天重來；當天全部打勾再加 20 EXP＋星屑；每天的紀錄存在 project_step_logs
-- =========================================================

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  done_def text not null default '' check (char_length(done_def) <= 200),
  status text not null default 'active' check (status in ('active', 'done')),
  xp integer not null default 0,
  level integer not null default 1,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.project_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  done boolean not null default false,
  done_at timestamptz,
  xp_given boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists project_steps_project_idx on public.project_steps(project_id);

alter table public.projects add column if not exists kind text not null default 'once';
do $$ begin
  alter table public.projects add constraint projects_kind_check check (kind in ('once', 'daily'));
exception when duplicate_object then null; end $$;

-- 每日重複專案：每個步驟每天一筆
create table if not exists public.project_step_logs (
  step_id uuid not null references public.project_steps(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  done boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (step_id, day)
);
create index if not exists project_step_logs_user_day on public.project_step_logs(user_id, day);

create table if not exists public.project_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  combo integer not null default 0,
  best_combo integer not null default 0,
  last_day date,
  total_xp integer not null default 0,
  crits integer not null default 0,
  done_count integer not null default 0
);

create table if not exists public.project_draws (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  result jsonb not null,
  primary key (user_id, day)
);

alter table public.projects enable row level security;
alter table public.project_steps enable row level security;
alter table public.project_stats enable row level security;
alter table public.project_draws enable row level security;
alter table public.project_step_logs enable row level security;
drop policy if exists "project_step_logs_read" on public.project_step_logs;
create policy "project_step_logs_read" on public.project_step_logs for select using (user_id = auth.uid());
grant select on public.project_step_logs to authenticated;

drop policy if exists "projects_own" on public.projects;
create policy "projects_own" on public.projects for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "project_steps_own" on public.project_steps;
create policy "project_steps_own" on public.project_steps for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid() and p.status = 'active'));
drop policy if exists "project_stats_read" on public.project_stats;
create policy "project_stats_read" on public.project_stats for select using (user_id = auth.uid());
drop policy if exists "project_draws_read" on public.project_draws;
create policy "project_draws_read" on public.project_draws for select using (user_id = auth.uid());

-- 經驗、等級、狀態只能由下面的函式改
revoke insert, update on public.projects from authenticated, anon;
grant select, delete on public.projects to authenticated;
grant insert (title, done_def, sort, kind) on public.projects to authenticated;
grant update (title, done_def, sort) on public.projects to authenticated;
revoke insert, update on public.project_steps from authenticated, anon;
grant select, delete on public.project_steps to authenticated;
grant insert (project_id, title, sort) on public.project_steps to authenticated;
grant update (title, sort) on public.project_steps to authenticated;
grant select on public.project_stats, public.project_draws to authenticated;

-- 給專案加經驗並處理升級獎勵（內部用）
create or replace function public.project_add_xp(p_user uuid, p_project uuid, p_xp integer)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_xp integer; v_lv integer; v_old integer;
  ups jsonb := '[]'::jsonb;
  src text;
begin
  update public.projects set xp = xp + p_xp where id = p_project and user_id = p_user
    returning xp, level into v_xp, v_lv;
  v_old := v_lv;
  -- 第 L 級 → L+1 需要 50×L；累計門檻 = 25×L×(L+1)
  while v_xp >= 25 * v_lv * (v_lv + 1) and v_lv < 99 loop
    v_lv := v_lv + 1;
    src := 'proj-lv:' || p_project || ':' || v_lv;
    perform public.grant_item(p_user, 'stardust', 20 * v_lv, src);
    if v_lv % 5 = 0 then
      perform public.grant_item(p_user, 'ticket_normal', 1, src);
      perform public.grant_item(p_user, 'wish_normal', 1, src);
    end if;
    ups := ups || jsonb_build_object('level', v_lv, 'stardust', 20 * v_lv, 'bonus', v_lv % 5 = 0);
  end loop;
  if v_lv <> v_old then update public.projects set level = v_lv where id = p_project; end if;
  update public.project_stats set total_xp = total_xp + p_xp where user_id = p_user;
  return ups;
end;
$function$;
revoke all on function public.project_add_xp(uuid, uuid, integer) from public, authenticated, anon;

-- 一個步驟第一次打勾的經驗：連擊、爆擊、升級（內部用）
create or replace function public.project_award_step(p_user uuid, p_project uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  today date := public.app_today();
  st public.project_stats%rowtype;
  r double precision;
  crit text := null;
  mult numeric;
  gain integer;
begin
  insert into public.project_stats (user_id) values (p_user) on conflict do nothing;
  select * into st from public.project_stats where user_id = p_user for update;
  if st.last_day is distinct from today then
    st.combo := case when st.last_day = today - 1 then st.combo + 1 else 1 end;
    update public.project_stats
      set combo = st.combo, best_combo = greatest(best_combo, st.combo), last_day = today
      where user_id = p_user;
  end if;

  mult := 1 + least(st.combo - 1, 10) * 0.05;
  r := random();
  if r < 0.02 then crit := 'super'; mult := mult * 5;
  elsif r < 0.12 then crit := 'crit'; mult := mult * 2;
  end if;
  gain := round(10 * mult);
  if crit is not null then update public.project_stats set crits = crits + 1 where user_id = p_user; end if;

  return jsonb_build_object('done', true, 'xp', gain, 'crit', crit, 'combo', st.combo,
                            'levelUps', public.project_add_xp(p_user, p_project, gain));
end;
$function$;
revoke all on function public.project_award_step(uuid, uuid) from public, authenticated, anon;

-- 每次打勾的星屑：5，爆擊 ×2、超級爆擊 ×5（內部用）
create or replace function public.project_step_dust(p_user uuid, p_step uuid, p_day date, p_crit text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare d integer := case p_crit when 'super' then 25 when 'crit' then 10 else 5 end;
begin
  if public.grant_item(p_user, 'stardust', d, 'proj-step:' || p_step || ':' || p_day) then
    return jsonb_build_object('stardust', d);
  end if;
  return '{}'::jsonb;
end;
$function$;
revoke all on function public.project_step_dust(uuid, uuid, date, text) from public, authenticated, anon;

-- 打勾／取消打勾（任務制改步驟本身；每日重複改今天的紀錄）
create or replace function public.project_step_toggle(p_step uuid)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
  s public.project_steps%rowtype;
  pr public.projects%rowtype;
  lg public.project_step_logs%rowtype;
  res jsonb;
  total integer; done_n integer;
  ups jsonb;
  dust integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into s from public.project_steps where id = p_step and user_id = u for update;
  if not found then raise exception '找不到這個步驟'; end if;
  select * into pr from public.projects where id = s.project_id;
  if pr.status = 'done' then raise exception '專案已完成，步驟不能再改'; end if;

  if pr.kind = 'daily' then
    select * into lg from public.project_step_logs where step_id = p_step and day = today;
    if found then
      update public.project_step_logs set done = not lg.done where step_id = p_step and day = today;
      return json_build_object('done', not lg.done, 'xp', 0, 'repeat', not lg.done);
    end if;
    insert into public.project_step_logs (step_id, project_id, user_id, day) values (p_step, pr.id, u, today);
    res := public.project_award_step(u, pr.id);
    res := res || public.project_step_dust(u, p_step, today, res->>'crit');

    -- 今天全部打勾：一天一次的全勤獎勵
    select count(*), count(*) filter (where l.done) into total, done_n
      from public.project_steps ps
      left join public.project_step_logs l on l.step_id = ps.id and l.day = today
      where ps.project_id = pr.id;
    dust := 15 + 5 * total;
    if total > 0 and done_n = total
       and public.grant_item(u, 'stardust', dust, 'proj-day:' || pr.id || ':' || today) then
      ups := public.project_add_xp(u, pr.id, 20);
      res := res || jsonb_build_object('dayClear', jsonb_build_object('xp', 20, 'stardust', dust),
                                       'levelUps', (res->'levelUps') || ups);
    end if;
    return res::json;
  end if;

  if s.done then
    update public.project_steps set done = false, done_at = null where id = p_step;
    return json_build_object('done', false, 'xp', 0);
  end if;
  update public.project_steps set done = true, done_at = now(), xp_given = true where id = p_step;
  if s.xp_given then
    return json_build_object('done', true, 'xp', 0, 'repeat', true);
  end if;
  res := public.project_award_step(u, pr.id);
  return (res || public.project_step_dust(u, p_step, today, res->>'crit'))::json;
end;
$function$;
grant execute on function public.project_step_toggle(uuid) to authenticated;

-- 完成專案
create or replace function public.project_complete(p_project uuid)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
  p public.projects%rowtype;
  n integer; left_n integer;
  bonus integer;
  ups jsonb;
  items jsonb := '[]'::jsonb;
  src text;
  today_done integer;
  dust integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into p from public.projects where id = p_project and user_id = u for update;
  if not found then raise exception '找不到這個專案'; end if;
  if p.status = 'done' then raise exception '這個專案已經完成了'; end if;
  if p.kind = 'daily' then raise exception '每日重複的專案不用完成，每天打勾就好'; end if;
  select count(*), count(*) filter (where not done) into n, left_n
    from public.project_steps where project_id = p_project;
  if left_n > 0 then raise exception '還有 % 個步驟沒完成', left_n; end if;

  select count(*) into today_done from public.projects
    where user_id = u and status = 'done'
      and (completed_at at time zone 'Asia/Taipei' - interval '2 hours')::date = today;

  update public.projects set status = 'done', completed_at = now() where id = p_project;
  insert into public.project_stats (user_id) values (u) on conflict do nothing;
  update public.project_stats set done_count = done_count + 1 where user_id = u;

  bonus := greatest(30, 20 * n);
  ups := public.project_add_xp(u, p_project, bonus);

  -- 物品獎勵：每天前 10 個完成的專案才有（避免灌專案）
  if today_done < 10 then
    src := 'proj-done:' || p_project;
    dust := 40 + 20 * n;
    perform public.grant_item(u, 'stardust', dust, src);
    items := items || jsonb_build_object('key', 'stardust', 'qty', dust);
    if n >= 3 then
      perform public.grant_item(u, 'ticket_normal', 1, src);
      perform public.grant_item(u, 'wish_normal', 1, src);
      items := items || jsonb_build_object('key', 'ticket_normal', 'qty', 1)
                     || jsonb_build_object('key', 'wish_normal', 'qty', 1);
    end if;
    if n >= 8 then
      perform public.grant_item(u, 'ticket_special', 1, src);
      perform public.grant_item(u, 'wish_rare', 1, src);
      items := items || jsonb_build_object('key', 'ticket_special', 'qty', 1)
                     || jsonb_build_object('key', 'wish_rare', 'qty', 1);
    end if;
    -- 驚喜：40% 多一張召喚券
    if random() < 0.4 then
      perform public.grant_item(u, 'ticket_normal', 1, src || ':lucky');
      items := items || jsonb_build_object('key', 'ticket_normal', 'qty', 1, 'lucky', true);
    end if;
  end if;

  return json_build_object('xp', bonus, 'levelUps', ups, 'items', items, 'capped', today_done >= 10);
end;
$function$;
grant execute on function public.project_complete(uuid) to authenticated;

-- 簽到後的幸運抽（每天一次，要先簽到）
create or replace function public.project_lucky_draw()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
  old jsonb;
  r double precision := random();
  k text; q integer := 1; tier text;
  res jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select result into old from public.project_draws where user_id = u and day = today;
  if found then return json_build_object('already', true, 'result', old); end if;
  if not exists (select 1 from public.checkins where user_id = u and checkin_date = today and not is_makeup) then
    return json_build_object('ready', false);
  end if;

  if r < 0.10 then k := null; tier := 'none';
  elsif r < 0.45 then k := 'stardust'; q := 30 + floor(random() * 51)::integer; tier := 'c';
  elsif r < 0.62 then k := 'wish_normal'; q := 2; tier := 'r';
  elsif r < 0.74 then k := 'ticket_normal'; q := 2; tier := 'r';
  elsif r < 0.80 then k := 'makeup_card'; tier := 'r';
  elsif r < 0.86 then k := 'stardust'; q := 150; tier := 'r';
  elsif r < 0.93 then k := 'wish_rare'; tier := 'x';
  elsif r < 0.97 then k := 'ticket_special'; tier := 'x';
  elsif r < 0.99 then k := 'wish_limited'; tier := 'x';
  else k := 'ticket_limited'; tier := 's';
  end if;

  if k is not null then perform public.grant_item(u, k, q, 'lucky:' || today); end if;
  if tier = 's' then
    perform public.grant_item(u, 'wish_limited', 1, 'lucky:' || today);
    perform public.grant_item(u, 'stardust', 300, 'lucky:' || today);
  end if;

  res := jsonb_build_object('tier', tier, 'key', k, 'qty', q);
  insert into public.project_draws (user_id, day, result) values (u, today, res);
  return json_build_object('ready', true, 'result', res);
end;
$function$;
grant execute on function public.project_lucky_draw() to authenticated;

-- ---------- 📅 補昨天的打卡（每日重複專案） ----------
-- 只能補「昨天」；補勾給 5 EXP（沒有爆擊、沒有全勤星屑），但會接回連擊和全勤紀錄
create or replace function public.project_step_makeup(p_step uuid)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  y date := public.app_today() - 1;
  s public.project_steps%rowtype;
  pr public.projects%rowtype;
  lg public.project_step_logs%rowtype;
  st public.project_stats%rowtype;
  ups jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into s from public.project_steps where id = p_step and user_id = u for update;
  if not found then raise exception '找不到這個項目'; end if;
  select * into pr from public.projects where id = s.project_id;
  if pr.kind <> 'daily' then raise exception '只有每日重複的專案可以補打卡'; end if;
  if (s.created_at at time zone 'Asia/Taipei' - interval '2 hours')::date > y then
    raise exception '這個項目是今天才加的，昨天不用補';
  end if;

  select * into lg from public.project_step_logs where step_id = p_step and day = y;
  if found then
    update public.project_step_logs set done = not lg.done where step_id = p_step and day = y;
    return json_build_object('done', not lg.done, 'xp', 0);
  end if;
  insert into public.project_step_logs (step_id, project_id, user_id, day) values (p_step, pr.id, u, y);

  -- 接回連擊：最後一次是前天 → 連到昨天
  insert into public.project_stats (user_id) values (u) on conflict do nothing;
  select * into st from public.project_stats where user_id = u for update;
  if st.last_day is null or st.last_day < y then
    st.combo := case when st.last_day = y - 1 then st.combo + 1 else 1 end;
    update public.project_stats
      set combo = st.combo, best_combo = greatest(best_combo, st.combo), last_day = y
      where user_id = u;
  elsif st.last_day = public.app_today() and st.combo = 1 then
    -- 今天已經勾過、連擊被重設為 1：補了昨天就接回前面的天數
    update public.project_stats set combo = combo + 1, best_combo = greatest(best_combo, combo + 1) where user_id = u;
  end if;

  ups := public.project_add_xp(u, pr.id, 5);
  perform public.grant_item(u, 'stardust', 3, 'proj-mk:' || p_step || ':' || y);
  return json_build_object('done', true, 'xp', 5, 'stardust', 3, 'levelUps', ups);
end;
$function$;
grant execute on function public.project_step_makeup(uuid) to authenticated;

-- ---------- 🗂️ 分類（只是分組顯示，每個專案還是各自獨立） ----------
alter table public.projects add column if not exists category text not null default '';
grant insert (category) on public.projects to authenticated;
grant update (category) on public.projects to authenticated;
