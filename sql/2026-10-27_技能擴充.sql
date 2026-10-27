-- =========================================================
-- 🌳 技能樹擴充：每個技能上限 3 → 10 級，新增 6 個技能（專案、財運）
-- 需要先跑過：2026-10-23_讀書與自律.sql、2026-10-26_專案.sql、2026-10-20_星露兌換星屑.sql、2026-10-27_冒險商店.sql
-- 可以重複執行。技能點仍然是「等級 = 點數」。
-- =========================================================

alter table public.skills drop constraint if exists skills_lv_check;
alter table public.skills add constraint skills_lv_check check (lv between 0 and 10);

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
    {"key":"trader",    "branch":"財運", "name":"商才",     "emoji":"💱", "max":10, "desc":"星露換星屑每天上限 +20／級"}
  ]'::jsonb
$$;

create or replace function public.skill_up(p_skill text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_lv integer; v_spent integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if not exists (select 1 from jsonb_array_elements(public.skill_catalog()) x where x->>'key' = p_skill) then raise exception '沒有這個技能'; end if;
  select coalesce(level, 1) into v_lv from public.profiles where id = v_user;
  select coalesce(sum(lv), 0) into v_spent from public.skills where user_id = v_user;
  if v_spent >= coalesce(v_lv, 1) then raise exception '技能點不夠，升級就會拿到新的點數'; end if;
  if public.skill_lv(v_user, p_skill) >= coalesce((select (x->>'max')::int from jsonb_array_elements(public.skill_catalog()) x where x->>'key' = p_skill), 10) then
    raise exception '這個技能已經滿級了';
  end if;
  insert into public.skills (user_id, skill, lv) values (v_user, p_skill, 1)
    on conflict (user_id, skill) do update set lv = public.skills.lv + 1;
  return json_build_object('success', true, 'lv', public.skill_lv(v_user, p_skill));
end;
$function$;

create or replace function public.project_step_dust(p_user uuid, p_step uuid, p_day date, p_crit text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare d integer := (5 + public.skill_lv(p_user, 'diligent')) * (case p_crit when 'super' then 5 when 'crit' then 2 else 1 end);  -- 技能：勤奮
begin
  if public.grant_item(p_user, 'stardust', d, 'proj-step:' || p_step || ':' || p_day) then
    return jsonb_build_object('stardust', d);
  end if;
  return '{}'::jsonb;
end;
$function$;

create or replace function public.project_award_step(p_user uuid, p_project uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  today date := public.app_today();
  st public.project_stats%rowtype;
  r double precision;
  crit text := null;
  mult numeric;
  gain integer;
begin
  insert into public.project_stats (user_id) values (p_user) on conflict do nothing;
  select * into st from public.project_stats where user_id = p_user for update;
  if st.last_day is distinct from today then
    st.combo := case when st.last_day = today - 1 then st.combo + 1 else 1 end;
    update public.project_stats
      set combo = st.combo, best_combo = greatest(best_combo, st.combo), last_day = today
      where user_id = p_user;
  end if;

  mult := 1 + least(st.combo - 1, 10) * 0.05;
  r := random();
  if r < 0.02 then crit := 'super'; mult := mult * 5;
  elsif r < 0.12 then crit := 'crit'; mult := mult * 2;
  end if;
  gain := round(10 * mult * (1 + 0.05 * public.skill_lv(p_user, 'fastlearn')));  -- 技能：速學
  if crit is not null then update public.project_stats set crits = crits + 1 where user_id = p_user; end if;

  return jsonb_build_object('done', true, 'xp', gain, 'crit', crit, 'combo', st.combo,
                            'levelUps', public.project_add_xp(p_user, p_project, gain));
end;
$function$;

create or replace function public.project_step_toggle(p_step uuid)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
  s public.project_steps%rowtype;
  pr public.projects%rowtype;
  lg public.project_step_logs%rowtype;
  res jsonb;
  total integer; done_n integer;
  ups jsonb;
  dust integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into s from public.project_steps where id = p_step and user_id = u for update;
  if not found then raise exception '找不到這個步驟'; end if;
  select * into pr from public.projects where id = s.project_id;
  if pr.status = 'done' then raise exception '專案已完成，步驟不能再改'; end if;

  if pr.kind = 'daily' then
    select * into lg from public.project_step_logs where step_id = p_step and day = today;
    if found then
      update public.project_step_logs set done = not lg.done where step_id = p_step and day = today;
      return json_build_object('done', not lg.done, 'xp', 0, 'repeat', not lg.done);
    end if;
    insert into public.project_step_logs (step_id, project_id, user_id, day) values (p_step, pr.id, u, today);
    res := public.project_award_step(u, pr.id);
    res := res || public.project_step_dust(u, p_step, today, res->>'crit');

    -- 今天全部打勾：一天一次的全勤獎勵
    select count(*), count(*) filter (where l.done) into total, done_n
      from public.project_steps ps
      left join public.project_step_logs l on l.step_id = ps.id and l.day = today
      where ps.project_id = pr.id;
    dust := 15 + 5 * total + 3 * public.skill_lv(u, 'fullclear');  -- 技能：全勤王
    if total > 0 and done_n = total
       and public.grant_item(u, 'stardust', dust, 'proj-day:' || pr.id || ':' || today) then
      ups := public.project_add_xp(u, pr.id, 20);
      res := res || jsonb_build_object('dayClear', jsonb_build_object('xp', 20, 'stardust', dust),
                                       'levelUps', (res->'levelUps') || ups);
    end if;
    return res::json;
  end if;

  if s.done then
    update public.project_steps set done = false, done_at = null where id = p_step;
    return json_build_object('done', false, 'xp', 0);
  end if;
  update public.project_steps set done = true, done_at = now(), xp_given = true where id = p_step;
  if s.xp_given then
    return json_build_object('done', true, 'xp', 0, 'repeat', true);
  end if;
  res := public.project_award_step(u, pr.id);
  return (res || public.project_step_dust(u, p_step, today, res->>'crit'))::json;
end;
$function$;

create or replace function public.project_lucky_draw()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
  old jsonb;
  r double precision := random();
  k text; q integer := 1; tier text;
  res jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select result into old from public.project_draws where user_id = u and day = today;
  if found then return json_build_object('already', true, 'result', old); end if;
  if not exists (select 1 from public.checkins where user_id = u and checkin_date = today and not is_makeup) then
    return json_build_object('ready', false);
  end if;

  r := least(0.9999, r + 0.01 * public.skill_lv(u, 'lucky'));  -- 技能：幸運星
  if r < 0.10 then k := null; tier := 'none';
  elsif r < 0.45 then k := 'stardust'; q := 30 + floor(random() * 51)::integer; tier := 'c';
  elsif r < 0.62 then k := 'wish_normal'; q := 2; tier := 'r';
  elsif r < 0.74 then k := 'ticket_normal'; q := 2; tier := 'r';
  elsif r < 0.80 then k := 'makeup_card'; tier := 'r';
  elsif r < 0.86 then k := 'stardust'; q := 150; tier := 'r';
  elsif r < 0.93 then k := 'wish_rare'; tier := 'x';
  elsif r < 0.97 then k := 'ticket_special'; tier := 'x';
  elsif r < 0.99 then k := 'wish_limited'; tier := 'x';
  else k := 'ticket_limited'; tier := 's';
  end if;

  if k is not null then perform public.grant_item(u, k, q, 'lucky:' || today); end if;
  if tier = 's' then
    perform public.grant_item(u, 'wish_limited', 1, 'lucky:' || today);
    perform public.grant_item(u, 'stardust', 300, 'lucky:' || today);
  end if;

  res := jsonb_build_object('tier', tier, 'key', k, 'qty', q);
  insert into public.project_draws (user_id, day, result) values (u, today, res);
  return json_build_object('ready', true, 'result', res);
end;
$function$;

create or replace function public.farm_exchange_stardust(p_count integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_day date := public.app_today();
  v_cap integer := 200 + 20 * public.skill_lv(auth.uid(), 'trader');  -- 技能：商才
  v_used integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_count is null or p_count < 1 or p_count > v_cap then raise exception '兌換數量不對'; end if;

  select coalesce(sum(delta), 0) into v_used
    from public.item_events
    where user_id = v_user and item_key = 'stardust'
      and source_key like 'exchange:' || v_day || ':%';

  if v_used + p_count > v_cap then
    raise exception '今天最多兌換 % 個星屑（已兌換 %）', v_cap, v_used;
  end if;

  perform public.grant_item(v_user, 'stardust', p_count,
                            'exchange:' || v_day || ':' || gen_random_uuid()::text);

  return json_build_object('success', true, 'got', p_count, 'used', v_used + p_count, 'cap', v_cap);
end;
$function$;

create or replace function public.rpg_store_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
begin
  if u is null then raise exception '尚未登入'; end if;
  return json_build_object(
    'gold', (select coalesce(gold, 0) from public.profiles where id = u),
    'bargain', public.skill_lv(u, 'bargain'),
    'items', (select jsonb_agg(x || jsonb_build_object(
                'price', round((x->>'price')::int * (1 - 0.03 * public.skill_lv(u, 'bargain')))::int,
                'was', (x->>'price')::int,
                'bought',
                coalesce((select sum(qty) from public.rpg_store_buys b
                          where b.user_id = u and b.day = today and b.item = x->>'item'), 0)))
              from jsonb_array_elements(public.rpg_store_catalog()) x));
end;
$function$;
grant execute on function public.rpg_store_status() to authenticated;

create or replace function public.rpg_store_buy(p_item text, p_qty integer default 1)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
  o jsonb;
  v_bought integer;
  v_cost integer;
  v_gold integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_qty is null or p_qty < 1 then raise exception '數量不對'; end if;
  select x into o from jsonb_array_elements(public.rpg_store_catalog()) x where x->>'item' = p_item;
  if o is null then raise exception '商店沒有賣這個'; end if;

  select gold into v_gold from public.profiles where id = u for update;
  select coalesce(sum(qty), 0) into v_bought from public.rpg_store_buys
    where user_id = u and day = today and item = p_item;
  if v_bought + p_qty > (o->>'limit')::int then
    raise exception '今天最多買 % 個（已買 %）', o->>'limit', v_bought;
  end if;
  v_cost := round((o->>'price')::int * (1 - 0.03 * public.skill_lv(u, 'bargain')))::int * p_qty;  -- 技能：砍價
  if coalesce(v_gold, 0) < v_cost then raise exception '金幣不夠（需要 %）', v_cost; end if;

  update public.profiles set gold = gold - v_cost, updated_at = now() where id = u;
  insert into public.rpg_store_buys (user_id, day, item, qty, price) values (u, today, p_item, p_qty, v_cost);
  perform public.grant_item(u, p_item, p_qty, 'store:' || gen_random_uuid());
  return json_build_object('success', true, 'item', p_item, 'qty', p_qty, 'gold', v_gold - v_cost);
end;
$function$;
revoke all on function public.rpg_store_buy(text, integer) from public, anon;
grant execute on function public.rpg_store_buy(text, integer) to authenticated;
