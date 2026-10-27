-- =========================================================
-- 🌳 技能樹：金庫分支（金幣技能）＋把戰鬥、遠征技能接回每週王和遠征
--   招財：專案每次打勾 +3 金幣／級
--   戰利品：每週王每次出擊 +5 金幣、打倒王金幣 +10%／級
--   尋金者：專注遠征金幣 +10%／級
--   另外：每週王出擊重新套用蠻力、鋒利、尋寶者和世界王；遠征重新套用遠行者
-- 需要先跑過：2026-10-27_技能擴充.sql。可以重複執行。
-- =========================================================

create or replace function public.skill_catalog()
returns jsonb language sql immutable as $$
  select '[
    {"key":"might",     "branch":"戰鬥", "name":"蠻力",     "emoji":"💪", "max":10, "desc":"出擊傷害 +5%／級"},
    {"key":"sharp",     "branch":"戰鬥", "name":"鋒利",     "emoji":"🗡️", "max":10, "desc":"爆擊率 +3%／級"},
    {"key":"loot",      "branch":"戰鬥", "name":"尋寶者",   "emoji":"🎁", "max":10, "desc":"出擊掉寶箱機率 +5%／級"},
    {"key":"travel",    "branch":"探索", "name":"遠行者",   "emoji":"🧭", "max":10, "desc":"每趟專注遠征星屑 +1／級"},
    {"key":"combo",     "branch":"探索", "name":"連擊大師", "emoji":"⚡", "max":10, "desc":"專注連擊每輪星屑 +1／級"},
    {"key":"scholar",   "branch":"學習", "name":"讀書人",   "emoji":"📖", "max":10, "desc":"每天複習知識卡的星屑上限 +2 張／級"},
    {"key":"diligent",  "branch":"專案", "name":"勤奮",     "emoji":"📝", "max":10, "desc":"專案每次打勾星屑 +1／級"},
    {"key":"fastlearn", "branch":"專案", "name":"速學",     "emoji":"📈", "max":10, "desc":"專案經驗 +5%／級"},
    {"key":"fullclear", "branch":"專案", "name":"全勤王",   "emoji":"🌟", "max":10, "desc":"每日專案全部完成的星屑 +3／級"},
    {"key":"lucky",     "branch":"財運", "name":"幸運星",   "emoji":"🍀", "max":10, "desc":"簽到幸運抽整體往好的方向 +1%／級"},
    {"key":"bargain",   "branch":"財運", "name":"砍價",     "emoji":"🏷️", "max":10, "desc":"冒險商店價格 -3%／級"},
    {"key":"trader",    "branch":"財運", "name":"商才",     "emoji":"💱", "max":10, "desc":"星露換星屑每天上限 +20／級"},
    {"key":"coin",      "branch":"金庫", "name":"招財",     "emoji":"💰", "max":10, "desc":"專案每次打勾 +3 金幣／級"},
    {"key":"spoils",    "branch":"金庫", "name":"戰利品",   "emoji":"🪙", "max":10, "desc":"每週王每次出擊 +5 金幣、打倒王的金幣 +10%／級"},
    {"key":"goldfind",  "branch":"金庫", "name":"尋金者",   "emoji":"🗺️", "max":10, "desc":"專注遠征拿到的金幣 +10%／級"}
  ]'::jsonb
$$;

create or replace function public.project_step_dust(p_user uuid, p_step uuid, p_day date, p_crit text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare d integer := (5 + public.skill_lv(p_user, 'diligent')) * (case p_crit when 'super' then 5 when 'crit' then 2 else 1 end);  -- 技能：勤奮
  g integer := 0;
begin
  if public.grant_item(p_user, 'stardust', d, 'proj-step:' || p_step || ':' || p_day) then
    g := 3 * public.skill_lv(p_user, 'coin');   -- 技能：招財
    if g > 0 then update public.profiles set gold = gold + g, updated_at = now() where id = p_user; end if;
    return jsonb_build_object('stardust', d, 'gold', g);
  end if;
  return '{}'::jsonb;
end;
$function$;

create or replace function public.rpg_boss_attack()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  h public.rpg_heroes%rowtype;
  r public.rpg_boss_runs%rowtype;
  a jsonb;
  v_power integer;
  v_weak text;
  v_mult numeric := 1;
  v_crit boolean;
  v_dmg integer;
  v_killed boolean := false;
  v_gold integer := 5 + 5 * public.skill_lv(auth.uid(), 'spoils');   -- 技能：戰利品
  v_reward jsonb := null;
  v_hit bigint;
  v_chest text := null;
  v_roll numeric;
  v_team bigint;
  rr public.team_raids%rowtype;
  v_cheer integer := 0;
  v_raid_dmg integer := 0;
  v_raid_killed boolean := false;
  v_dead boolean := false;
  m record;
  v_world jsonb := '{}'::jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select * into h from public.rpg_heroes where user_id = v_user;
  if h.class is null then raise exception '先選一個職業才能出擊'; end if;

  perform public.rpg_boss_ensure(v_user);
  select * into r from public.rpg_boss_runs
    where user_id = v_user and week_start = v_today - (extract(isodow from v_today)::int - 1) for update;
  v_team := public.team_of(v_user);
  if r.killed_at is not null then
    if v_team is null then raise exception '這週的王已經打倒了，下週一再來（加入小隊就能繼續打團隊王）'; end if;
    v_dead := true;   -- 自己的王倒了，這次全部打團隊王
  end if;

  a := public.rpg_boss_attacks_today(v_user);
  if (a->>'used')::int >= (a->>'total')::int then
    raise exception '今天的出擊次數用完了（專注滿 60 分、完成 3 個任務、運動都能多 1 次）';
  end if;

  v_power := greatest(10, (public.rpg_power_of(v_user)->>'power')::integer);
  select b->>'weak' into v_weak from jsonb_array_elements(public.rpg_boss_catalog()) b where b->>'key' = r.boss_key;
  if v_weak = h.class then v_mult := 1.3; end if;
  v_mult := v_mult * (1 + 0.05 * public.skill_lv(v_user, 'might'));                       -- 技能：蠻力
  v_crit := random() < (case when h.class = 'ranger' then 0.2 else 0.1 end) + 0.03 * public.skill_lv(v_user, 'sharp');  -- 技能：鋒利
  if v_crit then v_mult := v_mult * 1.5; end if;

  -- 📣 被加油：這次出擊每個加油 +10%（最多 3 個），用掉就沒了
  select least(count(*), 3) into v_cheer from public.cheers where to_user = v_user and day = v_today and not used;
  if v_cheer > 0 then
    v_mult := v_mult * (1 + 0.1 * v_cheer);
    update public.cheers set used = true where to_user = v_user and day = v_today and not used;
  end if;
  v_dmg := round(v_power * (0.85 + random() * 0.3) * v_mult);

  insert into public.rpg_boss_hits (user_id, week_start, hit_day, dmg, crit)
    values (v_user, r.week_start, v_today, v_dmg, v_crit)
    returning id into v_hit;

  if not v_dead then
    update public.rpg_boss_runs set dmg = dmg + v_dmg,
      killed_at = case when dmg + v_dmg >= hp then now() else null end
      where user_id = v_user and week_start = r.week_start
      returning * into r;
  end if;

  -- 🐲 團隊王：同樣的傷害 × 小隊加成
  if v_team is not null then
    perform public.team_raid_ensure(v_team);
    select * into rr from public.team_raids where team_id = v_team and week_start = public.fun_week_start() for update;
    if rr.killed_at is null then
      v_raid_dmg := round(v_dmg * public.team_bonus(v_team));
      insert into public.team_raid_hits (team_id, week_start, user_id, dmg) values (v_team, rr.week_start, v_user, v_raid_dmg);
      update public.team_raids set dmg = dmg + v_raid_dmg,
        killed_at = case when dmg + v_raid_dmg >= hp then now() else null end
        where team_id = v_team and week_start = rr.week_start
        returning * into rr;
      if rr.killed_at is not null then
        v_raid_killed := true;
        for m in select user_id from public.team_members where team_id = v_team loop
          perform public.grant_item(m.user_id, 'chest_team', 1, 'raid:' || rr.week_start);
        end loop;
        perform public.feed_post(v_user, 'raid', jsonb_build_object('boss', rr.boss_key, 'tier', rr.tier,
          'team_name', (select name from public.teams where id = v_team)));
      end if;
    end if;
  end if;

  if random() < 0.25 + 0.05 * public.skill_lv(v_user, 'loot') then   -- 技能：尋寶者
    v_roll := random() * 100;
    v_chest := case when v_roll < 60 then 'chest_wood' when v_roll < 90 then 'chest_iron'
                    when v_roll < 99 then 'chest_gold' else 'chest_star' end;
    perform public.grant_item(v_user, v_chest, 1, 'boss-chest:' || v_hit);
  end if;

  if r.killed_at is not null and not v_dead then
    v_killed := true;
    v_gold := v_gold + round((150 + 50 * r.tier) * (1 + 0.1 * public.skill_lv(v_user, 'spoils')));
    perform public.grant_item(v_user, 'ticket_special', 1, 'boss:' || r.week_start);
    perform public.grant_item(v_user, 'stardust', 3 + r.tier, 'boss-dust:' || r.week_start);
    perform public.grant_item(v_user, 'chest_gold', 1, 'boss-kill-chest:' || r.week_start);
    v_reward := jsonb_build_object('ticket_special', 1, 'stardust', 3 + r.tier, 'chest_gold', 1);
  end if;

  -- 🌍 世界王：同樣的傷害
  v_world := public.world_hit(v_user, v_dmg);

  update public.profiles set gold = gold + v_gold, updated_at = now() where id = v_user;

  return json_build_object('success', true, 'dmg', v_dmg, 'crit', v_crit, 'weak', v_mult >= 1.3 and v_weak = h.class,
    'killed', v_killed, 'gold', v_gold, 'reward', v_reward, 'chest', v_chest, 'run', to_jsonb(r),
    'cheer', v_cheer, 'raid_dmg', v_raid_dmg, 'raid_killed', v_raid_killed, 'personal_dead', v_dead,
    'world_dmg', coalesce((v_world->>'dmg')::int, 0), 'world_killed', coalesce((v_world->>'killed')::boolean, false));
end;
$function$;
revoke all on function public.rpg_boss_attack() from public, anon;
grant execute on function public.rpg_boss_attack() to authenticated;

create or replace function public.exp_claim()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  s record;
  v_min integer; v_place integer; v_early boolean;
  v_reward jsonb; v_out jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  for s in select f.* from public.focus_sessions f
           where f.user_id = v_user and not coalesce(f.is_manual, false)
             and f.duration_seconds >= 600 and f.session_date >= public.app_today() - 2
             and not exists (select 1 from public.expeditions e where e.session_id = f.id)
           order by f.id loop
    v_min := s.duration_seconds / 60;
    v_place := public.exp_place(v_min);
    v_early := s.mode = 'down' and coalesce(s.planned_minutes, 0) > 0 and s.duration_seconds < s.planned_minutes * 60 * 0.9;

    v_reward := case v_place
      when 0 then jsonb_build_object('stardust', 1, 'gold', 10 + floor(random() * 11)::int)
      when 1 then jsonb_build_object('stardust', 2, 'gold', 20 + floor(random() * 21)::int,
                    'chest_wood', (random() < 0.15)::int)
      when 2 then jsonb_build_object('stardust', 3, 'gold', 40 + floor(random() * 31)::int,
                    'chest_iron', (random() < 0.3)::int, 'gacha_coin', (random() < 0.1)::int)
      when 3 then jsonb_build_object('stardust', 5, 'gold', 80 + floor(random() * 41)::int,
                    'chest_iron', 1, 'gacha_coin', (random() < 0.2)::int, 'chest_gold', (random() < 0.1)::int)
      else jsonb_build_object('stardust', 8, 'gold', 150, 'chest_gold', 1,
                    'gacha_coin', (random() < 0.3)::int, 'chest_star', (random() < 0.05)::int) end;
    -- 技能：遠行者
    v_reward := jsonb_set(v_reward, '{stardust}', to_jsonb((v_reward->>'stardust')::int + public.skill_lv(v_user, 'travel')));
    -- 技能：尋金者
    v_reward := jsonb_set(v_reward, '{gold}', to_jsonb(round((v_reward->>'gold')::int * (1 + 0.1 * public.skill_lv(v_user, 'goldfind')))::int));
    -- 沒有中獎的拿掉；提早回家只留星屑和金幣
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_reward
      from jsonb_each(v_reward) where value::text::int > 0 and (not v_early or key in ('stardust', 'gold'));

    insert into public.expeditions (session_id, user_id, minutes, place, early, story, reward)
      values (s.id, v_user, v_min, v_place, v_early, floor(random() * 4)::int, v_reward)
      on conflict do nothing;
    if found then
      perform public.fun_give(v_user, v_reward, 'exp:' || s.id);
      v_out := v_out || jsonb_build_object('session', s.id, 'subject', s.subject, 'minutes', v_min, 'place', v_place,
                                           'early', v_early, 'reward', v_reward,
                                           'story', (select story from public.expeditions where session_id = s.id));
    end if;
  end loop;

  return json_build_object('success', true, 'new', v_out);
end;
$function$;
revoke all on function public.exp_claim() from public, anon;
grant execute on function public.exp_claim() to authenticated;
