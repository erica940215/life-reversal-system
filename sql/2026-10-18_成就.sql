-- =========================================================
-- 序光計畫：🏆 星露島成就（達成送星屑）
-- 可以重複執行。要先執行過「簽到發券與背包」和「星願池」那兩份。
--
--   farm_achieve_catalog()   56 個成就（含 6 個釣魚成就）的星屑數量和門檻（網頁上的 farm.js 也有同一份）
--   farm_achieve_status()    已經領過哪些、網站上的累計數字（習慣、任務、專注、簽到、晨間打卡、抽獎）
--   farm_achieve_claim(key)  領成就：網站上的成就由資料庫自己檢查；星露島的成就照島上的存檔
--
-- 星屑記在 player_items（item_key = 'stardust'），每個成就的來源是 'achieve:<key>'，
-- 同一個成就只會發一次。
-- =========================================================


-- ---------- 📜 成就目錄：key → 星屑、要檢查的數字、門檻 ----------
-- src = 'farm' 的照島上的存檔；其他的資料庫自己算
create or replace function public.farm_achieve_catalog()
returns jsonb language sql immutable
as $catalog$
  select $json${
    "plant1":{"dust":5,"src":"farm"},"harvest1":{"dust":5,"src":"farm"},"cook1":{"dust":5,"src":"farm"},
    "feed1":{"dust":5,"src":"farm"},"animal1":{"dust":5,"src":"farm"},"sell1":{"dust":5,"src":"farm"},
    "process1":{"dust":10,"src":"farm"},"harvest50":{"dust":15,"src":"farm"},"harvest200":{"dust":30,"src":"farm"},
    "harvest1000":{"dust":100,"src":"farm"},"plant100":{"dust":20,"src":"farm"},"cook10":{"dust":15,"src":"farm"},
    "cook50":{"dust":40,"src":"farm"},"cook200":{"dust":120,"src":"farm"},"feed50":{"dust":20,"src":"farm"},
    "animal100":{"dust":40,"src":"farm"},"process30":{"dust":30,"src":"farm"},"sell100":{"dust":20,"src":"farm"},
    "lv5":{"dust":10,"src":"farm"},"lv10":{"dust":20,"src":"farm"},"lv20":{"dust":40,"src":"farm"},
    "lv30":{"dust":80,"src":"farm"},"lv40":{"dust":120,"src":"farm"},"lv50":{"dust":300,"src":"farm"},
    "field5":{"dust":20,"src":"farm"},"field8":{"dust":100,"src":"farm"},"zones3":{"dust":20,"src":"farm"},
    "zones6":{"dust":80,"src":"farm"},"crops20":{"dust":20,"src":"farm"},"crops50":{"dust":60,"src":"farm"},
    "dishes20":{"dust":30,"src":"farm"},"animals5":{"dust":30,"src":"farm"},"dew10000":{"dust":40,"src":"farm"},
    "deco5":{"dust":20,"src":"farm"},"pet1":{"dust":20,"src":"farm"},
    "fish1":{"dust":5,"src":"farm"},"fishdex5":{"dust":20,"src":"farm"},"fish50":{"dust":30,"src":"farm"},
    "fishlegend":{"dust":50,"src":"farm"},"fish300":{"dust":100,"src":"farm"},"fishdexall":{"dust":100,"src":"farm"},
    "wish10":{"dust":20,"src":"wish","n":10},"wish100":{"dust":80,"src":"wish","n":100},
    "habit1":{"dust":5,"src":"habit","n":1},"habit50":{"dust":30,"src":"habit","n":50},"habit300":{"dust":100,"src":"habit","n":300},
    "task1":{"dust":5,"src":"task","n":1},"task50":{"dust":30,"src":"task","n":50},"task300":{"dust":100,"src":"task","n":300},
    "focus1h":{"dust":10,"src":"focus","n":60},"focus10h":{"dust":40,"src":"focus","n":600},"focus100h":{"dust":150,"src":"focus","n":6000},
    "checkin7":{"dust":15,"src":"checkin","n":7},"checkin30":{"dust":50,"src":"checkin","n":30},"checkin100":{"dust":150,"src":"checkin","n":100},
    "morning30":{"dust":40,"src":"morning","n":30}
  }$json$::jsonb
$catalog$;


-- ---------- 📊 網站上的累計數字 ----------
create or replace function public.farm_achieve_counts(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v jsonb := '{}'::jsonb;
  n bigint;
begin
  begin
    select count(*) into n from public.habit_logs where user_id = p_user and not is_makeup;
    v := v || jsonb_build_object('habit', n);
  exception when others then v := v || '{"habit":0}'::jsonb; end;

  begin
    execute 'select count(*) from public.tasks where user_id = $1 and completed = true' into n using p_user;
    v := v || jsonb_build_object('task', n);
  exception when others then v := v || '{"task":0}'::jsonb; end;

  begin
    select coalesce(floor(sum(duration_seconds) / 60), 0) into n from public.focus_sessions where user_id = p_user;
    v := v || jsonb_build_object('focus', n);
  exception when others then v := v || '{"focus":0}'::jsonb; end;

  begin
    select count(*) into n from public.checkins where user_id = p_user and not is_makeup;
    v := v || jsonb_build_object('checkin', n);
  exception when others then v := v || '{"checkin":0}'::jsonb; end;

  begin
    select count(distinct check_date) into n from public.morning_checkins where user_id = p_user;
    v := v || jsonb_build_object('morning', n);
  exception when others then v := v || '{"morning":0}'::jsonb; end;

  begin
    select count(*) into n from public.farm_wish_log where user_id = p_user;
    v := v || jsonb_build_object('wish', n);
  exception when others then v := v || '{"wish":0}'::jsonb; end;

  return v;
end;
$function$;

revoke all on function public.farm_achieve_counts(uuid) from public, anon, authenticated;


-- ---------- 🏆 狀態：領過哪些、累計數字 ----------
create or replace function public.farm_achieve_status()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_claimed jsonb;
begin
  if v_user is null then raise exception 'not signed in'; end if;

  select coalesce(jsonb_agg(substr(source_key, 9)), '[]'::jsonb) into v_claimed
    from public.item_events
    where user_id = v_user and item_key = 'stardust' and source_key like 'achieve:%';

  return jsonb_build_object('claimed', v_claimed, 'counts', public.farm_achieve_counts(v_user));
end;
$function$;

grant execute on function public.farm_achieve_status() to authenticated;


-- ---------- 🎁 領成就 ----------
create or replace function public.farm_achieve_claim(p_key text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_def jsonb := public.farm_achieve_catalog() -> p_key;
  v_src text;
  v_counts jsonb;
  v_dust integer;
  v_total integer;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if v_def is null then raise exception 'unknown achievement %', p_key; end if;

  v_src := v_def ->> 'src';
  v_dust := (v_def ->> 'dust')::integer;

  /* 網站上的成就：資料庫自己數 */
  if v_src <> 'farm' then
    v_counts := public.farm_achieve_counts(v_user);
    if coalesce((v_counts ->> v_src)::integer, 0) < (v_def ->> 'n')::integer then
      return jsonb_build_object('ok', false, 'reason', 'not_yet');
    end if;
  end if;

  if not public.grant_item(v_user, 'stardust', v_dust, 'achieve:' || p_key) then
    return jsonb_build_object('ok', false, 'reason', 'claimed');
  end if;

  select qty into v_total from public.player_items where user_id = v_user and item_key = 'stardust';
  return jsonb_build_object('ok', true, 'dust', v_dust, 'total', coalesce(v_total, 0));
end;
$function$;

grant execute on function public.farm_achieve_claim(text) to authenticated;
