-- =========================================================
-- 序光計畫：⚔️ 冒險：🗓️ 季節活動（萬聖節之後到春節）
-- 要先跑過「2026-10-23_遠征萬聖節日誌.sql」「2026-10-30_限定_2到4月.sql」。可以重複執行。
--
--   🍁 秋收祭   11/7～11/16（商店到 11/18）  貨幣：落葉      11/7 立冬簽到 → 稻穗大王
--   🛍️ 雙 11 流浪商人  11/11 當天            用金幣買，全場 5 折、限量
--   🦃 感謝週   11/23～11/29（商店到 12/1）  貨幣：感謝卡    幫好友加油也會遇到；11/26 簽到 → 感恩火雞王
--   🎄 星夜聖誕 12/18～12/28（商店到 12/30） 貨幣：聖誕襪    12/25 簽到 → 聖誕老人
--   🎆 跨年倒數 12/31～1/3（商店到 1/4）     貨幣：煙火      1/1 簽到 → 新年鐘聲
--   🧧 春節廟會 2027/2/1～2/14（商店到 2/16） 貨幣：紅包      2/6 大年初一簽到 → 年獸王
--
--   遇到活動怪：完成任務 40%、專注 25 分鐘以上一定、每週王每次出擊 30%（＋各活動的特別來源）
--   活動結束、商店關了之後，沒用完的貨幣自動換成星屑（1 個 = 2 星屑），不會浪費
-- =========================================================

create table if not exists public.ev_mobs (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null,
  kind text not null,
  source text not null,
  caught_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, event, source)
);
alter table public.ev_mobs enable row level security;
drop policy if exists "own select" on public.ev_mobs;
create policy "own select" on public.ev_mobs for select using (auth.uid() = user_id);
revoke insert, update, delete on public.ev_mobs from authenticated, anon;

create or replace function public.ev_catalog()
returns jsonb language sql immutable as $$
  select $json$[
  {"id":"harvest","name":"秋收祭","emoji":"🍁","start":"2026-11-07","end":"2026-11-16","shop_end":"2026-11-18",
   "currency":"leaf","cur_name":"落葉","cur_emoji":"🍂","desc":"秋天的森林裡，落葉精靈和稻草小怪到處亂跑。抓住牠們收集落葉！",
   "mobs":{"leaf_sprite":{"name":"落葉精靈","emoji":"🍃","cur":1,"w":0.62},"straw_imp":{"name":"稻草小怪","emoji":"🌾","cur":2,"w":0.3},
           "squirrel":{"name":"豐收松鼠","emoji":"🐿️","cur":5,"w":0.08,"bonus":{"gacha_coin":1}},
           "king":{"name":"稻穗大王","emoji":"👑","cur":12,"bonus":{"chest_gold":1}}},
   "king_day":"2026-11-07","king_note":"11/7 立冬簽到",
   "shop":[{"item":"frame_maple","name":"楓葉頭像框","price":30,"limit":1,"kind":"frame","emoji":"🍁"},
           {"item":"scarecrow_hat","name":"稻草人帽","price":50,"limit":1,"kind":"gear","emoji":"👒"},
           {"item":"maple_bow","name":"楓羽長弓","price":50,"limit":1,"kind":"gear","emoji":"🏹"},
           {"item":"chest_star","name":"星光寶箱","price":40,"limit":1,"kind":"item","emoji":"🌟"},
           {"item":"gacha_coin","name":"扭蛋幣","price":8,"limit":5,"kind":"item","emoji":"🪙"},
           {"item":"scratch_card","name":"刮刮樂","price":5,"limit":5,"kind":"item","emoji":"🎫"}]},
  {"id":"sale11","name":"雙 11 流浪商人","emoji":"🛍️","start":"2026-11-11","end":"2026-11-11","shop_end":"2026-11-11",
   "currency":"gold","cur_name":"金幣","cur_emoji":"🪙","sale":true,"desc":"流浪商人只來一天！全場 5 折，每樣限量，用金幣買。",
   "mobs":{},
   "shop":[{"item":"ticket_normal","name":"普通召喚券","price":60,"limit":3,"kind":"item","emoji":"🎫"},
           {"item":"ticket_special","name":"特殊召喚券","price":150,"limit":2,"kind":"item","emoji":"🎟️"},
           {"item":"ticket_limited","name":"限定召喚券","price":300,"limit":1,"kind":"item","emoji":"🌟"},
           {"item":"gacha_coin","name":"扭蛋幣","price":25,"limit":5,"kind":"item","emoji":"🪙"},
           {"item":"chest_star","name":"星光寶箱","price":200,"limit":1,"kind":"item","emoji":"✨"},
           {"item":"wish_rare","name":"稀有星願瓶","price":150,"limit":2,"kind":"item","emoji":"💎"}]},
  {"id":"thanks","name":"感謝週","emoji":"🦃","start":"2026-11-23","end":"2026-11-29","shop_end":"2026-12-01",
   "currency":"thanks_card","cur_name":"感謝卡","cur_emoji":"💌","desc":"謝謝一路陪你的人。幫好友加油、一起努力，都會收到感謝卡。",
   "mobs":{"dove":{"name":"感謝信鴿","emoji":"🕊️","cur":1,"w":0.62},"turkey":{"name":"火雞先生","emoji":"🦃","cur":3,"w":0.3},
           "tree":{"name":"感恩樹精","emoji":"🌳","cur":6,"w":0.08,"bonus":{"gacha_coin":1}},
           "king":{"name":"感恩火雞王","emoji":"👑","cur":12,"bonus":{"chest_gold":1}}},
   "king_day":"2026-11-26","king_note":"11/26 感恩節簽到","cheer":true,
   "shop":[{"item":"frame_friends","name":"好友合照框","price":30,"limit":1,"kind":"frame","emoji":"📸"},
           {"item":"turkey_feather","name":"火雞羽毛頭飾","price":45,"limit":1,"kind":"gear","emoji":"🪶"},
           {"item":"chest_star","name":"星光寶箱","price":40,"limit":1,"kind":"item","emoji":"🌟"},
           {"item":"gacha_coin","name":"扭蛋幣","price":8,"limit":5,"kind":"item","emoji":"🪙"},
           {"item":"scratch_card","name":"刮刮樂","price":5,"limit":5,"kind":"item","emoji":"🎫"}]},
  {"id":"xmas","name":"星夜聖誕","emoji":"🎄","start":"2026-12-18","end":"2026-12-28","shop_end":"2026-12-30",
   "currency":"stocking","cur_name":"聖誕襪","cur_emoji":"🧦","desc":"雪地裡的小精靈偷走了禮物！把牠們抓回來，收集聖誕襪換禮物。",
   "mobs":{"snow_sprite":{"name":"雪球精靈","emoji":"❄️","cur":1,"w":0.62},"ginger_soldier":{"name":"薑餅小兵","emoji":"🍪","cur":2,"w":0.3},
           "reindeer":{"name":"迷路麋鹿","emoji":"🦌","cur":5,"w":0.08,"bonus":{"gacha_coin":1}},
           "king":{"name":"聖誕老人","emoji":"🎅","cur":12,"bonus":{"chest_star":1}}},
   "king_day":"2026-12-25","king_note":"12/25 聖誕節簽到",
   "shop":[{"item":"frame_snowflake","name":"雪花頭像框","price":30,"limit":1,"kind":"frame","emoji":"❄️"},
           {"item":"santa_hat","name":"聖誕帽","price":50,"limit":1,"kind":"gear","emoji":"🎅"},
           {"item":"reindeer_cloak","name":"麋鹿披風","price":60,"limit":1,"kind":"gear","emoji":"🦌"},
           {"item":"chest_star","name":"星光寶箱","price":40,"limit":1,"kind":"item","emoji":"🌟"},
           {"item":"gacha_coin","name":"扭蛋幣","price":8,"limit":5,"kind":"item","emoji":"🪙"},
           {"item":"scratch_card","name":"刮刮樂","price":5,"limit":5,"kind":"item","emoji":"🎫"}]},
  {"id":"newyear","name":"跨年倒數","emoji":"🎆","start":"2026-12-31","end":"2027-01-03","shop_end":"2027-01-04",
   "currency":"firework","cur_name":"煙火","cur_emoji":"🎇","desc":"倒數 3、2、1！今年做到的每件事，都會變成夜空裡的煙火。",
   "mobs":{"spark":{"name":"煙火精靈","emoji":"🎇","cur":1,"w":0.7},"clock":{"name":"倒數時鐘","emoji":"⏰","cur":3,"w":0.3},
           "king":{"name":"新年鐘聲","emoji":"🔔","cur":15,"bonus":{"ticket_normal":1}}},
   "king_day":"2027-01-01","king_note":"1/1 元旦簽到",
   "shop":[{"item":"frame_firework","name":"煙火頭像框","price":30,"limit":1,"kind":"frame","emoji":"🎆"},
           {"item":"ticket_normal","name":"普通召喚券","price":12,"limit":3,"kind":"item","emoji":"🎫"},
           {"item":"chest_star","name":"星光寶箱","price":25,"limit":1,"kind":"item","emoji":"🌟"},
           {"item":"gacha_coin","name":"扭蛋幣","price":6,"limit":5,"kind":"item","emoji":"🪙"}]},
  {"id":"spring","name":"春節廟會","emoji":"🧧","start":"2027-02-01","end":"2027-02-14","shop_end":"2027-02-16",
   "currency":"red_envelope","cur_name":"紅包","cur_emoji":"🧧","desc":"廟會開張！趕走搗蛋的小年獸，收集紅包換新年好禮。",
   "mobs":{"nian_kid":{"name":"小年獸","emoji":"🐲","cur":1,"w":0.62},"lion":{"name":"舞獅","emoji":"🦁","cur":2,"w":0.3},
           "caishen":{"name":"財神爺","emoji":"💰","cur":5,"w":0.08,"bonus":{"gacha_coin":1}},
           "king":{"name":"年獸王","emoji":"👹","cur":15,"bonus":{"chest_gold":1}}},
   "king_day":"2027-02-06","king_note":"2/6 大年初一簽到",
   "shop":[{"item":"frame_couplet","name":"春聯頭像框","price":30,"limit":1,"kind":"frame","emoji":"🧧"},
           {"item":"dragon_spear","name":"舞龍長槍","price":55,"limit":1,"kind":"gear","emoji":"🐉"},
           {"item":"fortune_robe","name":"福氣錦袍","price":55,"limit":1,"kind":"gear","emoji":"🧥"},
           {"item":"chest_star","name":"星光寶箱","price":40,"limit":1,"kind":"item","emoji":"🌟"},
           {"item":"gacha_coin","name":"扭蛋幣","price":8,"limit":5,"kind":"item","emoji":"🪙"},
           {"item":"scratch_card","name":"刮刮樂","price":5,"limit":5,"kind":"item","emoji":"🎫"}]}
  ]$json$::jsonb
$$;
grant execute on function public.ev_catalog() to authenticated;

-- 活動裝備（pool = event，召喚抽不到，只能用活動貨幣換）
do $do$ begin
  if to_regprocedure('public.rpg_catalog_v3()') is null then
    alter function public.rpg_catalog() rename to rpg_catalog_v3;
  end if;
end $do$;
create or replace function public.rpg_catalog()
returns jsonb language sql immutable as $function$
  select c || jsonb_build_object('gear', (c->'gear') || $json${
    "scarecrow_hat":  {"name":"稻草人帽","slot":"accessory","tier":"x","pool":"event","event":"harvest","emoji":"👒","stat":{"vit":10,"wil":10,"str":4}},
    "maple_bow":      {"name":"楓羽長弓","slot":"weapon","tier":"x","pool":"event","event":"harvest","emoji":"🏹","stat":{"str":14,"int":8}},
    "turkey_feather": {"name":"火雞羽毛頭飾","slot":"accessory","tier":"x","pool":"event","event":"thanks","emoji":"🪶","stat":{"wil":12,"vit":8}},
    "santa_hat":      {"name":"聖誕帽","slot":"accessory","tier":"x","pool":"event","event":"xmas","emoji":"🎅","stat":{"int":10,"wil":10,"vit":4}},
    "reindeer_cloak": {"name":"麋鹿披風","slot":"armor","tier":"x","pool":"event","event":"xmas","emoji":"🦌","stat":{"vit":14,"wil":10}},
    "dragon_spear":   {"name":"舞龍長槍","slot":"weapon","tier":"x","pool":"event","event":"spring","emoji":"🐉","stat":{"str":16,"vit":8}},
    "fortune_robe":   {"name":"福氣錦袍","slot":"armor","tier":"x","pool":"event","event":"spring","emoji":"🧥","stat":{"vit":12,"int":12}}
  }$json$::jsonb)
  from (select public.rpg_catalog_v3() c) b;
$function$;
grant execute on function public.rpg_catalog() to authenticated;

-- 現在的活動：進行中，或商店還開著的那一個
create or replace function public.ev_current()
returns jsonb language sql stable as $$
  select e from jsonb_array_elements(public.ev_catalog()) e
  where public.app_today() between (e->>'start')::date and (e->>'shop_end')::date and not coalesce((e->>'sale')::boolean, false)
  order by (e->>'start')::date limit 1
$$;

-- 只開一天的流浪商人（可以跟其他活動同時）
create or replace function public.ev_sale()
returns jsonb language sql stable as $$
  select e from jsonb_array_elements(public.ev_catalog()) e
  where coalesce((e->>'sale')::boolean, false) and public.app_today() between (e->>'start')::date and (e->>'shop_end')::date limit 1
$$;

create or replace function public.ev_roll(p_ev jsonb, p_src text)
returns text language plpgsql immutable as $$
declare x numeric := (abs(hashtext('evmob:' || p_src)) % 10000) / 10000.0; acc numeric := 0; k text; v jsonb;
begin
  for k, v in select key, value from jsonb_each(p_ev->'mobs') where key <> 'king' order by (value->>'w')::numeric desc loop
    acc := acc + coalesce((v->>'w')::numeric, 0);
    if x < acc then return k; end if;
  end loop;
  return (select key from jsonb_each(p_ev->'mobs') where key <> 'king' limit 1);
end;
$$;

create or replace function public.ev_spawn(p_user uuid, ev jsonb)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_id text := ev->>'id';
  v_start date := (ev->>'start')::date;
  v_end date := (ev->>'end')::date;
  t record;
begin
  if ev is null or coalesce((ev->>'sale')::boolean, false) or public.app_today() > v_end then return; end if;
  -- 完成任務：40%
  for t in select id from public.tasks
           where user_id = p_user and completed
             and ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date between v_start and v_end loop
    if (abs(hashtext(v_id || '-task:' || t.id)) % 10000) / 10000.0 < 0.4 then
      insert into public.ev_mobs (user_id, event, kind, source) values (p_user, v_id, public.ev_roll(ev, v_id || 'task:' || t.id), 'task:' || t.id)
        on conflict do nothing;
    end if;
  end loop;
  -- 專注 25 分鐘以上：一定
  for t in select id from public.focus_sessions
           where user_id = p_user and not coalesce(is_manual, false) and duration_seconds >= 1500
             and session_date between v_start and v_end loop
    insert into public.ev_mobs (user_id, event, kind, source) values (p_user, v_id, public.ev_roll(ev, v_id || 'focus:' || t.id), 'focus:' || t.id)
      on conflict do nothing;
  end loop;
  -- 每週王出擊：30%
  begin
    for t in select id from public.rpg_boss_hits where user_id = p_user and hit_day between v_start and v_end loop
      if (abs(hashtext(v_id || '-hit:' || t.id)) % 10000) / 10000.0 < 0.3 then
        insert into public.ev_mobs (user_id, event, kind, source) values (p_user, v_id, public.ev_roll(ev, v_id || 'hit:' || t.id), 'hit:' || t.id)
          on conflict do nothing;
      end if;
    end loop;
  exception when others then null;
  end;
  -- 感謝週：幫好友加油，每次一定遇到
  if coalesce((ev->>'cheer')::boolean, false) then
    begin
      for t in select to_user, day from public.cheers where from_user = p_user and day between v_start and v_end loop
        insert into public.ev_mobs (user_id, event, kind, source) values (p_user, v_id, public.ev_roll(ev, v_id || 'cheer:' || t.to_user || t.day), 'cheer:' || t.to_user || ':' || t.day)
          on conflict do nothing;
      end loop;
    exception when others then null;
    end;
  end if;
  -- 特別的日子簽到：大王
  if ev ? 'king_day' and exists (select 1 from public.checkins where user_id = p_user and checkin_date = (ev->>'king_day')::date) then
    insert into public.ev_mobs (user_id, event, kind, source) values (p_user, v_id, 'king', 'king-day') on conflict do nothing;
  end if;
end;
$function$;
revoke all on function public.ev_spawn(uuid, jsonb) from public, anon, authenticated;

-- 過期的活動貨幣換星屑（1 個 = 2 星屑）
create or replace function public.ev_settle(p_user uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare e jsonb; q integer; out jsonb := '[]'::jsonb;
begin
  for e in select x from jsonb_array_elements(public.ev_catalog()) x
           where public.app_today() > (x->>'shop_end')::date and x->>'currency' <> 'gold' loop
    q := public.fun_qty(p_user, e->>'currency');
    if q > 0 then
      perform public.fun_take(p_user, e->>'currency', q, 'ev-settle:' || (e->>'id'));
      perform public.grant_item(p_user, 'stardust', q * 2, 'ev-settle-dust:' || (e->>'id'));
      out := out || jsonb_build_object('event', e->>'name', 'n', q, 'stardust', q * 2);
    end if;
  end loop;
  return out;
end;
$function$;
revoke all on function public.ev_settle(uuid) from public, anon, authenticated;

create or replace function public.ev_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); ev jsonb := public.ev_current(); settled jsonb; nxt jsonb; v_id text; sale jsonb := public.ev_sale(); sj jsonb := null;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  settled := public.ev_settle(v_user);
  select x into nxt from jsonb_array_elements(public.ev_catalog()) x where (x->>'start')::date > public.app_today() order by (x->>'start')::date limit 1;
  if sale is not null then
    sj := jsonb_build_object('event', sale, 'cur', (select coalesce(gold, 0) from public.profiles where id = v_user),
      'bought', coalesce((select jsonb_object_agg(item, n) from (
        select split_part(source_key, ':', 3) item, count(*) n from public.item_events
        where user_id = v_user and source_key like 'ev-buy:' || (sale->>'id') || ':%' and delta < 0 group by 1) x), '{}'::jsonb));
  end if;
  if ev is null then
    return json_build_object('event', null, 'next', nxt, 'settled', settled, 'today', public.app_today(), 'sale', sj);
  end if;
  v_id := ev->>'id';
  perform public.ev_spawn(v_user, ev);
  return json_build_object(
    'event', ev, 'next', nxt, 'settled', settled, 'today', public.app_today(), 'sale', sj,
    'active', public.app_today() between (ev->>'start')::date and (ev->>'end')::date,
    'cur', case when ev->>'currency' = 'gold' then (select coalesce(gold, 0) from public.profiles where id = v_user) else public.fun_qty(v_user, ev->>'currency') end,
    'waiting', coalesce((select json_agg(json_build_object('id', id, 'kind', kind) order by id)
                         from public.ev_mobs where user_id = v_user and event = v_id and caught_at is null), '[]'::json),
    'caught', coalesce((select json_object_agg(kind, n) from (
                         select kind, count(*) n from public.ev_mobs where user_id = v_user and event = v_id and caught_at is not null group by kind) x), '{}'::json),
    'bought', coalesce((select json_object_agg(item, n) from (
                         select split_part(source_key, ':', 3) item, count(*) n from public.item_events
                         where user_id = v_user and source_key like 'ev-buy:' || v_id || ':%' and delta < 0 group by 1) x), '{}'::json));
end;
$function$;
revoke all on function public.ev_status() from public, anon;
grant execute on function public.ev_status() to authenticated;

create or replace function public.ev_catch(p_id bigint default null)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid(); ev jsonb := public.ev_current(); g record; m jsonb; v_cur integer := 0;
  v_bonus jsonb := '{}'::jsonb; v_list jsonb := '[]'::jsonb; k text; v integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if ev is null then raise exception '現在沒有活動'; end if;
  for g in select * from public.ev_mobs where user_id = v_user and event = ev->>'id' and caught_at is null and (p_id is null or id = p_id) for update loop
    m := ev->'mobs'->g.kind;
    update public.ev_mobs set caught_at = now() where id = g.id;
    v_cur := v_cur + (m->>'cur')::int;
    perform public.grant_item(v_user, ev->>'currency', (m->>'cur')::int, 'ev-catch:' || g.id);
    if m ? 'bonus' then
      perform public.fun_give(v_user, m->'bonus', 'ev-bonus:' || g.id);
      for k, v in select key, value::int from jsonb_each_text(m->'bonus') loop
        v_bonus := v_bonus || jsonb_build_object(k, coalesce((v_bonus->>k)::int, 0) + v);
      end loop;
    end if;
    v_list := v_list || jsonb_build_object('id', g.id, 'kind', g.kind);
  end loop;
  return json_build_object('success', true, 'cur', v_cur, 'bonus', v_bonus, 'caught', v_list);
end;
$function$;
revoke all on function public.ev_catch(bigint) from public, anon;
grant execute on function public.ev_catch(bigint) to authenticated;

drop function if exists public.ev_buy(text);
create or replace function public.ev_buy(p_item text, p_event text default null)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid(); ev jsonb := case when p_event is not null and p_event = (public.ev_sale()->>'id') then public.ev_sale() else public.ev_current() end; o jsonb; v_n integer; v_lv integer;
  v_id text := gen_random_uuid()::text; v_gold integer; v_src text;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if ev is null then raise exception '商店已經關了'; end if;
  select x into o from jsonb_array_elements(ev->'shop') x where x->>'item' = p_item;
  if o is null then raise exception '沒有這個東西'; end if;
  select count(*) into v_n from public.item_events where user_id = v_user and delta < 0 and source_key like 'ev-buy:' || (ev->>'id') || ':' || p_item || ':%';
  if v_n >= (o->>'limit')::int then raise exception '這個已經換到上限了'; end if;
  v_src := 'ev-buy:' || (ev->>'id') || ':' || p_item || ':' || v_id;

  if ev->>'currency' = 'gold' then
    select gold into v_gold from public.profiles where id = v_user for update;
    if coalesce(v_gold, 0) < (o->>'price')::int then raise exception '金幣不夠'; end if;
    update public.profiles set gold = gold - (o->>'price')::int, updated_at = now() where id = v_user;
    -- 用一筆 0 數量的紀錄記住買了幾次
    insert into public.item_events (user_id, item_key, delta, source_key) values (v_user, 'gold', -(o->>'price')::int, v_src);
  else
    perform public.fun_take(v_user, ev->>'currency', (o->>'price')::int, v_src);
  end if;

  if o->>'kind' = 'frame' then
    perform public.fun_frame_grant(v_user, p_item);
  elsif o->>'kind' = 'gear' then
    select level into v_lv from public.rpg_gear where user_id = v_user and gear_key = p_item for update;
    if v_lv is null then insert into public.rpg_gear (user_id, gear_key) values (v_user, p_item);
    elsif v_lv < 5 then update public.rpg_gear set level = level + 1 where user_id = v_user and gear_key = p_item;
    end if;
  else
    perform public.grant_item(v_user, p_item, 1, 'ev-get:' || v_id);
  end if;
  return json_build_object('success', true, 'item', p_item);
end;
$function$;
revoke all on function public.ev_buy(text, text) from public, anon;
grant execute on function public.ev_buy(text, text) to authenticated;
