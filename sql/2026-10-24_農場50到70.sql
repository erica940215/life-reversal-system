-- =========================================================
-- 🏝️ 星露島擴充：等級上限 50 → 70
-- 需要先跑過：2026-10-16_星露島.sql、2026-10-18_成就.sql、完整設定.sql
-- 可以重複執行。若之後重跑 2026-10-18_成就.sql 或 完整設定.sql，請再跑一次這份。
--
--   島嶼等級 51–70：每 5 級有星願瓶獎勵（55、65 普通；60 稀有；70 限定）
--   新成就：島嶼 Lv60（星露的旅人）、Lv70（星露傳說）
-- =========================================================

-- ---------- 🏅 成就獎勵目錄：加入 lv60 / lv70 ----------
do $$
begin
  if to_regprocedure('public.farm_achieve_catalog_base()') is null
     and to_regprocedure('public.farm_achieve_catalog()') is not null then
    alter function public.farm_achieve_catalog() rename to farm_achieve_catalog_base;
  end if;
end $$;

create or replace function public.farm_achieve_catalog()
returns jsonb language sql immutable
as $catalog$
  select public.farm_achieve_catalog_base() || $json${
    "lv60":{"dust":400,"src":"farm"},"lv70":{"dust":800,"src":"farm"}
  }$json$::jsonb
$catalog$;

-- ---------- 🎁 島嶼等級的星願瓶：上限 70 ----------
create or replace function public.farm_claim_levels()
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_lv integer;
  v_items jsonb := '[]'::jsonb;
  v_key text;
  v_qty integer;
  l integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;

  select least(coalesce((state->>'lv')::integer, 1), 70) into v_lv
    from public.farm_saves where user_id = v_user;

  if not found or v_lv < 5 then return v_items; end if;

  for l in 5..v_lv by 5 loop
    if l = 50 then v_key := 'wish_rare'; v_qty := 3;
    elsif l = 70 then v_key := 'wish_limited'; v_qty := 1;
    elsif l % 10 = 0 then v_key := 'wish_rare'; v_qty := 1;
    else v_key := 'wish_normal'; v_qty := 1;
    end if;

    if public.grant_item(v_user, v_key, v_qty, 'farm-lv:' || l) then
      v_items := v_items || jsonb_build_object('key', v_key, 'qty', v_qty, 'lv', l);
    end if;
  end loop;

  return v_items;
end;
$function$;
