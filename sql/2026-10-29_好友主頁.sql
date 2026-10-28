-- =========================================================
-- 序光計畫：👤 好友主頁（看好友各種遊戲的遊玩狀態）
-- 要先執行「2026-10-19_好友.sql」。可以重複執行。
--   friend_profile(p_friend)：自己或好友才看得到；對方關掉「讓好友看到」時只回名字
--   哪個遊戲的資料表還沒建立，那一塊就回 null，不會整個失敗
-- =========================================================

create or replace function public.friend_profile(p_friend uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  u uuid := p_friend;
  today date := public.app_today();
  wk date := public.app_today() - (extract(isodow from public.app_today())::int - 1);
  out jsonb;
  x jsonb;
  v_share boolean;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if u <> v_user and not exists (select 1 from public.friendships
      where status = 'accepted' and user_a = least(v_user, u) and user_b = greatest(v_user, u)) then
    raise exception '只能看好友的主頁';
  end if;

  select jsonb_build_object('name', coalesce(nullif(trim(username), ''), '玩家'), 'level', level, 'exp', exp, 'gold', gold)
    into out from public.profiles where id = u;
  out := coalesce(out, '{"name":"玩家"}'::jsonb) || jsonb_build_object('me', u = v_user);

  select share into v_share from public.friend_codes where user_id = u;
  if u <> v_user and v_share is false then return out || '{"hidden":true}'::jsonb; end if;

  -- 📅 生活
  begin
    select out || jsonb_build_object(
      'streak', (select streak from public.checkins where user_id = u order by checkin_date desc limit 1),
      'focus_week', (select coalesce(sum(duration_seconds), 0) / 60 from public.focus_sessions where user_id = u and session_date >= wk),
      'focus_total', (select coalesce(sum(duration_seconds), 0) / 3600 from public.focus_sessions where user_id = u),
      'tasks_week', (select count(*) from public.tasks where user_id = u and completed and completed_at >= wk::timestamptz))
      into out;
  exception when others then null; end;

  -- ⚔️ 冒險
  begin
    select jsonb_build_object(
      'class', h.class,
      'power', (public.rpg_power_of(u)->>'power')::int,
      'gear', (select count(*) from public.rpg_gear g where g.user_id = u),
      'boss', (select jsonb_build_object('key', r.boss_key, 'tier', r.tier, 'hp', r.hp, 'dmg', r.dmg, 'killed', r.killed_at is not null)
               from public.rpg_boss_runs r where r.user_id = u and r.week_start = wk),
      'world_dmg', (select dmg from public.world_hits w where w.user_id = u and w.month = to_char(today, 'YYYY-MM')),
      'team', (select t.name from public.team_members m join public.teams t on t.id = m.team_id where m.user_id = u limit 1),
      'skills', (select coalesce(sum(lv), 0) from public.skills s where s.user_id = u))
      into x from public.rpg_heroes h where h.user_id = u;
    out := out || jsonb_build_object('rpg', x);
  exception when others then null; end;

  -- 🎁 驚喜
  begin
    out := out || jsonb_build_object('fun', jsonb_build_object(
      'monsters', (select count(*) from public.fun_monsters where user_id = u),
      'frames', (select count(*) from public.fun_frames where user_id = u),
      'frame', (select frame from public.fun_profile where user_id = u)));
  exception when others then null; end;

  -- 🏝️ 星露島
  begin
    select jsonb_build_object(
      'lv', (state->>'lv')::int, 'dew', (state->>'dew')::int,
      'field', (state->'field'->>'size')::int,
      'harvest', (state->'stats'->>'harvest')::int, 'cook', (state->'stats'->>'cook')::int,
      'fish', (state->'fish'->>'total')::int,
      'animals', jsonb_array_length(coalesce(state->'ranch'->'animals', '[]'::jsonb)),
      'wheat', coalesce((state->'wheatfield'->>'open')::boolean, false))
      into x from public.farm_saves where user_id = u;
    out := out || jsonb_build_object('farm', x);
  exception when others then null; end;

  -- ☢️ 末世
  begin
    select jsonb_build_object(
      'day', s.day_no, 'hp', s.hp, 'morale', s.morale, 'food', s.food, 'water', s.water, 'parts', s.parts,
      'companions', jsonb_array_length(s.companions),
      'relics', (select count(*) from jsonb_object_keys(s.relics)),
      'seen', (select count(*) from jsonb_object_keys(s.seen)),
      'trinkets', (select count(*) from jsonb_object_keys(s.trinkets)),
      'base', (select coalesce(sum(value::int), 0) from jsonb_each_text(s.facilities)),
      'focus', s.focus_total, 'draws', s.draws_total)
      into x from public.doom_state s where s.user_id = u;
    out := out || jsonb_build_object('doom', x);
  exception when others then null; end;

  return out;
end;
$function$;
revoke all on function public.friend_profile(uuid) from public, anon;
grant execute on function public.friend_profile(uuid) to authenticated;
