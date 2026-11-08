-- =========================================================
-- 序光計畫：📚 今天學到什麼的延伸
--   🧒 費曼挑戰（用一句話講給阿布聽）  📚 村民來問問題（圖書館員每天問一則）
--   👾 怪物考官（忘 1 次小怪物、忘 3 次 Boss，Boss 要連續記得 3 次才打倒）
--   🌙 夢境回放（早上回想昨天學的）  ⚡ 隨機抽考  🎁 知識扭蛋（每複習 10 則一顆）
-- 可以重複執行。
-- =========================================================
alter table public.learn_notes add column if not exists explain text;
alter table public.learn_notes add column if not exists ok_streak integer not null default 0;
alter table public.learn_notes add column if not exists slain_at timestamptz;
alter table public.learn_notes add column if not exists villager_answer text;

create or replace function public.learn_review(p_id bigint, p_grade integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); n public.learn_notes; st integer; g integer[] := public.learn_gaps(); slain boolean := false; os integer;
begin
  select * into n from public.learn_notes where id = p_id and user_id = u for update;
  if not found then raise exception '找不到這則'; end if;
  st := case p_grade when 0 then 0 when 1 then n.stage else least(n.stage + 1, array_length(g, 1) - 1) end;
  os := case p_grade when 2 then n.ok_streak + 1 when 0 then 0 else n.ok_streak end;
  if n.lapses + (case when p_grade = 0 then 1 else 0 end) >= 3 and os >= 3 and n.slain_at is null then
    slain := true;
    perform public.grant_item(u, 'stardust', 50, 'learn-boss:' || p_id);
    perform public.grant_item(u, 'chest_gold', 1, 'learn-boss-c:' || p_id);
  end if;
  update public.learn_notes set stage = st, due = t + g[st + 1], reviews = reviews + 1, lapses = lapses + case when p_grade = 0 then 1 else 0 end,
    last_review = t, ok_streak = os, slain_at = case when slain then now() else slain_at end where id = p_id;
  if (select count(*) from public.learn_notes where user_id = u and last_review = t) = 5 then perform public.grant_item(u, 'stardust', 10, 'learn-rev:' || t); end if;
  return json_build_object('next_days', g[st + 1], 'stage', st, 'slain', slain, 'ok_streak', os);
end; $$;

create or replace function public.learn_explain(p_id bigint, p_text text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid();
begin
  update public.learn_notes set explain = left(btrim(p_text), 300) where id = p_id and user_id = u;
  perform public.grant_item(u, 'stardust', 5, 'feynman:' || p_id || ':' || public.app_today());
  return json_build_object('ok', true);
end; $$;

-- 📚 今天圖書館員想問哪一則（3 天以前寫的，每天固定一則）
create or replace function public.learn_villager_pick(u uuid) returns bigint language sql stable as $$
  select id from public.learn_notes where user_id = u and day <= public.app_today() - 3
  order by abs(hashtext(id::text || ':' || public.app_today())) limit 1 $$;

create or replace function public.learn_villager_answer(p_text text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); nid bigint := public.learn_villager_pick(auth.uid());
begin
  if nid is null then raise exception '今天沒有問題'; end if;
  if coalesce(btrim(p_text), '') = '' then raise exception '寫一點點也好'; end if;
  update public.learn_notes set villager_answer = left(btrim(p_text), 500) where id = nid and user_id = u;
  if public.grant_item(u, 'stardust', 10, 'learn-vq:' || t) then
    insert into public.village_aff (user_id, villager, aff) values (u, 'librarian', 1) on conflict (user_id, villager) do update set aff = public.village_aff.aff + 1;
  end if;
  return json_build_object('ok', true);
end; $$;

create or replace function public.learn_dream_claim()
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.grant_item(auth.uid(), 'stardust', 5, 'learn-dream:' || public.app_today());
  return json_build_object('ok', true);
end; $$;

-- ⚡ 隨機抽考：忘了就排回明天、從頭開始；記得只記一筆，不改排程
create or replace function public.learn_pop(p_id bigint, p_ok boolean)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today();
begin
  if not p_ok then
    update public.learn_notes set stage = 0, due = t + 1, lapses = lapses + 1, ok_streak = 0 where id = p_id and user_id = u;
  else
    perform public.grant_item(u, 'stardust', 5, 'learn-pop:' || t);
  end if;
  return json_build_object('ok', true);
end; $$;

-- 🎁 知識扭蛋：每複習 10 次一顆
create or replace function public.learn_capsule_open()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); total integer; opened integer; n record; r numeric := random(); k text; q integer;
begin
  select coalesce(sum(reviews), 0) / 10 into total from public.learn_notes where user_id = u;
  select count(*) into opened from public.item_events where user_id = u and source_key like 'kgacha:%';
  if opened >= total then raise exception '再複習幾則才有新的扭蛋'; end if;
  select id, subject, title, note, explain, day into n from public.learn_notes where user_id = u order by random() limit 1;
  select x.k, x.q into k, q from (values ('stardust', 15, 0.45), ('stardust', 30, 0.70), ('gacha_coin', 1, 0.92), ('wish_normal', 1, 1.0)) x(k, q, p) where r < x.p order by x.p limit 1;
  perform public.grant_item(u, k, q, 'kgacha:' || (opened + 1));
  return json_build_object('note', row_to_json(n), 'item', k, 'qty', q, 'left', total - opened - 1);
end; $$;

create or replace function public.learn_extra()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); vid bigint := public.learn_villager_pick(auth.uid());
begin
  if u is null then raise exception '尚未登入'; end if;
  return json_build_object(
    'villager', (select json_build_object('id', id, 'subject', subject, 'title', title, 'day', day, 'answered', exists (select 1 from public.item_events where user_id = u and source_key = 'learn-vq:' || t))
                 from public.learn_notes where id = vid),
    'monsters', coalesce((select json_agg(json_build_object('id', id, 'subject', subject, 'title', title, 'lapses', lapses, 'ok_streak', ok_streak, 'boss', lapses >= 3) order by lapses desc)
                 from public.learn_notes where user_id = u and lapses >= 1 and slain_at is null), '[]'),
    'slain', (select count(*) from public.learn_notes where user_id = u and slain_at is not null),
    'dream', coalesce((select json_agg(json_build_object('subject', subject, 'title', title, 'note', note) order by id) from public.learn_notes where user_id = u and day = t - 1), '[]'),
    'dream_done', exists (select 1 from public.item_events where user_id = u and source_key = 'learn-dream:' || t),
    'pop', (select json_build_object('id', id, 'subject', subject, 'title', title, 'note', note, 'day', day) from public.learn_notes
            where user_id = u and day <= t - 7 order by abs(hashtext(id::text || ':pop:' || t)) limit 1),
    'pop_hour', 10 + abs(hashtext(u::text || ':pophour:' || t)) % 12,
    'capsules', greatest(0, (select coalesce(sum(reviews), 0) / 10 from public.learn_notes where user_id = u) - (select count(*) from public.item_events where user_id = u and source_key like 'kgacha:%')),
    'capsule_progress', (select coalesce(sum(reviews), 0) % 10 from public.learn_notes where user_id = u));
end; $$;

do $$ declare f text; begin
  foreach f in array array['learn_review(bigint,integer)', 'learn_explain(bigint,text)', 'learn_villager_answer(text)', 'learn_dream_claim()', 'learn_pop(bigint,boolean)', 'learn_capsule_open()', 'learn_extra()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
