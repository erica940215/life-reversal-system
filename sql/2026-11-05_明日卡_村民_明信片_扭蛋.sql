-- =========================================================
-- 序光計畫：🌙 明日預覽卡、🏘️ 村民委託、📮 每週明信片、🎰 成就扭蛋機台
-- 要先跑過「2026-11-05_每週回顧和夢獸.sql」「2026-11-05_專注目標和小房間.sql」。可以重複執行。
-- =========================================================

-- ================= 🌙 明日預覽卡 ＋ ⭐ 明天最重要的一件事 =================
create table if not exists public.top_task (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  task_id bigint,
  title text not null check (char_length(title) between 1 and 120),
  done_at timestamptz,
  primary key (user_id, day)
);
alter table public.top_task enable row level security;
drop policy if exists "own select" on public.top_task;
create policy "own select" on public.top_task for select using (auth.uid() = user_id);
revoke insert, update, delete on public.top_task from authenticated, anon;

create or replace function public.tomorrow_preview()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today() + 1; ev text; def jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  ev := public.daily_event_pick(u, t);
  def := public.daily_event_defs()->ev;
  return json_build_object(
    'day', t, 'weekday', extract(isodow from t)::int,
    'tasks', coalesce((select json_agg(json_build_object('id', id, 'title', title, 'category', category, 'difficulty', difficulty) order by id)
        from public.tasks where user_id = u and task_date = t and not coalesce(skipped, false)), '[]'::json),
    'repeat', coalesce((select json_agg(json_build_object('title', title, 'category', category) order by id) from public.task_templates tt
        where tt.user_id = u and tt.repeat_enabled and (tt.repeat_end_date is null or tt.repeat_end_date >= t)
          and (tt.repeat_type = 'daily' or (tt.repeat_type = 'weekly' and extract(isodow from t)::int = any (tt.repeat_days)))
          and not exists (select 1 from public.tasks x where x.user_id = u and x.task_date = t and x.template_id = tt.id)), '[]'::json),
    'hint', case when ev = 'thief' then '明天好像有什麼東西在附近徘徊…早點開始專注比較安心'
                 when ev = 'quiet' then '明天看起來很平靜，適合好好休息'
                 when ev in ('traveler', 'together', 'marathon') then '明天好像會有人來找你…準備好多做一點事'
                 when ev in ('meteor', 'lucky', 'harvest') then '明天的運氣看起來很不錯 ✨'
                 else '明天好像有好事會發生…' end,
    'good', coalesce((def->>'good')::boolean, true),
    'top', (select json_build_object('task_id', task_id, 'title', title) from public.top_task where user_id = u and day = t));
end; $$;
revoke all on function public.tomorrow_preview() from public, anon;
grant execute on function public.tomorrow_preview() to authenticated;

create or replace function public.top_task_set(p_task_id bigint, p_title text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today() + 1; ti text := p_title;
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_task_id is not null then
    select title into ti from public.tasks where id = p_task_id and user_id = u;
    if ti is null then raise exception '找不到這個任務'; end if;
  end if;
  if coalesce(trim(ti), '') = '' then delete from public.top_task where user_id = u and day = t; return json_build_object('ok', true); end if;
  insert into public.top_task (user_id, day, task_id, title) values (u, t, p_task_id, left(trim(ti), 120))
    on conflict (user_id, day) do update set task_id = excluded.task_id, title = excluded.title, done_at = null;
  return json_build_object('ok', true);
end; $$;
revoke all on function public.top_task_set(bigint, text) from public, anon;
grant execute on function public.top_task_set(bigint, text) to authenticated;

-- 今天最重要的一件事（今日頁置頂）；完成了送星屑 20
create or replace function public.top_task_today()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); r public.top_task%rowtype; done boolean;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into r from public.top_task where user_id = u and day = t;
  if not found then return null; end if;
  done := r.done_at is not null or (r.task_id is not null and exists (select 1 from public.tasks where id = r.task_id and user_id = u and completed));
  if done and r.done_at is null then
    update public.top_task set done_at = now() where user_id = u and day = t;
    perform public.grant_item(u, 'stardust', 20, 'toptask:' || t);
  end if;
  return json_build_object('task_id', r.task_id, 'title', r.title, 'done', done);
end; $$;
revoke all on function public.top_task_today() from public, anon;
grant execute on function public.top_task_today() to authenticated;

create or replace function public.top_task_done()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today();
begin
  update public.top_task set done_at = coalesce(done_at, now()) where user_id = u and day = t and task_id is null;
  return public.top_task_today();
end; $$;
revoke all on function public.top_task_done() from public, anon;
grant execute on function public.top_task_done() to authenticated;


-- ================= 🏘️ 村民委託 =================
--   每天 2 個委託（照日期固定），完成 → 那位村民好感 +1、星屑 15
--   好感 3／7／15／30 → 解鎖一章故事＋禮物
create table if not exists public.village_quests (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  slot integer not null,
  villager text not null,
  quest text not null,
  done_at timestamptz,
  primary key (user_id, day, slot)
);
create table if not exists public.village_aff (
  user_id uuid not null references auth.users(id) on delete cascade,
  villager text not null,
  aff integer not null default 0,
  primary key (user_id, villager)
);
alter table public.village_quests enable row level security;
alter table public.village_aff enable row level security;
drop policy if exists "own select" on public.village_quests;
create policy "own select" on public.village_quests for select using (auth.uid() = user_id);
drop policy if exists "own select" on public.village_aff;
create policy "own select" on public.village_aff for select using (auth.uid() = user_id);
revoke insert, update, delete on public.village_quests, public.village_aff from authenticated, anon;

create or replace function public.village_defs()
returns jsonb language sql immutable as $$ select $j${
 "baker": {"name":"麵包店的莉莉","emoji":"🥖","job":"麵包店老闆",
   "quests":[{"k":"water","text":"最近大家都不喝水，烤爐旁邊熱得要命…今天幫我多喝 3 杯水好嗎？","check":"self"},
             {"k":"breakfast","text":"早餐是一天最重要的一餐！今天好好吃一頓早餐吧。","check":"self"},
             {"k":"walk","text":"我要送麵包去山丘，你要不要也出去走 15 分鐘？","check":"self"}],
   "story":["莉莉說，她的麵包店是奶奶留下來的，每天清晨四點就要起床揉麵團。","她偷偷告訴你，她最喜歡的不是做麵包，而是看客人咬下第一口時的表情。","莉莉在研發新口味，她說要用你種的季節水果做一款限定麵包。","莉莉把新麵包取名叫「你的名字＋的早晨」，說這是送給最常幫忙的人。"],
   "gift":[{"stardust":60},{"gacha_coin":2},{"wish_rare":1},{"wish_limited":1}]},
 "grandpa": {"name":"湯姆爺爺","emoji":"👴","job":"退休的老船長",
   "quests":[{"k":"call","text":"我好久沒跟家人說話了…你今天也打通電話給家人吧，聽聽他們的聲音。","check":"self"},
             {"k":"thanks","text":"年輕人，今天跟一個人說聲謝謝吧，說出口會讓兩個人都開心。","check":"self"},
             {"k":"read","text":"給我講個故事好嗎？今天專注讀書 30 分鐘，晚點說給我聽。","check":"focus30"}],
   "story":["湯姆爺爺年輕時開了四十年的船，去過一百多個港口。","他說最難忘的不是大風浪，而是在港口等他回家的那盞燈。","爺爺拿出一張泛黃的照片，是他和孫女在海邊的合照，他說孫女現在在國外讀書。","爺爺把他的舊羅盤送給你：「它帶我回家很多次，現在換它陪你找方向。」"],
   "gift":[{"stardust":60},{"chest_gold":1},{"ticket_special":1},{"ticket_limited":1}]},
 "florist": {"name":"花店的小雛","emoji":"💐","job":"花店店員",
   "quests":[{"k":"tidy","text":"花要在乾淨的地方才開得漂亮！今天把你的房間整理一下吧。","check":"life_room"},
             {"k":"sun","text":"植物需要陽光，人也是！今天去曬 10 分鐘太陽。","check":"self"},
             {"k":"plant","text":"農場的作物最近好嗎？今天去星露島收一次成吧。","check":"self"}],
   "story":["小雛說她其實很怕蟲，但為了花，每天都鼓起勇氣去溫室。","她最喜歡的花是向日葵，因為「它們總是朝著光的方向」。","小雛在學插花，她說想參加明年的比賽，但很怕自己做不好。","比賽那天，小雛用你送的花得了獎，她把獎盃上的緞帶分了一半給你。"],
   "gift":[{"stardust":60},{"gacha_coin":2},{"wish_rare":1},{"wish_limited":1}]},
 "kid": {"name":"小學生阿布","emoji":"🧒","job":"村裡最皮的小孩",
   "quests":[{"k":"tasks","text":"老師說今天要完成 3 件事才能出去玩！你也一起比賽，看誰先完成 3 個任務！","check":"task3"},
             {"k":"early","text":"我今天要早點睡，你也要比 12 點早睡喔！說好了！","check":"self"},
             {"k":"focus","text":"我寫功課只能撐 10 分鐘…你可以示範專注 25 分鐘給我看嗎？","check":"focus25"}],
   "story":["阿布最討厭數學，但他說「長大要當太空人」。","阿布偷偷跟你說，他的爸媽很忙，常常只有他一個人吃晚餐。","阿布這次數學考了 80 分，第一個跑來跟你炫耀。","阿布畫了一張你們一起的圖，上面寫著：「我的偶像」。"],
   "gift":[{"stardust":60},{"gacha_coin":3},{"wish_rare":1},{"chest_star":1}]},
 "librarian": {"name":"圖書館的書蟲先生","emoji":"📚","job":"圖書館員",
   "quests":[{"k":"study","text":"安靜的地方最適合讀書。今天專注滿 1 小時吧，我幫你留了靠窗的位子。","check":"focus60"},
             {"k":"note","text":"讀完要寫下來才會記得。今天專注結束時寫一句「這次完成了什麼」。","check":"self"},
             {"k":"plan","text":"睡前想好明天要做什麼的人，第二天都過得特別好。今晚確認明天的行程吧。","check":"plan"}],
   "story":["書蟲先生在這座圖書館待了三十年，他能背出每一本書放在哪個架子上。","他說年輕時也想當作家，但寫了一半就放棄了。","書蟲先生把那本寫了一半的手稿拿出來，問你覺得結局應該是什麼。","他終於把小說寫完了，扉頁上寫著：「獻給讓我重新提筆的那位讀者。」"],
   "gift":[{"stardust":60},{"wish_rare":1},{"ticket_special":1},{"wish_limited":2}]}
}$j$::jsonb $$;
grant execute on function public.village_defs() to authenticated;

create or replace function public.village_check(u uuid, ck text, d date)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case ck
    when 'focus25' then coalesce((select sum(duration_seconds) from public.focus_sessions where user_id = u and session_date = d), 0) >= 1500
    when 'focus30' then coalesce((select sum(duration_seconds) from public.focus_sessions where user_id = u and session_date = d), 0) >= 1800
    when 'focus60' then coalesce((select sum(duration_seconds) from public.focus_sessions where user_id = u and session_date = d), 0) >= 3600
    when 'task3' then (select count(*) from public.tasks where user_id = u and task_date = d and completed) >= 3
    when 'life_room' then exists (select 1 from public.project_step_logs l join public.project_steps s on s.id = l.step_id where l.user_id = u and l.day = d and l.done and s.title like '%整理房間%')
    when 'plan' then exists (select 1 from public.project_step_logs l join public.project_steps s on s.id = l.step_id where l.user_id = u and l.day = d and l.done and s.title like '%確認明天行程%')
    else true end
$$;
revoke all on function public.village_check(uuid, text, date) from public, anon, authenticated;

create or replace function public.village_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); t date := public.app_today(); defs jsonb := public.village_defs(); vs text[]; s integer; v text; q jsonb; h integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select array_agg(k order by k) into vs from jsonb_object_keys(defs) k;
  if not exists (select 1 from public.village_quests where user_id = u and day = t) then
    h := abs(hashtext(u::text || ':village:' || t));
    for s in 1..2 loop
      v := vs[1 + (h / (s * 7)) % array_length(vs, 1)];
      if s = 2 and v = (select villager from public.village_quests where user_id = u and day = t and slot = 1) then v := vs[1 + ((h / 7) + 1) % array_length(vs, 1)]; end if;
      q := defs->v->'quests'->((h / (s * 13)) % jsonb_array_length(defs->v->'quests'));
      insert into public.village_quests (user_id, day, slot, villager, quest) values (u, t, s, v, q->>'k') on conflict do nothing;
    end loop;
  end if;
  return json_build_object('day', t, 'defs', defs,
    'quests', (select json_agg(json_build_object('slot', vq.slot, 'villager', vq.villager, 'quest', vq.quest, 'done', vq.done_at is not null,
                 'check', (select e->>'check' from jsonb_array_elements(defs->vq.villager->'quests') e where e->>'k' = vq.quest),
                 'ready', public.village_check(u, (select e->>'check' from jsonb_array_elements(defs->vq.villager->'quests') e where e->>'k' = vq.quest), t)) order by vq.slot)
               from public.village_quests vq where vq.user_id = u and vq.day = t),
    'aff', coalesce((select json_object_agg(villager, aff) from public.village_aff where user_id = u), '{}'::json));
end; $$;
revoke all on function public.village_status() from public, anon;
grant execute on function public.village_status() to authenticated;

create or replace function public.village_done(p_slot integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); t date := public.app_today(); r public.village_quests%rowtype; defs jsonb := public.village_defs(); ck text; a integer;
  lv integer; tiers int[] := array[3, 7, 15, 30]; k text; v integer; got jsonb := null;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into r from public.village_quests where user_id = u and day = t and slot = p_slot;
  if not found then raise exception '沒有這個委託'; end if;
  if r.done_at is not null then raise exception '已經完成了'; end if;
  select e->>'check' into ck from jsonb_array_elements(defs->r.villager->'quests') e where e->>'k' = r.quest;
  if not public.village_check(u, ck, t) then raise exception '還沒做到喔，完成之後再回來找我！'; end if;
  update public.village_quests set done_at = now() where user_id = u and day = t and slot = p_slot;
  insert into public.village_aff (user_id, villager, aff) values (u, r.villager, 1)
    on conflict (user_id, villager) do update set aff = public.village_aff.aff + 1 returning aff into a;
  perform public.grant_item(u, 'stardust', 15, 'village:' || t || ':' || p_slot);
  lv := array_position(tiers, a);
  if lv is not null then
    for k, v in select key, value::int from jsonb_each_text(defs->r.villager->'gift'->(lv - 1)) loop
      perform public.grant_item(u, k, v, 'village-gift:' || r.villager || ':' || lv || ':' || k);
    end loop;
    got := jsonb_build_object('chapter', lv, 'story', defs->r.villager->'story'->>(lv - 1), 'gift', defs->r.villager->'gift'->(lv - 1));
  end if;
  return json_build_object('aff', a, 'unlock', got);
end; $$;
revoke all on function public.village_done(integer) from public, anon;
grant execute on function public.village_done(integer) to authenticated;


-- ================= 📮 每週明信片 =================
create table if not exists public.postcards (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week date not null,
  scene text not null,
  line text not null,
  stats jsonb not null,
  from_user uuid,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, week, from_user)
);
alter table public.postcards enable row level security;
drop policy if exists "own select" on public.postcards;
create policy "own select" on public.postcards for select using (auth.uid() = user_id);
revoke insert, update, delete on public.postcards from authenticated, anon;

create or replace function public.postcard_make(u uuid, ws date)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r jsonb := public.week_recap(u, ws); sc text; ln text; sport integer; f numeric; lp integer; dn integer; aw integer;
begin
  if exists (select 1 from public.postcards where user_id = u and week = ws and from_user is null) then return; end if;
  select count(*) into sport from public.project_step_logs l join public.project_steps s on s.id = l.step_id
   where l.user_id = u and l.done and l.day between ws and ws + 6 and s.title like '%運動%';
  f := (r->>'focus_h')::numeric; lp := coalesce((r->>'life_pct')::int, 0); dn := (r->>'dream_nights')::int; aw := (r->>'arena_w')::int;
  sc := case when f >= 20 then 'study' when sport >= 4 then 'mountain' when dn >= 4 then 'night' when lp >= 75 then 'home' when aw >= 5 then 'arena' when f + lp + dn = 0 then 'rest' else 'town' end;
  ln := case sc
    when 'study' then '這週在書房待了 ' || f || ' 小時，桌上的筆記越堆越高。'
    when 'mountain' then '這週動了 ' || sport || ' 天，身體比心情先爬上了山頂。'
    when 'night' then '這週入夢 ' || dn || ' 晚，夜空裡多了幾隻陪你睡覺的夢獸。'
    when 'home' then '這週生活打卡 ' || lp || '%，房間和日子都整整齊齊。'
    when 'arena' then '這週在競技場贏了 ' || aw || ' 場，越戰越勇。'
    when 'rest' then '這週好好休息了一下，有時候停下來也是前進的一部分。'
    else '這週在小鎮裡慢慢走著，專注 ' || f || ' 小時、生活打卡 ' || lp || '%。' end;
  insert into public.postcards (user_id, week, scene, line, stats) values (u, ws, sc, ln, r) on conflict do nothing;
end; $$;
revoke all on function public.postcard_make(uuid, date) from public, anon, authenticated;

-- 週日 18:00 以後做這週的；之前的週沒做的也補（最多 8 週）
create or replace function public.postcard_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); ws date := public.life_week(t); w date; first date;
begin
  if u is null then raise exception '尚未登入'; end if;
  select greatest(ws - 56, public.life_week((select min(session_date) from public.focus_sessions where user_id = u))) into first;
  if first is not null then
    w := first;
    while w < ws loop perform public.postcard_make(u, w); w := w + 7; end loop;
  end if;
  if extract(isodow from t) = 7 and extract(hour from now() at time zone 'Asia/Taipei') >= 18 then perform public.postcard_make(u, ws); end if;
  return json_build_object(
    'cards', coalesce((select json_agg(json_build_object('id', id, 'week', week, 'scene', scene, 'line', line, 'stats', stats,
        'from', case when from_user is not null then public.arena_name(from_user) end, 'note', note) order by week desc, id desc)
        from public.postcards where user_id = u), '[]'::json),
    'friends', coalesce((select json_agg(json_build_object('id', f, 'name', public.arena_name(f))) from public.arena_friends(u) f), '[]'::json));
end; $$;
revoke all on function public.postcard_status() from public, anon;
grant execute on function public.postcard_status() to authenticated;

create or replace function public.postcard_send(p_id bigint, p_friend uuid, p_note text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); c public.postcards%rowtype;
begin
  if u is null then raise exception '尚未登入'; end if;
  if not exists (select 1 from public.arena_friends(u) f where f = p_friend) then raise exception '只能寄給好友'; end if;
  select * into c from public.postcards where id = p_id and user_id = u and from_user is null;
  if not found then raise exception '找不到這張明信片'; end if;
  insert into public.postcards (user_id, week, scene, line, stats, from_user, note)
    values (p_friend, c.week, c.scene, c.line, c.stats, u, left(nullif(trim(p_note), ''), 100))
    on conflict (user_id, week, from_user) do update set note = excluded.note, created_at = now();
  return json_build_object('ok', true);
end; $$;
revoke all on function public.postcard_send(bigint, uuid, text) from public, anon;
grant execute on function public.postcard_send(bigint, uuid, text) to authenticated;


-- ================= 🎰 成就扭蛋機台 =================
create table if not exists public.milestone_capsules (
  user_id uuid not null references auth.users(id) on delete cascade,
  ms text not null,
  got_at timestamptz not null default now(),
  opened_at timestamptz,
  primary key (user_id, ms)
);
alter table public.milestone_capsules enable row level security;
drop policy if exists "own select" on public.milestone_capsules;
create policy "own select" on public.milestone_capsules for select using (auth.uid() = user_id);
revoke insert, update, delete on public.milestone_capsules from authenticated, anon;

create or replace function public.milestone_defs()
returns jsonb language sql immutable as $$ select $j$[
  {"k":"focus10","stat":"focus_h","need":10,"name":"見習讀書人","emoji":"📖","line":"專注第 10 小時。一切都從這裡開始。","color":"#7cc7ff"},
  {"k":"focus50","stat":"focus_h","need":50,"name":"書桌守護者","emoji":"🪑","line":"專注第 50 小時。椅子已經記住你的形狀了。","color":"#64b5f6"},
  {"k":"focus100","stat":"focus_h","need":100,"name":"百時學者","emoji":"🎓","line":"專注第 100 小時。你比一百小時前的自己更強。","color":"#3f8ae0"},
  {"k":"focus200","stat":"focus_h","need":200,"name":"知識航海士","emoji":"🧭","line":"專注第 200 小時。已經能看到遠方的島了。","color":"#5c6bc0"},
  {"k":"focus500","stat":"focus_h","need":500,"name":"傳說的專注者","emoji":"👑","line":"專注第 500 小時。這是很少人到得了的地方。","color":"#ffd54a"},
  {"k":"tasks50","stat":"tasks","need":50,"name":"任務新手","emoji":"✅","line":"完成第 50 個任務。","color":"#81c784"},
  {"k":"tasks100","stat":"tasks","need":100,"name":"百件達成","emoji":"🏅","line":"完成第 100 個任務。說到做到的人。","color":"#43a047"},
  {"k":"tasks300","stat":"tasks","need":300,"name":"任務收割機","emoji":"🌾","line":"完成第 300 個任務。","color":"#2e7d32"},
  {"k":"streak30","stat":"streak","need":30,"name":"一個月不缺席","emoji":"📅","line":"連續簽到 30 天。","color":"#ffb74d"},
  {"k":"streak100","stat":"streak","need":100,"name":"百日之約","emoji":"💯","line":"連續簽到 100 天。這已經是習慣了。","color":"#ff8a65"},
  {"k":"life7","stat":"life_all","need":7,"name":"生活小能手","emoji":"🧹","line":"生活打卡五領域全勤累積 7 天。","color":"#aed581"},
  {"k":"life30","stat":"life_all","need":30,"name":"自律管家","emoji":"🫖","line":"生活打卡五領域全勤累積 30 天。","color":"#9ccc65"},
  {"k":"life100","stat":"life_all","need":100,"name":"生活大師","emoji":"🏡","line":"生活打卡五領域全勤累積 100 天。","color":"#7cb342"},
  {"k":"dream10","stat":"dream","need":10,"name":"做夢的人","emoji":"🌙","line":"夢境收藏 10 種。","color":"#b39ddb"},
  {"k":"dream36","stat":"dream","need":36,"name":"夢境之主","emoji":"🌌","line":"夢境收藏全部收齊。","color":"#7e57c2"},
  {"k":"arena50","stat":"arena","need":50,"name":"競技場常勝軍","emoji":"⚔️","line":"競技場勝利 50 場。","color":"#e57373"},
  {"k":"boss5","stat":"boss","need":5,"name":"屠龍者","emoji":"🐉","line":"打倒每週王 5 次。","color":"#ef5350"},
  {"k":"museum6","stat":"museum","need":6,"name":"策展人","emoji":"🏛️","line":"博物館收藏 6 件人生大事。","color":"#d4a373"},
  {"k":"goal20","stat":"goals","need":20,"name":"說到做到","emoji":"🎯","line":"寫下目標並完成 20 次。","color":"#ff7043"},
  {"k":"village30","stat":"village","need":30,"name":"村裡的好鄰居","emoji":"🏘️","line":"完成村民委託 30 次。","color":"#8d6e63"}
]$j$::jsonb $$;
grant execute on function public.milestone_defs() to authenticated;

create or replace function public.milestone_stats(u uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'focus_h', floor(coalesce((select sum(duration_seconds) from public.focus_sessions where user_id = u), 0) / 3600),
    'tasks', (select count(*) from public.tasks where user_id = u and completed),
    'streak', coalesce((select max(streak) from public.checkins where user_id = u), 0),
    'life_all', (select count(*) from generate_series((select min(day) from public.project_step_logs where user_id = u), public.app_today(), interval '1 day') d where public.life_all_clear(u, d::date)),
    'dream', (select count(*) from public.dream_items where user_id = u),
    'arena', (select count(*) from public.arena_duels where user_id = u and win),
    'boss', (select count(*) from public.rpg_boss_runs where user_id = u and killed_at is not null),
    'museum', (select count(*) from public.museum_items where user_id = u),
    'goals', (select count(*) from public.focus_sessions where user_id = u and goal_result = 'done'),
    'village', (select count(*) from public.village_quests where user_id = u and done_at is not null))
$$;
revoke all on function public.milestone_stats(uuid) from public, anon, authenticated;

create or replace function public.capsule_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); st jsonb; x jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  st := public.milestone_stats(u);
  for x in select * from jsonb_array_elements(public.milestone_defs()) loop
    if coalesce((st->>(x->>'stat'))::numeric, 0) >= (x->>'need')::numeric then
      insert into public.milestone_capsules (user_id, ms) values (u, x->>'k') on conflict do nothing;
    end if;
  end loop;
  return json_build_object('stats', st, 'defs', public.milestone_defs(),
    'caps', coalesce((select json_object_agg(ms, json_build_object('got', got_at, 'opened', opened_at)) from public.milestone_capsules where user_id = u), '{}'::json),
    'pending', (select count(*) from public.milestone_capsules where user_id = u and opened_at is null));
end; $$;
revoke all on function public.capsule_status() from public, anon;
grant execute on function public.capsule_status() to authenticated;

create or replace function public.capsule_open()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); k text;
begin
  if u is null then raise exception '尚未登入'; end if;
  select ms into k from public.milestone_capsules where user_id = u and opened_at is null order by got_at, ms limit 1;
  if k is null then raise exception '沒有可以轉的扭蛋'; end if;
  update public.milestone_capsules set opened_at = now() where user_id = u and ms = k;
  perform public.grant_item(u, 'stardust', 50, 'capsule:' || k);
  return json_build_object('ms', k, 'def', (select e from jsonb_array_elements(public.milestone_defs()) e where e->>'k' = k));
end; $$;
revoke all on function public.capsule_open() from public, anon;
grant execute on function public.capsule_open() to authenticated;

-- 小房間多帶公仔（打開過的扭蛋）
do $$ begin
  if to_regprocedure('public.home_status_base(uuid)') is null then alter function public.home_status(uuid) rename to home_status_base; end if;
end $$;
revoke all on function public.home_status_base(uuid) from public, anon, authenticated;
create or replace function public.home_status(p_user uuid default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := coalesce(p_user, auth.uid());
begin
  return (public.home_status_base(p_user)::jsonb || jsonb_build_object('figures', coalesce((
    select jsonb_agg(e order by c.opened_at) from public.milestone_capsules c join jsonb_array_elements(public.milestone_defs()) e on e->>'k' = c.ms
     where c.user_id = u and c.opened_at is not null), '[]'::jsonb)))::json;
end; $$;
revoke all on function public.home_status(uuid) from public, anon;
grant execute on function public.home_status(uuid) to authenticated;
create or replace function public.home_place(p_slot text, p_item text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_slot not in ('wall1', 'wall2', 'shelf1', 'shelf2', 'floor1', 'floor2') then raise exception '沒有這個位置'; end if;
  if p_item is not null and not exists (select 1 from public.dream_items where user_id = u and item = p_item) then raise exception '你還沒有這個收藏'; end if;
  insert into public.room_layout (user_id, slots) values (u, '{}'::jsonb) on conflict do nothing;
  update public.room_layout set slots = case when p_item is null then slots - p_slot else slots || jsonb_build_object(p_slot, p_item) end, updated_at = now() where user_id = u;
  return public.home_status(null);
end; $$;
revoke all on function public.home_place(text, text) from public, anon;
grant execute on function public.home_place(text, text) to authenticated;
