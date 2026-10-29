-- =========================================================
-- 序光計畫：🔔 更多通知、🛌 休息券擴充、📊 週回顧、🏆 收藏總表
-- 要先執行「2026-10-29_推播提醒.sql」和「2026-10-30_末世_城市.sql」。可以重複執行。
-- =========================================================

-- 合成工坊多一個「休息券」配方（跟 2026-10-30_末世_城市.sql 裡的一樣）
create or replace function public.doom_city_cat()
returns jsonb language sql immutable
as $function$
select $json${
"projects": [
  {"id":"clinic","name":"社區診所","emoji":"🏥","desc":"照顧大家的身體。","lv":1,
   "stages":[{"cost":{"food":20,"water":30,"parts":40},"need":3},{"cost":{"food":40,"water":60,"parts":90},"need":8},{"cost":{"food":80,"water":120,"parts":180},"need":15}],
   "perk":"每階段：每天 HP +5、士氣 +2"},
  {"id":"greenhouse","name":"溫室農場","emoji":"🌱","desc":"自己種出食物。","lv":1,
   "stages":[{"cost":{"water":40,"parts":50},"need":3},{"cost":{"water":80,"parts":110},"need":8},{"cost":{"water":150,"parts":220},"need":15}],
   "perk":"每階段：每天食物 +4"},
  {"id":"waterplant","name":"淨水廠","emoji":"🚰","desc":"乾淨的水源源不絕。","lv":1,
   "stages":[{"cost":{"food":30,"parts":50},"need":3},{"cost":{"food":60,"parts":110},"need":8},{"cost":{"food":120,"parts":220},"need":15}],
   "perk":"每階段：每天水 +4"},
  {"id":"powerplant","name":"發電廠","emoji":"⚡","desc":"讓城市重新亮起來。","lv":2,
   "stages":[{"cost":{"food":30,"water":30,"parts":80},"need":5},{"cost":{"food":60,"water":60,"parts":160},"need":10},{"cost":{"food":120,"water":120,"parts":300},"need":20}],
   "perk":"每階段：每天零件 +4"},
  {"id":"school","name":"學校","emoji":"🏫","desc":"孩子們又能上課了。","lv":2,
   "stages":[{"cost":{"food":50,"water":50,"parts":60},"need":5},{"cost":{"food":100,"water":100,"parts":120},"need":12},{"cost":{"food":200,"water":200,"parts":240},"need":20}],
   "perk":"每階段：幸運 +3"},
  {"id":"radiotower","name":"無線電塔","emoji":"📡","desc":"聯絡更遠的倖存者。","lv":3,
   "stages":[{"cost":{"food":40,"water":40,"parts":100},"need":6},{"cost":{"food":80,"water":80,"parts":200},"need":12},{"cost":{"food":160,"water":160,"parts":350},"need":20}],
   "perk":"每階段：遠征隊伍 +1"},
  {"id":"citywall","name":"城牆","emoji":"🧱","desc":"擋住夜裡的掠奪者。","lv":2,
   "stages":[{"cost":{"food":20,"water":20,"parts":90},"need":4},{"cost":{"food":40,"water":40,"parts":180},"need":10},{"cost":{"food":80,"water":80,"parts":320},"need":18}],
   "perk":"每階段：防禦 +25"},
  {"id":"lighthouse","name":"星光燈塔","emoji":"🗼","desc":"在廢墟中央點亮希望。","lv":4,
   "stages":[{"cost":{"food":100,"water":100,"parts":150},"need":10},{"cost":{"food":200,"water":200,"parts":300},"need":20},{"cost":{"food":400,"water":400,"parts":600},"need":35}],
   "perk":"每階段：每天星屑 +5、搜刮券 +1"}
],
"recipes": [
  {"id":"r_bronze","name":"銅補給箱","emoji":"📦","icon":"ui/box_bronze","cost":{"parts":30,"food":10},"gain":{"box_bronze":1}},
  {"id":"r_silver","name":"銀補給箱","emoji":"🎁","icon":"ui/box_silver","cost":{"parts":60,"water":20,"scav":3},"gain":{"box_silver":1}},
  {"id":"r_gold","name":"金補給箱","emoji":"💰","icon":"ui/box_gold","cost":{"parts":120,"food":40,"water":40,"scav":6},"gain":{"box_gold":1}},
  {"id":"r_double","name":"翻倍卡","emoji":"✖️","icon":"craft/double","cost":{"parts":40,"scav":5},"gain":{"double":1}},
  {"id":"r_unid","name":"未鑑定物品","emoji":"❓","icon":"ui/unid","cost":{"food":10,"scav":2},"gain":{"unid":1}},
  {"id":"r_wish","name":"星願券","emoji":"🎫","icon":"craft/wish","cost":{"parts":40,"scav":4},"gain":{"wish_normal":1}},
  {"id":"r_ticket","name":"召喚券","emoji":"🎟️","icon":"craft/ticket","cost":{"parts":50,"scav":4},"gain":{"ticket_normal":1}},
  {"id":"r_scav","name":"搜刮券 ×2","emoji":"🎟️","icon":"ui/scav","cost":{"food":15,"water":15,"parts":10},"gain":{"scav":2}},
  {"id":"r_medkit","name":"急救包","emoji":"🩹","icon":"craft/medkit","cost":{"water":10,"parts":15},"gain":{"hp":20,"morale":5}},
  {"id":"r_party","name":"營火晚會","emoji":"🔥","icon":"craft/party","cost":{"food":20,"water":10},"gain":{"morale":20}},
  {"id":"r_dust","name":"星屑 ×15","emoji":"✨","icon":"craft/dust","cost":{"parts":30,"water":10},"gain":{"stardust":15}},
  {"id":"r_recruit","name":"招募倖存者","emoji":"🧑‍🤝‍🧑","icon":"craft/recruit","cost":{"food":30,"water":30},"gain":{"survivor":1}},
  {"id":"r_rest","name":"休息券","emoji":"🛌","icon":"craft/rest","cost":{"food":60,"water":60,"parts":40},"gain":{"item":"rest_extra"}}
],
"dests": [
  {"id":"farmland","name":"郊外農場","emoji":"🌾","desc":"安全，帶回很多食物。","city":1,"hours":1,"cost":{"food":5,"water":5},
   "gain":{"food":[12,25],"water":[4,10]},"survivor":0.3,"rare":0.05},
  {"id":"harbor","name":"廢棄港口","emoji":"⚓","desc":"零件和水很多。","city":2,"hours":3,"cost":{"food":10,"water":10},
   "gain":{"parts":[15,35],"water":[10,20]},"survivor":0.5,"rare":0.1},
  {"id":"station","name":"山區氣象站","emoji":"🏔️","desc":"可能有無線電訊號和星屑。","city":4,"hours":4,"cost":{"food":15,"water":15},
   "gain":{"stardust":[8,20],"parts":[10,25],"scav":[1,3]},"survivor":0.6,"rare":0.15},
  {"id":"undercity","name":"地下城市","emoji":"🚇","desc":"很多倖存者躲在這裡，但很危險。","city":7,"hours":6,"cost":{"food":25,"water":25},
   "gain":{"food":[15,30],"parts":[20,40],"scav":[2,4]},"survivor":1.5,"rare":0.2},
  {"id":"starfall","name":"星落之地","emoji":"🌠","desc":"傳說星星墜落的地方，寶物最多。","city":10,"hours":8,"cost":{"food":40,"water":40,"parts":20},
   "gain":{"stardust":[30,60],"scav":[3,6],"gold":[50,150]},"survivor":1,"rare":0.4}
]
}$json$::jsonb
$function$;

create or replace function public.doom_craft(p_id text, p_n integer default 1)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  st public.doom_state%rowtype;
  r jsonb;
  n integer := greatest(1, least(coalesce(p_n, 1), 20));
  i integer;
  done integer := 0;
  out jsonb := '[]'::jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select el into r from jsonb_array_elements(public.doom_city_cat()->'recipes') el where el->>'id' = p_id;
  if r is null then raise exception '沒有這個配方'; end if;
  for i in 1..n loop
    select * into st from public.doom_state where user_id = u for update;
    exit when not public.doom_can_pay(st, r->'cost');
    perform public.doom_apply(u, public.doom_neg(r->'cost'), 'doom-craft-pay:' || gen_random_uuid());
    if r->'gain' ? 'item' then
      perform public.grant_item(u, r->'gain'->>'item', 1, 'doom-craft-item:' || gen_random_uuid());
      out := out || jsonb_build_object('k', r->'gain'->>'item', 'n', 1);
    elsif r->'gain' ? 'survivor' then
      update public.doom_state set survivors = survivors + (r->'gain'->>'survivor')::int where user_id = u;
      out := out || jsonb_build_object('k', 'survivor', 'n', 1);
    else
      out := out || public.doom_apply(u, r->'gain', 'doom-craft:' || gen_random_uuid());
    end if;
    done := done + 1;
  end loop;
  if done = 0 then raise exception '材料不夠'; end if;
  update public.doom_state set crafted = crafted + done where user_id = u;
  return json_build_object('id', p_id, 'n', done, 'gains', out);
end;
$function$;

-- =========================================================
-- 🔔 通知擴充：遠征回來、農場作物都熟了、每日總結
-- =========================================================
alter table public.push_settings
  add column if not exists n_exp boolean not null default true,
  add column if not exists n_farm boolean not null default true,
  add column if not exists n_summary boolean not null default true,
  add column if not exists summary_time text not null default '22:30',
  add column if not exists farm_at bigint not null default 0;
alter table public.doom_expeditions add column if not exists notified boolean not null default false;

create or replace function public.push_get()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); s public.push_settings%rowtype;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into s from public.push_settings where user_id = u;
  return json_build_object(
    'enabled', coalesce(s.enabled, true),
    'times', coalesce(s.times, '{21:00}'),
    'only_pending', coalesce(s.only_pending, true),
    'n_exp', coalesce(s.n_exp, true), 'n_farm', coalesce(s.n_farm, true),
    'n_summary', coalesce(s.n_summary, true), 'summary_time', coalesce(s.summary_time, '22:30'),
    'devices', (select count(*) from public.push_subs where user_id = u),
    'endpoints', (select coalesce(json_agg(endpoint), '[]'::json) from public.push_subs where user_id = u));
end;
$function$;

create or replace function public.push_save_more(p_exp boolean, p_farm boolean, p_summary boolean, p_summary_time text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_summary_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception '時間格式不對'; end if;
  insert into public.push_settings (user_id, n_exp, n_farm, n_summary, summary_time)
    values (u, p_exp, p_farm, p_summary, p_summary_time)
    on conflict (user_id) do update set n_exp = p_exp, n_farm = p_farm, n_summary = p_summary,
      summary_time = p_summary_time, updated_at = now();
  return public.push_get();
end;
$function$;
revoke all on function public.push_save_more(boolean, boolean, boolean, text) from public, anon;
grant execute on function public.push_save_more(boolean, boolean, boolean, text) to authenticated;

-- 農場：所有種下去的田（菜田、麥田、香草園、溫室）最晚熟的時間（毫秒），還有沒澆水的就回 null
create or replace function public.push_farm_ripe(st jsonb)
returns bigint language sql immutable
as $function$
  select case when count(*) = 0 or bool_or(p->>'t1' is null) then null else max((p->>'t1')::bigint) end
  from (select value p from jsonb_each(coalesce(st->'field'->'plots', '{}')) union all
        select value from jsonb_each(coalesce(st->'wheatfield'->'plots', '{}')) union all
        select value from jsonb_each(coalesce(st->'herb'->'plots', '{}')) union all
        select value from jsonb_each(coalesce(st->'green'->'plots', '{}'))) x
  where p ? 'c';
$function$;

create or replace function public.push_due()
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  now_tp timestamp := now() at time zone 'Asia/Taipei';
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  today date := public.app_today();
  s record;
  t text;
  due_at timestamp;
  n integer; done integer;
  titles text;
  msg jsonb;
  msgs jsonb;
  out jsonb := '[]'::jsonb;
  e record;
  ripe bigint;
  fmin integer; hab integer; v_streak integer;
begin
  for s in select * from public.push_settings p
           where exists (select 1 from public.push_subs x where x.user_id = p.user_id) loop
    msgs := '[]'::jsonb;

    -- 📋 任務提醒
    if s.enabled then
      foreach t in array s.times loop
        due_at := now_tp::date + t::time;
        continue when now_tp < due_at or now_tp >= due_at + interval '60 minutes';
        continue when coalesce(s.sent->>t, '') = today::text;
        update public.push_settings set sent = sent || jsonb_build_object(t, today::text) where user_id = s.user_id;
        select count(*), string_agg(title, '、' order by id) filter (where rn <= 3)
          into n, titles
          from (select id, title, row_number() over (order by id) rn from public.tasks
                where user_id = s.user_id and task_date = today and not completed and not coalesce(skipped, false)) q;
        if n = 0 then
          continue when s.only_pending;
          msgs := msgs || jsonb_build_object('title', '🎉 今天的任務都完成了', 'body', '太棒了！記得也去專注一下、收一收農場。', 'url', './#today', 'tag', 'task');
        else
          msgs := msgs || jsonb_build_object('title', '📋 還有 ' || n || ' 個任務沒完成',
            'body', titles || case when n > 3 then ' …等 ' || n || ' 個' else '' end, 'url', './#tasks', 'tag', 'task');
        end if;
      end loop;
    end if;

    -- 🧭 遠征回來了
    if s.n_exp then
      begin
        for e in select x.id, x.dest from public.doom_expeditions x
                 where x.user_id = s.user_id and x.claimed_at is null and not x.notified and public.doom_exp_end(x) <= now() loop
          update public.doom_expeditions set notified = true where id = e.id;
          msgs := msgs || jsonb_build_object('title', '🧭 遠征隊回來了！',
            'body', coalesce((select d->>'emoji' || ' ' || (d->>'name') from jsonb_array_elements(public.doom_city_cat()->'dests') d where d->>'id' = e.dest), '') || '的隊伍帶著東西回來了，快去收下。',
            'url', './#doom', 'tag', 'exp' || e.id);
        end loop;
      exception when others then null; end;
    end if;

    -- 🌾 農場作物都熟了（熟了 3 小時以上就不補送）
    if s.n_farm then
      begin
        select public.push_farm_ripe(state) into ripe from public.farm_saves where user_id = s.user_id;
        if ripe is not null and ripe <= now_ms and ripe > s.farm_at then
          update public.push_settings set farm_at = ripe where user_id = s.user_id;
          if now_ms - ripe < 3 * 3600 * 1000 then
            msgs := msgs || jsonb_build_object('title', '🌾 農場的作物都熟了', 'body', '田裡全部可以收成了，收完記得再種下一輪。', 'url', './#farm', 'tag', 'farm');
          end if;
        end if;
      exception when others then null; end;
    end if;

    -- 📊 每日總結
    if s.n_summary then
      due_at := now_tp::date + s.summary_time::time;
      if now_tp >= due_at and now_tp < due_at + interval '60 minutes' and coalesce(s.sent->>'summary', '') <> today::text then
        update public.push_settings set sent = sent || jsonb_build_object('summary', today::text) where user_id = s.user_id;
        select coalesce(sum(duration_seconds), 0) / 60 into fmin from public.focus_sessions where user_id = s.user_id and session_date = today;
        select count(*) filter (where completed), count(*) filter (where not coalesce(skipped, false)) into done, n
          from public.tasks where user_id = s.user_id and task_date = today;
        begin select count(*) into hab from public.habit_logs where user_id = s.user_id and log_date = today; exception when others then hab := 0; end;
        select c.streak into v_streak from public.checkins c where c.user_id = s.user_id order by checkin_date desc limit 1;
        msgs := msgs || jsonb_build_object(
          'title', case when fmin >= 180 or (n > 0 and done = n) then '🌟 今天超棒！' when fmin + done * 20 > 0 then '📊 今天的成果' else '🌙 今天休息了一下' end,
          'body', '專注 ' || case when fmin >= 60 then (fmin / 60) || ' 小時 ' || (fmin % 60) || ' 分' else fmin || ' 分' end
            || '・任務 ' || done || '/' || n || '・習慣 ' || hab || ' 個' || case when v_streak > 0 then '・連續簽到 ' || v_streak || ' 天' else '' end
            || case when fmin + done = 0 then '。明天再一起加油！' else '。' end,
          'url', './#today', 'tag', 'summary');
      end if;
    end if;

    if jsonb_array_length(msgs) > 0 then
      out := out || (select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'msg', m,
        'subs', (select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth))
                 from public.push_subs where user_id = s.user_id))) from jsonb_array_elements(msgs) m);
    end if;
  end loop;
  return out;
end;
$function$;
revoke all on function public.push_due() from public, anon, authenticated;
grant execute on function public.push_due() to service_role;


-- =========================================================
-- 🛌 休息券：每月免費 2 張，用完之後可以用末世工坊做的「休息券」
-- =========================================================
create or replace function public.rest_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_today date := public.app_today(); v_start date := date_trunc('month', public.app_today())::date;
  v_free integer; v_extra integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  v_free := greatest(0, 2 - (select count(*) from public.rest_days where user_id = v_user and day >= v_start));
  select coalesce(qty, 0) into v_extra from public.player_items where user_id = v_user and item_key = 'rest_extra';
  return json_build_object(
    'left', v_free + coalesce(v_extra, 0), 'free', v_free, 'extra', coalesce(v_extra, 0),
    'used', coalesce((select json_agg(day order by day) from public.rest_days where user_id = v_user and day >= v_start), '[]'::json),
    'missed', coalesce((select json_agg(d::date order by d) from generate_series(v_start, v_today - 1, interval '1 day') d
                        where not exists (select 1 from public.checkins where user_id = v_user and checkin_date = d::date)), '[]'::json));
end;
$function$;
revoke all on function public.rest_status() from public, anon;
grant execute on function public.rest_status() to authenticated;

create or replace function public.rest_use(p_date date)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.app_today();
  v_start date := date_trunc('month', public.app_today())::date;
  v_prev integer; v_streak integer; v_day date;
  v_paid boolean := false;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_date is null or p_date >= v_today or p_date < v_start then raise exception '只能用在這個月、今天以前沒簽到的日子'; end if;
  if exists (select 1 from public.checkins where user_id = v_user and checkin_date = p_date) then raise exception '這天已經簽到過了'; end if;
  if (select count(*) from public.rest_days where user_id = v_user and day >= v_start) >= 2 then
    update public.player_items set qty = qty - 1, updated_at = now() where user_id = v_user and item_key = 'rest_extra' and qty > 0;
    if not found then raise exception '這個月的免費休息券用完了（末世的合成工坊可以做休息券）'; end if;
    v_paid := true;
  end if;

  insert into public.rest_days (user_id, day) values (v_user, p_date);
  select streak into v_prev from public.checkins where user_id = v_user and checkin_date = p_date - 1;
  v_streak := coalesce(v_prev, 0) + 1;
  insert into public.checkins (user_id, checkin_date, streak, crit, crit_chance, exp, gold, is_makeup, cost)
    values (v_user, p_date, v_streak, false, 0, 0, 0, true, 0);
  v_day := p_date + 1;
  loop
    update public.checkins set streak = v_streak + 1 where user_id = v_user and checkin_date = v_day;
    exit when not found;
    v_streak := v_streak + 1;
    v_day := v_day + 1;
  end loop;
  perform public.checkin_month_bonus(v_user, p_date);
  return json_build_object('success', true, 'day', p_date, 'streak', v_streak, 'paid', v_paid);
end;
$function$;
revoke all on function public.rest_use(date) from public, anon;
grant execute on function public.rest_use(date) to authenticated;


-- =========================================================
-- 📊 週回顧＋🏆 收藏總表
--   life_week(p_offset)：0 = 這週、-1 = 上週…（週一到週日）
--   life_collection()：各遊戲收藏的「已經有幾個」，總數由網頁算或這裡算
-- =========================================================
create or replace function public.life_week(p_offset integer default 0)
returns json language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  t date := public.app_today();
  ws date := t - (extract(isodow from t)::int - 1) + 7 * coalesce(p_offset, 0);
  days jsonb;
  prev jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select jsonb_agg(jsonb_build_object(
      'day', d::date,
      'focus', (select coalesce(sum(duration_seconds), 0) / 60 from public.focus_sessions f where f.user_id = u and f.session_date = d::date),
      'tasks', (select count(*) from public.tasks k where k.user_id = u and k.task_date = d::date and not coalesce(k.skipped, false)),
      'done', (select count(*) from public.tasks k where k.user_id = u and k.task_date = d::date and k.completed),
      'habits', (select count(*) from public.habit_logs h where h.user_id = u and h.log_date = d::date),
      'checkin', exists (select 1 from public.checkins c where c.user_id = u and c.checkin_date = d::date)
    ) order by d)
    into days from generate_series(ws, ws + 6, interval '1 day') d;
  select jsonb_build_object(
      'focus', (select coalesce(sum(duration_seconds), 0) / 60 from public.focus_sessions f where f.user_id = u and f.session_date between ws - 7 and ws - 1),
      'done', (select count(*) from public.tasks k where k.user_id = u and k.task_date between ws - 7 and ws - 1 and k.completed),
      'tasks', (select count(*) from public.tasks k where k.user_id = u and k.task_date between ws - 7 and ws - 1 and not coalesce(k.skipped, false)))
    into prev;
  return json_build_object('start', ws, 'end', ws + 6, 'today', t, 'days', days, 'prev', prev,
    'subjects', (select coalesce(jsonb_agg(x order by x.min desc), '[]'::jsonb) from (
      select subject, sum(duration_seconds) / 60 as min from public.focus_sessions
      where user_id = u and session_date between ws and ws + 6 group by subject) x));
end;
$function$;
revoke all on function public.life_week(integer) from public, anon;
grant execute on function public.life_week(integer) to authenticated;

create or replace function public.life_collection()
returns json language plpgsql stable security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); out jsonb := '{}'::jsonb; x jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  begin
    select jsonb_build_object('crops', (select count(*) from jsonb_object_keys(coalesce(state->'known'->'crops', '{}'))),
      'dishes', (select count(*) from jsonb_object_keys(coalesce(state->'known'->'dishes', '{}'))),
      'animals', (select count(*) from jsonb_object_keys(coalesce(state->'known'->'animals', '{}'))),
      'fish', (select count(*) from jsonb_object_keys(coalesce(state->'fish'->'caught', '{}'))),
      'lv', (state->>'lv')::int)
      into x from public.farm_saves where user_id = u;
    out := out || jsonb_build_object('farm', x);
  exception when others then null; end;
  begin
    out := out || jsonb_build_object('rpg', jsonb_build_object(
      'gear', (select count(*) from public.rpg_gear where user_id = u),
      'gear_total', (select count(*) from jsonb_object_keys(public.rpg_catalog()->'gear')),
      'monsters', (select count(*) from public.fun_monsters where user_id = u),
      'frames', (select count(*) from public.fun_frames where user_id = u),
      'skills', (select coalesce(sum(lv), 0) from public.skills where user_id = u)));
  exception when others then null; end;
  begin
    select jsonb_build_object(
      'seen', (select count(*) from jsonb_object_keys(s.seen)),
      'seen_total', (select count(*) from jsonb_array_elements(public.doom_catalog()->'loot'))
                  + (select count(*) from jsonb_array_elements(public.doom_zones()->'zones') z, jsonb_array_elements(z->'items') i),
      'trinkets', (select count(*) from jsonb_object_keys(s.trinkets)),
      'trinkets_total', jsonb_array_length(public.doom_trinket_cat()->'items'),
      'relics', (select count(*) from jsonb_object_keys(s.relics)),
      'relics_total', jsonb_array_length(public.doom_catalog()->'relics'),
      'companions', jsonb_array_length(s.companions),
      'companions_total', jsonb_array_length(public.doom_catalog()->'companions'),
      'memories', jsonb_array_length(s.memories),
      'memories_total', jsonb_array_length(public.doom_extra()->'memories'),
      'projects', coalesce((select sum(value::int) from jsonb_each_text(s.projects)), 0),
      'projects_total', 3 * jsonb_array_length(public.doom_city_cat()->'projects'),
      'zones', jsonb_array_length(s.zones_unlocked),
      'zones_total', (select count(*) from jsonb_array_elements(public.doom_zones()->'zones') z where (z->>'hidden')::boolean))
      into x from public.doom_state s where s.user_id = u;
    out := out || jsonb_build_object('doom', x);
  exception when others then null; end;
  return out;
end;
$function$;
revoke all on function public.life_collection() from public, anon;
grant execute on function public.life_collection() to authenticated;
