-- =========================================================
-- 序光計畫：農場「訂單任務」交單獎勵（隨機）
-- 可以重複執行。要先執行過「簽到發券與背包」（需要 grant_item）。
--
-- 每張訂單交單時，伺服器隨機抽一份獎勵：
--   40%  ⭐ 星屑 ×1
--   25%  ⭐ 星屑 ×3
--   20%  🎫 普通星願券 ×1
--   10%  🎟️ 普通召喚券 ×1
--    5%  ⭐ 星屑 ×6
-- 同一張訂單（day:slot）只能領一次。
-- =========================================================


create or replace function public.farm_order_claim(p_key text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_roll integer;
  v_item text;
  v_qty integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_key is null or p_key !~ '^\d{4}-\d{2}-\d{2}:[0-9]$' then raise exception '訂單編號不對'; end if;

  if exists (select 1 from public.item_events where user_id = v_user and source_key = 'farmorder:' || p_key) then
    return json_build_object('success', true, 'already', true);
  end if;

  v_roll := floor(random() * 100)::integer;
  if v_roll < 40 then        v_item := 'stardust';    v_qty := 1;
  elsif v_roll < 65 then     v_item := 'stardust';    v_qty := 3;
  elsif v_roll < 85 then     v_item := 'wish_normal'; v_qty := 1;
  elsif v_roll < 95 then     v_item := 'ticket_normal'; v_qty := 1;
  else                       v_item := 'stardust';    v_qty := 6;
  end if;

  perform public.grant_item(v_user, v_item, v_qty, 'farmorder:' || p_key);

  return json_build_object('success', true, 'already', false, 'item', v_item, 'qty', v_qty);
end;
$function$;

revoke all on function public.farm_order_claim(text) from public, anon;
grant execute on function public.farm_order_claim(text) to authenticated;

notify pgrst, 'reload schema';


-- ---------- ✅ 檢查結果 ----------
select case
  when exists (select 1 from pg_proc where proname = 'farm_order_claim' and pronamespace = 'public'::regnamespace)
    then '✅ 農場訂單設定完成'
  else '⚠️ 設定失敗'
end as 檢查結果;
