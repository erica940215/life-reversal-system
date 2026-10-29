-- =========================================================
-- 序光計畫：🔔 推播提醒（網站關著也收得到）
-- 可以重複執行。
--
--   push_subs        每台裝置的推播訂閱（一個人可以有好幾台）
--   push_settings    提醒時間（台北時間）、只在還有任務沒完成時才提醒
--   push_due()       排程每 10 分鐘呼叫一次：找出現在該提醒的人、組好內容、記下已送出
--   push_vapid()     送推播用的私鑰（放在 Vault，名字 push_vapid_private，不寫在這個檔案裡）
--   pg_cron 每 10 分鐘呼叫 Edge Function「push-remind」，由它真的把通知送出去
-- =========================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.push_subs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user on public.push_subs (user_id);
alter table public.push_subs enable row level security;

create table if not exists public.push_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  times text[] not null default '{21:00}',
  only_pending boolean not null default true,
  sent jsonb not null default '{}'::jsonb,       -- {"21:00":"2026-10-29"}：哪個時間今天送過了
  updated_at timestamptz not null default now()
);
alter table public.push_settings enable row level security;
-- 兩張表都不開放直接讀寫，只能透過下面的函式


-- ---------- 📱 這台裝置開啟／關閉通知 ----------
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '尚未登入'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' then raise exception '訂閱資料不正確'; end if;
  insert into public.push_subs (user_id, endpoint, p256dh, auth, ua)
    values (u, p_endpoint, p_p256dh, p_auth, left(p_ua, 200))
    on conflict (endpoint) do update set user_id = u, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua;
  insert into public.push_settings (user_id) values (u) on conflict (user_id) do nothing;
  return public.push_get();
end;
$function$;

create or replace function public.push_unsubscribe(p_endpoint text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
begin
  delete from public.push_subs where endpoint = p_endpoint and user_id = auth.uid();
  return public.push_get();
end;
$function$;


-- ---------- ⚙️ 提醒設定 ----------
create or replace function public.push_get()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); s public.push_settings%rowtype;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into s from public.push_settings where user_id = u;
  return json_build_object(
    'enabled', coalesce(s.enabled, true),
    'times', coalesce(s.times, '{21:00}'),
    'only_pending', coalesce(s.only_pending, true),
    'devices', (select count(*) from public.push_subs where user_id = u),
    'endpoints', (select coalesce(json_agg(endpoint), '[]'::json) from public.push_subs where user_id = u));
end;
$function$;

create or replace function public.push_save(p_enabled boolean, p_times text[], p_only_pending boolean)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); t text; clean text[] := '{}';
begin
  if u is null then raise exception '尚未登入'; end if;
  foreach t in array coalesce(p_times, '{}') loop
    if t ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and not t = any(clean) then clean := clean || t; end if;
  end loop;
  if array_length(clean, 1) > 6 then raise exception '提醒時間最多 6 個'; end if;
  select array_agg(x order by x) into clean from unnest(clean) x;
  insert into public.push_settings (user_id, enabled, times, only_pending, updated_at)
    values (u, p_enabled, coalesce(clean, '{}'), p_only_pending, now())
    on conflict (user_id) do update set enabled = p_enabled, times = coalesce(clean, '{}'),
      only_pending = p_only_pending, updated_at = now();
  return public.push_get();
end;
$function$;

grant execute on function public.push_subscribe(text, text, text, text) to authenticated;
grant execute on function public.push_unsubscribe(text) to authenticated;
grant execute on function public.push_get() to authenticated;
grant execute on function public.push_save(boolean, text[], boolean) to authenticated;
revoke all on function public.push_subscribe(text, text, text, text) from public, anon;
revoke all on function public.push_unsubscribe(text) from public, anon;
revoke all on function public.push_get() from public, anon;
revoke all on function public.push_save(boolean, text[], boolean) from public, anon;


-- ---------- ⏰ 現在該提醒誰（只給 Edge Function 用） ----------
-- 提醒時間到了之後的 60 分鐘內才送（排程漏跑也不會半夜補送）；每個時間每天只送一次
create or replace function public.push_due()
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  now_tp timestamp := now() at time zone 'Asia/Taipei';
  today date := public.app_today();
  s record;
  t text;
  due_at timestamp;
  n integer;
  titles text;
  msg jsonb;
  out jsonb := '[]'::jsonb;
begin
  for s in select * from public.push_settings p
           where p.enabled and exists (select 1 from public.push_subs x where x.user_id = p.user_id) loop
    foreach t in array s.times loop
      due_at := now_tp::date + t::time;
      continue when now_tp < due_at or now_tp >= due_at + interval '60 minutes';
      continue when coalesce(s.sent->>t, '') = today::text;
      update public.push_settings set sent = sent || jsonb_build_object(t, today::text) where user_id = s.user_id;

      select count(*), string_agg(title, '、' order by id) filter (where rn <= 3)
        into n, titles
        from (select id, title, row_number() over (order by id) rn from public.tasks
              where user_id = s.user_id and task_date = today and not completed and not coalesce(skipped, false)) q;

      if n = 0 then
        continue when s.only_pending;
        msg := jsonb_build_object('title', '🎉 今天的任務都完成了', 'body', '太棒了！記得也去專注一下、收一收農場。', 'url', './#today');
      else
        msg := jsonb_build_object(
          'title', '📋 還有 ' || n || ' 個任務沒完成',
          'body', titles || case when n > 3 then ' …等 ' || n || ' 個' else '' end,
          'url', './#tasks');
      end if;

      out := out || jsonb_build_object('user_id', s.user_id, 'msg', msg,
        'subs', (select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth))
                 from public.push_subs where user_id = s.user_id));
    end loop;
  end loop;
  return out;
end;
$function$;
revoke all on function public.push_due() from public, anon, authenticated;
grant execute on function public.push_due() to service_role;

-- 「送測試通知」用：某個人的所有裝置
create or replace function public.push_subs_of(p_user uuid)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]'::jsonb)
  from public.push_subs where user_id = p_user;
$function$;
revoke all on function public.push_subs_of(uuid) from public, anon, authenticated;
grant execute on function public.push_subs_of(uuid) to service_role;

-- 裝置換掉、取消訂閱之後推播服務會回 404/410，把那筆刪掉
create or replace function public.push_drop(p_endpoint text)
returns void language sql security definer set search_path to 'public'
as $function$ delete from public.push_subs where endpoint = p_endpoint; $function$;
revoke all on function public.push_drop(text) from public, anon, authenticated;
grant execute on function public.push_drop(text) to service_role;

-- 私鑰從 Vault 拿（要另外存進 Vault，名字 push_vapid_private）
create or replace function public.push_vapid()
returns text language sql stable security definer set search_path to 'public'
as $function$ select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_private' limit 1; $function$;
revoke all on function public.push_vapid() from public, anon, authenticated;
grant execute on function public.push_vapid() to service_role;


-- ---------- 🕒 每 10 分鐘叫 Edge Function 檢查一次 ----------
do $$
begin
  perform cron.unschedule('push-remind') where exists (select 1 from cron.job where jobname = 'push-remind');
end $$;
select cron.schedule('push-remind', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://smlaokhqhgzjhnxeqfen.supabase.co/functions/v1/push-remind',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 20000);
$cron$);
