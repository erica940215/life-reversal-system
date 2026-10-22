-- =========================================================
-- ⚔️ 冒險線第二階段：每週王 + 好友傷害排行
-- 需要先跑過：2026-10-16_簽到發券與背包.sql（grant_item）、2026-10-19_好友.sql、2026-10-22_冒險.sql
--
-- 規則：
--   * 每週一（凌晨 2 點換日）出一隻王，每個人打自己的王
--   * 王的血量 = 本週第一次打開時的戰力 × 10（大約要 10 次出擊），連續打倒會升階，每階血量 +15%
--   * 每天出擊次數：基本 1 次；今天專注滿 60 分 +1；今天完成 3 個任務 +1；今天有運動 +1（最多 4 次）
--   * 每次出擊 +5 金幣；打倒王：金幣 150 + 50×階級、特殊召喚券 1、星屑 3+階級
--   * 王有弱點職業，那個職業打它傷害 ×1.3；遊俠爆擊率 20%，其他 10%
-- =========================================================

create table if not exists public.rpg_boss_runs (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  boss_key text not null,
  tier integer not null default 1,
  hp bigint not null,
  dmg bigint not null default 0,
  killed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create table if not exists public.rpg_boss_hits (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  hit_day date not null,
  dmg integer not null,
  crit boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists rpg_boss_hits_user_day on public.rpg_boss_hits (user_id, hit_day);

alter table public.rpg_boss_runs enable row level security;
alter table public.rpg_boss_hits enable row level security;
drop policy if exists "boss runs own" on public.rpg_boss_runs;
create policy "boss runs own" on public.rpg_boss_runs for select using (auth.uid() = user_id);
drop policy if exists "boss hits own" on public.rpg_boss_hits;
create policy "boss hits own" on public.rpg_boss_hits for select using (auth.uid() = user_id);
revoke insert, update, delete on public.rpg_boss_runs, public.rpg_boss_hits from authenticated, anon;


-- ---------- 王的資料（照週數輪替） ----------
create or replace function public.rpg_boss_catalog()
returns jsonb language sql immutable as $$
  select '[
    {"key":"sloth_slime",   "name":"怠惰史萊姆王", "emoji":"🟢", "weak":"warrior",  "desc":"黏在床上不肯起來的大史萊姆。行動派的戰士最剋它。"},
    {"key":"delay_dragon",  "name":"拖延巨龍",     "emoji":"🐉", "weak":"scholar",  "desc":"把今天的事都吞到明天的龍。專注的學者最剋它。"},
    {"key":"phone_wraith",  "name":"手機幽靈",     "emoji":"👻", "weak":"guardian", "desc":"一滑就是一小時的幽靈。意志堅定的守護者最剋它。"},
    {"key":"fatigue_golem", "name":"疲憊石像",     "emoji":"🗿", "weak":"ranger",   "desc":"讓人什麼都不想做的石像。什麼都做一點的遊俠最剋它。"}
  ]'::jsonb
$$;


-- ---------- 算戰力（和網頁上 rpg.js 的公式一樣） ----------
create or replace function public.rpg_power_of(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_today date := public.app_today();
  v_from date := public.app_today() - 6;
  h public.rpg_heroes%rowtype;
  v_lv integer;
  v_tasks integer; v_focus integer; v_ex integer; v_sleep integer; v_habits integer; v_streak integer;
  s_str numeric; s_int numeric; s_vit numeric; s_wil numeric;
  cat jsonb := public.rpg_catalog();
  v_slot text; v_key text; v_level integer; g jsonb; k text; v numeric;
  v_sum numeric; v_power numeric;
begin
  select * into h from public.rpg_heroes where user_id = p_user;
  select coalesce(level, 1) into v_lv from public.profiles where id = p_user;
  v_lv := coalesce(v_lv, 1);

  select count(*) into v_tasks from public.tasks
    where user_id = p_user and completed and completed_at >= now() - interval '7 days';
  select coalesce(sum(duration_seconds), 0) / 60 into v_focus from public.focus_sessions
    where user_id = p_user and session_date between v_from and v_today;
  select coalesce(sum(minutes), 0) into v_ex from public.exercise_logs
    where user_id = p_user and log_date between v_from and v_today;
  select count(*) into v_sleep from public.sleep_logs
    where user_id = p_user and night_date between v_from - 1 and v_today and bed_at is not null and wake_at is not null;
  select count(*) into v_habits from public.habit_logs
    where user_id = p_user and log_date between v_from and v_today;
  v_streak := coalesce((select streak from public.checkins
                         where user_id = p_user and checkin_date >= v_today - 1
                         order by checkin_date desc limit 1), 0);

  s_str := v_tasks * 5 + v_lv * 2;
  s_int := floor(v_focus / 6.0) + v_lv * 2;
  s_vit := floor(v_ex / 3.0) + v_sleep * 2 + v_lv * 2;
  s_wil := v_habits * 3 + least(v_streak, 30) * 2 + v_lv * 2;

  if h.equip is not null then
    for v_slot in select unnest(array['weapon', 'armor', 'accessory']) loop
      v_key := h.equip->>v_slot;
      continue when v_key is null;
      select level into v_level from public.rpg_gear where user_id = p_user and gear_key = v_key;
      continue when v_level is null;
      g := cat->'gear'->v_key;
      continue when g is null;
      for k, v in select key, value::numeric from jsonb_each_text(g->'stat') loop
        v := round(v * (1 + 0.2 * (v_level - 1)));
        if k = 'str' then s_str := s_str + v;
        elsif k = 'int' then s_int := s_int + v;
        elsif k = 'vit' then s_vit := s_vit + v;
        elsif k = 'wil' then s_wil := s_wil + v;
        end if;
      end loop;
    end loop;
  end if;

  v_sum := s_str + s_int + s_vit + s_wil;
  v_power := case h.class
    when 'scholar'  then v_sum + s_int
    when 'warrior'  then v_sum + (s_str + s_vit) * 0.5
    when 'guardian' then v_sum + s_wil
    when 'ranger'   then v_sum * 1.25
    else v_sum end;

  return jsonb_build_object('power', round(v_power)::integer, 'class', h.class,
    'str', s_str, 'int', s_int, 'vit', s_vit, 'wil', s_wil);
end;
$function$;
revoke all on function public.rpg_power_of(uuid) from public, anon, authenticated;


-- ---------- 今天可以出擊幾次 ----------
create or replace function public.rpg_boss_attacks_today(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_today date := public.app_today();
  v_focus integer; v_tasks integer; v_ex boolean; v_used integer;
begin
  select coalesce(sum(duration_seconds), 0) / 60 into v_focus from public.focus_sessions
    where user_id = p_user and session_date = v_today;
  select count(*) into v_tasks from public.tasks
    where user_id = p_user and completed
      and ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date = v_today;
  select exists (select 1 from public.exercise_logs where user_id = p_user and log_date = v_today) into v_ex;
  select count(*) into v_used from public.rpg_boss_hits where user_id = p_user and hit_day = v_today;

  return jsonb_build_object(
    'focus_min', v_focus, 'tasks', v_tasks, 'exercise', v_ex,
    'total', 1 + (v_focus >= 60)::int + (v_tasks >= 3)::int + v_ex::int,
    'used', v_used);
end;
$function$;
revoke all on function public.rpg_boss_attacks_today(uuid) from public, anon, authenticated;


-- ---------- 本週的王（沒有就建一隻） ----------
create or replace function public.rpg_boss_ensure(p_user uuid)
returns public.rpg_boss_runs language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_today date := public.app_today();
  v_week date := public.app_today() - (extract(isodow from public.app_today())::int - 1);
  r public.rpg_boss_runs%rowtype;
  prev public.rpg_boss_runs%rowtype;
  v_tier integer := 1;
  v_power integer;
  bosses jsonb := public.rpg_boss_catalog();
  v_boss text;
begin
  select * into r from public.rpg_boss_runs where user_id = p_user and week_start = v_week;
  if found then return r; end if;

  select * into prev from public.rpg_boss_runs where user_id = p_user and week_start < v_week
    order by week_start desc limit 1;
  if found then
    v_tier := case when prev.killed_at is not null then least(prev.tier + 1, 20) else prev.tier end;
  end if;

  v_power := (public.rpg_power_of(p_user)->>'power')::integer;
  v_boss := bosses->(((v_week - date '2026-01-05') / 7) % jsonb_array_length(bosses))::int->>'key';

  insert into public.rpg_boss_runs (user_id, week_start, boss_key, tier, hp)
  values (p_user, v_week, v_boss, v_tier,
          round(greatest(20, v_power) * 10 * (1 + 0.15 * (v_tier - 1))))
  on conflict do nothing;

  select * into r from public.rpg_boss_runs where user_id = p_user and week_start = v_week;
  return r;
end;
$function$;
revoke all on function public.rpg_boss_ensure(uuid) from public, anon, authenticated;


-- ---------- 給網頁：每週王狀態 ----------
create or replace function public.rpg_boss_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  h public.rpg_heroes%rowtype;
  r public.rpg_boss_runs%rowtype;
  v_hits jsonb;
  v_last jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select * into h from public.rpg_heroes where user_id = v_user;
  if h.class is null then
    return json_build_object('need_class', true, 'bosses', public.rpg_boss_catalog());
  end if;

  r := public.rpg_boss_ensure(v_user);

  select coalesce(jsonb_agg(jsonb_build_object('day', hit_day, 'dmg', dmg, 'crit', crit, 'at', created_at) order by created_at desc), '[]'::jsonb)
    into v_hits from (select * from public.rpg_boss_hits where user_id = v_user and week_start = r.week_start
                      order by created_at desc limit 12) x;

  select to_jsonb(p) into v_last from (
    select week_start, boss_key, tier, hp, dmg, killed_at from public.rpg_boss_runs
    where user_id = v_user and week_start < r.week_start order by week_start desc limit 1) p;

  return json_build_object(
    'run', to_jsonb(r),
    'attacks', public.rpg_boss_attacks_today(v_user),
    'power', public.rpg_power_of(v_user),
    'hits', v_hits,
    'last', v_last,
    'bosses', public.rpg_boss_catalog(),
    'week_end', r.week_start + 7);
end;
$function$;
revoke all on function public.rpg_boss_status() from public, anon;
grant execute on function public.rpg_boss_status() to authenticated;


-- ---------- 出擊 ----------
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
  v_gold integer := 5;
  v_reward jsonb := null;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select * into h from public.rpg_heroes where user_id = v_user;
  if h.class is null then raise exception '先選一個職業才能出擊'; end if;

  perform public.rpg_boss_ensure(v_user);
  select * into r from public.rpg_boss_runs
    where user_id = v_user and week_start = v_today - (extract(isodow from v_today)::int - 1) for update;
  if r.killed_at is not null then raise exception '這週的王已經打倒了，下週一再來'; end if;

  a := public.rpg_boss_attacks_today(v_user);
  if (a->>'used')::int >= (a->>'total')::int then
    raise exception '今天的出擊次數用完了（專注滿 60 分、完成 3 個任務、運動都能多 1 次）';
  end if;

  v_power := greatest(10, (public.rpg_power_of(v_user)->>'power')::integer);
  select b->>'weak' into v_weak from jsonb_array_elements(public.rpg_boss_catalog()) b where b->>'key' = r.boss_key;
  if v_weak = h.class then v_mult := 1.3; end if;
  v_crit := random() < case when h.class = 'ranger' then 0.2 else 0.1 end;
  if v_crit then v_mult := v_mult * 1.5; end if;
  v_dmg := round(v_power * (0.85 + random() * 0.3) * v_mult);

  insert into public.rpg_boss_hits (user_id, week_start, hit_day, dmg, crit)
    values (v_user, r.week_start, v_today, v_dmg, v_crit);

  update public.rpg_boss_runs set dmg = dmg + v_dmg,
    killed_at = case when dmg + v_dmg >= hp then now() else null end
    where user_id = v_user and week_start = r.week_start
    returning * into r;

  if r.killed_at is not null then
    v_killed := true;
    v_gold := v_gold + 150 + 50 * r.tier;
    perform public.grant_item(v_user, 'ticket_special', 1, 'boss:' || r.week_start);
    perform public.grant_item(v_user, 'stardust', 3 + r.tier, 'boss-dust:' || r.week_start);
    v_reward := jsonb_build_object('ticket_special', 1, 'stardust', 3 + r.tier);
  end if;

  update public.profiles set gold = gold + v_gold, updated_at = now() where id = v_user;

  return json_build_object('success', true, 'dmg', v_dmg, 'crit', v_crit, 'weak', v_mult >= 1.3 and v_weak = h.class,
    'killed', v_killed, 'gold', v_gold, 'reward', v_reward, 'run', to_jsonb(r));
end;
$function$;
revoke all on function public.rpg_boss_attack() from public, anon;
grant execute on function public.rpg_boss_attack() to authenticated;


-- ---------- 好友本週傷害排行 ----------
create or replace function public.rpg_boss_rank()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_week date := public.app_today() - (extract(isodow from public.app_today())::int - 1);
begin
  if v_user is null then raise exception '尚未登入'; end if;
  return coalesce((
    select json_agg(row_to_json(x) order by x.dmg desc, x.name)
    from (
      select u.id = v_user as me,
             coalesce(p.username, '冒險者') as name,
             h.class,
             coalesce(r.dmg, 0) as dmg,
             r.tier,
             r.killed_at is not null as killed
      from (select v_user as id
            union select case when f.user_a = v_user then f.user_b else f.user_a end
            from public.friendships f
            where f.status = 'accepted' and (f.user_a = v_user or f.user_b = v_user)) u
      left join public.profiles p on p.id = u.id
      left join public.rpg_heroes h on h.user_id = u.id
      left join public.rpg_boss_runs r on r.user_id = u.id and r.week_start = v_week
    ) x), '[]'::json);
end;
$function$;
revoke all on function public.rpg_boss_rank() from public, anon;
grant execute on function public.rpg_boss_rank() to authenticated;

notify pgrst, 'reload schema';

select case
  when exists (select 1 from pg_proc where proname = 'rpg_boss_attack' and pronamespace = 'public'::regnamespace)
    then '✅ 每週王設定完成'
  else '⚠️ 設定失敗'
end as 檢查結果;
