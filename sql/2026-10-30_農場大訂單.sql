-- =========================================================
-- 序光計畫：🏝️ 星露島 📦 大訂單（每天 2 張，一大批同一種食材換星屑）
-- 第 1 張：星屑 30；第 2 張（數量兩倍）：星屑 60。每張每天只能領一次。可以重複執行。
-- =========================================================
create or replace function public.farm_bigorder_claim(p_slot integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  v_day date := public.app_today();
  v_qty integer;
  v_new boolean;
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_slot not in (0, 1) then raise exception '沒有這張大訂單'; end if;
  v_qty := case p_slot when 0 then 30 else 60 end;
  v_new := public.grant_item(u, 'stardust', v_qty, 'farmbig:' || v_day || ':' || p_slot);
  return json_build_object('success', true, 'already', not v_new, 'item', 'stardust', 'qty', v_qty);
end;
$function$;
revoke all on function public.farm_bigorder_claim(integer) from public, anon;
grant execute on function public.farm_bigorder_claim(integer) to authenticated;
