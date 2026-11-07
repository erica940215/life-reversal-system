-- =========================================================
-- 序光計畫：🥚 扭蛋機新系列
--   系列 3 🍰 甜點妖精、系列 4 ✏️ 文具小夥伴（各 12 隻＋隱藏版 1 隻）
--   集滿 13 隻送限定召喚券、星屑 30、專屬頭像框
--   （舊的兩個系列集滿獎勵用過的 key 保留，不會重複發）
-- 可以重複執行。
-- =========================================================
create or replace function public.fun_gacha_pull(p_series text default 'm')
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  mons text[];
  v_secret text;
  v_key text;
  v_count integer;
  v_dust integer := 0;
  v_set boolean := false;
  v_id text := gen_random_uuid()::text;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_series = 'z' then
    mons := array['z_aries', 'z_taurus', 'z_gemini', 'z_cancer', 'z_leo', 'z_virgo',
                  'z_libra', 'z_scorpio', 'z_sagittarius', 'z_capricorn', 'z_aquarius', 'z_pisces'];
    v_secret := 'z_polaris';
  elsif p_series = 'm' then
    mons := array['m_owl', 'm_pillow', 'm_kappa', 'm_snail', 'm_hamster', 'm_fly',
                  'm_drop', 'm_rooster', 'm_tomato', 'm_chick', 'm_bookworm', 'm_hedgehog'];
    v_secret := 'm_secret';
  elsif p_series = 's' then
    mons := array['s_macaron', 's_pudding', 's_donut', 's_mochi', 's_croissant', 's_taiyaki',
                  's_bubbletea', 's_cupcake', 's_icecream', 's_pancake', 's_dango', 's_cookie'];
    v_secret := 's_starcake';
  elsif p_series = 'w' then
    mons := array['w_pencil', 'w_eraser', 'w_ruler', 'w_highlighter', 'w_stapler', 'w_notebook',
                  'w_clip', 'w_sticky', 'w_compass', 'w_scissors', 'w_glue', 'w_calculator'];
    v_secret := 'w_fountainpen';
  else
    raise exception '沒有這個扭蛋系列';
  end if;
  perform public.fun_take(v_user, 'gacha_coin', 1, 'gacha-use:' || v_id);

  v_key := case when random() < 0.04 then v_secret
                else mons[1 + floor(random() * array_length(mons, 1))::int] end;

  insert into public.fun_monsters (user_id, monster_key) values (v_user, v_key)
  on conflict (user_id, monster_key) do update set count = public.fun_monsters.count + 1
  returning count into v_count;

  if v_count > 1 then
    v_dust := case when v_key = v_secret then 10 else 2 end;
    perform public.grant_item(v_user, 'stardust', v_dust, 'gacha-dup:' || v_id);
  end if;

  -- 13 隻都到齊：送一次大禮
  if (select count(*) from public.fun_monsters where user_id = v_user and monster_key like p_series || '\_%') >= 13 then
    v_set := public.grant_item(v_user, 'ticket_limited', 1, case p_series when 'm' then 'monster-set:1' when 'z' then 'zodiac-set:1' else p_series || '-gacha-set:1' end);
    if v_set then
      perform public.grant_item(v_user, 'stardust', 30, case p_series when 'm' then 'monster-set-dust:1' when 'z' then 'zodiac-set-dust:1' else p_series || '-gacha-set-dust:1' end);
      perform public.fun_frame_grant(v_user, case p_series when 'm' then 'frame_monster' when 'z' then 'frame_zodiac' when 's' then 'frame_sweets' else 'frame_stationery' end);
    end if;
  end if;

  return json_build_object('success', true, 'key', v_key, 'count', v_count, 'dust', v_dust, 'set_done', v_set);
end;
$function$;
revoke all on function public.fun_gacha_pull(text) from public, anon;
grant execute on function public.fun_gacha_pull(text) to authenticated;
