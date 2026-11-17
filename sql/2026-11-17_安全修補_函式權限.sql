-- =========================================================
-- 序光計畫：🔒 安全修補：收回函式的訪客權限（已經在線上套用過；可以重複執行）
--   問題：86 個以伺服器權限執行（security definer）的函式，沒登入的訪客（anon）也能呼叫。
--   做法：全部收回 public／anon 的執行權限，只留給登入使用者和後台。
--         其中 13 個「內部輔助函式」（參數可以帶任何使用者 id，只給其他函式呼叫）和觸發器函式，連登入使用者也不能直接呼叫。
--   以後新增 security definer 函式，記得加：
--     revoke all on function 函式名(參數) from public, anon;  grant execute on function 函式名(參數) to authenticated;
-- =========================================================
do $$ declare r record;
  helpers text[] := array['arena_day_score','arena_friends','arena_name','arena_power','arena_theme_score','arena_week_points','gacha_party','rpg_dungeon_ok','rpg_ench_progress','rpg_power_of','rpg_quest_check','rpg_sidekick_bonus','spirit_sync'];
begin
  for r in select p.oid::regprocedure sig, p.proname, p.prorettype = 'trigger'::regtype trg from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.prosecdef and (has_function_privilege('anon', p.oid, 'execute') or p.proname = any(helpers)) loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
    if r.trg or r.proname = any(helpers) then execute format('revoke all on function %s from authenticated', r.sig);
    else execute format('grant execute on function %s to authenticated', r.sig); end if;
  end loop;
end $$;
