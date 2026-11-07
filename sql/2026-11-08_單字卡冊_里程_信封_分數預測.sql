-- =========================================================
-- 序光計畫：🃏 單字卡冊、📚 情境圖鑑、🎁 單字寶箱、🎡 複習輪盤、🎟️ 專注刮刮樂、
--           ✉️ 神秘信封、🛣️ 人生總里程、📈 單字存量、🏅 連續紀錄、🎯 多益分數預測
-- 可以重複執行。
-- =========================================================

-- 每次作答的秒數（秒懂率、閃卡、分數預測用）
create table if not exists public.vocab_speed (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id bigint not null,
  day date not null,
  mode text,
  secs numeric not null,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists vocab_speed_user on public.vocab_speed (user_id, day);
create index if not exists vocab_speed_word on public.vocab_speed (user_id, word_id, created_at desc);
create table if not exists public.toeic_est (
  user_id uuid not null references auth.users(id) on delete cascade,
  week date not null,
  score integer not null,
  parts jsonb,
  primary key (user_id, week)
);
do $$ declare t text; begin
  foreach t in array array['vocab_speed', 'toeic_est'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own select" on public.%I', t);
    execute format('create policy "own select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end $$;

create or replace function public.vocab_speed_log(p_word bigint, p_secs numeric, p_ok boolean, p_mode text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.vocab_speed (user_id, word_id, day, mode, secs, ok) values (auth.uid(), p_word, public.app_today(), left(p_mode, 12), least(greatest(p_secs, 0), 600), p_ok);
end; $$;

-- 卡片星等：學過 1★、4 天 2★、15 天 3★、45 天 4★、90 天 5★；最近 3 次以上都在 3 秒內答對 = 閃卡
create or replace function public.vocab_card_stars(d integer, reps integer) returns integer language sql immutable as $$
  select case when coalesce(reps, 0) = 0 then 0 when d >= 90 then 5 when d >= 45 then 4 when d >= 15 then 3 when d >= 4 then 2 else 1 end $$;

create or replace function public.toeic_scenes() returns jsonb language sql immutable as $$ select '{
 "辦公室":{"emoji":"🏢","badge":"辦公室達人"},"會議":{"emoji":"🗣️","badge":"會議主持人"},"人事":{"emoji":"🧑‍💼","badge":"人資專家"},
 "商務":{"emoji":"💼","badge":"商務菁英"},"財務":{"emoji":"💰","badge":"財務高手"},"採購":{"emoji":"📦","badge":"採購專員"},
 "行銷":{"emoji":"📣","badge":"行銷鬼才"},"製造":{"emoji":"🏭","badge":"工廠管理員"},"旅遊":{"emoji":"✈️","badge":"旅行家"},
 "交通":{"emoji":"🚆","badge":"交通通"},"餐飲":{"emoji":"🍽️","badge":"美食評論家"},"購物":{"emoji":"🛍️","badge":"購物達人"},
 "住宅":{"emoji":"🏠","badge":"房地產顧問"},"健康":{"emoji":"🩺","badge":"健康管家"},"活動":{"emoji":"🎪","badge":"活動企劃"},
 "科技":{"emoji":"💻","badge":"科技通"},"職場":{"emoji":"👔","badge":"職場老手"},"一般":{"emoji":"📘","badge":"基礎扎實"}}'::jsonb $$;

-- 🛣️ 環島路線（公里）
create or replace function public.mileage_stops() returns jsonb language sql immutable as $$ select '[
 {"km":0,"name":"台北","emoji":"🏙️"},{"km":40,"name":"桃園","emoji":"✈️"},{"km":75,"name":"新竹","emoji":"🌬️"},{"km":110,"name":"苗栗","emoji":"🍓"},
 {"km":165,"name":"台中","emoji":"🧋"},{"km":190,"name":"彰化","emoji":"🛕"},{"km":230,"name":"雲林","emoji":"🥜"},{"km":270,"name":"嘉義","emoji":"🌲"},
 {"km":330,"name":"台南","emoji":"🏯"},{"km":375,"name":"高雄","emoji":"🚢"},{"km":400,"name":"屏東","emoji":"🌴"},{"km":480,"name":"墾丁","emoji":"🏖️"},
 {"km":600,"name":"台東","emoji":"🎈"},{"km":760,"name":"花蓮","emoji":"⛰️"},{"km":880,"name":"宜蘭","emoji":"♨️"},{"km":960,"name":"基隆","emoji":"🦑"},{"km":1000,"name":"回到台北・環島完成","emoji":"🏆"}]'::jsonb $$;

create or replace function public.streak_best(days date[], t date, out cur integer, out best integer)
language plpgsql immutable as $$
declare d date; prev date; run integer := 0;
begin
  cur := 0; best := 0;
  foreach d in array coalesce(days, '{}') loop
    if prev is not null and d = prev + 1 then run := run + 1; else run := 1; end if;
    best := greatest(best, run); prev := d;
  end loop;
  if prev is not null and prev >= t - 1 then cur := run; end if;
end; $$;

-- 📖 全部資料
create or replace function public.toeic_hub()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); w date := public.life_week(public.app_today());
  cards jsonb; scenes jsonb := '[]'::jsonb; sc record; known integer; total integer; fast_pct integer; fast_n integer; listen_pct integer;
  focus_min integer; km numeric; stops jsonb; reached jsonb := '[]'::jsonb; st jsonb; cur_s record; medals jsonb := '[]'::jsonb;
  est integer; ev integer; curve jsonb; due_left integer; today_rev integer; chest_ok boolean; scratch_total integer; scratch_given integer;
  wk jsonb; env_open boolean; tod jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;

  -- 🃏 卡冊
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'word', v.word, 'meaning', v.meaning, 'pos', v.pos, 'tag', coalesce(nullif(v.tags, ''), '一般'),
      'stars', public.vocab_card_stars(v.interval_days, v.reps), 'lapses', v.lapses,
      'shiny', (select count(*) >= 3 and bool_and(x.ok and x.secs <= 3) from (select ok, secs from public.vocab_speed s where s.user_id = u and s.word_id = v.id order by created_at desc limit 3) x))
      order by v.interval_days desc nulls last, v.word), '[]'::jsonb), count(*), count(*) filter (where v.interval_days >= 4)
    into cards, total, known from public.vocab_words v where v.user_id = u;

  -- 📚 情境圖鑑：精通（3★ 以上）比例 ≥ 80% 且至少 10 個字 → 徽章
  for sc in select coalesce(nullif(tags, ''), '一般') tag, count(*) n, count(*) filter (where interval_days >= 15) m from public.vocab_words where user_id = u group by 1 order by 2 desc loop
    if sc.n >= 10 and sc.m * 100 >= sc.n * 80 then
      if public.grant_item(u, 'stardust', 100, 'scene-badge:' || sc.tag) then
        insert into public.user_titles (user_id, title) select u, coalesce(public.toeic_scenes()->sc.tag->>'badge', sc.tag || '達人')
          where not exists (select 1 from public.user_titles where user_id = u and title = coalesce(public.toeic_scenes()->sc.tag->>'badge', sc.tag || '達人'));
      end if;
    end if;
    scenes := scenes || jsonb_build_array(jsonb_build_object('tag', sc.tag, 'n', sc.n, 'm', sc.m, 'emoji', coalesce(public.toeic_scenes()->sc.tag->>'emoji', '📘'),
      'badge', coalesce(public.toeic_scenes()->sc.tag->>'badge', sc.tag || '達人'), 'done', sc.n >= 10 and sc.m * 100 >= sc.n * 80));
  end loop;

  -- ⚡ 秒懂率（最近 7 天）、聽力答對率（最近 30 天聽音題）
  select round(100.0 * count(*) filter (where ok and secs <= 3) / nullif(count(*), 0)), count(*) into fast_pct, fast_n from public.vocab_speed where user_id = u and day > t - 7;
  select round(100.0 * count(*) filter (where ok) / nullif(count(*), 0)) into listen_pct from public.vocab_speed where user_id = u and mode = 'listen' and day > t - 30;

  -- 今天：寶箱、輪盤
  select jsonb_build_object('n', count(*), 'fast', count(*) filter (where ok and secs <= 3)) into tod from public.vocab_speed where user_id = u and day = t;
  chest_ok := (tod->>'n')::int >= 10 and (tod->>'fast')::int * 100 >= (tod->>'n')::int * 80;
  select count(*) into due_left from public.vocab_words where user_id = u and reps > 0 and due <= t;
  select count(*) into today_rev from public.vocab_log where user_id = u and day = t;

  -- 🎟️ 專注刮刮樂：每 2 小時一張
  select coalesce(sum(coalesce(duration_seconds, 0)), 0) / 60 into focus_min from public.focus_sessions where user_id = u;
  select count(*) into scratch_given from public.item_events where user_id = u and source_key like 'focus-scratch:%';
  -- 從 2026-11-08 開始算（以前的專注不補發）
  select coalesce(sum(coalesce(duration_seconds, 0)), 0) / 60 / 120 into scratch_total from public.focus_sessions where user_id = u and session_date >= date '2026-11-08';
  if scratch_total > scratch_given then
    for i in scratch_given + 1 .. least(scratch_total, scratch_given + 20) loop perform public.grant_item(u, 'scratch_card', 1, 'focus-scratch:' || i); end loop;
  end if;

  -- 🛣️ 里程
  km := round(focus_min / 60.0, 1); stops := public.mileage_stops();
  for st in select * from jsonb_array_elements(stops) loop
    if (st->>'km')::numeric <= km then
      if (st->>'km')::int > 0 then perform public.grant_item(u, 'stardust', 30 + (st->>'km')::int / 10, 'mile:' || (st->>'km')); end if;
      reached := reached || jsonb_build_array((st->>'km')::int);
    end if;
  end loop;

  -- 🏅 連續紀錄
  for cur_s in
    select 'focus' k, '⏱️ 連續專注' n, array(select distinct session_date from public.focus_sessions where user_id = u order by 1) d
    union all select 'life', '🌱 連續生活打卡', array(select distinct day from public.project_step_logs where user_id = u and done order by 1)
    union all select 'vocab', '📖 連續複習單字', array(select distinct day from public.vocab_log where user_id = u order by 1)
    union all select 'task', '✅ 連續完成任務', array(select distinct task_date from public.tasks where user_id = u and completed order by 1)
  loop
    select * into st from (select row_to_json(x)::jsonb from public.streak_best(cur_s.d, t) x) y(st);
    medals := medals || jsonb_build_array(jsonb_build_object('k', cur_s.k, 'name', cur_s.n) || st);
  end loop;

  -- 🎯 多益粗估：單字量決定基礎，秒懂率和聽力答對率加減
  ev := least(known, 3000);
  est := round(330 + ev * 0.13 + coalesce(fast_pct, 40) * 0.6 + coalesce(listen_pct, 50) * 0.4);
  est := least(990, greatest(10, (est / 5) * 5));
  insert into public.toeic_est (user_id, week, score, parts) values (u, w, est, jsonb_build_object('known', known, 'fast', fast_pct, 'listen', listen_pct))
    on conflict (user_id, week) do update set score = excluded.score, parts = excluded.parts;

  -- 📈 單字存量曲線：第一次在 ≥3 天間隔下答對，算「會了」
  select coalesce(jsonb_agg(jsonb_build_object('d', d, 'known', c, 'added', a) order by d), '[]') into curve from (
    select d::date d,
      (select count(distinct word_id) from public.vocab_log l where l.user_id = u and l.grade >= 2 and l.interval_before >= 3 and l.day <= d) c,
      (select count(*) from public.vocab_words v where v.user_id = u and v.created_at::date <= d) a
    from generate_series(greatest(t - 59, (select coalesce(min(created_at)::date, t) from public.vocab_words where user_id = u)), t, interval '1 day') d) x;

  -- ✉️ 神秘信封：這週日 18:00 後可以開；上週沒開的也可以補開
  select jsonb_build_object('focus_h', round(coalesce(sum(duration_seconds), 0) / 3600.0, 1)) into wk from public.focus_sessions where user_id = u and session_date between w and w + 6;
  env_open := extract(isodow from t) = 7 and extract(hour from now() at time zone 'Asia/Taipei') >= 18;

  return json_build_object('today', t, 'cards', cards, 'total', total, 'known', known, 'goal', 2500, 'scenes', scenes,
    'fast_pct', fast_pct, 'fast_n', fast_n, 'listen_pct', listen_pct,
    'chest', jsonb_build_object('ok', chest_ok, 'today', tod, 'claimed', exists (select 1 from public.item_events where user_id = u and source_key = 'vchest:' || t || ':stardust')),
    'wheel', jsonb_build_object('ok', due_left = 0 and today_rev >= 10, 'due_left', due_left, 'reviewed', today_rev, 'claimed', exists (select 1 from public.item_events where user_id = u and source_key like 'vwheel:' || t || ':%')),
    'scratch', jsonb_build_object('total', scratch_total, 'next_min', 120 - coalesce((select coalesce(sum(coalesce(duration_seconds, 0)), 0) / 60 from public.focus_sessions where user_id = u and session_date >= date '2026-11-08'), 0)::int % 120, 'have', coalesce((select qty from public.player_items where user_id = u and item_key = 'scratch_card'), 0)),
    'mileage', jsonb_build_object('km', km, 'stops', stops, 'reached', reached),
    'medals', medals, 'est', est, 'est_hist', coalesce((select jsonb_agg(jsonb_build_object('w', week, 's', score) order by week) from public.toeic_est where user_id = u), '[]'),
    'curve', curve,
    'envelope', jsonb_build_object('week', w, 'open_now', env_open, 'this_week', wk,
      'claimed_this', exists (select 1 from public.item_events where user_id = u and source_key like 'env:' || w || ':%'),
      'last_week', w - 7, 'claimed_last', exists (select 1 from public.item_events where user_id = u and source_key like 'env:' || (w - 7) || ':%')));
end; $$;

-- 🎁 單字寶箱
create or replace function public.vocab_chest_open()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); h jsonb; r numeric := random(); got jsonb;
begin
  h := public.toeic_hub()::jsonb;
  if not (h->'chest'->>'ok')::boolean then raise exception '今天要答 10 題以上、秒懂率 80%% 才能開'; end if;
  if (h->'chest'->>'claimed')::boolean then raise exception '今天已經開過了'; end if;
  perform public.grant_item(u, 'stardust', 40, 'vchest:' || t || ':stardust');
  if r < 0.12 then
    insert into public.fun_monsters (user_id, monster_key) values (u, 't_scholar') on conflict (user_id, monster_key) do update set count = public.fun_monsters.count + 1;
    got := '{"stardust":40,"t_scholar":1}';
  elsif r < 0.6 then perform public.grant_item(u, 'gacha_coin', 2, 'vchest:' || t || ':coin'); got := '{"stardust":40,"gacha_coin":2}';
  else perform public.grant_item(u, 'wish_normal', 1, 'vchest:' || t || ':wish'); got := '{"stardust":40,"wish_normal":1}'; end if;
  return json_build_object('got', got);
end; $$;

-- 🎡 複習完的輪盤
create or replace function public.vocab_wheel_spin()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); h jsonb; r numeric := random(); k text; q integer; idx integer;
begin
  h := public.toeic_hub()::jsonb;
  if not (h->'wheel'->>'ok')::boolean then raise exception '把到期的單字全部複習完（至少 10 個）才能轉'; end if;
  if (h->'wheel'->>'claimed')::boolean then raise exception '今天已經轉過了'; end if;
  select x.k, x.q, x.i into k, q, idx from (values
    (0, 'stardust', 20, 0.30), (1, 'gacha_coin', 1, 0.55), (2, 'stardust', 50, 0.70), (3, 'makeup_card', 1, 0.80),
    (4, 'gacha_coin', 3, 0.90), (5, 'wish_normal', 1, 0.97), (6, 'chest_gold', 1, 1.0)) x(i, k, q, p) where r < x.p order by x.p limit 1;
  perform public.grant_item(u, k, q, 'vwheel:' || t || ':' || k);
  return json_build_object('idx', idx, 'item', k, 'qty', q);
end; $$;

-- ✉️ 開神秘信封（p_last = true 開上週的）
create or replace function public.envelope_open(p_last boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); w date := public.life_week(public.app_today()) - case when p_last then 7 else 0 end;
  fh numeric; td integer; ld integer; vr integer; score integer; tier text; r numeric := random(); got jsonb; k text; v integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  if not p_last and not (extract(isodow from t) = 7 and extract(hour from now() at time zone 'Asia/Taipei') >= 18) then raise exception '週日晚上 6 點才寄到'; end if;
  if exists (select 1 from public.item_events where user_id = u and source_key like 'env:' || w || ':%') then raise exception '這封已經開過了'; end if;
  select coalesce(sum(duration_seconds), 0) / 3600.0 into fh from public.focus_sessions where user_id = u and session_date between w and w + 6;
  select count(*) into td from public.tasks where user_id = u and completed and task_date between w and w + 6;
  select count(distinct day) into ld from public.project_step_logs where user_id = u and done and day between w and w + 6;
  select count(*) into vr from public.vocab_log where user_id = u and day between w and w + 6;
  score := least(100, round(least(fh, 30) / 30 * 45 + least(td, 30) / 30.0 * 20 + ld / 7.0 * 20 + least(vr, 200) / 200.0 * 15));
  -- 分數越高，抽到稀有的機率越高
  tier := case when r < score / 400.0 then 'legend' when r < score / 150.0 then 'rare' when r < 0.3 + score / 200.0 then 'good' else 'normal' end;
  got := case tier when 'legend' then '{"wish_limited":1,"gacha_coin":5,"stardust":200}' when 'rare' then '{"wish_rare":1,"gacha_coin":3,"stardust":120}'
    when 'good' then '{"chest_gold":1,"gacha_coin":2,"stardust":80}' else '{"gacha_coin":1,"stardust":40}' end;
  for k, v in select key, value::int from jsonb_each_text(got) loop perform public.grant_item(u, k, v, 'env:' || w || ':' || k); end loop;
  return json_build_object('tier', tier, 'score', score, 'got', got, 'stats', json_build_object('focus_h', round(fh, 1), 'tasks', td, 'life_days', ld, 'vocab', vr));
end; $$;

do $$ declare f text; begin
  foreach f in array array['vocab_speed_log(bigint,numeric,boolean,text)', 'toeic_hub()', 'vocab_chest_open()', 'vocab_wheel_spin()', 'envelope_open(boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
