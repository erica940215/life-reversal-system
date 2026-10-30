-- =========================================================
-- 序光計畫：📰 每週戰報＋🏅 成就總覽
-- 要先跑過「2026-10-30_通知與回顧.sql」「2026-10-30_末世_美食進階.sql」「2026-10-30_冒險_裝備突破.sql」。可以重複執行。
--
--   life_game_week(p_offset)：這週三個遊戲各拿了什麼、打倒了什麼，跟上週比
--   life_achievements()：三個遊戲的成就、限定收藏、美食收藏，給「收藏」頁的成就總覽
-- =========================================================

create or replace function public.life_game_stats(u uuid, d1 date, d2 date)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  t1 timestamptz := (d1::timestamp + interval '2 hours') at time zone 'Asia/Taipei';
  t2 timestamptz := ((d2 + 1)::timestamp + interval '2 hours') at time zone 'Asia/Taipei';
  r jsonb := '{}'::jsonb;
begin
  r := r || jsonb_build_object(
    'stardust', (select coalesce(sum(delta), 0) from public.item_events where user_id = u and item_key = 'stardust' and delta > 0 and created_at >= t1 and created_at < t2),
    'tickets', (select coalesce(-sum(delta), 0) from public.item_events where user_id = u and item_key like 'ticket_%' and delta < 0 and created_at >= t1 and created_at < t2),
    'wishes', (select coalesce(-sum(delta), 0) from public.item_events where user_id = u and item_key like 'wish_%' and delta < 0 and created_at >= t1 and created_at < t2));
  -- ⚔️ 冒險
  begin
    r := r || jsonb_build_object(
      'summons', (select count(*) from public.rpg_summon_log where user_id = u and created_at >= t1 and created_at < t2),
      'new_gear', (select count(*) from public.rpg_summon_log where user_id = u and result = 'new' and created_at >= t1 and created_at < t2),
      'best_gear', (select gear_key from public.rpg_summon_log where user_id = u and created_at >= t1 and created_at < t2
                    order by position(tier in 'crlxs') desc, created_at desc limit 1),
      'boss_hits', (select count(*) from public.rpg_boss_hits where user_id = u and created_at >= t1 and created_at < t2),
      'boss_dmg', (select coalesce(sum(dmg), 0) from public.rpg_boss_hits where user_id = u and created_at >= t1 and created_at < t2),
      'boss_kills', (select count(*) from public.rpg_boss_runs where user_id = u and killed_at >= t1 and killed_at < t2));
  exception when others then null;
  end;
  -- 🏝️ 星露島
  begin
    r := r || jsonb_build_object(
      'wish_draws', (select count(*) from public.farm_wish_log where user_id = u and created_at >= t1 and created_at < t2),
      'wish_big', (select count(*) from public.farm_wish_log where user_id = u and tier in ('x', 's') and created_at >= t1 and created_at < t2),
      'farm_orders', (select count(*) from public.item_events where user_id = u and (source_key like 'farmorder:%' or source_key like 'farmbig:%' or source_key like 'farmfest:%') and created_at >= t1 and created_at < t2));
  exception when others then null;
  end;
  -- ☢️ 末世
  begin
    r := r || jsonb_build_object(
      'doom_runs', (select count(*) from public.doom_runs where user_id = u and created_at >= t1 and created_at < t2),
      'doom_draws', (select coalesce(sum(draws), 0) from public.doom_days where user_id = u and day between d1 and d2),
      'doom_meals', (select count(*) from public.doom_days where user_id = u and day between d1 and d2 and meal is not null),
      'zombies', (select coalesce(sum(coalesce((result->'zombies'->>'walker')::int, 0) + coalesce((result->'zombies'->>'mutant')::int, 0) + coalesce((result->'zombies'->>'king')::int, 0)), 0)
                  from public.doom_runs where user_id = u and created_at >= t1 and created_at < t2),
      'cores', (select coalesce(sum(coalesce((result->'zombies'->>'cores')::int, 0)), 0) from public.doom_runs where user_id = u and created_at >= t1 and created_at < t2),
      'zombie_kings', (select coalesce(sum(coalesce((result->'zombies'->>'king')::int, 0)), 0) from public.doom_runs where user_id = u and created_at >= t1 and created_at < t2),
      'rescued', (select coalesce(sum(coalesce((result->>'rescued')::int, 0)), 0) from public.doom_runs where user_id = u and created_at >= t1 and created_at < t2),
      'doom_rare', (select count(*) from public.doom_log where user_id = u and day between d1 and d2 and tier in ('x', 's')),
      'doom_highlights', (select coalesce(jsonb_agg(body order by created_at desc), '[]'::jsonb) from (
          select body, created_at from public.doom_log where user_id = u and day between d1 and d2 and tier in ('x', 's') order by created_at desc limit 5) q));
  exception when others then null;
  end;
  return r;
end;
$function$;
revoke all on function public.life_game_stats(uuid, date, date) from public, anon, authenticated;

create or replace function public.life_game_week(p_offset integer default 0)
returns json language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  t date := public.app_today();
  ws date := t - (extract(isodow from t)::int - 1) + 7 * coalesce(p_offset, 0);
begin
  if u is null then raise exception '尚未登入'; end if;
  return json_build_object('start', ws, 'end', ws + 6, 'today', t,
    'now', public.life_game_stats(u, ws, least(ws + 6, t)),
    'prev', public.life_game_stats(u, ws - 7, ws - 1));
end;
$function$;
grant execute on function public.life_game_week(integer) to authenticated;

create or replace function public.life_achievements()
returns json language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  out jsonb := '{}'::jsonb;
  st public.doom_state%rowtype;
  w public.farm_wish%rowtype;
  mon text := to_char(public.app_today(), 'YYYY-MM');
begin
  if u is null then raise exception '尚未登入'; end if;
  begin
    out := out || jsonb_build_object('farm_ach', (select count(*) from public.item_events where user_id = u and item_key = 'stardust' and source_key like 'achieve:%'),
      'farm_ach_total', (select count(*) from jsonb_object_keys(public.farm_achieve_catalog())));
  exception when others then null; end;
  begin
    select * into w from public.farm_wish where user_id = u;
    out := out || jsonb_build_object(
      'farm_ltd', (select count(distinct k) from jsonb_each(public.farm_wish_catalog()->'months') m, lateral (
          select jsonb_array_elements_text(m.value->'s') k union all select jsonb_array_elements_text(m.value->'x') union all select jsonb_array_elements_text(m.value->'l')) x
        where m.key <= mon and coalesce(w.owned, '{}'::jsonb) ? k),
      'farm_ltd_total', (select count(distinct k) from jsonb_each(public.farm_wish_catalog()->'months') m, lateral (
          select jsonb_array_elements_text(m.value->'s') k union all select jsonb_array_elements_text(m.value->'x') union all select jsonb_array_elements_text(m.value->'l')) x
        where m.key <= mon));
  exception when others then null; end;
  begin
    out := out || jsonb_build_object(
      'rpg_ltd', (select count(*) from public.rpg_gear g where g.user_id = u and public.rpg_catalog()->'gear'->g.gear_key->>'pool' = 'limited'),
      'rpg_ltd_total', (select count(*) from jsonb_each(public.rpg_catalog()->'gear') e where e.value->>'pool' = 'limited'),
      'rpg_stars', (select coalesce(sum(star), 0) from public.rpg_gear where user_id = u),
      'rpg_stars_total', 3 * (select count(*) from public.rpg_gear where user_id = u),
      'rpg_eggs', (select count(*) from public.rpg_eggs where user_id = u),
      'boss_kills', (select count(*) from public.rpg_boss_runs where user_id = u and killed_at is not null));
  exception when others then null; end;
  begin
    select * into st from public.doom_state where user_id = u;
    if found then
      out := out || jsonb_build_object(
        'food_got', (select count(*) from jsonb_array_elements(public.doom_food_cat()->'items') el
                     where st.fgot ? (el->>'id') or st.eaten ? (el->>'id') or coalesce((st.pantry->>(el->>'id'))::int, 0) > 0),
        'food_total', jsonb_array_length(public.doom_food_cat()->'items'),
        'food_eaten', (select count(*) from jsonb_object_keys(st.eaten)),
        'fach', (select count(*) from jsonb_object_keys(st.rewards) k where k like 'fach:%'),
        'fach_total', jsonb_array_length(public.doom_fach_cat()),
        'tsets', (select count(*) from jsonb_object_keys(st.rewards) k where k like 'tset:%'),
        'tsets_total', jsonb_array_length(public.doom_trinket_cat()->'series'),
        'doom_ltd', (select count(*) from jsonb_each(public.doom_ltd_cat()) m where m.key <= mon and st.companions ? (m.value->>'comp'))
                  + (select count(*) from jsonb_each(public.doom_ltd_cat()) m, jsonb_array_elements_text(m.value->'foods') f where m.key <= mon and (st.fgot ? f or st.eaten ? f)),
        'doom_ltd_total', (select count(*) * 4 from jsonb_each(public.doom_ltd_cat()) m where m.key <= mon),
        'powers', (select coalesce(sum(value::int), 0) from jsonb_each_text(st.powers)),
        'powers_total', 10 * jsonb_array_length(public.doom_power_cat()->'powers'),
        'farm_lv', coalesce((st.dfarm->>'lv')::int, 1));
    end if;
  exception when others then null; end;
  return out::json;
end;
$function$;
grant execute on function public.life_achievements() to authenticated;
