-- =========================================================
-- 序光計畫：🏝️ 星露島節日限時訂單
-- 可以重複執行。要先執行過「簽到發券與背包」（需要 grant_item）。
--   節日當天有一張限時訂單，交了拿星屑 40（一天一次）
--   節日：元旦、情人節、春節、元宵、清明、端午、七夕、中秋、萬聖節、雙十一、冬至、聖誕節、跨年
-- =========================================================
create or replace function public.farm_festival_claim(p_day text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_day is null or p_day <> public.app_today()::text then raise exception '只能交今天的節日訂單'; end if;
  if to_char(public.app_today(), 'MM-DD') not in ('01-01','02-14','02-17','03-03','04-04','05-31','08-19','09-25','10-31','11-11','12-21','12-25','12-31') then
    raise exception '今天不是節日';
  end if;
  if exists (select 1 from public.item_events where user_id = v_user and source_key = 'farmfest:' || p_day) then
    return json_build_object('success', true, 'already', true);
  end if;
  perform public.grant_item(v_user, 'stardust', 40, 'farmfest:' || p_day);
  return json_build_object('success', true, 'already', false, 'item', 'stardust', 'qty', 40);
end;
$function$;
revoke all on function public.farm_festival_claim(text) from public, anon;
grant execute on function public.farm_festival_claim(text) to authenticated;
