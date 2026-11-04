-- =========================================================
-- 序光計畫：🤝 兩人共同目標（每週，跟每個好友各一組）
-- 要先跑過「2026-11-05_競技商店擴充.sql」。可以重複執行。
--
--   這週（週一～週日）兩個人的專注時間加起來（不算補記）：
--     🥉 20 小時：競技幣 60＋星屑 100
--     🥈 40 小時：競技幣 100＋限定星願瓶 1
--     🥇 60 小時：限定召喚券 1＋星光寶箱 1
--   兩個人都拿得到（各自打開競技場時領）；上週沒領到的，這週打開也會補發
-- =========================================================

create table if not exists public.coop_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  claim text not null,
  at timestamptz not null default now(),
  primary key (user_id, claim)
);
alter table public.coop_claims enable row level security;
revoke all on public.coop_claims from anon, authenticated;

create or replace function public.coop_tiers()
returns jsonb language sql immutable as $$ select $j$[
  {"h":20,"name":"🥉 銅","reward":{"arena_coin":60,"stardust":100}},
  {"h":40,"name":"🥈 銀","reward":{"arena_coin":100,"wish_limited":1}},
  {"h":60,"name":"🥇 金","reward":{"ticket_limited":1,"chest_star":1}}
]$j$::jsonb $$;

create or replace function public.coop_hours(u uuid, ws date)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select round(coalesce(sum(duration_seconds), 0) / 3600.0, 1) from public.focus_sessions
   where user_id = u and session_date between ws and ws + 6 and not coalesce(is_manual, false)
$$;
revoke all on function public.coop_hours(uuid, date) from public, anon, authenticated;

create or replace function public.coop_week(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  t date := public.app_today(); ws date := public.life_week(t); w date; f uuid; tier jsonb; k text; v integer;
  out jsonb := '[]'::jsonb; got jsonb := '[]'::jsonb; me numeric; them numeric; tot numeric;
begin
  for f in select * from public.arena_friends(u) loop
    -- 上週、這週達標就發（每個人自己領自己的）
    foreach w in array array[ws - 7, ws] loop
      tot := public.coop_hours(u, w) + public.coop_hours(f, w);
      for tier in select * from jsonb_array_elements(public.coop_tiers()) loop
        exit when tot < (tier->>'h')::numeric;
        insert into public.coop_claims (user_id, claim) values (u, f || ':' || w || ':' || (tier->>'h')) on conflict do nothing;
        if found then
          for k, v in select key, value::int from jsonb_each_text(tier->'reward') loop
            perform public.grant_item(u, k, v, 'coop:' || f || ':' || w || ':' || (tier->>'h') || ':' || k);
          end loop;
          got := got || jsonb_build_object('why', '🤝 和 ' || public.arena_name(f) || ' 一起專注 ' || (tier->>'h') || ' 小時', 'reward', tier->'reward');
        end if;
      end loop;
    end loop;
    me := public.coop_hours(u, ws); them := public.coop_hours(f, ws);
    out := out || jsonb_build_object('friend', public.arena_name(f), 'me', me, 'them', them, 'total', me + them,
      'days_left', ws + 6 - t + 1,
      'daily', (select jsonb_agg(jsonb_build_object('d', d::date,
                  'me', round(coalesce((select sum(duration_seconds) from public.focus_sessions where user_id = u and session_date = d::date and not coalesce(is_manual, false)), 0) / 3600.0, 1),
                  'them', round(coalesce((select sum(duration_seconds) from public.focus_sessions where user_id = f and session_date = d::date and not coalesce(is_manual, false)), 0) / 3600.0, 1)) order by d)
                from generate_series(ws, ws + 6, interval '1 day') d));
  end loop;
  return jsonb_build_object('week', ws, 'tiers', public.coop_tiers(), 'pairs', out, 'got', got);
end; $$;
revoke all on function public.coop_week(uuid) from public, anon, authenticated;

create or replace function public.arena_status()
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  return (public.arena_status_shop()::jsonb || jsonb_build_object('owned', public.arena_owned(auth.uid()), 'coop', public.coop_week(auth.uid())))::json;
end; $$;
revoke all on function public.arena_status() from public, anon;
grant execute on function public.arena_status() to authenticated;
