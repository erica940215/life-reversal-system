-- =========================================================
-- 序光計畫：🎯 考試倒數、⭐ 專注品質、😴 早睡獎勵、🌅 早起挑戰、🏁 每週挑戰、🗓️ 年度熱力圖
-- 可以重複執行。
-- =========================================================

-- ---------- ⚙️ 個人目標設定 ----------
create table if not exists public.life_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bed_goal text not null default '01:00',     -- 幾點前睡算早睡
  wake_goal text not null default '08:30',    -- 幾點前打開網站算早起
  claims jsonb not null default '{}'::jsonb,  -- {"sleep":"2026-10-30","morning":"…","exam:3":"…","week:2026-10-26":{…}}
  updated_at timestamptz not null default now()
);
alter table public.life_goals enable row level security;

create table if not exists public.exams (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  exam_date date not null,
  target_hours integer not null default 100,   -- 考前想累積的專注時數
  subject text,                                 -- 只算這個科目（空的 = 全部）
  created_at timestamptz not null default now()
);
create index if not exists exams_user on public.exams (user_id, exam_date);
alter table public.exams enable row level security;

alter table public.focus_sessions add column if not exists quality smallint check (quality between 1 and 3);

create or replace function public.life_goal_row(u uuid)
returns public.life_goals language plpgsql security definer set search_path to 'public'
as $function$
declare g public.life_goals%rowtype;
begin
  insert into public.life_goals (user_id) values (u) on conflict (user_id) do nothing;
  select * into g from public.life_goals where user_id = u;
  return g;
end;
$function$;
revoke all on function public.life_goal_row(uuid) from public, anon, authenticated;

-- 發獎：stardust / chest_* / ticket_* 用 grant_item；doom 的物資用 doom_apply（末世沒裝也不會壞）
create or replace function public.life_reward(u uuid, g jsonb, src text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare r record; out jsonb := '[]'::jsonb; d jsonb := '{}'::jsonb;
begin
  for r in select key, value from jsonb_each(g) loop
    if r.key in ('food', 'water', 'parts', 'scav', 'morale', 'hp') then d := d || jsonb_build_object(r.key, r.value);
    else
      if public.grant_item(u, r.key, (r.value #>> '{}')::int, src || ':' || r.key) then
        out := out || jsonb_build_object('k', r.key, 'n', (r.value #>> '{}')::int);
      end if;
    end if;
  end loop;
  if d <> '{}'::jsonb then
    begin
      perform public.doom_ensure(u);
      out := out || public.doom_apply(u, d, src || ':doom');
    exception when others then null; end;
  end if;
  return out;
end;
$function$;
revoke all on function public.life_reward(uuid, jsonb, text) from public, anon, authenticated;


-- ---------- 🏁 每週挑戰：每週一自動出 3 個 ----------
create or replace function public.week_pool()
returns jsonb language sql immutable
as $function$
select $j$[
  {"id":"focus10","emoji":"⏱️","name":"本週專注 10 小時","kind":"focus_min","goal":600},
  {"id":"focus15","emoji":"🔥","name":"本週專注 15 小時","kind":"focus_min","goal":900},
  {"id":"focus20","emoji":"🌋","name":"本週專注 20 小時","kind":"focus_min","goal":1200},
  {"id":"days2h","emoji":"📚","name":"4 天都專注滿 2 小時","kind":"days_focus120","goal":4},
  {"id":"days1h","emoji":"📖","name":"6 天都專注滿 1 小時","kind":"days_focus60","goal":6},
  {"id":"alltask3","emoji":"✅","name":"3 天把任務全部完成","kind":"days_alltask","goal":3},
  {"id":"alltask5","emoji":"🏆","name":"5 天把任務全部完成","kind":"days_alltask","goal":5},
  {"id":"tasks20","emoji":"📝","name":"完成 20 個任務","kind":"tasks","goal":20},
  {"id":"tasks30","emoji":"📋","name":"完成 30 個任務","kind":"tasks","goal":30},
  {"id":"habit15","emoji":"🌱","name":"習慣打卡 15 次","kind":"habits","goal":15},
  {"id":"checkin7","emoji":"📅","name":"7 天都簽到","kind":"checkins","goal":7},
  {"id":"subjects3","emoji":"🎨","name":"專注 3 個不同科目","kind":"subjects","goal":3},
  {"id":"long90","emoji":"🧘","name":"一次專注滿 90 分鐘","kind":"long_session","goal":90},
  {"id":"sleep4","emoji":"😴","name":"4 天早睡","kind":"early_sleep","goal":4},
  {"id":"quality5","emoji":"⭐","name":"5 次「很專心」的專注","kind":"quality3","goal":5}
]$j$::jsonb
$function$;

create or replace function public.week_challenges(u uuid, ws date)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  pool jsonb := public.week_pool();
  n integer := jsonb_array_length(pool);
  seed integer := abs(hashtext(u::text || ws::text));
  picks integer[] := '{}';
  i integer := 0;
  k integer;
  c jsonb;
  v integer;
  out jsonb := '[]'::jsonb;
  we date := ws + 6;
  bed text;
begin
  select bed_goal into bed from public.life_goals where user_id = u;
  bed := coalesce(bed, '01:00');
  while array_length(picks, 1) is null or array_length(picks, 1) < 3 loop
    k := (seed + i * 7919) % n;
    i := i + 1;
    c := pool->k;
    -- 同一種類只出一個
    continue when exists (select 1 from unnest(picks) p where pool->p->>'kind' = c->>'kind');
    picks := picks || k;
  end loop;
  foreach k in array picks loop
    c := pool->k;
    v := case c->>'kind'
      when 'focus_min' then (select coalesce(sum(duration_seconds), 0) / 60 from public.focus_sessions where user_id = u and session_date between ws and we)
      when 'days_focus120' then (select count(*) from (select session_date from public.focus_sessions where user_id = u and session_date between ws and we group by 1 having sum(duration_seconds) >= 7200) x)
      when 'days_focus60' then (select count(*) from (select session_date from public.focus_sessions where user_id = u and session_date between ws and we group by 1 having sum(duration_seconds) >= 3600) x)
      when 'days_alltask' then (select count(*) from (select task_date from public.tasks where user_id = u and task_date between ws and we and not coalesce(skipped, false)
                                  group by 1 having count(*) > 0 and bool_and(completed)) x)
      when 'tasks' then (select count(*) from public.tasks where user_id = u and task_date between ws and we and completed)
      when 'habits' then (select count(*) from public.habit_logs where user_id = u and log_date between ws and we)
      when 'checkins' then (select count(*) from public.checkins where user_id = u and checkin_date between ws and we)
      when 'subjects' then (select count(distinct subject) from public.focus_sessions where user_id = u and session_date between ws and we)
      when 'long_session' then (select coalesce(max(duration_seconds), 0) / 60 from public.focus_sessions where user_id = u and session_date between ws and we)
      when 'early_sleep' then (select count(*) from public.sleep_logs s where s.user_id = u and s.night_date between ws - 1 and we - 1 and s.bed_at is not null
                                 and s.bed_at at time zone 'Asia/Taipei' <= s.night_date + case when bed::time < '12:00' then 1 else 0 end + bed::time)
      when 'quality3' then (select count(*) from public.focus_sessions where user_id = u and session_date between ws and we and quality = 3)
      else 0 end;
    out := out || (c || jsonb_build_object('value', least(v, (c->>'goal')::int), 'done', v >= (c->>'goal')::int));
  end loop;
  return out;
end;
$function$;
revoke all on function public.week_challenges(uuid, date) from public, anon, authenticated;


-- ---------- 📋 今日目標總覽（考試倒數、早睡早起、每週挑戰） ----------
create or replace function public.life_goals_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  t date := public.app_today();
  ws date := public.app_today() - (extract(isodow from public.app_today())::int - 1);
  g public.life_goals%rowtype;
  now_tp timestamp := now() at time zone 'Asia/Taipei';
  sl public.sleep_logs%rowtype;
  slept_ok boolean := false;
  exams jsonb;
  ch jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  g := public.life_goal_row(u);

  select * into sl from public.sleep_logs where user_id = u and night_date = t - 1;
  slept_ok := sl.bed_at is not null and sl.bed_at at time zone 'Asia/Taipei'
              <= (t - 1) + case when g.bed_goal::time < '12:00' then 1 else 0 end + g.bed_goal::time;

  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'date', e.exam_date, 'subject', e.subject,
      'target', e.target_hours, 'days', e.exam_date - t,
      'done_min', (select coalesce(sum(duration_seconds), 0) / 60 from public.focus_sessions f
                   where f.user_id = u and f.session_date >= (e.created_at at time zone 'Asia/Taipei')::date and f.session_date <= t
                     and (e.subject is null or f.subject = e.subject)),
      'today_min', (select coalesce(sum(duration_seconds), 0) / 60 from public.focus_sessions f
                    where f.user_id = u and f.session_date = t and (e.subject is null or f.subject = e.subject)),
      'claimed', coalesce(g.claims->>('exam:' || e.id), '') = t::text) order by e.exam_date), '[]'::jsonb)
    into exams from public.exams e where e.user_id = u and e.exam_date >= t;

  ch := public.week_challenges(u, ws);

  return json_build_object(
    'today', t, 'week_start', ws, 'now', to_char(now_tp, 'HH24:MI'),
    'bed_goal', g.bed_goal, 'wake_goal', g.wake_goal,
    'sleep', json_build_object('logged', sl.id is not null, 'bed_at', sl.bed_at, 'ok', slept_ok,
                               'claimed', coalesce(g.claims->>'sleep', '') = t::text),
    'morning', json_build_object('open', now_tp::time >= '05:00' and now_tp::time <= g.wake_goal::time and now_tp::date = t,
                                 'claimed', coalesce(g.claims->>'morning', '') = t::text),
    'exams', exams,
    'week', ch,
    'week_claimed', g.claims->('week:' || ws));
end;
$function$;
grant execute on function public.life_goals_status() to authenticated;
revoke all on function public.life_goals_status() from public, anon;

create or replace function public.life_goals_save(p_bed text, p_wake text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_bed !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or p_wake !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception '時間格式不對'; end if;
  if p_wake::time < '05:00' or p_wake::time > '11:00' then raise exception '早起時間要在 05:00～11:00 之間'; end if;
  perform public.life_goal_row(u);
  update public.life_goals set bed_goal = p_bed, wake_goal = p_wake, updated_at = now() where user_id = u;
  return public.life_goals_status();
end;
$function$;
grant execute on function public.life_goals_save(text, text) to authenticated;
revoke all on function public.life_goals_save(text, text) from public, anon;


-- ---------- 🎁 領獎 ----------
--   sleep：昨晚早睡 → 星屑 5、末世士氣 +10、搜刮券 2
--   morning：早上 5 點到早起時間之間打開 → 木寶箱、星屑 3
--   exam:<id>：今天的考試建議專注量達標 → 星屑 4、搜刮券 1
--   wk:<challenge id>：每個挑戰 → 星屑 10；三個都完成 → 金寶箱、特殊召喚券、星屑 30
create or replace function public.life_goals_claim(p_kind text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  t date := public.app_today();
  ws date := public.app_today() - (extract(isodow from public.app_today())::int - 1);
  st json;
  g public.life_goals%rowtype;
  e json;
  c jsonb;
  wk jsonb;
  gains jsonb;
  need integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  st := public.life_goals_status();
  g := public.life_goal_row(u);

  if p_kind = 'sleep' then
    if (st->'sleep'->>'claimed')::boolean then raise exception '今天領過了'; end if;
    if not (st->'sleep'->>'ok')::boolean then raise exception '昨晚沒有在 % 前睡（要先在「生活」記錄睡眠）', g.bed_goal; end if;
    update public.life_goals set claims = claims || jsonb_build_object('sleep', t::text) where user_id = u;
    gains := public.life_reward(u, '{"stardust":5,"morale":10,"scav":2}', 'sleep:' || t);

  elsif p_kind = 'morning' then
    if (st->'morning'->>'claimed')::boolean then raise exception '今天領過了'; end if;
    if not (st->'morning'->>'open')::boolean then raise exception '要在 % 前打開才算早起', g.wake_goal; end if;
    update public.life_goals set claims = claims || jsonb_build_object('morning', t::text) where user_id = u;
    gains := public.life_reward(u, '{"chest_wood":1,"stardust":3}', 'morning:' || t);

  elsif p_kind like 'exam:%' then
    select x into e from json_array_elements(st->'exams') x where x->>'id' = substr(p_kind, 6);
    if e is null then raise exception '找不到這個考試'; end if;
    if (e->>'claimed')::boolean then raise exception '今天領過了'; end if;
    need := ceil(greatest(0, (e->>'target')::int * 60 - (e->>'done_min')::int + (e->>'today_min')::int)::numeric / greatest(1, (e->>'days')::int + 1));
    if (e->>'today_min')::int < need then raise exception '今天還差 % 分鐘', need - (e->>'today_min')::int; end if;
    update public.life_goals set claims = claims || jsonb_build_object(p_kind, t::text) where user_id = u;
    gains := public.life_reward(u, '{"stardust":4,"scav":1}', p_kind || ':' || t);

  elsif p_kind like 'wk:%' then
    wk := coalesce(g.claims->('week:' || ws), '{}'::jsonb);
    if substr(p_kind, 4) = 'all' then
      if wk ? 'all' then raise exception '這週的大獎領過了'; end if;
      if exists (select 1 from json_array_elements(st->'week') x where not (x->>'done')::boolean) then raise exception '三個挑戰都完成才能領'; end if;
      wk := wk || '{"all":true}';
      gains := public.life_reward(u, '{"chest_gold":1,"ticket_special":1,"stardust":30}', 'week-all:' || ws);
    else
      select x::jsonb into c from json_array_elements(st->'week') x where x->>'id' = substr(p_kind, 4);
      if c is null then raise exception '這週沒有這個挑戰'; end if;
      if wk ? (c->>'id') then raise exception '領過了'; end if;
      if not (c->>'done')::boolean then raise exception '還沒完成'; end if;
      wk := wk || jsonb_build_object(c->>'id', true);
      gains := public.life_reward(u, '{"stardust":10}', 'week:' || ws || ':' || (c->>'id'));
    end if;
    update public.life_goals set claims = claims || jsonb_build_object('week:' || ws, wk) where user_id = u;
  else
    raise exception '不認得的獎勵';
  end if;
  return json_build_object('kind', p_kind, 'gains', gains);
end;
$function$;
grant execute on function public.life_goals_claim(text) to authenticated;
revoke all on function public.life_goals_claim(text) from public, anon;


-- ---------- 📚 考試 ----------
create or replace function public.exam_save(p_id bigint, p_name text, p_date date, p_target integer, p_subject text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '尚未登入'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception '要有考試名稱'; end if;
  if p_date is null or p_date < public.app_today() then raise exception '考試日期要在今天之後'; end if;
  if p_id is null then
    if (select count(*) from public.exams where user_id = u and exam_date >= public.app_today()) >= 5 then raise exception '最多 5 個考試'; end if;
    insert into public.exams (user_id, name, exam_date, target_hours, subject)
      values (u, left(trim(p_name), 40), p_date, greatest(1, least(coalesce(p_target, 100), 2000)), nullif(trim(coalesce(p_subject, '')), ''));
  else
    update public.exams set name = left(trim(p_name), 40), exam_date = p_date,
      target_hours = greatest(1, least(coalesce(p_target, 100), 2000)), subject = nullif(trim(coalesce(p_subject, '')), '')
      where id = p_id and user_id = u;
  end if;
  return public.life_goals_status();
end;
$function$;
grant execute on function public.exam_save(bigint, text, date, integer, text) to authenticated;
revoke all on function public.exam_save(bigint, text, date, integer, text) from public, anon;

create or replace function public.exam_delete(p_id bigint)
returns json language plpgsql security definer set search_path to 'public'
as $function$
begin
  delete from public.exams where id = p_id and user_id = auth.uid();
  return public.life_goals_status();
end;
$function$;
grant execute on function public.exam_delete(bigint) to authenticated;
revoke all on function public.exam_delete(bigint) from public, anon;


-- ---------- 🗓️ 年度熱力圖＋⭐ 專注品質 ----------
create or replace function public.life_year(p_year integer default null)
returns json language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  y integer := coalesce(p_year, extract(year from public.app_today())::int);
begin
  if u is null then raise exception '尚未登入'; end if;
  return json_build_object('year', y, 'today', public.app_today(),
    'days', (select coalesce(json_object_agg(session_date, m), '{}'::json) from (
       select session_date, sum(duration_seconds) / 60 as m from public.focus_sessions
       where user_id = u and extract(year from session_date) = y group by 1) x),
    'quality', (select coalesce(json_agg(q), '[]'::json) from (
       select subject, round(avg(quality), 2) as avg, count(*) as n,
              count(*) filter (where quality = 3) as great, count(*) filter (where quality = 1) as poor
       from public.focus_sessions where user_id = u and quality is not null and session_date >= public.app_today() - 30
       group by subject order by avg(quality) desc) q),
    'quality_hour', (select coalesce(json_agg(q order by q.h), '[]'::json) from (
       select extract(hour from started_at at time zone 'Asia/Taipei')::int / 3 * 3 as h, round(avg(quality), 2) as avg, count(*) as n
       from public.focus_sessions where user_id = u and quality is not null and session_date >= public.app_today() - 30
       group by 1) q));
end;
$function$;
grant execute on function public.life_year(integer) to authenticated;
revoke all on function public.life_year(integer) from public, anon;
