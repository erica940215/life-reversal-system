-- =========================================================
-- 序光計畫：📅 每週回顧推播 ＋ 🌳 人生之樹上的夢獸
-- 要先跑過「2026-11-05_夢境和人生之樹.sql」「2026-10-24_推播.sql」。可以重複執行。
--
--   📅 每週日晚上 8 點（8:00～8:59 之間送一次）：
--      「這週專注 X 小時・任務 a/b・生活打卡 Y%・夢境收集 Z 隻・競技 W 勝」
--      點通知會直接打開「📊 回顧 → 週回顧」
--   🌳 人生之樹：那個月有連續入夢 7 晚以上，樹枝上會多一隻夢獸在睡覺
--      （那個月拿到最稀有的夢境收藏；連續 14、21… 晚再多一隻，最多 3 隻）
-- =========================================================

create or replace function public.week_recap(u uuid, ws date)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with d as (select x::date d from generate_series(ws, least(ws + 6, public.app_today()), interval '1 day') x)
  select jsonb_build_object(
    'focus_h', round(coalesce((select sum(duration_seconds) from public.focus_sessions where user_id = u and session_date between ws and ws + 6), 0) / 3600.0, 1),
    'tasks_done', (select count(*) from public.tasks where user_id = u and task_date between ws and ws + 6 and completed),
    'tasks_total', (select count(*) from public.tasks where user_id = u and task_date between ws and ws + 6 and not coalesce(skipped, false)),
    'life_pct', (select round(avg(p)) from (select public.life_pct(u, dom, d.d) p from d, unnest(array['sleep', 'care', 'health', 'food', 'life']) dom) x where p is not null),
    'life_all', (select count(*) from d where public.life_all_clear(u, d.d)),
    'dream_new', (select count(*) from public.dream_items where user_id = u
                   and first_at >= (ws::timestamp + interval '6 hours') at time zone 'Asia/Taipei'
                   and first_at < ((ws + 7)::timestamp + interval '6 hours') at time zone 'Asia/Taipei'),
    'dream_total', (select count(*) from public.dream_items where user_id = u),
    'dream_nights', (select count(*) from public.dream_nights where user_id = u and entered_at is not null and day between ws and ws + 6),
    'arena_w', (select count(*) from public.arena_duels where user_id = u and win and day between ws and ws + 6))
$$;
revoke all on function public.week_recap(uuid, date) from public, anon, authenticated;

-- 推播：原本的提醒＋週日晚上的每週回顧
do $$ begin
  if to_regprocedure('public.push_due_base()') is null then alter function public.push_due() rename to push_due_base; end if;
end $$;
revoke all on function public.push_due_base() from public, anon, authenticated;

create or replace function public.push_due()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  out jsonb := public.push_due_base(); now_tp timestamp := now() at time zone 'Asia/Taipei';
  ws date := public.life_week(public.app_today()); s record; r jsonb; body text; title text;
begin
  if (extract(isodow from now_tp) = 7 and extract(hour from now_tp) = 20) or current_setting('test.weekly', true) = '1' then
    for s in select * from public.push_settings p where exists (select 1 from public.push_subs x where x.user_id = p.user_id)
               and coalesce(p.sent->>'weekly', '') <> ws::text loop
      update public.push_settings set sent = sent || jsonb_build_object('weekly', ws::text) where user_id = s.user_id;
      r := public.week_recap(s.user_id, ws);
      title := case when (r->>'focus_h')::numeric >= 20 or coalesce((r->>'life_pct')::int, 0) >= 80 then '🌟 這週超棒！來回顧一下'
                    else '📅 這週回顧' end;
      body := '專注 ' || (r->>'focus_h') || ' 小時・任務 ' || (r->>'tasks_done') || '/' || (r->>'tasks_total')
        || coalesce('・生活打卡 ' || (r->>'life_pct') || '%', '')
        || '・夢境收集 ' || (r->>'dream_total') || ' 隻' || case when (r->>'dream_new')::int > 0 then '（這週 +' || (r->>'dream_new') || '）' else '' end
        || case when (r->>'arena_w')::int > 0 then '・競技 ' || (r->>'arena_w') || ' 勝' else '' end
        || '。點開看完整回顧，順便勾「回顧這週」。';
      out := out || jsonb_build_array(jsonb_build_object('user_id', s.user_id,
        'msg', jsonb_build_object('title', title, 'body', body, 'url', './?review=week#today', 'tag', 'weekly'),
        'subs', public.push_subs_of(s.user_id)));
    end loop;
  end if;
  return out;
end; $$;
revoke all on function public.push_due() from public, anon, authenticated;

-- 網站裡也看得到（週回顧最上面）
create or replace function public.week_recap_me()
returns json language sql security definer set search_path to 'public' as $$
  select (public.week_recap(auth.uid(), public.life_week(public.app_today())) || jsonb_build_object('week', public.life_week(public.app_today())))::json
$$;
revoke all on function public.week_recap_me() from public, anon;
grant execute on function public.week_recap_me() to authenticated;

-- 🌳 人生之樹：每個月多帶「夢獸」
do $$ begin
  if to_regprocedure('public.life_tree_base()') is null then alter function public.life_tree() rename to life_tree_base; end if;
end $$;
revoke all on function public.life_tree_base() from public, anon, authenticated;

create or replace function public.life_tree()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); b jsonb := public.life_tree_base()::jsonb; mo jsonb; out jsonb := '[]'::jsonb; m date; best integer; pets jsonb;
begin
  for mo in select * from jsonb_array_elements(b->'months') loop
    m := (mo->>'month')::date;
    select coalesce(max(streak), 0) into best from public.dream_nights where user_id = u and entered_at is not null and day >= m and day < (m + interval '1 month')::date;
    pets := '[]'::jsonb;
    if best >= 7 then
      select coalesce(jsonb_agg(x), '[]'::jsonb) into pets from (
        select jsonb_build_object('key', e->>'key', 'name', e->>'name', 'emoji', e->>'emoji') x
          from public.dream_items di join jsonb_array_elements(public.dream_catalog()) e on e->>'key' = di.item
         where di.user_id = u and di.first_at < ((m + interval '1 month')::timestamp + interval '6 hours') at time zone 'Asia/Taipei'
         order by case e->>'tier' when 'm' then 0 when 'l' then 1 when 'r' then 2 else 3 end,
                  (di.first_at >= (m::timestamp + interval '6 hours') at time zone 'Asia/Taipei') desc, di.first_at desc
         limit least(3, best / 7)) q;
    end if;
    out := out || (mo || jsonb_build_object('dream_streak', best, 'dream_pets', pets));
  end loop;
  return (b || jsonb_build_object('months', out))::json;
end; $$;
revoke all on function public.life_tree() from public, anon;
grant execute on function public.life_tree() to authenticated;
