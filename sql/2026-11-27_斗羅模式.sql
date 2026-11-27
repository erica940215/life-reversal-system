-- =========================================================
-- 序光計畫：⚔️ 斗羅模式（唐三陪你修煉、大師每天指導）
-- 可以重複執行。
--   魂力：從你真實完成的事自動累積
--     🌿 藍銀草（規律線）：生活打卡（睡眠／保養／運動／飲食／生活／每週）每項 5、每日簽到 5
--     🔨 昊天錘（突破線）：專注每分鐘 1、任務 簡單15/普通30/困難50/史詩80、
--                          專案步驟 5、學到什麼 10、單字 1、多益 2、複習 2
--   等級：累積魂力 2L²+40L（每天讀 5 小時約一個半月到 90 級）；每 10 級是瓶頸，要完成「獵魂挑戰」吸收魂環才能繼續升
--   仙草：某天專注滿 180 分鐘 → 1 株，可在獵魂時使用（目標 -30%）
-- =========================================================

create table if not exists public.douluo_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp_blue bigint not null default 0,
  xp_hao bigint not null default 0,
  last_sync timestamptz not null default (now() - interval '30 days'),
  rings jsonb not null default '[]'::jsonb,
  hunt jsonb,
  herbs integer not null default 0,
  herb_days jsonb not null default '[]'::jsonb,
  master_follow integer not null default 0,
  follow_days jsonb not null default '[]'::jsonb,
  seen_chapter integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.douluo_state enable row level security;
drop policy if exists douluo_state_own on public.douluo_state;
create policy douluo_state_own on public.douluo_state for select using (user_id = auth.uid());

create or replace function public.douluo_level(p_xp bigint, p_rings integer)
returns integer language sql immutable as $$
  select least(greatest(1, least(100, floor((-40 + sqrt(1600 + 8.0 * greatest(p_xp, 0))) / 4)::int + 1)), (p_rings + 1) * 10)
$$;

-- 這段時間內的各項成果（獵魂、統計共用）
create or replace function public.douluo_since(u uuid, t0 timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'focus', coalesce((select sum(duration_seconds) / 60 from focus_sessions where user_id = u and started_at >= t0), 0),
    'hard', (select count(*) from tasks where user_id = u and completed and completed_at >= t0 and difficulty in ('hard', 'epic')),
    'tasks', (select count(*) from tasks where user_id = u and completed and completed_at >= t0),
    'lifedays', (select count(distinct l.day) from project_step_logs l join projects p on p.id = l.project_id where l.user_id = u and l.done and l.created_at >= t0 and p.domain is not null)
  )
$$;

create or replace function public.douluo_sync()
returns integer language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); s douluo_state; b bigint; h bigint; d record; nh integer := 0; hd jsonb;
begin
  if u is null then raise exception 'not signed in'; end if;
  insert into douluo_state(user_id) values (u) on conflict do nothing;
  select * into s from douluo_state where user_id = u for update;
  b := 5 * (select count(*) from project_step_logs l join projects p on p.id = l.project_id where l.user_id = u and l.done and l.created_at >= s.last_sync and p.domain is not null)
     + 5 * (select count(*) from checkins where user_id = u and created_at >= s.last_sync);
  h := coalesce((select sum(duration_seconds) / 60 from focus_sessions where user_id = u and started_at >= s.last_sync), 0)
     + coalesce((select sum(case difficulty when 'easy' then 15 when 'hard' then 50 when 'epic' then 80 else 30 end) from tasks where user_id = u and completed and completed_at >= s.last_sync), 0)
     + 5 * (select count(*) from project_step_logs l join projects p on p.id = l.project_id where l.user_id = u and l.done and l.created_at >= s.last_sync and p.domain is null)
     + 10 * (select count(*) from learn_notes where user_id = u and created_at >= s.last_sync)
     + (select count(*) from vocab_log where user_id = u and created_at >= s.last_sync)
     + 2 * (select count(*) from toeic_answers where user_id = u and created_at >= s.last_sync)
     + 2 * (select count(*) from kb_log where user_id = u and created_at >= s.last_sync);
  -- 魂技加成：藍銀草每個魂環 +3%，昊天錘每個魂環 +3%
  b := round(b * (1 + 0.03 * (select count(*) from jsonb_array_elements(s.rings) r where r->>'line' = 'blue')));
  h := round(h * (1 + 0.03 * (select count(*) from jsonb_array_elements(s.rings) r where r->>'line' = 'hao')));
  -- 仙草：專注滿 180 分鐘的日子
  hd := s.herb_days;
  for d in select session_date, sum(duration_seconds) / 60 m from focus_sessions where user_id = u and session_date >= (s.last_sync at time zone 'Asia/Taipei')::date - 1 group by session_date having sum(duration_seconds) / 60 >= 180 loop
    if not hd ? d.session_date::text then hd := hd || to_jsonb(d.session_date::text); nh := nh + 1; end if;
  end loop;
  update douluo_state set xp_blue = xp_blue + b, xp_hao = xp_hao + h, last_sync = now(), herbs = herbs + least(nh, 3),
    herb_days = (select coalesce(jsonb_agg(x), '[]') from (select x from jsonb_array_elements(hd) x order by x desc limit 40) z) where user_id = u;
  return b + h;
end $$;

create or replace function public.douluo_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); g integer; s douluo_state; t date := public.app_today(); st jsonb; streak integer := 0; dd date;
begin
  g := public.douluo_sync();
  select * into s from douluo_state where user_id = u;
  dd := t;
  loop
    exit when not exists (select 1 from tasks where user_id = u and completed and task_date = dd
                          union select 1 from focus_sessions where user_id = u and session_date = dd
                          union select 1 from project_step_logs where user_id = u and done and day = dd);
    streak := streak + 1; dd := dd - 1; exit when streak > 400;
  end loop;
  if streak = 0 then dd := t - 1; loop
    exit when not exists (select 1 from tasks where user_id = u and completed and task_date = dd union select 1 from focus_sessions where user_id = u and session_date = dd union select 1 from project_step_logs where user_id = u and done and day = dd);
    streak := streak + 1; dd := dd - 1; exit when streak > 400; end loop; end if;
  st := jsonb_build_object(
    'today', t,
    'focus_today', coalesce((select sum(duration_seconds) / 60 from focus_sessions where user_id = u and session_date = t), 0),
    'focus_yday', coalesce((select sum(duration_seconds) / 60 from focus_sessions where user_id = u and session_date = t - 1), 0),
    'tasks_today', (select count(*) from tasks where user_id = u and task_date = t),
    'done_today', (select count(*) from tasks where user_id = u and task_date = t and completed),
    'tasks_yday', (select count(*) from tasks where user_id = u and task_date = t - 1),
    'done_yday', (select count(*) from tasks where user_id = u and task_date = t - 1 and completed),
    'open_today', coalesce((select jsonb_agg(title) from (select title from tasks where user_id = u and task_date = t and not completed order by id limit 5) x), '[]'),
    'subj7', coalesce((select jsonb_object_agg(subject, m) from (select subject, sum(duration_seconds) / 60 m from focus_sessions where user_id = u and session_date > t - 7 group by subject) x), '{}'),
    'subjp7', coalesce((select jsonb_object_agg(subject, m) from (select subject, sum(duration_seconds) / 60 m from focus_sessions where user_id = u and session_date <= t - 7 and session_date > t - 14 group by subject) x), '{}'),
    'subj_last', coalesce((select jsonb_object_agg(subject, d) from (select subject, max(session_date) d from focus_sessions where user_id = u and session_date > t - 60 group by subject) x), '{}'),
    'life7', coalesce((select jsonb_object_agg(domain, n) from (select p.domain, count(*) n from project_step_logs l join projects p on p.id = l.project_id where l.user_id = u and l.done and l.day > t - 7 and p.domain is not null group by p.domain) x), '{}'),
    'life_has', coalesce((select jsonb_agg(distinct domain) from projects where user_id = u and status = 'active' and domain is not null), '[]'),
    'life_all', coalesce((select jsonb_object_agg(domain, n) from (select p.domain, count(*) n from project_step_logs l join projects p on p.id = l.project_id where l.user_id = u and l.done and p.domain is not null group by p.domain) x), '{}'),
    'notes_all', (select count(*) from learn_notes where user_id = u),
    'hard_all', (select count(*) from tasks where user_id = u and completed and difficulty in ('hard', 'epic')),
    'focus_all', coalesce((select sum(duration_seconds) / 60 from focus_sessions where user_id = u), 0),
    'streak', streak);
  return jsonb_build_object('gained', g, 'state', to_jsonb(s) - 'herb_days' - 'follow_days',
    'level', public.douluo_level(s.xp_blue + s.xp_hao, jsonb_array_length(s.rings)),
    'raw_level', public.douluo_level(s.xp_blue + s.xp_hao, 99),
    'stats', st,
    'hunt_prog', case when s.hunt is null then null else public.douluo_since(u, (s.hunt->>'start')::timestamptz) end);
end $$;

-- 獵魂：p_tier 1 百年 / 2 千年 / 3 萬年 / 4 十萬年；p_line 'blue' 或 'hao'
create or replace function public.douluo_hunt_start(p_tier integer, p_line text, p_herb boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); s douluo_state; f numeric := 1; tg jsonb;
begin
  select * into s from douluo_state where user_id = u for update;
  if s.hunt is not null then raise exception '已經在獵魂中'; end if;
  if public.douluo_level(s.xp_blue + s.xp_hao, 99) < (jsonb_array_length(s.rings) + 1) * 10 then raise exception '魂力還沒到瓶頸'; end if;
  if p_tier not between 1 and 4 or p_line not in ('blue', 'hao') then raise exception '參數錯誤'; end if;
  if p_herb then if s.herbs < 1 then raise exception '沒有仙草'; end if; f := 0.7; update douluo_state set herbs = herbs - 1 where user_id = u; end if;
  tg := case p_tier
    when 1 then jsonb_build_object('focus', ceil(300 * f), 'hard', 0, 'lifedays', 0, 'days', 7)
    when 2 then jsonb_build_object('focus', ceil(600 * f), 'hard', ceil(2 * f), 'lifedays', 0, 'days', 7)
    when 3 then jsonb_build_object('focus', ceil(900 * f), 'hard', ceil(4 * f), 'lifedays', ceil(5 * f), 'days', 10)
    else jsonb_build_object('focus', ceil(1500 * f), 'hard', ceil(6 * f), 'lifedays', ceil(7 * f), 'days', 14) end;
  update douluo_state set hunt = jsonb_build_object('tier', p_tier, 'line', p_line, 'start', now(), 'until', now() + make_interval(days => (tg->>'days')::int), 'target', tg, 'herb', p_herb) where user_id = u;
  return tg;
end $$;

create or replace function public.douluo_hunt_check()
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); s douluo_state; p jsonb; tg jsonb; ok boolean;
begin
  select * into s from douluo_state where user_id = u for update;
  if s.hunt is null then return jsonb_build_object('status', 'none'); end if;
  p := public.douluo_since(u, (s.hunt->>'start')::timestamptz); tg := s.hunt->'target';
  ok := (p->>'focus')::int >= (tg->>'focus')::int and (p->>'hard')::int >= (tg->>'hard')::int and (p->>'lifedays')::int >= (tg->>'lifedays')::int;
  if ok then
    update douluo_state set rings = rings || jsonb_build_object('tier', s.hunt->'tier', 'line', s.hunt->>'line', 'at', now(), 'n', jsonb_array_length(rings) + 1), hunt = null where user_id = u;
    return jsonb_build_object('status', 'done', 'tier', s.hunt->'tier', 'line', s.hunt->>'line', 'n', jsonb_array_length(s.rings) + 1);
  elsif now() > (s.hunt->>'until')::timestamptz then
    update douluo_state set hunt = null where user_id = u;
    return jsonb_build_object('status', 'failed', 'prog', p);
  end if;
  return jsonb_build_object('status', 'going', 'prog', p);
end $$;

create or replace function public.douluo_hunt_cancel()
returns void language sql security definer set search_path = public as $$
  update public.douluo_state set hunt = null where user_id = auth.uid()
$$;

-- 照大師的建議加任務 → 師徒進度（每天最多 3 次）
create or replace function public.douluo_follow()
returns integer language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); t text := public.app_today()::text; s douluo_state; n integer;
begin
  select * into s from douluo_state where user_id = u for update;
  n := (select count(*) from jsonb_array_elements_text(s.follow_days) x where x = t);
  if n >= 3 then return s.master_follow; end if;
  update douluo_state set master_follow = master_follow + 1,
    follow_days = (select coalesce(jsonb_agg(x), '[]') from (select x from jsonb_array_elements(s.follow_days || to_jsonb(t)) x order by x desc limit 30) z)
    where user_id = u;
  return s.master_follow + 1;
end $$;

create or replace function public.douluo_seen(p_ch integer)
returns void language sql security definer set search_path = public as $$
  update public.douluo_state set seen_chapter = greatest(seen_chapter, p_ch) where user_id = auth.uid()
$$;

revoke all on function public.douluo_since(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.douluo_sync() from public, anon;
grant execute on function public.douluo_sync(), public.douluo_status(), public.douluo_hunt_start(integer, text, boolean), public.douluo_hunt_check(), public.douluo_hunt_cancel(), public.douluo_follow(), public.douluo_seen(integer) to authenticated;
revoke execute on function public.douluo_status(), public.douluo_hunt_start(integer, text, boolean), public.douluo_hunt_check(), public.douluo_hunt_cancel(), public.douluo_follow(), public.douluo_seen(integer) from anon;
