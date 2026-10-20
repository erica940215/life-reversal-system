-- =========================================================
-- 序光計畫：星露兌換星屑（市集）
-- 可以重複執行。要先執行過「簽到發券與背包」（需要 grant_item）。
--
-- 匯率：1 星屑 = 100 星露（星露在農場裡扣，這裡只負責發星屑）
-- 每天最多兌換 10 個星屑（以遊戲日計算，跟任務一樣 2 點換日）。
-- =========================================================


create or replace function public.farm_exchange_stardust(p_count integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_day date := public.app_today();
  v_cap constant integer := 10;
  v_used integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_count is null or p_count < 1 or p_count > v_cap then raise exception '兌換數量不對'; end if;

  select coalesce(sum(delta), 0) into v_used
    from public.item_events
    where user_id = v_user and item_key = 'stardust'
      and source_key like 'exchange:' || v_day || ':%';

  if v_used + p_count > v_cap then
    raise exception '今天最多兌換 % 個星屑（已兌換 %）', v_cap, v_used;
  end if;

  perform public.grant_item(v_user, 'stardust', p_count,
                            'exchange:' || v_day || ':' || gen_random_uuid()::text);

  return json_build_object('success', true, 'got', p_count, 'used', v_used + p_count, 'cap', v_cap);
end;
$function$;

revoke all on function public.farm_exchange_stardust(integer) from public, anon;
grant execute on function public.farm_exchange_stardust(integer) to authenticated;

notify pgrst, 'reload schema';


-- ---------- ✅ 檢查結果 ----------
select case
  when exists (select 1 from pg_proc where proname = 'farm_exchange_stardust' and pronamespace = 'public'::regnamespace)
    then '✅ 星露兌換星屑設定完成'
  else '⚠️ 設定失敗'
end as 檢查結果;
