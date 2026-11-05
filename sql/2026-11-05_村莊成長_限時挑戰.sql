-- =========================================================
-- 序光計畫：🏘️ 村莊會長大、⏱️ 任務限時挑戰
-- 要先跑過「2026-11-05_明日卡_村民_明信片_扭蛋.sql」。可以重複執行。
--
--   🏘️ 村莊經驗 = 完成委託 ×10 ＋ 累積專注小時 ×2 ＋ 完成任務 ×1 ＋ 生活打卡 ×1
--      升級會蓋新建築；Lv4、Lv6、Lv8 各搬來一位新村民（會開始出委託）
--   ⏱️ 任務旁按「限時」自己訂時間，時限內完成拿額外星屑，超時也有一點點
-- =========================================================

-- 🏘️ 新村民：原本的 village_defs 改名成 base，新的版本 = base ＋ 新村民
do $$ begin
  if to_regprocedure('public.village_defs_base()') is null then alter function public.village_defs() rename to village_defs_base; end if;
end $$;
revoke all on function public.village_defs_base() from public, anon, authenticated;

create or replace function public.village_defs()
returns jsonb language sql immutable as $$ select public.village_defs_base() || $j${
 "barista": {"name":"咖啡館的阿默","emoji":"☕","job":"新開咖啡館的老闆","unlock":4,
   "quests":[{"k":"deep","text":"我的店最適合讀書了！今天專注滿 1 小時，我請你一杯拿鐵。","check":"focus60"},
             {"k":"slow","text":"今天找 10 分鐘，什麼都不做，好好喝一杯飲料，看看窗外。","check":"self"},
             {"k":"plan","text":"睡前把明天的行程確認一下吧，明天早上就不會手忙腳亂。","check":"plan"}],
   "story":["阿默以前是工程師，有一天加班到凌晨，決定辭職開一間咖啡館。","他說咖啡館最棒的時刻，是看到有人在角落專心讀書，好像整個世界都安靜下來。","阿默在牆上掛了一塊小黑板，寫著每位常客的名字，你的名字也在上面。","阿默研發了一款新飲料，取名叫「專注特調」，說靈感來自你。"],
   "gift":[{"stardust":80},{"gacha_coin":3},{"wish_rare":1},{"chest_star":1}]},
 "astronomer": {"name":"天文台的星野","emoji":"🔭","job":"天文台的研究員","unlock":6,
   "quests":[{"k":"night","text":"今晚的星空很清楚！早點把事情做完，晚上抬頭看看天空。","check":"self"},
             {"k":"focus","text":"觀測需要耐心。今天專注 30 分鐘，跟我一樣不分心。","check":"focus30"},
             {"k":"three","text":"星星要一顆一顆數。今天完成 3 個任務，一步一步來。","check":"task3"}],
   "story":["星野從小就想當太空人，後來發現自己會暈車，就改當天文學家。","她說每一顆星星的光，都是很久很久以前出發的，現在才抵達我們眼前。","星野用你的名字幫一顆小行星取了暱稱，雖然是非官方的。","星野說：「努力就像星光，現在看不到，總有一天會抵達。」"],
   "gift":[{"stardust":100},{"wish_rare":1},{"ticket_special":1},{"wish_limited":1}]},
 "musician": {"name":"街頭樂手小澄","emoji":"🎸","job":"廣場的街頭樂手","unlock":8,
   "quests":[{"k":"music","text":"今天專注的時候放點音樂吧！白噪音電台也可以。專注 25 分鐘。","check":"focus25"},
             {"k":"stretch","text":"坐太久了！跟著我的節奏，起來伸展 5 分鐘。","check":"self"},
             {"k":"tidy","text":"表演前我都會整理舞台。今天把你的房間整理一下吧。","check":"life_room"}],
   "story":["小澄每天傍晚都在噴水池旁邊彈吉他，說這是村莊最好的舞台。","她坦白說自己其實很怕上台，第一次表演時手一直抖。","小澄寫了一首新歌，副歌唱的是一個每天努力的人。","小澄在祭典上邀請你上台，說這首歌是寫給你的。"],
   "gift":[{"stardust":120},{"gacha_coin":5},{"chest_star":1},{"ticket_limited":1}]}
}$j$::jsonb $$;
revoke all on function public.village_defs() from public, anon;
grant execute on function public.village_defs() to authenticated;

create or replace function public.village_buildings() returns jsonb language sql immutable as $$ select '[
 {"lv":1,"k":"square","emoji":"⛲","name":"小廣場","desc":"村莊一開始只有一座小噴水池。"},
 {"lv":2,"k":"oven","emoji":"🥖","name":"麵包店的石窯","desc":"莉莉的麵包店擴建，蓋了一座新的石窯。"},
 {"lv":3,"k":"library2","emoji":"📚","name":"圖書館二樓","desc":"圖書館加蓋二樓，多了一間安靜的自習室。"},
 {"lv":4,"k":"cafe","emoji":"☕","name":"咖啡館","desc":"新村民阿默開了一間咖啡館。"},
 {"lv":5,"k":"greenhouse","emoji":"🌷","name":"花店溫室","desc":"小雛的花店多了一間玻璃溫室，冬天也有花。"},
 {"lv":6,"k":"observatory","emoji":"🔭","name":"天文台","desc":"山丘上蓋了天文台，星野搬來了。"},
 {"lv":7,"k":"lighthouse","emoji":"🗼","name":"港口燈塔","desc":"湯姆爺爺的港口點亮了燈塔。"},
 {"lv":8,"k":"stage","emoji":"🎸","name":"廣場舞台","desc":"噴水池旁搭起舞台，街頭樂手小澄來了。"},
 {"lv":9,"k":"school","emoji":"🏫","name":"村莊小學","desc":"阿布終於有自己的新教室了。"},
 {"lv":10,"k":"festival","emoji":"🎆","name":"星光祭典","desc":"村莊變成小鎮，每晚都有祭典的燈火。"}]'::jsonb $$;

create or replace function public.village_level(u uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare xp integer; th integer[] := array[0, 60, 150, 300, 500, 800, 1200, 1700, 2400, 3200]; lv integer := 1; qd integer; fh integer; td integer; ld integer;
begin
  select count(*) into qd from public.village_quests where user_id = u and done_at is not null;
  select coalesce(sum(duration_seconds), 0) / 3600 into fh from public.focus_sessions where user_id = u;
  select count(*) into td from public.tasks where user_id = u and completed;
  select count(*) into ld from public.project_step_logs where user_id = u and done;
  xp := qd * 10 + fh * 2 + td + ld;
  while lv < 10 and xp >= th[lv + 1] loop lv := lv + 1; end loop;
  return jsonb_build_object('lv', lv, 'xp', xp, 'cur', th[lv], 'next', case when lv < 10 then th[lv + 1] end,
    'parts', jsonb_build_object('quests', qd, 'focus_h', fh, 'tasks', td, 'life', ld));
end; $$;
revoke all on function public.village_level(uuid) from public, anon, authenticated;

-- 只從已經搬來的村民出委託
create or replace function public.village_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); t date := public.app_today(); defs jsonb := public.village_defs(); vs text[]; s integer; v text; q jsonb; h integer; vl jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  vl := public.village_level(u);
  select array_agg(k order by k) into vs from jsonb_object_keys(defs) k where coalesce((defs->k->>'unlock')::int, 1) <= (vl->>'lv')::int;
  if not exists (select 1 from public.village_quests where user_id = u and day = t) then
    h := abs(hashtext(u::text || ':village:' || t));
    for s in 1..2 loop
      v := vs[1 + (h / (s * 7)) % array_length(vs, 1)];
      if s = 2 and v = (select villager from public.village_quests where user_id = u and day = t and slot = 1) then v := vs[1 + ((h / 7) + 1) % array_length(vs, 1)]; end if;
      q := defs->v->'quests'->((h / (s * 13)) % jsonb_array_length(defs->v->'quests'));
      insert into public.village_quests (user_id, day, slot, villager, quest) values (u, t, s, v, q->>'k') on conflict do nothing;
    end loop;
  end if;
  return json_build_object('day', t, 'defs', defs, 'town', vl, 'buildings', public.village_buildings(),
    'quests', (select json_agg(json_build_object('slot', vq.slot, 'villager', vq.villager, 'quest', vq.quest, 'done', vq.done_at is not null,
                 'check', (select e->>'check' from jsonb_array_elements(defs->vq.villager->'quests') e where e->>'k' = vq.quest),
                 'ready', public.village_check(u, (select e->>'check' from jsonb_array_elements(defs->vq.villager->'quests') e where e->>'k' = vq.quest), t)) order by vq.slot)
               from public.village_quests vq where vq.user_id = u and vq.day = t),
    'aff', coalesce((select json_object_agg(villager, aff) from public.village_aff where user_id = u), '{}'::json));
end; $$;
revoke all on function public.village_status() from public, anon;
grant execute on function public.village_status() to authenticated;

-- 村莊升級禮物（每升一級一次）
create or replace function public.village_levelup_claim()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); vl jsonb; got integer[] := '{}'; i integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  vl := public.village_level(u);
  for i in 2..(vl->>'lv')::int loop
    if public.grant_item(u, 'stardust', 50 * i, 'villagelv:' || i) then
      if i % 3 = 0 then perform public.grant_item(u, 'chest_star', 1, 'villagelvc:' || i); end if;
      got := got || i;
    end if;
  end loop;
  return json_build_object('levels', got, 'town', vl);
end; $$;
revoke all on function public.village_levelup_claim() from public, anon;
grant execute on function public.village_levelup_claim() to authenticated;


-- ⏱️ 任務限時挑戰 ------------------------------------------------
create table if not exists public.task_challenges (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id bigint not null,
  minutes integer not null check (minutes between 5 and 240),
  started_at timestamptz not null default now(),
  deadline timestamptz not null,
  finished_at timestamptz,
  success boolean,
  cancelled boolean not null default false
);
create index if not exists task_challenges_user on public.task_challenges (user_id, finished_at);
alter table public.task_challenges enable row level security;
drop policy if exists "own select" on public.task_challenges;
create policy "own select" on public.task_challenges for select using (auth.uid() = user_id);
revoke insert, update, delete on public.task_challenges from authenticated, anon;

create or replace function public.challenge_list()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid();
begin
  return json_build_object('now', now(),
    'active', coalesce((select json_agg(json_build_object('task_id', task_id, 'minutes', minutes, 'started_at', started_at, 'deadline', deadline))
      from public.task_challenges where user_id = u and finished_at is null and not cancelled and started_at > now() - interval '1 day'), '[]'),
    'wins', (select count(*) from public.task_challenges where user_id = u and success),
    'tries', (select count(*) from public.task_challenges where user_id = u and finished_at is not null));
end; $$;

create or replace function public.challenge_start(p_task_id bigint, p_minutes integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '尚未登入'; end if;
  if not exists (select 1 from public.tasks where id = p_task_id and user_id = u and not completed) then raise exception '找不到這個任務，或已經完成了'; end if;
  if p_minutes not between 5 and 240 then raise exception '時間要在 5～240 分鐘之間'; end if;
  update public.task_challenges set cancelled = true where user_id = u and task_id = p_task_id and finished_at is null and not cancelled;
  insert into public.task_challenges (user_id, task_id, minutes, deadline) values (u, p_task_id, p_minutes, now() + make_interval(mins => p_minutes));
  return public.challenge_list();
end; $$;

create or replace function public.challenge_cancel(p_task_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  update public.task_challenges set cancelled = true where user_id = auth.uid() and task_id = p_task_id and finished_at is null and not cancelled;
  return public.challenge_list();
end; $$;

-- 任務打勾後呼叫：時限內 → 星屑 15＋每 10 分鐘 +5（最多 60），30 分鐘以上再送扭蛋幣；超時 → 星屑 5
create or replace function public.challenge_finish(p_task_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); c public.task_challenges; ok boolean; sd integer; left_s integer;
begin
  select * into c from public.task_challenges where user_id = u and task_id = p_task_id and finished_at is null and not cancelled order by id desc limit 1 for update;
  if not found then return json_build_object('had', false); end if;
  if not exists (select 1 from public.tasks where id = p_task_id and user_id = u and completed) then return json_build_object('had', false); end if;
  ok := now() <= c.deadline;
  left_s := extract(epoch from c.deadline - now())::int;
  sd := case when ok then least(15 + (c.minutes / 10) * 5, 60) else 5 end;
  update public.task_challenges set finished_at = now(), success = ok where id = c.id;
  perform public.grant_item(u, 'stardust', sd, 'chal:' || c.id);
  if ok and c.minutes >= 30 then perform public.grant_item(u, 'gacha_coin', 1, 'chalc:' || c.id); end if;
  return json_build_object('had', true, 'ok', ok, 'stardust', sd, 'coin', ok and c.minutes >= 30, 'left', left_s, 'minutes', c.minutes,
    'used', extract(epoch from now() - c.started_at)::int,
    'wins', (select count(*) from public.task_challenges where user_id = u and success));
end; $$;

do $$ declare f text; begin
  foreach f in array array['challenge_list()', 'challenge_start(bigint,integer)', 'challenge_cancel(bigint)', 'challenge_finish(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
