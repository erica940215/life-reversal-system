-- =========================================================
-- 序光計畫：✅ 每日任務的獎勵改成 ⭐ 星屑（金幣不再由任務發）
-- 可以重複執行。要先執行過「簽到發券與背包」那一份（需要 grant_item）。
--
--   complete_task(id)    完成任務：加 EXP，星屑依難度發（easy 1、normal 2、hard 3、epic 5）
--   uncomplete_task(id)  取消完成：扣回 EXP；這個任務發過的星屑也一起收回
--
-- 升級還是照舊給 100 金幣（那是升級獎勵，不是任務獎勵）。
-- 星屑記在 player_items（item_key = 'stardust'）；每次完成的來源是 'task:<id>:<時間>'，
-- 取消時寫一筆負數的帳，所以重複完成、取消都不會重複發。
-- =========================================================


-- ---------- ✅ 完成任務 ----------
create or replace function public.complete_task(p_task_id bigint)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user_id uuid;
  v_task public.tasks%rowtype;
  v_profile public.profiles%rowtype;
  v_required_exp integer;
  v_new_level integer;
  v_new_exp integer;
  v_new_gold integer;
  v_dust integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception '尚未登入'; end if;

  select * into v_task from public.tasks where id = p_task_id and user_id = v_user_id for update;
  if not found then raise exception '找不到這個任務'; end if;

  if v_task.completed then
    return json_build_object('success', false, 'message', '這個任務已經完成');
  end if;

  select * into v_profile from public.profiles where id = v_user_id for update;
  if not found then raise exception '找不到玩家資料'; end if;

  v_dust := case v_task.difficulty when 'easy' then 2 when 'hard' then 5 when 'epic' then 8 else 3 end;

  v_new_exp   := v_profile.exp + v_task.exp_reward;
  v_new_gold  := v_profile.gold;          -- 任務不再給金幣
  v_new_level := v_profile.level;

  loop
    v_required_exp := 100 + (v_new_level - 1) * 50;
    exit when v_new_exp < v_required_exp;
    v_new_exp   := v_new_exp - v_required_exp;
    v_new_level := v_new_level + 1;
    v_new_gold  := v_new_gold + 100;      -- 升級獎勵照舊
  end loop;

  update public.tasks set completed = true, completed_at = now()
    where id = v_task.id and user_id = v_user_id;

  update public.profiles set level = v_new_level, exp = v_new_exp, gold = v_new_gold, updated_at = now()
    where id = v_user_id;

  perform public.grant_item(v_user_id, 'stardust', v_dust,
                            'task:' || v_task.id || ':' || gen_random_uuid()::text);

  return json_build_object(
    'success', true,
    'task_id', v_task.id,
    'task_exp', v_task.exp_reward,
    'task_dust', v_dust,
    'level', v_new_level,
    'exp', v_new_exp,
    'gold', v_new_gold
  );
end;
$function$;

grant execute on function public.complete_task(bigint) to authenticated;


-- ---------- ↩️ 取消完成：扣回 EXP 和這個任務發過的星屑 ----------
create or replace function public.uncomplete_task(p_task_id bigint)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_profile public.profiles%rowtype;
  v_new_level integer;
  v_new_exp integer;
  v_new_gold integer;
  v_net integer;
begin
  if v_user_id is null then raise exception '尚未登入'; end if;

  select * into v_task from public.tasks where id = p_task_id and user_id = v_user_id for update;
  if not found then raise exception '找不到這個任務'; end if;
  if not v_task.completed then
    return json_build_object('success', false, 'message', '這個任務尚未完成');
  end if;

  select * into v_profile from public.profiles where id = v_user_id for update;
  if not found then raise exception '找不到玩家資料'; end if;

  v_new_exp   := v_profile.exp - coalesce(v_task.exp_reward, 0);
  v_new_gold  := v_profile.gold;
  v_new_level := v_profile.level;
  while v_new_exp < 0 and v_new_level > 1 loop
    v_new_level := v_new_level - 1;
    v_new_exp   := v_new_exp + (100 + (v_new_level - 1) * 50);
    v_new_gold  := v_new_gold - 100;
  end loop;
  if v_new_exp < 0 then v_new_exp := 0; end if;

  update public.tasks set completed = false, completed_at = null
    where id = v_task.id and user_id = v_user_id;

  update public.profiles set level = v_new_level, exp = v_new_exp, gold = v_new_gold, updated_at = now()
    where id = v_user_id;

  -- 收回這個任務目前淨發出的星屑（發過幾次、收回幾次，加起來就是淨額）
  select coalesce(sum(delta), 0) into v_net from public.item_events
    where user_id = v_user_id and item_key = 'stardust'
      and (source_key like 'task:' || v_task.id || ':%' or source_key like 'task-undo:' || v_task.id || ':%');

  if v_net > 0 then
    insert into public.item_events (user_id, item_key, delta, source_key)
      values (v_user_id, 'stardust', -v_net,
              'task-undo:' || v_task.id || ':' || gen_random_uuid()::text);
    update public.player_items set qty = greatest(0, qty - v_net), updated_at = now()
      where user_id = v_user_id and item_key = 'stardust';
  end if;

  return json_build_object('success', true, 'task_id', v_task.id, 'level', v_new_level,
                           'exp', v_new_exp, 'gold', v_new_gold, 'dust_back', v_net);
end;
$function$;

grant execute on function public.uncomplete_task(bigint) to authenticated;

notify pgrst, 'reload schema';


-- ---------- ✅ 檢查結果 ----------
select case
  when exists (select 1 from pg_proc where proname = 'grant_item' and pronamespace = 'public'::regnamespace)
    then '✅ 任務改發星屑設定完成'
  else '⚠️ 缺少 grant_item：先執行「簽到發券與背包」那一份'
end as 檢查結果;
