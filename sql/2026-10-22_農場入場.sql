-- =========================================================
-- 序光計畫：農場入場時間（入場卷）
-- 可以重複執行。要先執行過「簽到發券與背包」（需要 grant_item）。
--
--   早上免費：每天 5:00～11:59 可以免費進 15 分鐘（一天一次）
--   入場卷 farmpass10：完成任務、專注每滿 1 小時各得 1 張，進去 10 分鐘
--   睡前卷 farmpass30：每天自動發 1 張，進去 30 分鐘
--
-- 進去的時間可以疊加：如果還有剩的時間，新的時間接在後面。
-- =========================================================


create table if not exists public.farm_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_day date not null,
  kind text not null,
  minutes integer not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.farm_entries enable row level security;
drop policy if exists "own select" on public.farm_entries;
create policy "own select" on public.farm_entries for select using (auth.uid() = user_id);
revoke insert, update, delete on public.farm_entries from authenticated;
grant select on public.farm_entries to authenticated;


-- ---------- 📊 狀態：每天發一張睡前卷，回傳目前能不能進、還剩多久 ----------
create or replace function public.farm_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_day date := public.app_today();
  v_hour integer := extract(hour from (now() at time zone 'Asia/Taipei'))::integer;
  v_until timestamptz;
  v_p10 integer;
  v_p30 integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  perform public.grant_item(v_user, 'farmpass30', 1, 'farm-daily30:' || v_day);

  select max(expires_at) into v_until from public.farm_entries
    where user_id = v_user and expires_at > now();

  select coalesce(max(case when item_key = 'farmpass10' then qty end), 0),
         coalesce(max(case when item_key = 'farmpass30' then qty end), 0)
    into v_p10, v_p30
    from public.player_items where user_id = v_user and item_key in ('farmpass10', 'farmpass30');

  return json_build_object(
    'active_until', v_until,
    'pass10', v_p10,
    'pass30', v_p30,
    'morning_ok', (v_hour between 5 and 11) and not exists (
      select 1 from public.farm_entries where user_id = v_user and entry_day = v_day and kind = 'morning'),
    'hour', v_hour
  );
end;
$function$;

revoke all on function public.farm_status() from public, anon;
grant execute on function public.farm_status() to authenticated;


-- ---------- 🚪 進農場：kind = morning / pass10 / pass30 ----------
create or replace function public.farm_enter(p_kind text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_day date := public.app_today();
  v_hour integer := extract(hour from (now() at time zone 'Asia/Taipei'))::integer;
  v_minutes integer;
  v_base timestamptz;
  v_until timestamptz;
  v_left integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  if p_kind = 'morning' then
    v_minutes := 15;
    if not (v_hour between 5 and 11) then raise exception '早上免費時段是 5:00～11:59'; end if;
    if exists (select 1 from public.farm_entries where user_id = v_user and entry_day = v_day and kind = 'morning') then
      raise exception '今天的早上免費已經用過了';
    end if;
  elsif p_kind in ('pass10', 'pass30') then
    v_minutes := case p_kind when 'pass10' then 10 else 30 end;
    update public.player_items set qty = qty - 1, updated_at = now()
      where user_id = v_user and item_key = 'farmpass' || v_minutes and qty >= 1
      returning qty into v_left;
    if not found then raise exception '沒有入場卷了'; end if;
    insert into public.item_events (user_id, item_key, delta, source_key)
      values (v_user, 'farmpass' || v_minutes, -1, 'farm-enter:' || gen_random_uuid()::text);
  else
    raise exception '不認識的入場方式';
  end if;

  select max(expires_at) into v_until from public.farm_entries
    where user_id = v_user and expires_at > now();
  v_base := greatest(now(), coalesce(v_until, now()));

  insert into public.farm_entries (user_id, entry_day, kind, minutes, expires_at)
    values (v_user, v_day, p_kind, v_minutes, v_base + make_interval(mins => v_minutes))
    returning expires_at into v_until;

  return json_build_object('success', true, 'minutes', v_minutes, 'active_until', v_until);
end;
$function$;

revoke all on function public.farm_enter(text) from public, anon;
grant execute on function public.farm_enter(text) to authenticated;

notify pgrst, 'reload schema';


-- ---------- ✅ 檢查結果 ----------
select case
  when exists (select 1 from pg_proc where proname = 'farm_enter' and pronamespace = 'public'::regnamespace)
    then '✅ 農場入場時間設定完成'
  else '⚠️ 設定失敗'
end as 檢查結果;
