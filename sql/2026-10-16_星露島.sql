-- =========================================================
-- 序光計畫：🏝️ 星露島（生活線農場）
-- 可以重複執行
--
--   farm_saves           每個人一份農場存檔（網頁只能讀自己的，寫入要透過 farm_save）
--   farm_save()          存檔（rev 對不上代表別的分頁存過了，會回傳 conflict）
--   farm_open_wish()     開一個星願瓶：背包 -1，回傳一個隨機數給網頁決定抽到什麼
--   farm_claim_levels()  島嶼等級獎勵的星願瓶（Lv5 普通、Lv10 稀有…Lv50 稀有 ×3），同一級只發一次
-- =========================================================


-- ---------- 💾 農場存檔 ----------
create table if not exists public.farm_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  rev integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.farm_saves enable row level security;
drop policy if exists "own select" on public.farm_saves;
create policy "own select" on public.farm_saves for select using (auth.uid() = user_id);
revoke insert, update, delete on public.farm_saves from authenticated;
grant select on public.farm_saves to authenticated;


create or replace function public.farm_save(p_state jsonb, p_rev integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_rev integer;
  v_lv integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then raise exception '存檔格式不對'; end if;
  if pg_column_size(p_state) > 500000 then raise exception '存檔太大'; end if;

  v_lv := coalesce((p_state->>'lv')::integer, 1);
  if v_lv < 1 or v_lv > 70 then raise exception '島嶼等級不正確'; end if;

  select rev into v_rev from public.farm_saves where user_id = v_user for update;

  if not found then
    insert into public.farm_saves (user_id, state, rev) values (v_user, p_state, 1);
    return json_build_object('ok', true, 'rev', 1);
  end if;

  if p_rev is distinct from v_rev then
    return json_build_object('ok', false, 'conflict', true, 'rev', v_rev);
  end if;

  update public.farm_saves
    set state = p_state, rev = v_rev + 1, updated_at = now()
    where user_id = v_user;

  return json_build_object('ok', true, 'rev', v_rev + 1);
end;
$function$;


-- ---------- 🌠 開星願瓶 ----------
create or replace function public.farm_open_wish(p_item text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_qty integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_item not in ('wish_normal', 'wish_rare', 'wish_limited') then raise exception '這不是星願瓶'; end if;

  select qty into v_qty from public.player_items
    where user_id = v_user and item_key = p_item for update;

  if coalesce(v_qty, 0) < 1 then raise exception '星願瓶不夠'; end if;

  update public.player_items set qty = qty - 1, updated_at = now()
    where user_id = v_user and item_key = p_item;

  insert into public.item_events (user_id, item_key, delta, source_key)
    values (v_user, p_item, -1, 'farm-wish:' || gen_random_uuid());

  return json_build_object('roll', random(), 'left', v_qty - 1);
end;
$function$;


-- ---------- 🎁 島嶼等級的星願瓶（看存檔裡的等級，每一級只發一次） ----------
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

  select least(coalesce((state->>'lv')::integer, 1), 50) into v_lv
    from public.farm_saves where user_id = v_user;

  if not found or v_lv < 5 then return v_items; end if;

  for l in 5..v_lv by 5 loop
    if l = 50 then v_key := 'wish_rare'; v_qty := 3;
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


revoke all on function public.farm_save(jsonb, integer) from public, anon;
revoke all on function public.farm_open_wish(text) from public, anon;
revoke all on function public.farm_claim_levels() from public, anon;
grant execute on function public.farm_save(jsonb, integer) to authenticated;
grant execute on function public.farm_open_wish(text) to authenticated;
grant execute on function public.farm_claim_levels() to authenticated;


-- ---------- 讓網站馬上看到新的表 ----------
notify pgrst, 'reload schema';


-- ---------- ✅ 檢查結果 ----------
select coalesce(string_agg(missing, '、'), '✅ 星露島 設定完成') as 檢查結果
from (
  select '缺少表 farm_saves' as missing
  where to_regclass('public.farm_saves') is null
  union all
  select '缺少函式 ' || f
  from unnest(array['farm_save', 'farm_open_wish', 'farm_claim_levels']) f
  where not exists (select 1 from pg_proc where proname = f and pronamespace = 'public'::regnamespace)
) x;
