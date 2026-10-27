-- =========================================================
-- 🏪 冒險商店：每天都開，用金幣買召喚券、扭蛋幣、寶箱等
-- 需要先跑過：2026-10-22_驚喜.sql（金幣在 profiles.gold、grant_item）
-- 可以重複執行。
--   週末流浪商人照舊（有一樣 7 折）；商店價格是原價，每樣每天有購買上限
-- =========================================================

create table if not exists public.rpg_store_buys (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  item text not null,
  qty integer not null,
  price integer not null,
  created_at timestamptz not null default now()
);
create index if not exists rpg_store_buys_user_day on public.rpg_store_buys(user_id, day);
alter table public.rpg_store_buys enable row level security;
do $$ begin
  create policy "rpg_store_buys_read" on public.rpg_store_buys for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create or replace function public.rpg_store_catalog()
returns jsonb language sql immutable as $$
  select '[
    {"item":"ticket_normal","name":"普通召喚券","price":150,"limit":5},
    {"item":"ticket_special","name":"特殊召喚券","price":450,"limit":2},
    {"item":"ticket_limited","name":"限定召喚券","price":1200,"limit":1},
    {"item":"gacha_coin","name":"扭蛋幣","price":120,"limit":5},
    {"item":"scratch_card","name":"刮刮樂","price":80,"limit":3},
    {"item":"chest_iron","name":"鐵寶箱","price":220,"limit":2},
    {"item":"wish_normal","name":"普通星願瓶","price":100,"limit":5},
    {"item":"farmpass10","name":"農場入場卷","price":60,"limit":3}
  ]'::jsonb
$$;

create or replace function public.rpg_store_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
begin
  if u is null then raise exception '尚未登入'; end if;
  return json_build_object(
    'gold', (select coalesce(gold, 0) from public.profiles where id = u),
    'items', (select jsonb_agg(x || jsonb_build_object('bought',
                coalesce((select sum(qty) from public.rpg_store_buys b
                          where b.user_id = u and b.day = today and b.item = x->>'item'), 0)))
              from jsonb_array_elements(public.rpg_store_catalog()) x));
end;
$function$;
grant execute on function public.rpg_store_status() to authenticated;

create or replace function public.rpg_store_buy(p_item text, p_qty integer default 1)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
  o jsonb;
  v_bought integer;
  v_cost integer;
  v_gold integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_qty is null or p_qty < 1 then raise exception '數量不對'; end if;
  select x into o from jsonb_array_elements(public.rpg_store_catalog()) x where x->>'item' = p_item;
  if o is null then raise exception '商店沒有賣這個'; end if;

  select gold into v_gold from public.profiles where id = u for update;
  select coalesce(sum(qty), 0) into v_bought from public.rpg_store_buys
    where user_id = u and day = today and item = p_item;
  if v_bought + p_qty > (o->>'limit')::int then
    raise exception '今天最多買 % 個（已買 %）', o->>'limit', v_bought;
  end if;
  v_cost := (o->>'price')::int * p_qty;
  if coalesce(v_gold, 0) < v_cost then raise exception '金幣不夠（需要 %）', v_cost; end if;

  update public.profiles set gold = gold - v_cost, updated_at = now() where id = u;
  insert into public.rpg_store_buys (user_id, day, item, qty, price) values (u, today, p_item, p_qty, v_cost);
  perform public.grant_item(u, p_item, p_qty, 'store:' || gen_random_uuid());
  return json_build_object('success', true, 'item', p_item, 'qty', p_qty, 'gold', v_gold - v_cost);
end;
$function$;
revoke all on function public.rpg_store_buy(text, integer) from public, anon;
grant execute on function public.rpg_store_buy(text, integer) to authenticated;
