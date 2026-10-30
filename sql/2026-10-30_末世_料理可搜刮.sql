-- =========================================================
-- 序光計畫：☢️ 末世：🍽️ 料理也可以從探索中搜到
-- 要在「2026-10-30_末世_搜刮食物.sql」之後執行（之後的檔都跑過也沒關係）。可以重複執行。
--
--   專注搜刮、抽獎、外送員撿到美食的時候，有 30% 是「料理」（星露島料理、魚料理）
--   料理的稀有度照抽到的品階：越稀有的料理越難搜到
--   搜刮物資專屬的食物（礦泉水、罐頭…）還是跟著物資來，不會隨機掉
-- =========================================================

create or replace function public.doom_pantry_roll(u uuid, p_zone text, p_chance numeric)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  cat jsonb := public.doom_food_cat();
  tier text;
  e jsonb := null;
  have integer;
  dish boolean;
begin
  if random() >= p_chance then return null; end if;
  tier := public.doom_roll_tier(public.doom_luck(u));
  dish := random() < 0.3;
  if dish then
    -- 🍽️ 料理：照品階挑，那個品階沒有就往下找
    select el into e from jsonb_array_elements(cat->'items') el where el ? 'cook' and el->>'t' = tier order by random() limit 1;
    if e is null then
      select el into e from jsonb_array_elements(cat->'items') el
        where el ? 'cook' and position(el->>'t' in 'crlxs') <= position(tier in 'crlxs')
        order by position(el->>'t' in 'crlxs') desc, random() limit 1;
    end if;
  end if;
  if e is null and p_zone is not null and random() < 0.6 then
    select el into e from jsonb_array_elements(cat->'items') el
      where not (el ? 'cook') and not (el ? 'scav') and el->>'t' = tier and exists (select 1 from jsonb_array_elements(cat->'cats') c where c->>'id' = el->>'c' and c->'zones' ? p_zone)
      order by random() limit 1;
  end if;
  if e is null then select el into e from jsonb_array_elements(cat->'items') el where not (el ? 'cook') and not (el ? 'scav') and el->>'t' = tier order by random() limit 1; end if;
  if e is null then select el into e from jsonb_array_elements(cat->'items') el where not (el ? 'cook') and not (el ? 'scav') and el->>'t' = 'c' order by random() limit 1; end if;
  select coalesce((pantry->>(e->>'id'))::int, 0) into have from public.doom_state where user_id = u;
  update public.doom_state set pantry = pantry || jsonb_build_object(e->>'id', have + 1) where user_id = u;
  return jsonb_build_object('id', e->>'id', 'name', e->>'name', 'emoji', e->>'emoji', 'tier', e->>'t', 'new', have = 0
    and not exists (select 1 from public.doom_state where user_id = u and eaten ? (e->>'id')));
end;
$function$;
revoke all on function public.doom_pantry_roll(uuid, text, numeric) from public, authenticated, anon;
