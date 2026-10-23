-- =========================================================
-- 📚 讀書與自律：知識卡、今日主線連擊、休息券、專注連擊、技能樹、一起專注房間、全服世界王
-- 需要先跑過：2026-10-23_小隊.sql、2026-10-23_遠征萬聖節日誌.sql、2026-10-23_成長系統.sql
-- 可以重複執行。
--
--   知識卡：專注完寫一句「學到什麼」；第 1、3、7、14、30、60 天提醒複習；記得就往下一階，忘了回到第 1 天
--     每複習記得一張 +1 星屑（一天最多 5 張，技能「讀書人」每級 +2 張）
--   今日主線連擊：完成主線那天 +2 星屑；連續 3/7/14/30 天各送寶箱（用休息券的那天也算有接上）
--   休息券：每月 2 張，補簽這個月之前沒簽到的一天（免費、不會讓之後的補簽變貴）
--   專注連擊：兩次專注（各 20 分鐘以上）中間休息不超過 10 分鐘就接上連擊，第 2 輪起每輪多拿星屑（最多 +3）
--   技能樹：每升 1 級拿 1 點技能點；6 種技能各 3 級；重置要 20 星屑
--   一起專注房間：用房間碼加入（最多 8 人）；跟房間裡的人同時專注（重疊一半以上），每輪 +2 星屑，3 人以上 +3
--   全服世界王：每月一隻，所有人打每週王的傷害也會打在牠身上；打倒後，有出過力的人都拿星光寶箱＋限定召喚券
-- =========================================================


-- ---------- 小工具：技能等級 ----------
create table if not exists public.skills (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill text not null,
  lv integer not null default 0 check (lv between 0 and 3),
  primary key (user_id, skill)
);
alter table public.skills enable row level security;
revoke all on public.skills from anon, authenticated;

create or replace function public.skill_lv(p_user uuid, p_skill text)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce((select lv from public.skills where user_id = p_user and skill = p_skill), 0)
$$;
revoke all on function public.skill_lv(uuid, text) from public, anon, authenticated;

create or replace function public.skill_catalog()
returns jsonb language sql immutable as $$
  select '[
    {"key":"might",   "branch":"戰鬥", "name":"蠻力",   "emoji":"💪", "desc":"出擊傷害 +5%／級"},
    {"key":"sharp",   "branch":"戰鬥", "name":"鋒利",   "emoji":"🗡️", "desc":"爆擊率 +3%／級"},
    {"key":"loot",    "branch":"戰鬥", "name":"尋寶者", "emoji":"🎁", "desc":"出擊掉寶箱機率 +5%／級"},
    {"key":"travel",  "branch":"探索", "name":"遠行者", "emoji":"🧭", "desc":"每趟專注遠征星屑 +1／級"},
    {"key":"combo",   "branch":"探索", "name":"連擊大師", "emoji":"⚡", "desc":"專注連擊每輪星屑 +1／級"},
    {"key":"scholar", "branch":"學習", "name":"讀書人", "emoji":"📖", "desc":"每天複習知識卡的星屑上限 +2 張／級"}
  ]'::jsonb
$$;

create or replace function public.skill_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_lv integer; v_spent integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select coalesce(level, 1) into v_lv from public.profiles where id = v_user;
  select coalesce(sum(lv), 0) into v_spent from public.skills where user_id = v_user;
  return json_build_object('catalog', public.skill_catalog(), 'level', coalesce(v_lv, 1), 'spent', v_spent,
    'points', greatest(coalesce(v_lv, 1) - v_spent, 0),
    'skills', coalesce((select json_object_agg(skill, lv) from public.skills where user_id = v_user), '{}'::json),
    'stardust', public.fun_qty(v_user, 'stardust'));
end;
$function$;
revoke all on function public.skill_status() from public, anon;
grant execute on function public.skill_status() to authenticated;

create or replace function public.skill_up(p_skill text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_lv integer; v_spent integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if not exists (select 1 from jsonb_array_elements(public.skill_catalog()) x where x->>'key' = p_skill) then raise exception '沒有這個技能'; end if;
  select coalesce(level, 1) into v_lv from public.profiles where id = v_user;
  select coalesce(sum(lv), 0) into v_spent from public.skills where user_id = v_user;
  if v_spent >= coalesce(v_lv, 1) then raise exception '技能點不夠，升級就會拿到新的點數'; end if;
  if public.skill_lv(v_user, p_skill) >= 3 then raise exception '這個技能已經滿級了'; end if;
  insert into public.skills (user_id, skill, lv) values (v_user, p_skill, 1)
    on conflict (user_id, skill) do update set lv = public.skills.lv + 1;
  return json_build_object('success', true, 'lv', public.skill_lv(v_user, p_skill));
end;
$function$;
revoke all on function public.skill_up(text) from public, anon;
grant execute on function public.skill_up(text) to authenticated;

create or replace function public.skill_reset()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if not exists (select 1 from public.skills where user_id = v_user and lv > 0) then raise exception '還沒有點任何技能'; end if;
  perform public.fun_take(v_user, 'stardust', 20, 'skill-reset:' || gen_random_uuid());
  delete from public.skills where user_id = v_user;
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.skill_reset() from public, anon;
grant execute on function public.skill_reset() to authenticated;


-- =========================================================
-- 🃏 知識卡
-- =========================================================
create table if not exists public.kcards (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id bigint references public.focus_sessions(id) on delete set null,
  subject text not null default '其他',
  question text,
  note text not null,
  step integer not null default 0,
  due date not null,
  reviews integer not null default 0,
  last_review date,
  created_at timestamptz not null default now()
);
create index if not exists kcards_user_due on public.kcards (user_id, due);
alter table public.kcards enable row level security;
revoke all on public.kcards from anon, authenticated;

create or replace function public.kcard_add(p_session bigint, p_subject text, p_question text, p_note text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_note text := left(trim(coalesce(p_note, '')), 500); v_subject text := left(trim(coalesce(p_subject, '')), 30);
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if v_note = '' then raise exception '寫下這次學到的重點'; end if;
  if p_session is not null and not exists (select 1 from public.focus_sessions where id = p_session and user_id = v_user) then
    raise exception '找不到這次專注';
  end if;
  if v_subject = '' and p_session is not null then select subject into v_subject from public.focus_sessions where id = p_session; end if;
  insert into public.kcards (user_id, session_id, subject, question, note, due)
    values (v_user, p_session, coalesce(nullif(v_subject, ''), '其他'), nullif(left(trim(coalesce(p_question, '')), 200), ''), v_note, public.app_today() + 1);
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.kcard_add(bigint, text, text, text) from public, anon;
grant execute on function public.kcard_add(bigint, text, text, text) to authenticated;

create or replace function public.kcard_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_today date := public.app_today();
begin
  if v_user is null then raise exception '尚未登入'; end if;
  return json_build_object(
    'today', v_today,
    'due', coalesce((select json_agg(x order by x.due, x.id) from (
              select id, subject, question, note, step, due, reviews, created_at from public.kcards
              where user_id = v_user and due <= v_today order by due, id limit 30) x), '[]'::json),
    'due_count', (select count(*) from public.kcards where user_id = v_user and due <= v_today),
    'total', (select count(*) from public.kcards where user_id = v_user),
    'mastered', (select count(*) from public.kcards where user_id = v_user and step >= 5),
    'subjects', coalesce((select json_agg(json_build_object('subject', subject, 'n', n) order by n desc) from (
              select subject, count(*) n from public.kcards where user_id = v_user group by subject) s), '[]'::json),
    'cards', coalesce((select json_agg(x order by x.created_at desc) from (
              select id, subject, question, note, step, due, reviews, created_at from public.kcards
              where user_id = v_user order by created_at desc limit 200) x), '[]'::json),
    'reviewed_today', (select count(*) from public.kcards where user_id = v_user and last_review = v_today),
    'reward_cap', 5 + 2 * public.skill_lv(v_user, 'scholar'),
    'rewarded_today', (select count(*) from public.item_events where user_id = v_user and source_key like 'kc:' || v_today || ':%'));
end;
$function$;
revoke all on function public.kcard_status() from public, anon;
grant execute on function public.kcard_status() to authenticated;

create or replace function public.kcard_review(p_id bigint, p_ok boolean)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid(); v_today date := public.app_today();
  k public.kcards%rowtype;
  gaps integer[] := array[1, 3, 7, 14, 30, 60];
  v_step integer;
  v_dust boolean := false;
begin
  select * into k from public.kcards where id = p_id and user_id = v_user for update;
  if not found then raise exception '找不到這張卡'; end if;
  v_step := case when p_ok then least(k.step + 1, 5) else 0 end;
  update public.kcards set step = v_step, due = v_today + gaps[v_step + 1], reviews = reviews + 1, last_review = v_today where id = p_id;
  if p_ok and (select count(*) from public.item_events where user_id = v_user and source_key like 'kc:' || v_today || ':%')
               < 5 + 2 * public.skill_lv(v_user, 'scholar') then
    v_dust := public.grant_item(v_user, 'stardust', 1, 'kc:' || v_today || ':' || p_id);
  end if;
  return json_build_object('success', true, 'step', v_step, 'next', v_today + gaps[v_step + 1], 'dust', v_dust);
end;
$function$;
revoke all on function public.kcard_review(bigint, boolean) from public, anon;
grant execute on function public.kcard_review(bigint, boolean) to authenticated;

create or replace function public.kcard_delete(p_id bigint)
returns json language plpgsql security definer set search_path to 'public'
as $function$
begin
  delete from public.kcards where id = p_id and user_id = auth.uid();
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.kcard_delete(bigint) from public, anon;
grant execute on function public.kcard_delete(bigint) to authenticated;


-- =========================================================
-- 🛌 休息券（每月 2 張，免費補簽）
-- =========================================================
create table if not exists public.rest_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.rest_days enable row level security;
revoke all on public.rest_days from anon, authenticated;

create or replace function public.rest_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_today date := public.app_today(); v_start date := date_trunc('month', public.app_today())::date;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  return json_build_object(
    'left', 2 - (select count(*) from public.rest_days where user_id = v_user and day >= v_start),
    'used', coalesce((select json_agg(day order by day) from public.rest_days where user_id = v_user and day >= v_start), '[]'::json),
    'missed', coalesce((select json_agg(d::date order by d) from generate_series(v_start, v_today - 1, interval '1 day') d
                        where not exists (select 1 from public.checkins where user_id = v_user and checkin_date = d::date)), '[]'::json));
end;
$function$;
revoke all on function public.rest_status() from public, anon;
grant execute on function public.rest_status() to authenticated;

create or replace function public.rest_use(p_date date)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_start date := date_trunc('month', public.app_today())::date;
  v_prev integer; v_streak integer; v_day date;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_date is null or p_date >= v_today or p_date < v_start then raise exception '只能用在這個月、今天以前沒簽到的日子'; end if;
  if (select count(*) from public.rest_days where user_id = v_user and day >= v_start) >= 2 then raise exception '這個月的休息券用完了'; end if;
  if exists (select 1 from public.checkins where user_id = v_user and checkin_date = p_date) then raise exception '這天已經簽到過了'; end if;

  insert into public.rest_days (user_id, day) values (v_user, p_date);
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
  perform public.checkin_month_bonus(v_user, p_date);
  return json_build_object('success', true, 'day', p_date, 'streak', v_streak);
end;
$function$;
revoke all on function public.rest_use(date) from public, anon;
grant execute on function public.rest_use(date) to authenticated;


-- =========================================================
-- 🎯 今日主線連擊
-- =========================================================
create or replace function public.mainline_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_today_done boolean;
  v_day date;
  v_streak integer := 0;
  v_run_start date;
  m integer;
  d record;
  v_new jsonb := '[]'::jsonb;
  v_r jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select coalesce(bool_or(completed), false) into v_today_done from public.mainlines where user_id = v_user and main_date = v_today;

  -- 從今天（沒完成就從昨天）往回數
  v_day := case when v_today_done then v_today else v_today - 1 end;
  loop
    exit when not (exists (select 1 from public.mainlines where user_id = v_user and main_date = v_day and completed)
                   or exists (select 1 from public.rest_days where user_id = v_user and day = v_day));
    v_streak := v_streak + 1;
    v_run_start := v_day;
    v_day := v_day - 1;
    exit when v_streak > 400;
  end loop;

  -- 最近 7 天完成主線：每天 +2 星屑
  for d in select main_date from public.mainlines where user_id = v_user and completed and main_date between v_today - 6 and v_today loop
    perform public.grant_item(v_user, 'stardust', 2, 'ml:' || d.main_date);
  end loop;

  -- 連擊里程碑（同一段連擊每個里程碑一次）
  foreach m in array array[3, 7, 14, 30] loop
    if v_streak >= m then
      v_r := case m when 3 then '{"chest_wood":1}'::jsonb when 7 then '{"chest_iron":1,"stardust":3}'::jsonb
                    when 14 then '{"chest_gold":1,"stardust":5}'::jsonb else '{"chest_star":1,"stardust":10}'::jsonb end;
      if public.grant_item(v_user, 'ml_mark', 1, 'ml-ms:' || v_run_start || ':' || m) then
        perform public.fun_give(v_user, v_r, 'ml-ms-r:' || v_run_start || ':' || m);
        v_new := v_new || jsonb_build_object('days', m, 'reward', v_r);
      end if;
    end if;
  end loop;

  return json_build_object('streak', v_streak, 'today_done', v_today_done,
    'today_set', exists (select 1 from public.mainlines where user_id = v_user and main_date = v_today),
    'new', v_new);
end;
$function$;
revoke all on function public.mainline_status() from public, anon;
grant execute on function public.mainline_status() to authenticated;


-- =========================================================
-- 📚 一起專注房間
-- =========================================================
create table if not exists public.focus_rooms (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.focus_room_members (
  room_id bigint not null references public.focus_rooms(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.focus_rooms enable row level security;
alter table public.focus_room_members enable row level security;
revoke all on public.focus_rooms from anon, authenticated;
revoke all on public.focus_room_members from anon, authenticated;

create or replace function public.room_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_room bigint; r public.focus_rooms%rowtype; v_today date := public.app_today();
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select room_id into v_room from public.focus_room_members where user_id = v_user;
  if v_room is null then return json_build_object('room', null, 'now', now()); end if;
  select * into r from public.focus_rooms where id = v_room;
  return json_build_object('now', now(),
    'room', json_build_object('id', r.id, 'code', r.code, 'name', r.name, 'owner', r.owner = v_user),
    'members', coalesce((select json_agg(json_build_object(
        'id', m.user_id, 'me', m.user_id = v_user, 'name', public.team_name_of(m.user_id),
        'class', h.class, 'frame', fp.frame, 'title', fp.title,
        'state', coalesce(p.status, 'idle'),
        'live_ms', case when p.status = 'running' then p.acc_ms + extract(epoch from (now() - p.seg_start)) * 1000
                        when p.status = 'paused' then p.acc_ms else 0 end,
        'today_min', (select coalesce(sum(duration_seconds), 0) / 60 from public.focus_sessions where user_id = m.user_id and session_date = v_today)
      ) order by m.joined_at)
      from public.focus_room_members m
      left join public.focus_presence p on p.user_id = m.user_id
      left join public.rpg_heroes h on h.user_id = m.user_id
      left join public.fun_profile fp on fp.user_id = m.user_id
      where m.room_id = v_room), '[]'::json));
end;
$function$;
revoke all on function public.room_status() from public, anon;
grant execute on function public.room_status() to authenticated;

create or replace function public.room_create(p_name text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_code text; v_id bigint;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if exists (select 1 from public.focus_room_members where user_id = v_user) then raise exception '你已經在一個房間裡了'; end if;
  loop
    v_code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from public.focus_rooms where code = v_code);
  end loop;
  insert into public.focus_rooms (code, name, owner) values (v_code, coalesce(nullif(left(trim(coalesce(p_name, '')), 16), ''), '自習室'), v_user)
    returning id into v_id;
  insert into public.focus_room_members (room_id, user_id) values (v_id, v_user);
  return json_build_object('success', true, 'code', v_code);
end;
$function$;
revoke all on function public.room_create(text) from public, anon;
grant execute on function public.room_create(text) to authenticated;

create or replace function public.room_join(p_code text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_id bigint;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if exists (select 1 from public.focus_room_members where user_id = v_user) then raise exception '你已經在一個房間裡了，先離開才能換'; end if;
  select id into v_id from public.focus_rooms where code = upper(trim(coalesce(p_code, '')));
  if v_id is null then raise exception '找不到這個房間碼'; end if;
  if (select count(*) from public.focus_room_members where room_id = v_id) >= 8 then raise exception '房間滿了（最多 8 人）'; end if;
  insert into public.focus_room_members (room_id, user_id) values (v_id, v_user);
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.room_join(text) from public, anon;
grant execute on function public.room_join(text) to authenticated;

create or replace function public.room_leave()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_room bigint; v_next uuid;
begin
  select room_id into v_room from public.focus_room_members where user_id = v_user;
  if v_room is null then raise exception '你不在房間裡'; end if;
  delete from public.focus_room_members where user_id = v_user;
  select user_id into v_next from public.focus_room_members where room_id = v_room order by joined_at limit 1;
  if v_next is null then delete from public.focus_rooms where id = v_room;
  else update public.focus_rooms set owner = v_next where id = v_room and owner = v_user; end if;
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.room_leave() from public, anon;
grant execute on function public.room_leave() to authenticated;


-- =========================================================
-- ⚡ 專注連擊＋房間一起專注的獎勵（結束專注後結算）
-- =========================================================
create or replace function public.focus_bonus_claim()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  s record;
  v_prev_end timestamptz := null;
  v_combo integer := 0;
  v_bonus integer;
  v_room bigint;
  v_others integer;
  v_out jsonb := '[]'::jsonb;
  v_lv integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  v_lv := public.skill_lv(v_user, 'combo');
  select room_id into v_room from public.focus_room_members where user_id = v_user;

  for s in select * from public.focus_sessions
           where user_id = v_user and session_date = v_today and not coalesce(is_manual, false) and duration_seconds >= 1200
           order by started_at loop
    v_combo := case when v_prev_end is not null and s.started_at - v_prev_end <= interval '10 minutes' then v_combo + 1 else 1 end;
    v_prev_end := s.ended_at;

    if v_combo >= 2 then
      v_bonus := least(v_combo - 1, 3) + v_lv;
      if public.grant_item(v_user, 'stardust', v_bonus, 'combo:' || s.id) then
        v_out := v_out || jsonb_build_object('kind', 'combo', 'combo', v_combo, 'dust', v_bonus);
      end if;
    end if;

    if v_room is not null then
      select count(distinct o.user_id) into v_others
        from public.focus_sessions o join public.focus_room_members m on m.user_id = o.user_id and m.room_id = v_room
        where o.user_id <> v_user and o.started_at < s.ended_at and o.ended_at > s.started_at
          and extract(epoch from (least(o.ended_at, s.ended_at) - greatest(o.started_at, s.started_at))) >= s.duration_seconds * 0.5;
      if v_others >= 1 and public.grant_item(v_user, 'stardust', case when v_others >= 2 then 3 else 2 end, 'room:' || s.id) then
        v_out := v_out || jsonb_build_object('kind', 'room', 'with', v_others, 'dust', case when v_others >= 2 then 3 else 2 end);
      end if;
    end if;
  end loop;

  return json_build_object('success', true, 'new', v_out, 'combo', v_combo, 'last_end', v_prev_end, 'now', now());
end;
$function$;
revoke all on function public.focus_bonus_claim() from public, anon;
grant execute on function public.focus_bonus_claim() to authenticated;


-- =========================================================
-- 🌍 全服世界王
-- =========================================================
create table if not exists public.world_bosses (
  month text primary key,           -- 'YYYY-MM'
  boss_key text not null,
  hp bigint not null,
  dmg bigint not null default 0,
  killed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.world_hits (
  month text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  dmg bigint not null default 0,
  hits integer not null default 0,
  primary key (month, user_id)
);
alter table public.world_bosses enable row level security;
alter table public.world_hits enable row level security;
revoke all on public.world_bosses from anon, authenticated;
revoke all on public.world_hits from anon, authenticated;

create or replace function public.world_catalog()
returns jsonb language sql immutable as $$
  select '[
    {"key":"world_chronos", "name":"時間吞噬者", "emoji":"⏳", "desc":"把每個人的「等一下」都吞進肚子裡，越吃越大。"},
    {"key":"world_void",    "name":"虛無巨獸",   "emoji":"🌑", "desc":"讓人覺得做什麼都沒意義的巨獸。大家一起行動，牠就會變小。"},
    {"key":"world_kraken",  "name":"惰性海怪",   "emoji":"🐙", "desc":"八隻觸手都在說「明天再開始」。"},
    {"key":"world_titan",   "name":"倦怠泰坦",   "emoji":"🗿", "desc":"巨大又沉重，只有所有冒險者一起才推得動。"}
  ]'::jsonb
$$;

create or replace function public.world_ensure()
returns public.world_bosses language plpgsql security definer set search_path to 'public'
as $function$
declare v_month text := to_char(public.app_today(), 'YYYY-MM'); w public.world_bosses%rowtype; v_n integer; c jsonb := public.world_catalog();
begin
  select * into w from public.world_bosses where month = v_month;
  if found then return w; end if;
  select count(*) into v_n from public.rpg_heroes where class is not null;
  insert into public.world_bosses (month, boss_key, hp)
    values (v_month, c->((extract(month from public.app_today())::int) % jsonb_array_length(c))->>'key', 15000 * greatest(v_n, 3))
    on conflict do nothing;
  select * into w from public.world_bosses where month = v_month;
  return w;
end;
$function$;
revoke all on function public.world_ensure() from public, anon, authenticated;

-- 打世界王（給 rpg_boss_attack 用）
create or replace function public.world_hit(p_user uuid, p_dmg integer)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare w public.world_bosses%rowtype; v_killed boolean := false;
begin
  perform public.world_ensure();
  select * into w from public.world_bosses where month = to_char(public.app_today(), 'YYYY-MM') for update;
  if w.killed_at is not null then return jsonb_build_object('dmg', 0); end if;
  update public.world_bosses set dmg = dmg + p_dmg, killed_at = case when dmg + p_dmg >= hp then now() else null end
    where month = w.month returning * into w;
  insert into public.world_hits (month, user_id, dmg, hits) values (w.month, p_user, p_dmg, 1)
    on conflict (month, user_id) do update set dmg = public.world_hits.dmg + p_dmg, hits = public.world_hits.hits + 1;
  if w.killed_at is not null then
    v_killed := true;
    perform public.feed_post(p_user, 'world', jsonb_build_object('boss', w.boss_key, 'month', w.month));
  end if;
  return jsonb_build_object('dmg', p_dmg, 'killed', v_killed);
end;
$function$;
revoke all on function public.world_hit(uuid, integer) from public, anon, authenticated;

create or replace function public.world_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); w public.world_bosses%rowtype; x record; v_new jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  w := public.world_ensure();
  -- 打倒過的月份：有出力的人領獎（每月一次）
  for x in select b.month from public.world_bosses b join public.world_hits h on h.month = b.month and h.user_id = v_user
           where b.killed_at is not null loop
    if public.grant_item(v_user, 'chest_star', 1, 'world:' || x.month) then
      perform public.grant_item(v_user, 'ticket_limited', 1, 'world-t:' || x.month);
      v_new := v_new || to_jsonb(x.month);
    end if;
  end loop;
  return json_build_object(
    'boss', to_jsonb(w), 'catalog', public.world_catalog(),
    'players', (select count(*) from public.world_hits where month = w.month),
    'me', (select to_jsonb(h) - 'user_id' from public.world_hits h where month = w.month and user_id = v_user),
    'my_rank', (select r from (select user_id, rank() over (order by dmg desc) r from public.world_hits where month = w.month) z where user_id = v_user),
    'top', coalesce((select json_agg(json_build_object('name', public.team_name_of(h.user_id), 'dmg', h.dmg, 'me', h.user_id = v_user,
                       'class', hh.class, 'frame', fp.frame, 'title', fp.title) order by h.dmg desc)
                     from (select * from public.world_hits where month = w.month order by dmg desc limit 10) h
                     left join public.rpg_heroes hh on hh.user_id = h.user_id
                     left join public.fun_profile fp on fp.user_id = h.user_id), '[]'::json),
    'new', v_new);
end;
$function$;
revoke all on function public.world_status() from public, anon;
grant execute on function public.world_status() to authenticated;



-- =========================================================
-- 接上原本的系統
-- =========================================================

-- ⚔️ 每週王出擊：技能加成＋世界王
create or replace function public.rpg_boss_attack()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  h public.rpg_heroes%rowtype;
  r public.rpg_boss_runs%rowtype;
  a jsonb;
  v_power integer;
  v_weak text;
  v_mult numeric := 1;
  v_crit boolean;
  v_dmg integer;
  v_killed boolean := false;
  v_gold integer := 5;
  v_reward jsonb := null;
  v_hit bigint;
  v_chest text := null;
  v_roll numeric;
  v_team bigint;
  rr public.team_raids%rowtype;
  v_cheer integer := 0;
  v_raid_dmg integer := 0;
  v_raid_killed boolean := false;
  v_dead boolean := false;
  m record;
  v_world jsonb := '{}'::jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select * into h from public.rpg_heroes where user_id = v_user;
  if h.class is null then raise exception '先選一個職業才能出擊'; end if;

  perform public.rpg_boss_ensure(v_user);
  select * into r from public.rpg_boss_runs
    where user_id = v_user and week_start = v_today - (extract(isodow from v_today)::int - 1) for update;
  v_team := public.team_of(v_user);
  if r.killed_at is not null then
    if v_team is null then raise exception '這週的王已經打倒了，下週一再來（加入小隊就能繼續打團隊王）'; end if;
    v_dead := true;   -- 自己的王倒了，這次全部打團隊王
  end if;

  a := public.rpg_boss_attacks_today(v_user);
  if (a->>'used')::int >= (a->>'total')::int then
    raise exception '今天的出擊次數用完了（專注滿 60 分、完成 3 個任務、運動都能多 1 次）';
  end if;

  v_power := greatest(10, (public.rpg_power_of(v_user)->>'power')::integer);
  select b->>'weak' into v_weak from jsonb_array_elements(public.rpg_boss_catalog()) b where b->>'key' = r.boss_key;
  if v_weak = h.class then v_mult := 1.3; end if;
  v_mult := v_mult * (1 + 0.05 * public.skill_lv(v_user, 'might'));                       -- 技能：蠻力
  v_crit := random() < (case when h.class = 'ranger' then 0.2 else 0.1 end) + 0.03 * public.skill_lv(v_user, 'sharp');  -- 技能：鋒利
  if v_crit then v_mult := v_mult * 1.5; end if;

  -- 📣 被加油：這次出擊每個加油 +10%（最多 3 個），用掉就沒了
  select least(count(*), 3) into v_cheer from public.cheers where to_user = v_user and day = v_today and not used;
  if v_cheer > 0 then
    v_mult := v_mult * (1 + 0.1 * v_cheer);
    update public.cheers set used = true where to_user = v_user and day = v_today and not used;
  end if;
  v_dmg := round(v_power * (0.85 + random() * 0.3) * v_mult);

  insert into public.rpg_boss_hits (user_id, week_start, hit_day, dmg, crit)
    values (v_user, r.week_start, v_today, v_dmg, v_crit)
    returning id into v_hit;

  if not v_dead then
    update public.rpg_boss_runs set dmg = dmg + v_dmg,
      killed_at = case when dmg + v_dmg >= hp then now() else null end
      where user_id = v_user and week_start = r.week_start
      returning * into r;
  end if;

  -- 🐲 團隊王：同樣的傷害 × 小隊加成
  if v_team is not null then
    perform public.team_raid_ensure(v_team);
    select * into rr from public.team_raids where team_id = v_team and week_start = public.fun_week_start() for update;
    if rr.killed_at is null then
      v_raid_dmg := round(v_dmg * public.team_bonus(v_team));
      insert into public.team_raid_hits (team_id, week_start, user_id, dmg) values (v_team, rr.week_start, v_user, v_raid_dmg);
      update public.team_raids set dmg = dmg + v_raid_dmg,
        killed_at = case when dmg + v_raid_dmg >= hp then now() else null end
        where team_id = v_team and week_start = rr.week_start
        returning * into rr;
      if rr.killed_at is not null then
        v_raid_killed := true;
        for m in select user_id from public.team_members where team_id = v_team loop
          perform public.grant_item(m.user_id, 'chest_team', 1, 'raid:' || rr.week_start);
        end loop;
        perform public.feed_post(v_user, 'raid', jsonb_build_object('boss', rr.boss_key, 'tier', rr.tier,
          'team_name', (select name from public.teams where id = v_team)));
      end if;
    end if;
  end if;

  if random() < 0.25 + 0.05 * public.skill_lv(v_user, 'loot') then   -- 技能：尋寶者
    v_roll := random() * 100;
    v_chest := case when v_roll < 60 then 'chest_wood' when v_roll < 90 then 'chest_iron'
                    when v_roll < 99 then 'chest_gold' else 'chest_star' end;
    perform public.grant_item(v_user, v_chest, 1, 'boss-chest:' || v_hit);
  end if;

  if r.killed_at is not null and not v_dead then
    v_killed := true;
    v_gold := v_gold + 150 + 50 * r.tier;
    perform public.grant_item(v_user, 'ticket_special', 1, 'boss:' || r.week_start);
    perform public.grant_item(v_user, 'stardust', 3 + r.tier, 'boss-dust:' || r.week_start);
    perform public.grant_item(v_user, 'chest_gold', 1, 'boss-kill-chest:' || r.week_start);
    v_reward := jsonb_build_object('ticket_special', 1, 'stardust', 3 + r.tier, 'chest_gold', 1);
  end if;

  -- 🌍 世界王：同樣的傷害
  v_world := public.world_hit(v_user, v_dmg);

  update public.profiles set gold = gold + v_gold, updated_at = now() where id = v_user;

  return json_build_object('success', true, 'dmg', v_dmg, 'crit', v_crit, 'weak', v_mult >= 1.3 and v_weak = h.class,
    'killed', v_killed, 'gold', v_gold, 'reward', v_reward, 'chest', v_chest, 'run', to_jsonb(r),
    'cheer', v_cheer, 'raid_dmg', v_raid_dmg, 'raid_killed', v_raid_killed, 'personal_dead', v_dead,
    'world_dmg', coalesce((v_world->>'dmg')::int, 0), 'world_killed', coalesce((v_world->>'killed')::boolean, false));
end;
$function$;
revoke all on function public.rpg_boss_attack() from public, anon;
grant execute on function public.rpg_boss_attack() to authenticated;

-- 🧭 遠征：技能「遠行者」
create or replace function public.exp_claim()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  s record;
  v_min integer; v_place integer; v_early boolean;
  v_reward jsonb; v_out jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  for s in select f.* from public.focus_sessions f
           where f.user_id = v_user and not coalesce(f.is_manual, false)
             and f.duration_seconds >= 600 and f.session_date >= public.app_today() - 2
             and not exists (select 1 from public.expeditions e where e.session_id = f.id)
           order by f.id loop
    v_min := s.duration_seconds / 60;
    v_place := public.exp_place(v_min);
    v_early := s.mode = 'down' and coalesce(s.planned_minutes, 0) > 0 and s.duration_seconds < s.planned_minutes * 60 * 0.9;

    v_reward := case v_place
      when 0 then jsonb_build_object('stardust', 1, 'gold', 10 + floor(random() * 11)::int)
      when 1 then jsonb_build_object('stardust', 2, 'gold', 20 + floor(random() * 21)::int,
                    'chest_wood', (random() < 0.15)::int)
      when 2 then jsonb_build_object('stardust', 3, 'gold', 40 + floor(random() * 31)::int,
                    'chest_iron', (random() < 0.3)::int, 'gacha_coin', (random() < 0.1)::int)
      when 3 then jsonb_build_object('stardust', 5, 'gold', 80 + floor(random() * 41)::int,
                    'chest_iron', 1, 'gacha_coin', (random() < 0.2)::int, 'chest_gold', (random() < 0.1)::int)
      else jsonb_build_object('stardust', 8, 'gold', 150, 'chest_gold', 1,
                    'gacha_coin', (random() < 0.3)::int, 'chest_star', (random() < 0.05)::int) end;
    -- 技能：遠行者
    v_reward := jsonb_set(v_reward, '{stardust}', to_jsonb((v_reward->>'stardust')::int + public.skill_lv(v_user, 'travel')));
    -- 沒有中獎的拿掉；提早回家只留星屑和金幣
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_reward
      from jsonb_each(v_reward) where value::text::int > 0 and (not v_early or key in ('stardust', 'gold'));

    insert into public.expeditions (session_id, user_id, minutes, place, early, story, reward)
      values (s.id, v_user, v_min, v_place, v_early, floor(random() * 4)::int, v_reward)
      on conflict do nothing;
    if found then
      perform public.fun_give(v_user, v_reward, 'exp:' || s.id);
      v_out := v_out || jsonb_build_object('session', s.id, 'subject', s.subject, 'minutes', v_min, 'place', v_place,
                                           'early', v_early, 'reward', v_reward,
                                           'story', (select story from public.expeditions where session_id = s.id));
    end if;
  end loop;

  return json_build_object('success', true, 'new', v_out);
end;
$function$;
revoke all on function public.exp_claim() from public, anon;
grant execute on function public.exp_claim() to authenticated;

-- 💰 補簽：休息券不會讓之後的補簽變貴
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
    where user_id = v_user and is_makeup and cost > 0 and checkin_date >= v_start;   -- 休息券（cost = 0）不算

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
revoke all on function public.makeup_checkin(date) from public, anon;
grant execute on function public.makeup_checkin(date) to authenticated;

notify pgrst, 'reload schema';

select case
  when exists (select 1 from pg_proc where proname = 'world_status' and pronamespace = 'public'::regnamespace)
    then '✅ 知識卡、主線連擊、休息券、專注連擊、技能樹、專注房間、世界王設定完成'
  else '⚠️ 設定失敗'
end as 檢查結果;
