-- =========================================================
-- 🌸 季節輪替＋彩蛋發放
-- 需要先跑過：2026-10-23_裝備擴充.sql、2026-10-24_新裝備.sql、2026-10-23_讀書與自律.sql、2026-10-22_遠征萬聖節日誌（hw_ghosts）
-- 可以重複執行。
--
--   季節輪替：每季一件季節限定（1–3 月冬至、4–6 月春分、7–9 月月見、10–12 月霜降）
--            限定池同時抽「當月系列」與「當季季節」。
--   彩蛋：條件達成時自動發放（rpg_egg_claim，冒險頁開啟時呼叫）；
--         寫一句話換「自己寫的歌徽章」（rpg_egg_self_note）。
-- =========================================================

create or replace function public.rpg_summon(p_pool text, p_count integer default 1)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  cat jsonb := public.rpg_catalog();
  v_ticket text;
  v_rates jsonb;
  v_tiers text[] := array['c', 'r', 'l', 'x', 's'];
  v_results jsonb := '[]'::jsonb;
  v_gold_total integer := 0;
  v_best integer := 0;
  i integer;
  t text;
  v_roll numeric;
  v_acc numeric;
  v_tier text;
  v_use_limited boolean;
  v_cands text[];
  v_key text;
  v_level integer;
  v_result text;
  v_gold integer;
  v_series text;
  v_season text;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_pool not in ('normal', 'special', 'limited') then raise exception '沒有這個召喚池'; end if;
  if p_count not in (1, 10) then raise exception '一次只能抽 1 或 10 次'; end if;

  v_series := cat->'series'->>to_char(public.app_today(), 'YYYY-MM');
  v_season := case ((extract(month from public.app_today())::integer - 1) / 3)
    when 0 then 'winter_solstice' when 1 then 'spring_equinox' when 2 then 'moon_view' else 'frost_descent' end;
  v_ticket := cat->'ticket'->>p_pool;
  v_rates := cat->'rates'->p_pool;

  update public.player_items set qty = qty - p_count, updated_at = now()
    where user_id = v_user and item_key = v_ticket and qty >= p_count;
  if not found then raise exception '召喚券不夠'; end if;
  insert into public.item_events (user_id, item_key, delta, source_key)
    values (v_user, v_ticket, -p_count, 'rpg-summon:' || gen_random_uuid()::text);

  for i in 1..p_count loop
    -- 抽稀有度
    v_roll := random() * 100;
    v_acc := 0;
    v_tier := 'c';
    foreach t in array v_tiers loop
      v_acc := v_acc + coalesce((v_rates->>t)::numeric, 0);
      if v_roll < v_acc then v_tier := t; exit; end if;
    end loop;
    if (v_rates->>v_tier)::numeric = 0 then v_tier := 'r'; end if;

    -- 普通池十連：最後一抽保底精良以上
    if p_pool = 'normal' and p_count = 10 and i = 10 and v_best < 2 and v_tier = 'c' then v_tier := 'r'; end if;
    v_best := greatest(v_best, array_position(v_tiers, v_tier));

    -- 限定池一半機率出限定裝備；一般池的史詩、傳說有 5% 機率出限定裝備
    v_use_limited := (p_pool = 'limited' and random() < 0.5)
                  or (p_pool <> 'limited' and v_tier in ('x', 's') and random() < 0.05);

    v_cands := null;
    -- 限定裝備：先找這個月的系列，沒有就任何限定
    if v_use_limited then
      select array_agg(k) into v_cands from jsonb_each(cat->'gear') e(k, v)
        where v->>'tier' = v_tier and v->>'pool' = 'limited' and (v->>'series' = v_series or v->>'series' = v_season);
      if v_cands is null then
        select array_agg(k) into v_cands from jsonb_each(cat->'gear') e(k, v)
          where v->>'tier' = v_tier and v->>'pool' = 'limited';
      end if;
    end if;
    if v_cands is null then
      select array_agg(k) into v_cands from jsonb_each(cat->'gear') e(k, v)
        where v->>'tier' = v_tier and v->>'pool' = 'base';
    end if;

    v_key := v_cands[1 + floor(random() * array_length(v_cands, 1))::integer];

    -- 新的、升級、或滿級換金幣
    select level into v_level from public.rpg_gear where user_id = v_user and gear_key = v_key for update;
    v_gold := 0;
    if not found then
      insert into public.rpg_gear (user_id, gear_key) values (v_user, v_key);
      v_result := 'new'; v_level := 1;
    elsif v_level < 5 then
      update public.rpg_gear set level = level + 1 where user_id = v_user and gear_key = v_key;
      v_result := 'up'; v_level := v_level + 1;
    else
      v_gold := (cat->'gold'->>v_tier)::integer;
      v_gold_total := v_gold_total + v_gold;
      v_result := 'gold';
    end if;

    insert into public.rpg_summon_log (user_id, pool, gear_key, tier, result)
      values (v_user, p_pool, v_key, v_tier, v_result);

    v_results := v_results || jsonb_build_object('key', v_key, 'tier', v_tier, 'result', v_result,
                                                 'level', v_level, 'gold', v_gold);
  end loop;

  if v_gold_total > 0 then
    update public.profiles set gold = gold + v_gold_total, updated_at = now() where id = v_user;
  end if;

  return json_build_object('success', true, 'results', v_results, 'gold', v_gold_total);
end;
$function$;

-- ---------- 🥚 彩蛋紀錄 ----------
create table if not exists public.rpg_eggs (
  user_id uuid not null references auth.users(id) on delete cascade,
  egg_key text not null,
  note text,
  granted_at timestamptz not null default now(),
  primary key (user_id, egg_key)
);
alter table public.rpg_eggs enable row level security;
drop policy if exists "rpg_eggs_read_own" on public.rpg_eggs;
create policy "rpg_eggs_read_own" on public.rpg_eggs for select using (user_id = auth.uid());

-- 內部用：發放一件彩蛋，回傳是否第一次拿到（不開放給前端直接呼叫）
create or replace function public.rpg_egg_grant(p_user uuid, p_key text, p_note text default null)
returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare n integer;
begin
  insert into public.rpg_eggs (user_id, egg_key, note) values (p_user, p_key, p_note)
    on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  insert into public.rpg_gear (user_id, gear_key)
    select p_user, p_key where not exists (
      select 1 from public.rpg_gear where user_id = p_user and gear_key = p_key);
  return true;
end;
$function$;
revoke all on function public.rpg_egg_grant(uuid, text, text) from public, authenticated, anon;

-- 自動檢查條件並發放彩蛋
create or replace function public.rpg_egg_claim()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
  got text[] := '{}';
  longest integer := 0;
  broken boolean := false;
begin
  if u is null then raise exception '尚未登入'; end if;

  -- 深夜的燈：凌晨 1–4 點結束過一次 10 分鐘以上的專注
  if exists (select 1 from public.focus_sessions where user_id = u and duration_seconds >= 600
             and extract(hour from ended_at at time zone 'Asia/Taipei') between 1 and 3)
     and public.rpg_egg_grant(u, 'midnight_lamp') then
    got := array_append(got, 'midnight_lamp');
  end if;

  -- 連續 30 天勳章／失敗的紀念品：完成主線或休息日的連續區段
  with covered as (
    select main_date as d from public.mainlines where user_id = u and completed
    union
    select day as d from public.rest_days where user_id = u
  ), islands as (
    select min(d) as s, max(d) as e, count(*) as len
    from (select d, d - (row_number() over (order by d))::integer as g from covered) x
    group by g
  )
  select coalesce(max(len), 0), coalesce(bool_or(len >= 3 and e < today - 1), false)
    into longest, broken from islands;

  if longest >= 30 and public.rpg_egg_grant(u, 'consecutive_medal') then
    got := array_append(got, 'consecutive_medal');
  end if;
  if broken and public.rpg_egg_grant(u, 'failed_souvenir') then
    got := array_append(got, 'failed_souvenir');
  end if;

  -- 紙燈籠鬼面：萬聖活動抓到 3 隻幽靈
  if (select count(*) from public.hw_ghosts where user_id = u and caught_at is not null) >= 3
     and public.rpg_egg_grant(u, 'paper_lantern_ghost') then
    got := array_append(got, 'paper_lantern_ghost');
  end if;

  -- 會說話的骷髏手杖：打倒過一次每週王
  if exists (select 1 from public.rpg_boss_runs where user_id = u and killed_at is not null)
     and public.rpg_egg_grant(u, 'talking_skeleton_staff') then
    got := array_append(got, 'talking_skeleton_staff');
  end if;

  -- 月下狐尾：累積召喚 100 次
  if (select count(*) from public.rpg_summon_log where user_id = u) >= 100
     and public.rpg_egg_grant(u, 'under_moon_fox_tail') then
    got := array_append(got, 'under_moon_fox_tail');
  end if;

  return json_build_object('granted', to_jsonb(got));
end;
$function$;
grant execute on function public.rpg_egg_claim() to authenticated;

-- 寫一句鼓勵自己的話，換「自己寫的歌徽章」
create or replace function public.rpg_egg_self_note(p_text text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  t text := btrim(coalesce(p_text, ''));
begin
  if u is null then raise exception '尚未登入'; end if;
  if char_length(t) < 6 then raise exception '至少寫 6 個字，寫一句真心的話就好'; end if;
  if char_length(t) > 60 then raise exception '最多 60 個字'; end if;
  return json_build_object('granted', public.rpg_egg_grant(u, 'self_written_badge', t));
end;
$function$;
grant execute on function public.rpg_egg_self_note(text) to authenticated;
