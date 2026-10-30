-- =========================================================
-- 序光計畫：⏱️ 懸浮倒數 → 時間到推播
-- 要先跑過「2026-10-29_推播提醒.sql」。可以重複執行。
--   網站開始倒數時呼叫 push_timer_set(秒數)，時間到（誤差 30 秒內）推播到你所有開了通知的裝置
--   暫停、重來時呼叫 push_timer_cancel()
-- =========================================================

create table if not exists public.push_timers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fire_at timestamptz not null,
  title text not null default '⏱️ 時間到了！',
  sent boolean not null default false
);
alter table public.push_timers enable row level security;
revoke all on public.push_timers from anon, authenticated;

create or replace function public.push_timer_set(p_seconds integer, p_title text default null)
returns void language sql security definer set search_path to 'public'
as $function$
  insert into public.push_timers (user_id, fire_at, title, sent)
  values (auth.uid(), now() + make_interval(secs => greatest(1, p_seconds)), coalesce(nullif(p_title, ''), '⏱️ 時間到了！'), false)
  on conflict (user_id) do update set fire_at = excluded.fire_at, title = excluded.title, sent = false;
$function$;
grant execute on function public.push_timer_set(integer, text) to authenticated;

create or replace function public.push_timer_cancel()
returns void language sql security definer set search_path to 'public'
as $function$ delete from public.push_timers where user_id = auth.uid(); $function$;
grant execute on function public.push_timer_cancel() to authenticated;

-- 給推播服務：到時間的倒數（拿了就標記送出）
create or replace function public.push_timers_due()
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare out jsonb := '[]'::jsonb; t record;
begin
  for t in update public.push_timers set sent = true where not sent and fire_at <= now() + interval '5 seconds' returning * loop
    out := out || jsonb_build_object('msg', jsonb_build_object('title', t.title, 'body', '倒數結束，休息一下或開始下一件事吧。', 'url', './#focus'),
      'subs', public.push_subs_of(t.user_id));
  end loop;
  delete from public.push_timers where sent and fire_at < now() - interval '1 day';
  return out;
end;
$function$;
revoke all on function public.push_timers_due() from public, anon, authenticated;
grant execute on function public.push_timers_due() to service_role;

-- 每 30 秒看一次有沒有到時間的倒數
do $do$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'push-timers';
  perform cron.schedule('push-timers', '30 seconds', $cron$
    select net.http_post(
      url := 'https://smlaokhqhgzjhnxeqfen.supabase.co/functions/v1/push-remind',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"timers":true}'::jsonb,
      timeout_milliseconds := 20000);
  $cron$);
end $do$;
