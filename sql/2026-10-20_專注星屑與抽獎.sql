-- =========================================================
-- 序光計畫：專注也能拿星屑；專注每滿一小時送一張星願券（普通）
-- 可以重複執行。要先執行過「簽到發券與背包」（需要 grant_item）與「星願池」。
--
--   每滿 30 分鐘 → ⭐ 1 星屑
--   每滿 1 小時  → 🎫 1 張 wish_normal（普通星願券，給星願池抽）
--
-- 以「今天」為單位累計專注秒數，每個里程碑只發一次（source_key 固定，grant_item 會擋重複）。
-- 只處理今天（跟 sync_focus_reward 一樣，過去日期不會再發）。
-- 注意：刪掉專注紀錄不會收回已經發出的獎勵（已發的里程碑不會退）。
-- =========================================================


create or replace function public.claim_focus_rewards(p_date date default null)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_day date := coalesce(p_date, public.app_today());
  v_seconds integer;
  v_half integer;
  v_hours integer;
  v_dust integer := 0;
  v_tickets integer := 0;
  i integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  -- 只處理今天
  if v_day <> v_today then
    return json_build_object('success', true, 'dust', 0, 'tickets', 0, 'skipped', true);
  end if;

  select coalesce(sum(duration_seconds), 0) into v_seconds
    from public.focus_sessions
    where user_id = v_user and session_date = v_today;

  v_half  := v_seconds / 1800;
  v_hours := v_seconds / 3600;

  for i in 1..v_half loop
    if public.grant_item(v_user, 'stardust', 1, 'focus-30:' || v_today || ':' || i) then
      v_dust := v_dust + 1;
    end if;
  end loop;

  for i in 1..v_hours loop
    if public.grant_item(v_user, 'wish_normal', 1, 'focus-hour:' || v_today || ':' || i) then
      v_tickets := v_tickets + 1;
    end if;
  end loop;

  return json_build_object('success', true, 'dust', v_dust, 'tickets', v_tickets,
                           'focus_seconds', v_seconds);
end;
$function$;

revoke all on function public.claim_focus_rewards(date) from public, anon;
grant execute on function public.claim_focus_rewards(date) to authenticated;

notify pgrst, 'reload schema';


-- ---------- ✅ 檢查結果 ----------
select case
  when exists (select 1 from pg_proc where proname = 'claim_focus_rewards' and pronamespace = 'public'::regnamespace)
    then '✅ 專注星屑與星願券設定完成'
  else '⚠️ 設定失敗'
end as 檢查結果;
