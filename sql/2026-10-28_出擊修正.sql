-- =========================================================
-- 序光計畫：出擊修正（要先執行 2026-10-27_技能金庫.sql，可以重複執行）
--   這週的個人王打倒、又沒有小隊時，出擊照樣可以打世界王（之前會直接擋掉）
-- =========================================================

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
    if v_team is null and exists (select 1 from public.world_bosses
        where month = to_char(v_today, 'YYYY-MM') and killed_at is not null) then
      raise exception '這週的王和這個月的世界王都打倒了，下週一再來（加入小隊就能繼續打團隊王）';
    end if;
    v_dead := true;   -- 自己的王倒了，這次打團隊王和世界王
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
