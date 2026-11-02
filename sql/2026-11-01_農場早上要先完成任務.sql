-- =========================================================
-- 序光計畫：🚪 進農場（早上免費、入場卷、睡前卷）都要先完成今天的 1 個任務
-- 要先跑過「2026-10-22_農場入場.sql」。可以重複執行。
-- =========================================================
do $$ begin
  if to_regprocedure('public.farm_status_base()') is null then alter function public.farm_status() rename to farm_status_base; end if;
  if to_regprocedure('public.farm_enter_base(text)') is null then alter function public.farm_enter(text) rename to farm_enter_base; end if;
end $$;
revoke all on function public.farm_status_base() from public, anon, authenticated;
revoke all on function public.farm_enter_base(text) from public, anon, authenticated;

create or replace function public.farm_task_today(u uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select count(*)::int from public.tasks
   where user_id = u and completed and completed_at is not null
     and ((completed_at at time zone 'Asia/Taipei') - interval '3 hours')::date = public.app_today()
$$;
revoke all on function public.farm_task_today(uuid) from public, anon, authenticated;

create or replace function public.farm_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare b jsonb := public.farm_status_base()::jsonb; n integer := public.farm_task_today(auth.uid());
begin
  return (b || jsonb_build_object('tasks_today', n, 'morning_ok', coalesce((b->>'morning_ok')::boolean, false) and n >= 1))::json;
end; $$;
revoke all on function public.farm_status() from public, anon;
grant execute on function public.farm_status() to authenticated;

create or replace function public.farm_enter(p_kind text)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if public.farm_task_today(auth.uid()) < 1 then
    raise exception '先完成今天的 1 個任務，才能進農場';
  end if;
  return public.farm_enter_base(p_kind);
end; $$;
revoke all on function public.farm_enter(text) from public, anon;
grant execute on function public.farm_enter(text) to authenticated;
