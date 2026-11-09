-- =========================================================
-- 序光計畫：🐉 靈獸
--   抽靈獸蛋（星屑 300／次，每週 1 次免費，30 抽保底 SR 以上）
--   靈獸跟著你的真實努力長大：專注、任務、打卡、單字、學到什麼都會給經驗
--   幼體 → 少年 → 成體 → 覺醒；重複抽到加經驗
-- 可以重複執行。
-- =========================================================
create table if not exists public.spirit_beasts (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  xp integer not null default 0,
  dupes integer not null default 0,
  name text,
  obtained_at timestamptz not null default now(),
  primary key (user_id, key)
);
create table if not exists public.spirit_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active text,
  pity integer not null default 0,
  pulls integer not null default 0,
  last_sync timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['spirit_beasts', 'spirit_state'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own select" on public.%I', t);
    execute format('create policy "own select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('revoke insert, update, delete on public.%I from authenticated, anon', t);
  end loop;
end $$;

create or replace function public.spirit_defs() returns jsonb language sql immutable as $$ select '{
 "deer":{"r":"N","name":"小白鹿","emoji":"🦌","desc":"在晨霧裡出現的小鹿，最喜歡安靜讀書的人。"},
 "rabbit":{"r":"N","name":"月兔","emoji":"🐇","desc":"從月亮掉下來的兔子，晚上會發出淡淡的光。"},
 "panda":{"r":"N","name":"竹林熊貓","emoji":"🐼","desc":"慢慢來，但從不放棄。"},
 "fox":{"r":"N","name":"雪狐","emoji":"🦊","desc":"尾巴尖端是白色的，跑起來像一道雪。"},
 "lizard":{"r":"N","name":"翡翠蜥","emoji":"🦎","desc":"會依你的心情變換顏色。"},
 "leopard":{"r":"R","name":"雪豹","emoji":"🐆","desc":"高山上的守望者，專注的時候眼睛會發亮。"},
 "owl":{"r":"R","name":"白梟","emoji":"🦉","desc":"夜讀時會停在你的肩膀上。"},
 "turtle":{"r":"R","name":"星殼海龜","emoji":"🐢","desc":"殼上刻著星圖，活了很久很久。"},
 "unicorn":{"r":"R","name":"獨角馬","emoji":"🦄","desc":"只親近說到做到的人。"},
 "ninetail":{"r":"SR","name":"九尾狐","emoji":"🦊","desc":"每覺醒一次就多一條尾巴的傳說靈狐。"},
 "qilin":{"r":"SR","name":"麒麟","emoji":"🦄","desc":"象徵祥瑞，出現的地方會有好事發生。"},
 "seadragon":{"r":"SR","name":"海龍","emoji":"🐉","desc":"住在深海，你專注越久牠游得越深。"},
 "thunderbird":{"r":"SR","name":"雷鳥","emoji":"🦅","desc":"拍一次翅膀就是一道閃電。"},
 "phoenix":{"r":"SSR","name":"鳳凰","emoji":"🐦‍🔥","desc":"從失敗的灰燼裡重生，越挫越強。"},
 "yinglong":{"r":"SSR","name":"應龍","emoji":"🐲","desc":"有翅膀的龍，傳說中能呼風喚雨。"},
 "baize":{"r":"SSR","name":"白澤","emoji":"🐏","desc":"通曉天下萬物的神獸，學者最想遇見的夥伴。"}}'::jsonb $$;

create or replace function public.spirit_stage(xp integer) returns integer language sql immutable as $$
  select case when xp >= 6000 then 3 when xp >= 2000 then 2 when xp >= 400 then 1 else 0 end $$;

-- 從上次同步到現在的努力，算成經驗給「現在陪著你的靈獸」
create or replace function public.spirit_sync(u uuid) returns integer language plpgsql security definer set search_path to 'public' as $$
declare s public.spirit_state; gained integer := 0;
begin
  select * into s from public.spirit_state where user_id = u for update;
  if not found or s.active is null then return 0; end if;
  gained := coalesce((select sum(coalesce(duration_seconds, 0)) / 60 from public.focus_sessions where user_id = u and started_at >= s.last_sync), 0)
    + 15 * (select count(*) from public.tasks where user_id = u and completed and completed_at >= s.last_sync)
    + 5 * (select count(*) from public.project_step_logs where user_id = u and done and created_at >= s.last_sync)
    + (select count(*) from public.vocab_log where user_id = u and created_at >= s.last_sync)
    + 10 * (select count(*) from public.learn_notes where user_id = u and created_at >= s.last_sync);
  update public.spirit_beasts set xp = xp + gained where user_id = u and key = s.active;
  update public.spirit_state set last_sync = now() where user_id = u;
  return gained;
end; $$;

create or replace function public.spirit_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); g integer; act3 integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  insert into public.spirit_state (user_id) values (u) on conflict do nothing;
  g := public.spirit_sync(u);
  select count(distinct d) into act3 from (
    select session_date d from public.focus_sessions where user_id = u and session_date > t - 3
    union select day from public.project_step_logs where user_id = u and done and day > t - 3
    union select task_date from public.tasks where user_id = u and completed and task_date > t - 3) x;
  return json_build_object('defs', public.spirit_defs(), 'gained', g,
    'state', (select row_to_json(s) from public.spirit_state s where user_id = u),
    'beasts', coalesce((select json_agg(json_build_object('key', key, 'xp', xp, 'stage', public.spirit_stage(xp), 'dupes', dupes, 'name', name, 'obtained_at', obtained_at) order by obtained_at) from public.spirit_beasts where user_id = u), '[]'),
    'mood', case when act3 >= 3 then 'great' when act3 >= 1 then 'ok' else 'sad' end,
    'stardust', coalesce((select qty from public.player_items where user_id = u and item_key = 'stardust'), 0),
    'free', not exists (select 1 from public.item_events where user_id = u and source_key = 'spirit-free:' || public.life_week(t)));
end; $$;

-- 抽一次靈獸蛋：N 55%、R 30%、SR 12%、SSR 3%；30 抽內沒出 SR 以上，第 30 抽保底
create or replace function public.spirit_pull(p_free boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); s public.spirit_state; r numeric := random(); rar text; k text; isnew boolean; v_id text := gen_random_uuid()::text;
begin
  if u is null then raise exception '尚未登入'; end if;
  insert into public.spirit_state (user_id) values (u) on conflict do nothing;
  perform public.spirit_sync(u);
  select * into s from public.spirit_state where user_id = u for update;
  if p_free then
    if not public.grant_item(u, 'spirit_free_mark', 0, 'spirit-free:' || public.life_week(t)) then raise exception '這週的免費抽已經用過了'; end if;
  else
    perform public.fun_take(u, 'stardust', 300, 'spirit-pull:' || v_id);
  end if;
  rar := case when s.pity >= 29 then (case when r < 0.2 then 'SSR' else 'SR' end)
              when r < 0.03 then 'SSR' when r < 0.15 then 'SR' when r < 0.45 then 'R' else 'N' end;
  select key into k from jsonb_each(public.spirit_defs()) x(key, v) where v->>'r' = rar order by random() limit 1;
  isnew := not exists (select 1 from public.spirit_beasts where user_id = u and key = k);
  insert into public.spirit_beasts (user_id, key) values (u, k)
    on conflict (user_id, key) do update set dupes = public.spirit_beasts.dupes + 1, xp = public.spirit_beasts.xp + case rar when 'SSR' then 800 when 'SR' then 500 when 'R' then 300 else 200 end;
  update public.spirit_state set pity = case when rar in ('SR', 'SSR') then 0 else pity + 1 end, pulls = pulls + 1,
    active = coalesce(active, k) where user_id = u;
  return json_build_object('key', k, 'rarity', rar, 'new', isnew, 'def', public.spirit_defs()->k);
end; $$;

create or replace function public.spirit_set_active(p_key text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid();
begin
  if not exists (select 1 from public.spirit_beasts where user_id = u and key = p_key) then raise exception '你還沒有這隻靈獸'; end if;
  perform public.spirit_sync(u);
  update public.spirit_state set active = p_key where user_id = u;
  return public.spirit_status();
end; $$;

create or replace function public.spirit_rename(p_key text, p_name text)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  update public.spirit_beasts set name = nullif(left(btrim(p_name), 12), '') where user_id = auth.uid() and key = p_key;
  return public.spirit_status();
end; $$;

do $$ declare f text; begin
  foreach f in array array['spirit_status()', 'spirit_pull(boolean)', 'spirit_set_active(text)', 'spirit_rename(text,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
