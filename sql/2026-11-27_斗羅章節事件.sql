-- =========================================================
-- 序光計畫：⚔️ 斗羅模式・章節小事件（可以重複執行）
--   每一章有一個小事件，只算「這章事件開始之後」的紀錄（以前的不算）
--   完成獎勵：仙草 +1（獵魂時用）。不動經驗、金幣、星屑、魂力
-- =========================================================
alter table public.douluo_state add column if not exists events jsonb not null default '{}'::jsonb;

create or replace function public.douluo_events()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u uuid := auth.uid(); t date := public.app_today(); s douluo_state; lvl integer; ch integer := 0;
  thr integer[] := array[1, 11, 21, 31, 41, 51, 61, 71, 81, 91, 100];
  -- kind, 參數1, 參數2：
  --   day     某一天專注滿 a 分鐘
  --   streak  連續 b 天、每天專注滿 a 分鐘
  --   days    累積 b 天專注滿 a 分鐘
  --   tstreak 連續 b 天、每天完成 a 件任務
  --   hard    完成 a 件困難以上任務
  --   total   累積專注 a 分鐘
  kinds text[] := array['day', 'tstreak', 'streak', 'days', 'hard', 'streak', 'tstreak', 'streak', 'total', 'streak', 'total'];
  pa integer[] := array[60, 1, 120, 180, 5, 60, 3, 90, 1800, 120, 6000];
  pb integer[] := array[1, 3, 3, 3, 0, 7, 5, 9, 0, 10, 0];
  i integer; ev jsonb; st date; prog integer; tgt integer; ok boolean; out jsonb := '[]'::jsonb; evs jsonb; changed boolean := false;
begin
  if u is null then raise exception '請先登入'; end if;
  select * into s from douluo_state where user_id = u for update;
  if not found then return '[]'::jsonb; end if;
  lvl := public.douluo_level(s.xp_blue + s.xp_hao, jsonb_array_length(s.rings));
  for i in 1..11 loop if lvl >= thr[i] then ch := i; end if; end loop;
  evs := coalesce(s.events, '{}'::jsonb);
  for i in 1..ch loop
    ev := evs -> (i - 1)::text;
    if ev is null then ev := jsonb_build_object('start', t, 'done', null); evs := evs || jsonb_build_object((i - 1)::text, ev); changed := true; end if;
    st := (ev ->> 'start')::date;
    tgt := case kinds[i] when 'day' then pa[i] when 'total' then pa[i] when 'hard' then pa[i] else pb[i] end;
    if kinds[i] in ('day', 'streak', 'days') then
      with d as (select session_date dd, sum(duration_seconds) / 60 m from focus_sessions where user_id = u and session_date >= st group by 1),
           ok as (select dd from d where m >= pa[i]),
           g as (select dd, dd - (row_number() over (order by dd))::int grp from ok)
      select case kinds[i]
               when 'day' then coalesce((select max(m) from d), 0)
               when 'days' then (select count(*) from ok)
               else coalesce((select max(c) from (select count(*) c from g group by grp) z), 0) end
        into prog;
    elsif kinds[i] = 'tstreak' then
      with d as (select ((completed_at at time zone 'Asia/Taipei') - interval '6 hours')::date dd, count(*) n from tasks
                 where user_id = u and completed and completed_at is not null and ((completed_at at time zone 'Asia/Taipei') - interval '6 hours')::date >= st group by 1),
           ok as (select dd from d where n >= pa[i]),
           g as (select dd, dd - (row_number() over (order by dd))::int grp from ok)
      select coalesce((select max(c) from (select count(*) c from g group by grp) z), 0) into prog;
    elsif kinds[i] = 'hard' then
      select count(*) into prog from tasks where user_id = u and completed and difficulty in ('hard', 'epic')
        and ((completed_at at time zone 'Asia/Taipei') - interval '6 hours')::date >= st;
    else
      select coalesce(sum(duration_seconds) / 60, 0) into prog from focus_sessions where user_id = u and session_date >= st;
    end if;
    ok := prog >= tgt;
    if ok and (ev ->> 'done') is null then
      ev := jsonb_set(ev, '{done}', to_jsonb(t)); evs := jsonb_set(evs, array[(i - 1)::text], ev); changed := true;
      update douluo_state set herbs = herbs + 1 where user_id = u;
    end if;
    out := out || jsonb_build_object('ch', i - 1, 'start', st, 'done', ev -> 'done', 'prog', least(prog, tgt), 'target', tgt, 'new', ok and (ev ->> 'done') = t::text);
  end loop;
  if changed then update douluo_state set events = evs where user_id = u; end if;
  return out;
end $$;

revoke all on function public.douluo_events() from public, anon;
grant execute on function public.douluo_events() to authenticated;
