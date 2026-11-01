-- =========================================================
-- 序光計畫：🌠 限定星願瓶加碼
-- 要先跑過「2026-10-30_復刻池.sql」。可以重複執行。
--
--   原本：每月累計簽到 7 天 1 瓶、全勤再 2 瓶、星屑商店 150 星屑
--   新增（打開星願池時自動發，每項只發一次）：
--     📅 每週簽到滿 5 天：1 瓶（每週）
--     ⚔️ 打倒冒險每週王：1 瓶（每週）
--     ⏱️ 這個月專注每滿 10 小時：1 瓶（每月最多 3 瓶）
--   一個月大約可以多拿 8～11 瓶
-- =========================================================

create or replace function public.wish_ltd_bonus(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  t date := public.app_today();
  ws date := t - (extract(isodow from t)::int - 1);       -- 這週一
  w date;
  n integer;
  hours numeric;
  got jsonb := '[]'::jsonb;
  info jsonb;
begin
  -- 📅 這週、上週簽到滿 5 天
  foreach w in array array[ws - 7, ws] loop
    select count(*) into n from public.checkins where user_id = u and checkin_date between w and w + 6;
    if n >= 5 and public.grant_item(u, 'wish_limited', 1, 'ltd-checkin:' || w) then
      got := got || jsonb_build_object('why', '這週簽到滿 5 天');
    end if;
  end loop;
  -- ⚔️ 這週、上週打倒每週王
  begin
    foreach w in array array[ws - 7, ws] loop
      if exists (select 1 from public.rpg_boss_runs where user_id = u and week_start = w and killed_at is not null)
         and public.grant_item(u, 'wish_limited', 1, 'ltd-boss:' || w) then
        got := got || jsonb_build_object('why', '打倒冒險每週王');
      end if;
    end loop;
  exception when others then null;
  end;
  -- ⏱️ 這個月專注每滿 10 小時（最多 3 瓶）
  select coalesce(sum(duration_seconds), 0) / 3600.0 into hours from public.focus_sessions
    where user_id = u and not coalesce(is_manual, false) and session_date >= date_trunc('month', t)::date and session_date <= t;
  for n in 1..least(3, floor(hours / 10)::int) loop
    if public.grant_item(u, 'wish_limited', 1, 'ltd-focus:' || to_char(t, 'YYYY-MM') || ':' || n) then
      got := got || jsonb_build_object('why', '這個月專注滿 ' || (n * 10) || ' 小時');
    end if;
  end loop;

  select count(*) into n from public.checkins where user_id = u and checkin_date between ws and ws + 6;
  info := jsonb_build_object(
    'week_checkins', n,
    'boss_killed', coalesce((select killed_at is not null from public.rpg_boss_runs where user_id = u and week_start = ws), false),
    'month_hours', round(hours, 1),
    'focus_got', least(3, floor(hours / 10)::int),
    'got', got);
  return info;
exception when others then
  return jsonb_build_object('got', '[]'::jsonb);
end;
$function$;
revoke all on function public.wish_ltd_bonus(uuid) from public, anon, authenticated;

-- 狀態裡帶上加碼進度（打開星願池就順便發）
create or replace function public.farm_wish_status_of(p_user uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare b jsonb := public.wish_ltd_bonus(p_user);
begin
  return public.farm_wish_status_of_base(p_user)
    || jsonb_build_object('retro_n', coalesce((select retro_n from public.farm_wish where user_id = p_user), 1), 'ltd_bonus', b);
end;
$function$;
revoke all on function public.farm_wish_status_of(uuid) from public, anon, authenticated;
