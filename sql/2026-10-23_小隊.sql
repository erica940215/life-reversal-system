-- =========================================================
-- 🛡️ 多人：冒險小隊、團隊王、小隊週任務、加油、好友動態牆
-- 需要先跑過：2026-10-19_好友.sql、2026-10-22_冒險.sql、2026-10-22_每週王.sql、
--             2026-10-22_驚喜.sql、2026-10-23_裝備擴充.sql
-- 可以重複執行。
--
--   小隊：2～5 個好友。隊長可以改隊名、隊徽、請人離開；隊長離開會交給最早加入的人
--   團隊王：每週一隻，血量 = 全隊戰力加總 × 6，打倒會升階
--     你打每週王的每一下，同樣的傷害也會打在團隊王身上（加上小隊加成）
--     自己的王打倒之後，剩下的出擊次數全部打團隊王
--     小隊加成：每多一種職業 +5%（最多 +15%）；每位守護者 +5%（最多 +10%）
--     打倒團隊王：全隊每個人拿團隊寶箱 1 個
--   週任務：全隊合計專注 5 小時×人數、完成任務 15 個×人數、簽到 5 天×人數
--     每完成一個：鐵寶箱 1；三個全清：金寶箱 1，再 25% 星光寶箱
--   加油：每天可以幫每個好友加油一次；被加油的人下一次出擊 +10%（最多疊 3 次）
--     幫人加油自己拿星屑 1（一天最多 3）
--   動態牆：好友打倒每週王、抽到傳說、湊滿套裝、集滿扭蛋、小隊打倒團隊王、週任務全清
-- =========================================================


-- ---------- 資料表（全部只能透過函式讀寫） ----------
create table if not exists public.teams (
  id bigserial primary key,
  name text not null,
  emblem text not null default 'emblem_wolf',
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id bigint not null references public.teams(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.team_invites (
  team_id bigint not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.team_raids (
  team_id bigint not null references public.teams(id) on delete cascade,
  week_start date not null,
  boss_key text not null,
  tier integer not null default 1,
  hp bigint not null,
  dmg bigint not null default 0,
  killed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (team_id, week_start)
);

create table if not exists public.team_raid_hits (
  id bigserial primary key,
  team_id bigint not null references public.teams(id) on delete cascade,
  week_start date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  dmg integer not null,
  created_at timestamptz not null default now()
);
create index if not exists team_raid_hits_team on public.team_raid_hits (team_id, week_start);

create table if not exists public.cheers (
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  day date not null,
  used boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user, day)
);
create index if not exists cheers_to on public.cheers (to_user, day);

create table if not exists public.feed_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists feed_events_user on public.feed_events (user_id, created_at desc);

create table if not exists public.feed_likes (
  event_id bigint not null references public.feed_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

do $$
declare t text;
begin
  foreach t in array array['teams', 'team_members', 'team_invites', 'team_raids', 'team_raid_hits', 'cheers', 'feed_events', 'feed_likes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;


-- ---------- 小工具 ----------
create or replace function public.team_is_friend(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.friendships
                 where status = 'accepted' and user_a = least(p_a, p_b) and user_b = greatest(p_a, p_b))
$$;
revoke all on function public.team_is_friend(uuid, uuid) from public, anon, authenticated;

create or replace function public.team_of(p_user uuid)
returns bigint language sql stable security definer set search_path to 'public' as $$
  select team_id from public.team_members where user_id = p_user
$$;
revoke all on function public.team_of(uuid) from public, anon, authenticated;

create or replace function public.team_name_of(p_user uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(nullif(trim(username), ''), '冒險者') from public.profiles where id = p_user
$$;
revoke all on function public.team_name_of(uuid) from public, anon, authenticated;

create or replace function public.feed_post(p_user uuid, p_kind text, p_data jsonb)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.feed_events (user_id, kind, data) values (p_user, p_kind, coalesce(p_data, '{}'::jsonb))
$$;
revoke all on function public.feed_post(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.raid_catalog()
returns jsonb language sql immutable as $$
  select '[
    {"key":"raid_hydra",   "name":"無盡滑動九頭蛇", "emoji":"🐍", "desc":"每顆頭都是一支手機。砍掉一顆，又長出兩顆短影音。"},
    {"key":"raid_vampire", "name":"熬夜吸血鬼伯爵", "emoji":"🧛", "desc":"專吸睡眠的伯爵，時鐘永遠停在凌晨四點。"},
    {"key":"raid_abyss",   "name":"拖延深淵魔王",   "emoji":"😈", "desc":"抱著一堆「明天再說」的卷軸，越拖越大隻。"},
    {"key":"raid_fog",     "name":"焦慮迷霧巨人",   "emoji":"🌫️", "desc":"霧做的巨人，身上飄滿待辦清單。一起行動，霧就會散。"}
  ]'::jsonb
$$;

-- 小隊加成：每多一種職業 +5%（最多 15%）；每位守護者 +5%（最多 10%）
create or replace function public.team_bonus(p_team bigint)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select 1 + least(greatest(count(distinct h.class) - 1, 0), 3) * 0.05
           + least(count(*) filter (where h.class = 'guardian'), 2) * 0.05
  from public.team_members m left join public.rpg_heroes h on h.user_id = m.user_id
  where m.team_id = p_team
$$;
revoke all on function public.team_bonus(bigint) from public, anon, authenticated;


-- ---------- 本週團隊王（沒有就建一隻） ----------
create or replace function public.team_raid_ensure(p_team bigint)
returns public.team_raids language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_week date := public.fun_week_start();
  r public.team_raids%rowtype;
  prev public.team_raids%rowtype;
  v_tier integer := 1;
  v_power bigint := 0;
  m record;
  bosses jsonb := public.raid_catalog();
begin
  select * into r from public.team_raids where team_id = p_team and week_start = v_week;
  if found then return r; end if;

  select * into prev from public.team_raids where team_id = p_team and week_start < v_week order by week_start desc limit 1;
  if found then v_tier := case when prev.killed_at is not null then least(prev.tier + 1, 20) else prev.tier end; end if;

  for m in select user_id from public.team_members where team_id = p_team loop
    v_power := v_power + greatest(20, (public.rpg_power_of(m.user_id)->>'power')::int);
  end loop;

  insert into public.team_raids (team_id, week_start, boss_key, tier, hp)
  values (p_team, v_week,
          bosses->(((v_week - date '2026-01-05') / 7) % jsonb_array_length(bosses))::int->>'key',
          v_tier, round(greatest(v_power, 40) * 6 * (1 + 0.15 * (v_tier - 1))))
  on conflict do nothing;
  select * into r from public.team_raids where team_id = p_team and week_start = v_week;
  return r;
end;
$function$;
revoke all on function public.team_raid_ensure(bigint) from public, anon, authenticated;


-- ---------- 小隊週任務進度（順便發獎勵給這個人） ----------
create or replace function public.team_quests(p_team bigint, p_user uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_week date := public.fun_week_start();
  v_today date := public.app_today();
  n integer;
  v_focus integer; v_tasks integer; v_check integer;
  q jsonb;
  v_done integer := 0;
  i integer;
begin
  select count(*) into n from public.team_members where team_id = p_team;
  select coalesce(sum(duration_seconds), 0) / 60 into v_focus from public.focus_sessions
    where user_id in (select user_id from public.team_members where team_id = p_team) and session_date between v_week and v_today;
  select count(*) into v_tasks from public.tasks
    where user_id in (select user_id from public.team_members where team_id = p_team) and completed
      and ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date between v_week and v_today;
  select count(*) into v_check from public.checkins
    where user_id in (select user_id from public.team_members where team_id = p_team) and checkin_date between v_week and v_today;

  q := jsonb_build_array(
    jsonb_build_object('key', 'focus', 'name', '全隊合計專注', 'unit', '分鐘', 'now', v_focus, 'goal', 300 * n),
    jsonb_build_object('key', 'tasks', 'name', '全隊合計完成任務', 'unit', '個', 'now', v_tasks, 'goal', 15 * n),
    jsonb_build_object('key', 'checkin', 'name', '全隊合計簽到', 'unit', '天', 'now', v_check, 'goal', 5 * n));

  -- 發獎勵（每人每週每項一次，換隊也不會重拿）
  for i in 0..2 loop
    if (q->i->>'now')::int >= (q->i->>'goal')::int then
      v_done := v_done + 1;
      perform public.grant_item(p_user, 'chest_iron', 1, 'tq:' || v_week || ':' || (q->i->>'key'));
    end if;
  end loop;
  if v_done = 3 then
    if public.grant_item(p_user, 'chest_gold', 1, 'tq:' || v_week || ':all') then
      if random() < 0.25 then perform public.grant_item(p_user, 'chest_star', 1, 'tq:' || v_week || ':star'); end if;
    end if;
    if not exists (select 1 from public.feed_events where kind = 'quest' and data->>'team' = p_team::text and data->>'week' = v_week::text) then
      perform public.feed_post(p_user, 'quest', jsonb_build_object('team', p_team, 'week', v_week,
        'team_name', (select name from public.teams where id = p_team)));
    end if;
  end if;

  return jsonb_build_object('list', q, 'done', v_done);
end;
$function$;
revoke all on function public.team_quests(bigint, uuid) from public, anon, authenticated;


-- ---------- 給網頁：小隊頁的全部資料 ----------
create or replace function public.team_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_week date := public.fun_week_start();
  v_team bigint;
  t public.teams%rowtype;
  r public.team_raids%rowtype;
  v_members jsonb := '[]'::jsonb;
  v_invites jsonb;
  v_friends jsonb;
  v_quests jsonb := null;
  v_cheered_me integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  v_team := public.team_of(v_user);

  if v_team is not null then
    select * into t from public.teams where id = v_team;
    r := public.team_raid_ensure(v_team);
    v_quests := public.team_quests(v_team, v_user);

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.user_id, 'me', m.user_id = v_user, 'owner', m.user_id = t.owner,
        'name', public.team_name_of(m.user_id),
        'class', h.class, 'frame', fp.frame,
        'focus_min', (select coalesce(sum(duration_seconds), 0) / 60 from public.focus_sessions where user_id = m.user_id and session_date = v_today),
        'tasks', (select count(*) from public.tasks where user_id = m.user_id and completed
                    and ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date = v_today),
        'attacks', (select count(*) from public.rpg_boss_hits where user_id = m.user_id and hit_day = v_today),
        'raid_dmg', (select coalesce(sum(dmg), 0) from public.team_raid_hits where team_id = v_team and week_start = v_week and user_id = m.user_id)
      ) order by m.joined_at), '[]'::jsonb)
      into v_members
      from public.team_members m
      left join public.rpg_heroes h on h.user_id = m.user_id
      left join public.fun_profile fp on fp.user_id = m.user_id
      where m.team_id = v_team;
  end if;

  -- 別人邀請我
  select coalesce(jsonb_agg(jsonb_build_object('team', i.team_id, 'name', tt.name, 'emblem', tt.emblem,
           'by', public.team_name_of(i.invited_by),
           'count', (select count(*) from public.team_members where team_id = i.team_id))), '[]'::jsonb)
    into v_invites
    from public.team_invites i join public.teams tt on tt.id = i.team_id
    where i.user_id = v_user;

  -- 好友（加油、邀請用）
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.other, 'name', public.team_name_of(f.other),
      'class', h.class, 'frame', fp.frame,
      'team', public.team_of(f.other),
      'invited', v_team is not null and exists (select 1 from public.team_invites where team_id = v_team and user_id = f.other),
      'cheered', exists (select 1 from public.cheers where from_user = v_user and to_user = f.other and day = v_today)
    ) order by public.team_name_of(f.other)), '[]'::jsonb)
    into v_friends
    from (select case when user_a = v_user then user_b else user_a end as other
          from public.friendships where status = 'accepted' and (user_a = v_user or user_b = v_user)) f
    left join public.rpg_heroes h on h.user_id = f.other
    left join public.fun_profile fp on fp.user_id = f.other;

  select count(*) into v_cheered_me from public.cheers where to_user = v_user and day = v_today;

  return json_build_object(
    'team', case when v_team is null then null else jsonb_build_object(
      'id', t.id, 'name', t.name, 'emblem', t.emblem, 'owner', t.owner = v_user, 'bonus', public.team_bonus(v_team)) end,
    'members', v_members,
    'raid', case when v_team is null then null else to_jsonb(r) end,
    'raid_bosses', public.raid_catalog(),
    'quests', v_quests,
    'invites', v_invites,
    'friends', v_friends,
    'cheers_today', v_cheered_me,
    'cheers_unused', (select count(*) from public.cheers where to_user = v_user and day = v_today and not used),
    'cheers_given', (select count(*) from public.cheers where from_user = v_user and day = v_today),
    'week_end', v_week + 7);
end;
$function$;
revoke all on function public.team_status() from public, anon;
grant execute on function public.team_status() to authenticated;


-- ---------- 建立小隊 ----------
create or replace function public.team_create(p_name text, p_emblem text default 'emblem_wolf')
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_id bigint; v_name text := left(trim(coalesce(p_name, '')), 16);
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if public.team_of(v_user) is not null then raise exception '你已經在一個小隊裡了'; end if;
  if v_name = '' then raise exception '請取一個隊名'; end if;
  insert into public.teams (name, emblem, owner) values (v_name, coalesce(p_emblem, 'emblem_wolf'), v_user) returning id into v_id;
  insert into public.team_members (team_id, user_id) values (v_id, v_user);
  delete from public.team_invites where user_id = v_user;
  return json_build_object('success', true, 'team', v_id);
end;
$function$;
revoke all on function public.team_create(text, text) from public, anon;
grant execute on function public.team_create(text, text) to authenticated;


-- ---------- 改隊名、隊徽（隊長） ----------
create or replace function public.team_update(p_name text, p_emblem text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_team bigint := public.team_of(auth.uid());
begin
  if v_team is null then raise exception '你還沒有小隊'; end if;
  if not exists (select 1 from public.teams where id = v_team and owner = v_user) then raise exception '只有隊長可以改'; end if;
  update public.teams set name = coalesce(nullif(left(trim(coalesce(p_name, '')), 16), ''), name),
                          emblem = coalesce(p_emblem, emblem) where id = v_team;
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.team_update(text, text) from public, anon;
grant execute on function public.team_update(text, text) to authenticated;


-- ---------- 邀請好友（隊員都可以邀） ----------
create or replace function public.team_invite(p_user uuid)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_team bigint := public.team_of(auth.uid());
begin
  if v_team is null then raise exception '你還沒有小隊'; end if;
  if not public.team_is_friend(v_user, p_user) then raise exception '只能邀請好友'; end if;
  if public.team_of(p_user) is not null then raise exception '對方已經有小隊了'; end if;
  if (select count(*) from public.team_members where team_id = v_team) >= 5 then raise exception '小隊最多 5 個人'; end if;
  insert into public.team_invites (team_id, user_id, invited_by) values (v_team, p_user, v_user) on conflict do nothing;
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.team_invite(uuid) from public, anon;
grant execute on function public.team_invite(uuid) to authenticated;


-- ---------- 接受 / 拒絕邀請 ----------
create or replace function public.team_answer(p_team bigint, p_accept boolean)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if not exists (select 1 from public.team_invites where team_id = p_team and user_id = v_user) then raise exception '邀請已經失效了'; end if;
  if p_accept then
    if public.team_of(v_user) is not null then raise exception '你已經在一個小隊裡了，先離開才能加入'; end if;
    if (select count(*) from public.team_members where team_id = p_team) >= 5 then raise exception '這個小隊已經滿了'; end if;
    insert into public.team_members (team_id, user_id) values (p_team, v_user);
    delete from public.team_invites where user_id = v_user;
  else
    delete from public.team_invites where team_id = p_team and user_id = v_user;
  end if;
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.team_answer(bigint, boolean) from public, anon;
grant execute on function public.team_answer(bigint, boolean) to authenticated;


-- ---------- 離開小隊（隊長離開就交給最早加入的人；沒人了就解散） ----------
create or replace function public.team_leave()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_team bigint := public.team_of(auth.uid()); v_next uuid;
begin
  if v_team is null then raise exception '你還沒有小隊'; end if;
  delete from public.team_members where team_id = v_team and user_id = v_user;
  select user_id into v_next from public.team_members where team_id = v_team order by joined_at limit 1;
  if v_next is null then
    delete from public.teams where id = v_team;
  elsif exists (select 1 from public.teams where id = v_team and owner = v_user) then
    update public.teams set owner = v_next where id = v_team;
  end if;
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.team_leave() from public, anon;
grant execute on function public.team_leave() to authenticated;


-- ---------- 請隊員離開（隊長） ----------
create or replace function public.team_kick(p_user uuid)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_team bigint := public.team_of(auth.uid());
begin
  if v_team is null or not exists (select 1 from public.teams where id = v_team and owner = v_user) then raise exception '只有隊長可以這樣做'; end if;
  if p_user = v_user then raise exception '要離開請按「離開小隊」'; end if;
  delete from public.team_members where team_id = v_team and user_id = p_user;
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.team_kick(uuid) from public, anon;
grant execute on function public.team_kick(uuid) to authenticated;


-- ---------- 📣 加油 ----------
create or replace function public.cheer_friend(p_user uuid)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_today date := public.app_today(); v_given integer; v_dust boolean := false;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_user = v_user or not public.team_is_friend(v_user, p_user) then raise exception '只能幫好友加油'; end if;
  insert into public.cheers (from_user, to_user, day) values (v_user, p_user, v_today) on conflict do nothing;
  if not found then raise exception '今天已經幫他加過油了'; end if;
  select count(*) into v_given from public.cheers where from_user = v_user and day = v_today;
  if v_given <= 3 then
    v_dust := public.grant_item(v_user, 'stardust', 1, 'cheer:' || v_today || ':' || v_given);
  end if;
  return json_build_object('success', true, 'dust', v_dust, 'given', v_given);
end;
$function$;
revoke all on function public.cheer_friend(uuid) from public, anon;
grant execute on function public.cheer_friend(uuid) to authenticated;


-- ---------- 📰 動態牆 ----------
create or replace function public.feed_list()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception '尚未登入'; end if;
  return coalesce((
    select json_agg(x order by x.at desc) from (
      select e.id, e.kind, e.data, e.created_at as at, e.user_id = v_user as me,
             public.team_name_of(e.user_id) as name, h.class, fp.frame,
             (select count(*) from public.feed_likes l where l.event_id = e.id) as likes,
             exists (select 1 from public.feed_likes l where l.event_id = e.id and l.user_id = v_user) as liked
      from public.feed_events e
      left join public.rpg_heroes h on h.user_id = e.user_id
      left join public.fun_profile fp on fp.user_id = e.user_id
      where e.created_at >= now() - interval '7 days'
        and (e.user_id = v_user or public.team_is_friend(v_user, e.user_id))
      order by e.created_at desc limit 40) x), '[]'::json);
end;
$function$;
revoke all on function public.feed_list() from public, anon;
grant execute on function public.feed_list() to authenticated;

create or replace function public.feed_like(p_event bigint)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_owner uuid;
begin
  select user_id into v_owner from public.feed_events where id = p_event;
  if v_owner is null or not (v_owner = v_user or public.team_is_friend(v_user, v_owner)) then raise exception '看不到這則動態'; end if;
  if exists (select 1 from public.feed_likes where event_id = p_event and user_id = v_user) then
    delete from public.feed_likes where event_id = p_event and user_id = v_user;
    return json_build_object('success', true, 'liked', false);
  end if;
  insert into public.feed_likes (event_id, user_id) values (p_event, v_user);
  return json_build_object('success', true, 'liked', true);
end;
$function$;
revoke all on function public.feed_like(bigint) from public, anon;
grant execute on function public.feed_like(bigint) to authenticated;


-- ---------- 📰 自動貼動態（觸發器） ----------
create or replace function public.feed_on_summon() returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.tier = 's' and new.result = 'new' then
    perform public.feed_post(new.user_id, 'legend', jsonb_build_object('key', new.gear_key));
  end if;
  return new;
end; $function$;
drop trigger if exists feed_summon on public.rpg_summon_log;
create trigger feed_summon after insert on public.rpg_summon_log for each row execute function public.feed_on_summon();

create or replace function public.feed_on_boss() returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if old.killed_at is null and new.killed_at is not null then
    perform public.feed_post(new.user_id, 'boss', jsonb_build_object('boss', new.boss_key, 'tier', new.tier));
  end if;
  return new;
end; $function$;
drop trigger if exists feed_boss on public.rpg_boss_runs;
create trigger feed_boss after update on public.rpg_boss_runs for each row execute function public.feed_on_boss();

create or replace function public.feed_on_equip() returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare cat jsonb := public.rpg_catalog(); s1 text; s2 text; s3 text;
begin
  s1 := cat->'gear'->(new.equip->>'weapon')->>'set';
  s2 := cat->'gear'->(new.equip->>'armor')->>'set';
  s3 := cat->'gear'->(new.equip->>'accessory')->>'set';
  if s1 is not null and s1 = s2 and s2 = s3
     and not exists (select 1 from public.feed_events where user_id = new.user_id and kind = 'set' and data->>'set' = s1) then
    perform public.feed_post(new.user_id, 'set', jsonb_build_object('set', s1, 'name', cat->'sets'->s1->>'name'));
  end if;
  return new;
end; $function$;
drop trigger if exists feed_equip on public.rpg_heroes;
create trigger feed_equip after update of equip on public.rpg_heroes for each row execute function public.feed_on_equip();

create or replace function public.feed_on_collect() returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.source_key in ('monster-set:1', 'zodiac-set:1') then
    perform public.feed_post(new.user_id, 'collect', jsonb_build_object('series', case when new.source_key like 'monster%' then 'm' else 'z' end));
  end if;
  return new;
end; $function$;
drop trigger if exists feed_collect on public.item_events;
create trigger feed_collect after insert on public.item_events for each row
  when (new.source_key in ('monster-set:1', 'zodiac-set:1')) execute function public.feed_on_collect();



-- =========================================================
-- 接上原本的系統
-- =========================================================

-- ⚔️ 每週王出擊：加上被加油、團隊王
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
  v_crit := random() < case when h.class = 'ranger' then 0.2 else 0.1 end;
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

  if random() < 0.25 then
    v_roll := random() * 100;
    v_chest := case when v_roll < 60 then 'chest_wood' when v_roll < 90 then 'chest_iron'
                    when v_roll < 99 then 'chest_gold' else 'chest_star' end;
    perform public.grant_item(v_user, v_chest, 1, 'boss-chest:' || v_hit);
  end if;

  if r.killed_at is not null and not v_dead then
    v_killed := true;
    v_gold := v_gold + 150 + 50 * r.tier;
    perform public.grant_item(v_user, 'ticket_special', 1, 'boss:' || r.week_start);
    perform public.grant_item(v_user, 'stardust', 3 + r.tier, 'boss-dust:' || r.week_start);
    perform public.grant_item(v_user, 'chest_gold', 1, 'boss-kill-chest:' || r.week_start);
    v_reward := jsonb_build_object('ticket_special', 1, 'stardust', 3 + r.tier, 'chest_gold', 1);
  end if;

  update public.profiles set gold = gold + v_gold, updated_at = now() where id = v_user;

  return json_build_object('success', true, 'dmg', v_dmg, 'crit', v_crit, 'weak', v_mult >= 1.3 and v_weak = h.class,
    'killed', v_killed, 'gold', v_gold, 'reward', v_reward, 'chest', v_chest, 'run', to_jsonb(r),
    'cheer', v_cheer, 'raid_dmg', v_raid_dmg, 'raid_killed', v_raid_killed, 'personal_dead', v_dead);
end;
$function$;
revoke all on function public.rpg_boss_attack() from public, anon;
grant execute on function public.rpg_boss_attack() to authenticated;


-- 🎁 開寶箱：加上團隊寶箱
create or replace function public.fun_chest_open(p_chest text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_reward jsonb;
  v_id bigint;
  v_frame text;
  v_got_frame text := null;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_chest not in ('chest_wood', 'chest_iron', 'chest_gold', 'chest_star', 'chest_team') then raise exception '沒有這種寶箱'; end if;
  perform public.fun_take(v_user, p_chest, 1, 'chest-use:' || gen_random_uuid());

  v_reward := case p_chest
    when 'chest_wood' then jsonb_build_object(
      'stardust', 1 + floor(random() * 2)::int,
      'gold', 20 + floor(random() * 21)::int,
      'gacha_coin', (random() < 0.12)::int)
    when 'chest_iron' then jsonb_build_object(
      'stardust', 3 + floor(random() * 2)::int,
      'gold', 50 + floor(random() * 41)::int,
      'gacha_coin', (random() < 0.35)::int,
      'ticket_normal', (random() < 0.25)::int)
    when 'chest_gold' then jsonb_build_object(
      'stardust', 6 + floor(random() * 4)::int,
      'gold', 150 + floor(random() * 101)::int,
      'gacha_coin', 1,
      'ticket_special', (random() < 0.25)::int)
    when 'chest_team' then jsonb_build_object(
      'stardust', 8 + floor(random() * 5)::int,
      'gold', 200 + floor(random() * 101)::int,
      'gacha_coin', 1,
      'ticket_special', (random() < 0.3)::int,
      'chest_star', (random() < 0.1)::int)
    else jsonb_build_object(
      'stardust', 12 + floor(random() * 9)::int,
      'gold', 300,
      'gacha_coin', 2,
      'ticket_special', 1,
      'wish_rare', (random() < 0.3)::int) end;

  -- 數量是 0 的拿掉，網頁比較好顯示
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_reward
    from jsonb_each(v_reward) where value::text::int > 0;

  -- 頭像框：木 6%、鐵 10%、金 20%、星光 60%（已經有了就不會再出）
  v_frame := case p_chest when 'chest_wood' then 'frame_wood' when 'chest_iron' then 'frame_leaf'
                          when 'chest_gold' then 'frame_gold' else 'frame_star' end;
  if random() < (case p_chest when 'chest_wood' then 0.06 when 'chest_iron' then 0.10
                              when 'chest_gold' then 0.20 when 'chest_team' then 0 else 0.60 end)
     and public.fun_frame_grant(v_user, v_frame) then
    v_got_frame := v_frame;
  end if;

  insert into public.fun_chest_log (user_id, chest, reward)
    values (v_user, p_chest, v_reward || case when v_got_frame is null then '{}'::jsonb else jsonb_build_object('frame', v_got_frame) end)
    returning id into v_id;
  perform public.fun_give(v_user, v_reward, 'chest:' || v_id);

  return json_build_object('success', true, 'chest', p_chest, 'reward', v_reward, 'frame', v_got_frame);
end;
$function$;
revoke all on function public.fun_chest_open(text) from public, anon;
grant execute on function public.fun_chest_open(text) to authenticated;


-- 驚喜狀態也要讀到團隊寶箱的數量
create or replace function public.fun_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_week date := public.fun_week_start();
  f public.fun_fortunes%rowtype;
  v_items jsonb;
  v_mon jsonb;
  v_bought jsonb;
  v_weekend boolean := extract(isodow from public.app_today()) in (6, 7);
  v_total integer; v_done integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  perform public.fun_auto_grants(v_user);

  select * into f from public.fun_fortunes where user_id = v_user and day = v_today;

  select coalesce(jsonb_object_agg(item_key, qty), '{}'::jsonb) into v_items
    from public.player_items
    where user_id = v_user and item_key in ('scratch_card', 'gacha_coin', 'chest_wood', 'chest_iron', 'chest_gold', 'chest_star', 'chest_team', 'stardust');

  select coalesce(jsonb_object_agg(monster_key, count), '{}'::jsonb) into v_mon
    from public.fun_monsters where user_id = v_user;

  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_bought
    from public.fun_shop_buys where user_id = v_user and week_start = v_week;

  select count(*) filter (where not coalesce(skipped, false)),
         count(*) filter (where completed and not coalesce(skipped, false))
    into v_total, v_done
    from public.tasks where user_id = v_user and task_date = v_today;

  return json_build_object(
    'today', v_today,
    'checked_in', exists (select 1 from public.checkins where user_id = v_user and checkin_date = v_today),
    'fortune', case when f.user_id is null then null else jsonb_build_object('kind', f.kind, 'poem', f.poem, 'resolved_from', f.resolved_from) end,
    'tasks_done_today', public.fun_tasks_done_today(v_user),
    'tasks_plan', jsonb_build_object('total', v_total, 'done', v_done),
    'items', v_items,
    'monsters', v_mon,
    'set_done', exists (select 1 from public.item_events where user_id = v_user and source_key like 'monster-set%'),
    'zodiac_done', exists (select 1 from public.item_events where user_id = v_user and source_key like 'zodiac-set%'),
    'gold', coalesce((select gold from public.profiles where id = v_user), 0),
    'weekend', v_weekend,
    'shop', case when v_weekend then public.fun_shop_offers(v_week) else null end,
    'bought', v_bought,
    'class', (select class from public.rpg_heroes where user_id = v_user),
    'frame', (select frame from public.fun_profile where user_id = v_user),
    'frames', coalesce((select jsonb_agg(frame_key order by obtained_at) from public.fun_frames where user_id = v_user), '[]'::jsonb),
    'daikichi_count', (select count(*) from public.fun_fortunes where user_id = v_user and kind = 'daikichi'));
end;
$function$;
revoke all on function public.fun_status() from public, anon;
grant execute on function public.fun_status() to authenticated;

notify pgrst, 'reload schema';

select case
  when exists (select 1 from pg_proc where proname = 'team_status' and pronamespace = 'public'::regnamespace)
    then '✅ 小隊、團隊王、加油、動態牆設定完成'
  else '⚠️ 設定失敗'
end as 檢查結果;
