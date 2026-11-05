-- =========================================================
-- 序光計畫：🌳 人生之樹
-- 要先跑過「2026-11-05_月報.sql」「2026-11-05_生活打卡_徽章熱力圖.sql」。可以重複執行。
--
--   從你開始用網站的那個月開始，每個月長一層：
--     🔵 藍葉＝專注時數、🟢 綠葉＝生活打卡全勤＋簽到、🌿 樹枝粗細＝任務完成率
--     🌸 花＝跟好友互動（競技決鬥、一起專注）、🍎 果實＝打倒每週王＋重要徽章
--     🍂 落葉＝那個月比較低迷（不會死，只是留下痕跡）
-- =========================================================

create or replace function public.life_tree()
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); m0 date; m date; t date := public.app_today(); out jsonb := '[]'::jsonb; st jsonb; t0 timestamptz; t1 timestamptz;
begin
  if u is null then raise exception '尚未登入'; end if;
  select date_trunc('month', least(
      coalesce((select (to_jsonb(p)->>'created_at')::timestamptz from public.profiles p where p.id = u), now()),
      coalesce((select min(started_at) from public.focus_sessions where user_id = u), now())) at time zone 'Asia/Taipei')::date into m0;
  m := m0;
  while m <= t loop
    st := public.month_stats(u, m);
    t0 := (m::timestamp + interval '6 hours') at time zone 'Asia/Taipei';
    t1 := ((m + interval '1 month')::timestamp + interval '6 hours') at time zone 'Asia/Taipei';
    out := out || (st || jsonb_build_object(
      'month', m,
      'current', m = date_trunc('month', t)::date,
      'social', (select count(*) from public.arena_duels where user_id = u and day >= m and day < (m + interval '1 month')::date)
              + coalesce((select count(*) * 3 from public.coop_claims where user_id = u and at >= t0 and at < t1), 0),
      'fruits', coalesce((st->>'boss_kills')::int, 0)
              + (select count(*) from public.life_badges where user_id = u and got_at >= t0 and got_at < t1
                   and (badge ~ ':s(14|30|60|100|8|12|26|52)$' or badge ~ ':lv(10|20|30|50)$')),
      'fruit_list', coalesce((select jsonb_agg(badge order by got_at) from public.life_badges where user_id = u and got_at >= t0 and got_at < t1
                   and (badge ~ ':s(14|30|60|100|8|12|26|52)$' or badge ~ ':lv(10|20|30|50)$')), '[]'::jsonb)));
    m := (m + interval '1 month')::date;
  end loop;
  return json_build_object('start', m0, 'months', out);
end; $$;
revoke all on function public.life_tree() from public, anon;
grant execute on function public.life_tree() to authenticated;
