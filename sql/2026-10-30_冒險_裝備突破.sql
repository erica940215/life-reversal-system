-- =========================================================
-- 序光計畫：⚔️ 冒險：裝備突破 ★ ＋ 限定系列套裝
-- 要先跑過「2026-10-23_裝備擴充.sql」「2026-10-30_限定_2到4月.sql」。可以重複執行。
--
--   突破：Lv5 的裝備可以用金幣＋星屑突破，最多 ★3；每一顆星屬性 +20%（跟等級加成相乘）
--         費用（第 n 顆星）：金幣 普通 100／精良 200／稀有 400／史詩 800／傳說 1500 × n，星屑 10 × n
--   限定系列套裝：武器、防具、飾品都是同一個限定系列（例如金秋豐收三件），全部屬性 +15%
-- =========================================================

alter table public.rpg_gear add column if not exists star integer not null default 0;

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
  v_slot text; v_key text; v_level integer; v_star integer; g jsonb; k text; v numeric;
  v_series text[] := array[]::text[]; v_lset text := null;
  v_sum numeric; v_power numeric;
  v_sets text[] := array[]::text[];
  v_class_hit boolean := false;
  v_set text;
  sb jsonb;
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
      select level, coalesce(star, 0) into v_level, v_star from public.rpg_gear where user_id = p_user and gear_key = v_key;
      continue when v_level is null;
      g := cat->'gear'->v_key;
      continue when g is null;
      v_sets := v_sets || coalesce(g->>'set', '-');
      v_series := v_series || coalesce(case when g->>'pool' = 'limited' then g->>'series' end, '-');
      if g->>'class' is not null and g->>'class' = h.class then v_class_hit := true; end if;
      for k, v in select key, value::numeric from jsonb_each_text(g->'stat') loop
        v := round(v * (1 + 0.2 * (v_level - 1)) * (1 + 0.2 * v_star));
        if k = 'str' then s_str := s_str + v;
        elsif k = 'int' then s_int := s_int + v;
        elsif k = 'vit' then s_vit := s_vit + v;
        elsif k = 'wil' then s_wil := s_wil + v;
        end if;
      end loop;
    end loop;
  end if;

  -- 三件都是同一套：套裝效果
  v_set := null;
  if array_length(v_sets, 1) = 3 and v_sets[1] <> '-' and v_sets[1] = v_sets[2] and v_sets[2] = v_sets[3] then
    v_set := v_sets[1];
    sb := cat->'sets'->v_set->'bonus';
    s_str := round(s_str * (1 + coalesce((sb->>'str')::numeric, 0)));
    s_int := round(s_int * (1 + coalesce((sb->>'int')::numeric, 0)));
    s_vit := round(s_vit * (1 + coalesce((sb->>'vit')::numeric, 0)));
    s_wil := round(s_wil * (1 + coalesce((sb->>'wil')::numeric, 0)));
  end if;

  -- 三件同一個限定系列（例如金秋豐收）：全部屬性 +15%
  if array_length(v_series, 1) = 3 and v_series[1] <> '-' and v_series[1] = v_series[2] and v_series[2] = v_series[3] then
    v_lset := v_series[1];
    s_str := round(s_str * 1.15); s_int := round(s_int * 1.15); s_vit := round(s_vit * 1.15); s_wil := round(s_wil * 1.15);
  end if;

  v_sum := s_str + s_int + s_vit + s_wil;
  v_power := case h.class
    when 'scholar'  then v_sum + s_int
    when 'warrior'  then v_sum + (s_str + s_vit) * 0.5
    when 'guardian' then v_sum + s_wil
    when 'ranger'   then v_sum * 1.25
    else v_sum end;

  -- 職業專屬傳說：對應職業穿上，戰力 +20%
  if v_class_hit then v_power := v_power * (1 + (cat->>'class_bonus')::numeric); end if;

  return jsonb_build_object('power', round(v_power)::integer, 'class', h.class, 'set', v_set, 'lset', v_lset, 'class_hit', v_class_hit,
    'str', s_str, 'int', s_int, 'vit', s_vit, 'wil', s_wil);
end;
$function$;
revoke all on function public.rpg_power_of(uuid) from public, anon, authenticated;

create or replace function public.rpg_gear_star(p_key text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid(); g jsonb := public.rpg_catalog()->'gear'->p_key; r public.rpg_gear%rowtype; v_gold integer; v_dust integer; n integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  if g is null then raise exception '沒有這件裝備'; end if;
  select * into r from public.rpg_gear where user_id = u and gear_key = p_key for update;
  if not found then raise exception '還沒有這件裝備'; end if;
  if r.level < 5 then raise exception '要先升到 Lv5 才能突破'; end if;
  if r.star >= 3 then raise exception '已經突破到 ★3 了'; end if;
  n := r.star + 1;
  v_gold := n * case g->>'tier' when 'c' then 100 when 'r' then 200 when 'l' then 400 when 'x' then 800 else 1500 end;
  v_dust := 10 * n;
  if coalesce((select p.gold from public.profiles p where p.id = u), 0) < v_gold then raise exception '金幣不夠（要 %）', v_gold; end if;
  if coalesce((select qty from public.player_items where user_id = u and item_key = 'stardust'), 0) < v_dust then raise exception '星屑不夠（要 %）', v_dust; end if;
  update public.profiles p set gold = p.gold - v_gold, updated_at = now() where p.id = u;
  update public.player_items set qty = qty - v_dust, updated_at = now() where user_id = u and item_key = 'stardust';
  insert into public.item_events (user_id, item_key, delta, source_key) values (u, 'stardust', -v_dust, 'rpg-star:' || gen_random_uuid());
  update public.rpg_gear set star = n where user_id = u and gear_key = p_key;
  return json_build_object('key', p_key, 'star', n, 'gold', v_gold, 'dust', v_dust);
end;
$function$;
grant execute on function public.rpg_gear_star(text) to authenticated;

-- 狀態裡帶上每件裝備的星數
do $do$ begin
  if to_regprocedure('public.rpg_status_base()') is null then
    alter function public.rpg_status() rename to rpg_status_base;
  end if;
end $do$;
revoke all on function public.rpg_status_base() from public, anon, authenticated;

create or replace function public.rpg_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); base jsonb;
begin
  base := public.rpg_status_base()::jsonb;
  if u is null then return base::json; end if;
  return (base || jsonb_build_object('stars', coalesce((select jsonb_object_agg(gear_key, star) from public.rpg_gear where user_id = u and star > 0), '{}'::jsonb),
    'stardust', coalesce((select qty from public.player_items where user_id = u and item_key = 'stardust'), 0)))::json;
end;
$function$;
grant execute on function public.rpg_status() to authenticated;
