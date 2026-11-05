-- =========================================================
-- 序光計畫：📜 季節劇情（村莊每一季的主線）
-- 要先跑過「2026-11-05_村莊成長_限時挑戰.sql」。可以重複執行。
--
--   春 3–5 月 花見祭、夏 6–8 月 夏夜煙火祭、秋 9–11 月 豐收祭、冬 12–2 月 星光燈祭
--   這一季的材料 = 專注每 30 分鐘 1 個 ＋ 完成委託 2 個 ＋ 每完成 3 個任務 1 個
--   材料夠了就解鎖下一章；第 5 章「祭典」要季末最後 7 天才會舉行
-- =========================================================

create or replace function public.season_defs() returns jsonb language sql immutable as $$ select $j${
 "spring": {"name":"花見祭","emoji":"🌸","mat":"花種","mat_emoji":"🌱","color":"#ff9ec7",
   "chapters":[
     {"need":20,"title":"春天的來信","text":"小雛收到一封信：今年村莊被選為「花見祭」的舉辦地！可是廣場光禿禿的，一朵花也沒有。她拜託你幫忙收集花種。"},
     {"need":50,"title":"第一排花苗","text":"你帶來的花種種滿了廣場邊緣。阿布每天放學都跑來澆水，還幫每株花取了名字。"},
     {"need":90,"title":"莉莉的櫻花麵包","text":"莉莉說祭典一定要有限定麵包。她用花瓣做出粉紅色的櫻花麵包，第一個請你試吃。"},
     {"need":140,"title":"花開的前一晚","text":"所有花苞都鼓起來了。湯姆爺爺說，明天早上推開窗，整個村莊會變成粉紅色。"},
     {"need":200,"title":"🌸 花見祭","text":"花見祭開始了！全村坐在花樹下野餐，小雛把第一束花送給你：「這個春天是你種出來的。」","festival":true}]},
 "summer": {"name":"夏夜煙火祭","emoji":"🎆","mat":"火藥星","mat_emoji":"✨","color":"#ffb347",
   "chapters":[
     {"need":20,"title":"消失的煙火師","text":"每年夏天幫村莊放煙火的老師傅退休了。阿布哭著說今年看不到煙火了，你決定幫忙收集做煙火的火藥星。"},
     {"need":50,"title":"天文台的計算","text":"星野幫忙計算煙火要飛多高才不會打到燈塔。她說：「只要材料夠，我們自己做得出來。」"},
     {"need":90,"title":"試射","text":"第一發試射只冒出一點小火花，大家笑成一團。湯姆爺爺說：「第一次出海也是這樣。」"},
     {"need":140,"title":"夏夜的約定","text":"所有煙火都準備好了。小澄寫了一首歌，說要在煙火升空時唱。"},
     {"need":200,"title":"🎆 夏夜煙火祭","text":"夜空炸開一朵又一朵煙火，全村一起倒數。阿布說：「這是我看過最漂亮的一次！」","festival":true}]},
 "autumn": {"name":"豐收祭","emoji":"🌾","mat":"麥穗","mat_emoji":"🌾","color":"#e0a84b",
   "chapters":[
     {"need":20,"title":"空空的穀倉","text":"秋天到了，可是今年的穀倉幾乎是空的。村長說如果收不到足夠的麥穗，豐收祭就要取消了。"},
     {"need":50,"title":"一起割麥","text":"你帶著大家到田裡割麥。阿默送來一壺熱咖啡，說是給「最認真的農夫」。"},
     {"need":90,"title":"莉莉的大麵包","text":"莉莉要烤一個全村一起吃的超大麵包，她說麵粉全部要用你收來的麥子磨。"},
     {"need":140,"title":"豐收的燈籠","text":"廣場掛滿了南瓜燈籠。湯姆爺爺講起年輕時在異國港口看過的豐收節。"},
     {"need":200,"title":"🌾 豐收祭","text":"豐收祭開始了！長桌擺滿食物，全村舉杯感謝這一季的努力，第一杯敬給你。","festival":true}]},
 "winter": {"name":"星光燈祭","emoji":"🏮","mat":"燈芯","mat_emoji":"🕯️","color":"#8fb8ff",
   "chapters":[
     {"need":20,"title":"最長的夜","text":"冬天的夜晚好長，村莊暗得看不見路。圖書館員說古書上記載，以前每年冬至都會舉行「星光燈祭」。"},
     {"need":50,"title":"燈籠工坊","text":"大家在咖啡館裡做燈籠，你收來的燈芯一根一根被裝進去。阿布的燈籠歪歪的，但他很得意。"},
     {"need":90,"title":"天文台的星圖","text":"星野說要把燈籠排成冬季星座的形狀，從天文台往下看，村莊就是一片星空。"},
     {"need":140,"title":"點燈前夕","text":"上千盞燈籠排好了。小澄在雪地裡練習新歌，手凍得通紅還是笑著。"},
     {"need":200,"title":"🏮 星光燈祭","text":"燈一盞一盞亮起，整個村莊變成地上的銀河。湯姆爺爺說：「這下子，迷路的人都找得到回家的路了。」","festival":true}]}
}$j$::jsonb $$;

create or replace function public.season_now(d date)
returns jsonb language sql immutable as $$
  select jsonb_build_object('key', k, 'start', s, 'end', (s + interval '3 months - 1 day')::date, 'id', k || '-' || extract(year from s)::int)
  from (select case when extract(month from d) in (3,4,5) then 'spring' when extract(month from d) in (6,7,8) then 'summer'
                    when extract(month from d) in (9,10,11) then 'autumn' else 'winter' end k,
               case when extract(month from d) in (1,2) then make_date(extract(year from d)::int - 1, 12, 1)
                    when extract(month from d) = 12 then make_date(extract(year from d)::int, 12, 1)
                    else make_date(extract(year from d)::int, ((extract(month from d)::int - 3) / 3) * 3 + 3, 1) end s) x
$$;

create or replace function public.season_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); sn jsonb := public.season_now(public.app_today()); def jsonb; s date; e date;
  fm integer; vq integer; td integer; mat integer; left_d integer; got jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  s := (sn->>'start')::date; e := (sn->>'end')::date; def := public.season_defs()->(sn->>'key');
  select coalesce(sum(duration_seconds), 0) / 60 into fm from public.focus_sessions where user_id = u and session_date between s and e;
  select count(*) into vq from public.village_quests where user_id = u and done_at is not null and day between s and e;
  select count(*) into td from public.tasks where user_id = u and completed and task_date between s and e;
  mat := fm / 30 + vq * 2 + td / 3;
  left_d := e - t;
  select coalesce(jsonb_agg(split_part(source_key, ':', 3)::int), '[]'::jsonb) into got
    from public.item_events where user_id = u and source_key like 'season:' || (sn->>'id') || ':%:stardust';
  return json_build_object('season', sn, 'def', def, 'mat', mat, 'days_left', left_d, 'claimed', got,
    'parts', json_build_object('focus_min', fm, 'quests', vq, 'tasks', td), 'festival_open', left_d <= 6);
end; $$;

-- 領章節獎勵：第 1～4 章 星屑 80／120／160／200；第 5 章祭典 星屑 300＋星光寶箱＋限定星願瓶
create or replace function public.season_claim(p_ch integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); st jsonb; ch jsonb; sid text;
begin
  st := public.season_status()::jsonb;
  if p_ch not between 1 and 5 then raise exception '沒有這一章'; end if;
  ch := st->'def'->'chapters'->(p_ch - 1);
  if (st->>'mat')::int < (ch->>'need')::int then raise exception '材料還不夠'; end if;
  if p_ch = 5 and not (st->>'festival_open')::boolean then raise exception '祭典要季末最後 7 天才舉行'; end if;
  sid := st->'season'->>'id';
  if public.grant_item(u, 'stardust', case p_ch when 5 then 300 else 40 + 40 * p_ch end, 'season:' || sid || ':' || p_ch || ':stardust') and p_ch = 5 then
    perform public.grant_item(u, 'chest_star', 1, 'season:' || sid || ':5:chest');
    perform public.grant_item(u, 'wish_limited', 1, 'season:' || sid || ':5:wish');
  end if;
  return public.season_status();
end; $$;

revoke all on function public.season_status() from public, anon;
grant execute on function public.season_status() to authenticated;
revoke all on function public.season_claim(integer) from public, anon;
grant execute on function public.season_claim(integer) to authenticated;
