-- =========================================================
-- 序光計畫：🥚 習慣寵物蛋、🕳️ 黑洞模式、🔨 人生拍賣會、📡 季節雷達、👹 拖延捕手
-- 要先跑過「2026-11-02_生活打卡.sql」。可以重複執行。（📻 白噪音電台只在網頁，不用 SQL）
-- =========================================================

-- 🥚 習慣寵物蛋 ------------------------------------------------
create table if not exists public.habit_eggs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  habit text not null check (char_length(habit) between 1 and 40),
  streak integer not null default 0,
  best integer not null default 0,
  total integer not null default 0,
  colds integer not null default 0,
  last_day date,
  pet text,
  hatched_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.habit_eggs enable row level security;
drop policy if exists "own select" on public.habit_eggs;
create policy "own select" on public.habit_eggs for select using (auth.uid() = user_id);
revoke insert, update, delete on public.habit_eggs from authenticated, anon;

create or replace function public.egg_pets() returns jsonb language sql immutable as $$ select '[
 {"k":"fox","emoji":"🦊","name":"晨光狐狸"},{"k":"owl","emoji":"🦉","name":"夜讀貓頭鷹"},{"k":"turtle","emoji":"🐢","name":"堅持小龜"},
 {"k":"cat","emoji":"🐈","name":"整潔貓"},{"k":"dragon","emoji":"🐉","name":"自律小龍"},{"k":"penguin","emoji":"🐧","name":"早睡企鵝"},
 {"k":"bunny","emoji":"🐇","name":"元氣兔"},{"k":"panda","emoji":"🐼","name":"專注熊貓"},{"k":"unicorn","emoji":"🦄","name":"夢想獨角獸"},
 {"k":"phoenix","emoji":"🐦‍🔥","name":"浴火鳳凰"}]'::jsonb $$;

create or replace function public.egg_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today();
begin
  if u is null then raise exception '尚未登入'; end if;
  return json_build_object('today', t, 'pets', public.egg_pets(), 'eggs', coalesce((select json_agg(json_build_object(
      'id', id, 'habit', habit, 'total', total, 'best', best, 'colds', colds, 'pet', pet, 'hatched_at', hatched_at,
      'done_today', last_day = t,
      'streak', case when last_day >= t - 1 then streak else 0 end,
      'cold', pet is null and last_day is not null and last_day < t - 1) order by hatched_at nulls first, id desc)
    from public.habit_eggs where user_id = u), '[]'));
end; $$;

create or replace function public.egg_start(p_habit text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '尚未登入'; end if;
  if (select count(*) from public.habit_eggs where user_id = u and pet is null) >= 3 then raise exception '一次最多孵 3 顆蛋'; end if;
  insert into public.habit_eggs (user_id, habit) values (u, btrim(p_habit));
  return public.egg_status();
end; $$;

create or replace function public.egg_check(p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); e public.habit_eggs; v_st integer; p jsonb; hatched jsonb;
begin
  select * into e from public.habit_eggs where id = p_id and user_id = u for update;
  if not found then raise exception '找不到這顆蛋'; end if;
  if e.pet is not null then raise exception '已經孵出來了'; end if;
  if e.last_day = t then raise exception '今天已經打卡了'; end if;
  v_st := case when e.last_day = t - 1 then e.streak + 1 else 1 end;
  update public.habit_eggs set streak = v_st, best = greatest(best, v_st), total = total + 1, last_day = t,
    colds = colds + case when e.last_day is not null and e.last_day < t - 1 then 1 else 0 end where id = p_id;
  perform public.grant_item(u, 'stardust', 5, 'egg:' || p_id || ':' || t);
  if v_st >= 21 then
    select x into p from jsonb_array_elements(public.egg_pets()) x
      where x->>'k' not in (select pet from public.habit_eggs where user_id = u and pet is not null) order by random() limit 1;
    if p is null then select x into p from jsonb_array_elements(public.egg_pets()) x order by random() limit 1; end if;
    update public.habit_eggs set pet = p->>'k', hatched_at = now() where id = p_id;
    perform public.grant_item(u, 'stardust', 200, 'egghatch:' || p_id);
    perform public.grant_item(u, 'chest_star', 1, 'egghatchc:' || p_id);
    hatched := p;
  end if;
  return (public.egg_status()::jsonb || jsonb_build_object('hatched', hatched))::json;
end; $$;

create or replace function public.egg_drop(p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.habit_eggs where id = p_id and user_id = auth.uid() and pet is null;
  return public.egg_status();
end; $$;

-- 🕳️ 黑洞模式 ------------------------------------------------
create table if not exists public.blackhole_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  minutes integer,
  focus_min integer,
  loot jsonb
);
alter table public.blackhole_runs enable row level security;
drop policy if exists "own select" on public.blackhole_runs;
create policy "own select" on public.blackhole_runs for select using (auth.uid() = user_id);
revoke insert, update, delete on public.blackhole_runs from authenticated, anon;

create or replace function public.blackhole_start()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); r public.blackhole_runs;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into r from public.blackhole_runs where user_id = u and ended_at is null and started_at > now() - interval '12 hours';
  if not found then insert into public.blackhole_runs (user_id) values (u) returning * into r; end if;
  return json_build_object('id', r.id, 'started_at', r.started_at);
end; $$;

create or replace function public.blackhole_end()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); r public.blackhole_runs; m integer; fm integer; v_loot jsonb := '{}'::jsonb; tier text; k text; v integer;
begin
  select * into r from public.blackhole_runs where user_id = u and ended_at is null order by id desc limit 1 for update;
  if not found then raise exception '沒有在黑洞裡'; end if;
  m := least(extract(epoch from now() - r.started_at)::int / 60, 480);
  select coalesce(sum(coalesce(duration_seconds, 0)), 0) / 60 into fm from public.focus_sessions
   where user_id = u and started_at >= r.started_at - interval '2 minutes';
  -- 待滿 30 分鐘、而且裡面至少專注一半時間才有寶物
  if m >= 30 and fm * 2 >= least(m, 240) then
    tier := case when m >= 180 then 'deep' when m >= 90 then 'mid' else 'edge' end;
    v_loot := case tier
      when 'deep' then jsonb_build_object('stardust', 150, 'chest_star', 1, 'wish_rare', 1)
      when 'mid'  then jsonb_build_object('stardust', 80, 'chest_gold', 1)
      else jsonb_build_object('stardust', 30, 'gacha_coin', 1) end;
    if random() < 0.15 then v_loot := v_loot || jsonb_build_object('wish_limited', 1); end if;
    for k, v in select key, value::int from jsonb_each_text(v_loot) loop
      perform public.grant_item(u, k, v, 'blackhole:' || r.id || ':' || k);
    end loop;
  end if;
  update public.blackhole_runs set ended_at = now(), minutes = m, focus_min = fm, loot = v_loot where id = r.id;
  return json_build_object('minutes', m, 'focus_min', fm, 'tier', tier, 'loot', v_loot,
    'runs', (select count(*) from public.blackhole_runs where user_id = u and loot <> '{}'::jsonb));
end; $$;

-- 🔨 人生拍賣會 ------------------------------------------------
create table if not exists public.auction_items (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  emoji text not null default '🎁',
  price integer not null check (price between 10 and 100000),
  weekly_limit integer not null default 1 check (weekly_limit between 1 and 7),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.auction_wins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id bigint references public.auction_items(id) on delete set null,
  title text not null, emoji text, price integer not null,
  week date not null, used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.auction_items enable row level security;
alter table public.auction_wins enable row level security;
drop policy if exists "own select" on public.auction_items;
create policy "own select" on public.auction_items for select using (auth.uid() = user_id);
drop policy if exists "own select" on public.auction_wins;
create policy "own select" on public.auction_wins for select using (auth.uid() = user_id);
revoke insert, update, delete on public.auction_items, public.auction_wins from authenticated, anon;

-- 週六、週日都開（以早上 6 點換日算）。同一件獎勵這週買越多次越貴（×1.5）
create or replace function public.auction_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); w date := public.life_week(public.app_today());
begin
  if u is null then raise exception '尚未登入'; end if;
  return json_build_object('open', extract(isodow from t) >= 6, 'today', t, 'week', w,
    'opens_in', case when extract(isodow from t) >= 6 then 0 else 6 - extract(isodow from t)::int end,
    'stardust', coalesce((select qty from public.player_items where user_id = u and item_key = 'stardust'), 0),
    'items', coalesce((select json_agg(json_build_object('id', i.id, 'title', i.title, 'emoji', i.emoji, 'base', i.price, 'limit', i.weekly_limit,
        'bought', b.n, 'price', round(i.price * power(1.5, b.n))::int) order by i.price)
      from public.auction_items i cross join lateral (select count(*)::int n from public.auction_wins where item_id = i.id and week = w) b
      where i.user_id = u and not i.archived), '[]'),
    'wins', coalesce((select json_agg(json_build_object('id', id, 'title', title, 'emoji', emoji, 'price', price, 'used', used_at is not null, 'at', created_at) order by used_at nulls first, created_at desc)
      from (select * from public.auction_wins where user_id = u and (used_at is null or used_at > now() - interval '14 days') limit 30) x), '[]'),
    'spent', coalesce((select sum(price) from public.auction_wins where user_id = u), 0));
end; $$;

create or replace function public.auction_item_save(p_id bigint, p_title text, p_emoji text, p_price integer, p_limit integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_id is null then
    if (select count(*) from public.auction_items where user_id = u and not archived) >= 20 then raise exception '最多 20 件'; end if;
    insert into public.auction_items (user_id, title, emoji, price, weekly_limit) values (u, btrim(p_title), coalesce(nullif(btrim(p_emoji), ''), '🎁'), p_price, coalesce(p_limit, 1));
  else
    update public.auction_items set title = btrim(p_title), emoji = coalesce(nullif(btrim(p_emoji), ''), '🎁'), price = p_price, weekly_limit = coalesce(p_limit, 1) where id = p_id and user_id = u;
  end if;
  return public.auction_status();
end; $$;

create or replace function public.auction_item_del(p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  update public.auction_items set archived = true where id = p_id and user_id = auth.uid();
  return public.auction_status();
end; $$;

create or replace function public.auction_buy(p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); w date := public.life_week(public.app_today()); i public.auction_items; n integer; pr integer;
begin
  if extract(isodow from t) < 6 then raise exception '拍賣會週六、週日才開'; end if;
  select * into i from public.auction_items where id = p_id and user_id = u and not archived;
  if not found then raise exception '找不到這件獎勵'; end if;
  select count(*) into n from public.auction_wins where item_id = i.id and week = w;
  if n >= i.weekly_limit then raise exception '這週已經買到上限了'; end if;
  pr := round(i.price * power(1.5, n));
  perform public.fun_take(u, 'stardust', pr, 'auction:' || i.id || ':' || w || ':' || n);
  insert into public.auction_wins (user_id, item_id, title, emoji, price, week) values (u, i.id, i.title, i.emoji, pr, w);
  return public.auction_status();
end; $$;

create or replace function public.auction_use(p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  update public.auction_wins set used_at = now() where id = p_id and user_id = auth.uid() and used_at is null;
  return public.auction_status();
end; $$;

-- 📡 季節雷達：最近 4 季，每個領域的平均完成度 -------------------
create or replace function public.life_seasons()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); q0 date := date_trunc('quarter', public.app_today())::date; res jsonb := '[]'::jsonb; qs date; qe date; row jsonb; d text;
begin
  if u is null then raise exception '尚未登入'; end if;
  for i in reverse 3..0 loop
    qs := (q0 - make_interval(months => 3 * i))::date; qe := least((qs + interval '3 months - 1 day')::date, t);
    row := jsonb_build_object('label', extract(year from qs) || ' Q' || extract(quarter from qs), 'from', qs, 'to', qe);
    foreach d in array array['sleep', 'care', 'health', 'food', 'life', 'weekly'] loop
      row := row || jsonb_build_object(d, (select round(avg(p)) from (select public.life_pct(u, d, g::date) p from generate_series(qs, qe, interval '1 day') g) x where p is not null));
    end loop;
    res := res || jsonb_build_array(row);
  end loop;
  return json_build_object('seasons', res);
end; $$;

-- 👹 拖延捕手：順延 3 天以上的任務 ----------------------------------
create or replace function public.monster_list()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today();
begin
  return json_build_object('monsters', coalesce((select json_agg(json_build_object('id', id, 'title', title, 'days', task_date - original_date) order by task_date - original_date desc)
      from public.tasks where user_id = u and not completed and not skipped and task_date = t and original_date is not null and task_date - original_date >= 3), '[]'),
    'slain', (select count(*) from public.item_events where user_id = u and source_key like 'monster:%:stardust'));
end; $$;

create or replace function public.monster_slay(p_task_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); k record; days integer; got boolean;
begin
  select * into k from public.tasks where id = p_task_id and user_id = u;
  if not found or not k.completed or k.original_date is null then return json_build_object('ok', false); end if;
  days := k.task_date - k.original_date;
  if days < 3 then return json_build_object('ok', false); end if;
  got := public.grant_item(u, 'stardust', 30 + 10 * least(days, 14), 'monster:' || k.id || ':stardust');
  if got then
    perform public.grant_item(u, 'chest_gold', 1, 'monster:' || k.id || ':chest');
    -- 雙倍：再發一次這個任務原本的經驗和金幣
    declare lv integer; ex integer;
    begin
      select level, exp + coalesce(k.exp_reward, 0) into lv, ex from public.profiles where id = u for update;
      while ex >= 100 + (lv - 1) * 50 loop ex := ex - (100 + (lv - 1) * 50); lv := lv + 1; end loop;
      update public.profiles set level = lv, exp = ex, gold = gold + coalesce(k.gold_reward, 0), updated_at = now() where id = u;
    end;
  end if;
  return json_build_object('ok', got, 'days', days, 'title', k.title, 'stardust', 30 + 10 * least(days, 14), 'exp', k.exp_reward, 'gold', k.gold_reward);
end; $$;

do $$ declare f text; begin
  foreach f in array array['egg_status()', 'egg_start(text)', 'egg_check(bigint)', 'egg_drop(bigint)', 'blackhole_start()', 'blackhole_end()',
    'auction_status()', 'auction_item_save(bigint,text,text,integer,integer)', 'auction_item_del(bigint)', 'auction_buy(bigint)', 'auction_use(bigint)',
    'life_seasons()', 'monster_list()', 'monster_slay(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
