-- =========================================================
-- 📖 英文單字複習（遺忘曲線）
-- 不需要先跑其他遊戲的 SQL；有跑過「簽到發券與背包」的話，每天複習完會送星屑
-- 可以重複執行。
--
--   匯入：網站把貼上的文字／CSV／Excel 切好，整批送進來（同一個人同一個字不會重複）
--   排程：每個字有自己的間隔和難易度（ease）
--     忘了 → 今天再考一次，之後從 1 天重來，ease −0.2
--     模糊 → 間隔 ×1.2，ease −0.15
--     記得 → 間隔 × ease
--     很熟 → 間隔 × ease × 1.3，ease +0.15
--     新字第一次：模糊／記得 1 天，很熟 4 天；最長 365 天
--   每天：到期的複習全部出＋新字（每天上限可以調，預設 20）
--   分享碼：把一本單字本做成 6 碼分享碼，朋友輸入就能匯入一份副本（各自的進度）
-- =========================================================

create table if not exists public.vocab_words (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck text not null default '我的單字',
  word text not null,
  pos text, meaning text, phonetic text,
  example text, example_zh text,
  collocations text, synonyms text, forms text, mnemonic text, tags text,
  position integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  interval_days integer not null default 0,
  ease numeric not null default 2.5,
  due date,
  first_review date,
  last_review date,
  created_at timestamptz not null default now()
);
create unique index if not exists vocab_words_uniq on public.vocab_words (user_id, lower(word));
create index if not exists vocab_words_due on public.vocab_words (user_id, due);

create table if not exists public.vocab_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id bigint not null references public.vocab_words(id) on delete cascade,
  day date not null,
  grade integer not null,
  was_new boolean not null default false,
  interval_before integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists vocab_log_user_day on public.vocab_log (user_id, day);

create table if not exists public.vocab_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_per_day integer not null default 20 check (new_per_day between 0 and 200)
);

create table if not exists public.vocab_shares (
  code text primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  deck text not null,
  words jsonb not null,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['vocab_words', 'vocab_log', 'vocab_settings', 'vocab_shares'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- 給排程用的「今天」：有 app_today() 就用它（凌晨 2 點換日），沒有就用台北時間
create or replace function public.vocab_today()
returns date language plpgsql stable as $$
begin
  return public.app_today();
exception when undefined_function then
  return (now() at time zone 'Asia/Taipei')::date;
end $$;


-- ---------- 匯入 ----------
-- p_rows：[{"word":"negotiate","pos":"v.","meaning":"協商",...}, ...]
create or replace function public.vocab_import(p_rows jsonb, p_deck text default null)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_deck text := coalesce(nullif(left(trim(coalesce(p_deck, '')), 40), ''), '我的單字');
  r jsonb;
  v_word text;
  v_added integer := 0;
  v_dup integer := 0;
  v_bad integer := 0;
  v_pos integer;
  f text := '';
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception '格式不對'; end if;
  if jsonb_array_length(p_rows) > 3000 then raise exception '一次最多匯入 3000 個字'; end if;
  select coalesce(max(position), 0) into v_pos from public.vocab_words where user_id = v_user;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_word := left(trim(coalesce(r->>'word', '')), 80);
    if v_word = '' or v_word !~ '[A-Za-z]' then v_bad := v_bad + 1; continue; end if;
    v_pos := v_pos + 1;
    insert into public.vocab_words (user_id, deck, word, pos, meaning, phonetic, example, example_zh, collocations, synonyms, forms, mnemonic, tags, position)
    values (v_user, v_deck, v_word,
      nullif(left(trim(coalesce(r->>'pos', '')), 30), ''),
      nullif(left(trim(coalesce(r->>'meaning', '')), 200), ''),
      nullif(left(trim(coalesce(r->>'phonetic', '')), 80), ''),
      nullif(left(trim(coalesce(r->>'example', '')), 400), ''),
      nullif(left(trim(coalesce(r->>'example_zh', '')), 400), ''),
      nullif(left(trim(coalesce(r->>'collocations', '')), 300), ''),
      nullif(left(trim(coalesce(r->>'synonyms', '')), 200), ''),
      nullif(left(trim(coalesce(r->>'forms', '')), 200), ''),
      nullif(left(trim(coalesce(r->>'mnemonic', '')), 300), ''),
      nullif(left(trim(coalesce(r->>'tags', '')), 100), ''),
      v_pos)
    on conflict (user_id, lower(word)) do nothing;
    if found then v_added := v_added + 1; else v_dup := v_dup + 1; end if;
  end loop;

  return json_build_object('success', true, 'added', v_added, 'dup', v_dup, 'bad', v_bad, 'deck', v_deck);
end;
$function$;
revoke all on function public.vocab_import(jsonb, text) from public, anon;
grant execute on function public.vocab_import(jsonb, text) to authenticated;


-- ---------- 今天要複習的字 ----------
create or replace function public.vocab_queue()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.vocab_today();
  v_limit integer;
  v_new_done integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select coalesce((select new_per_day from public.vocab_settings where user_id = v_user), 20) into v_limit;
  select count(*) into v_new_done from public.vocab_words where user_id = v_user and first_review = v_today;

  return json_build_object(
    'today', v_today,
    'new_limit', v_limit,
    'new_done', v_new_done,
    'review', coalesce((select json_agg(to_jsonb(w) - 'user_id' order by w.due, w.id) from (
        select * from public.vocab_words where user_id = v_user and reps > 0 and due <= v_today
        order by due, id limit 500) w), '[]'::json),
    'new', coalesce((select json_agg(to_jsonb(w) - 'user_id' order by w.position) from (
        select * from public.vocab_words where user_id = v_user and reps = 0
        order by position limit greatest(v_limit - v_new_done, 0)) w), '[]'::json),
    'reviewed_today', (select count(distinct word_id) from public.vocab_log where user_id = v_user and day = v_today),
    -- 選擇題用的干擾選項
    'pool', coalesce((select json_agg(json_build_object('word', word, 'meaning', meaning)) from (
        select word, meaning from public.vocab_words where user_id = v_user and meaning is not null
        order by random() limit 60) p), '[]'::json));
end;
$function$;
revoke all on function public.vocab_queue() from public, anon;
grant execute on function public.vocab_queue() to authenticated;


-- ---------- 複習一個字：0 忘了、1 模糊、2 記得、3 很熟 ----------
create or replace function public.vocab_review(p_id bigint, p_grade integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.vocab_today();
  w public.vocab_words%rowtype;
  v_int integer;
  v_ease numeric;
  v_new boolean;
  v_left integer;
  v_dust boolean := false;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  if p_grade not between 0 and 3 then raise exception '分數不對'; end if;
  select * into w from public.vocab_words where id = p_id and user_id = v_user for update;
  if not found then raise exception '找不到這個字'; end if;

  v_new := w.reps = 0;
  v_ease := w.ease;
  if p_grade = 0 then
    v_int := 0;
    v_ease := greatest(1.3, v_ease - 0.2);
  elsif w.interval_days = 0 then
    v_int := case p_grade when 3 then 4 else 1 end;
  elsif p_grade = 1 then
    v_int := greatest(1, round(w.interval_days * 1.2));
    v_ease := greatest(1.3, v_ease - 0.15);
  elsif p_grade = 2 then
    v_int := greatest(w.interval_days + 1, round(w.interval_days * v_ease));
  else
    v_int := greatest(w.interval_days + 2, round(w.interval_days * v_ease * 1.3));
    v_ease := least(3.0, v_ease + 0.15);
  end if;
  v_int := least(v_int, 365);

  update public.vocab_words set
    reps = reps + 1,
    lapses = lapses + (p_grade = 0)::int,
    interval_days = v_int,
    ease = v_ease,
    due = v_today + v_int,
    first_review = coalesce(first_review, v_today),
    last_review = v_today
  where id = p_id;

  insert into public.vocab_log (user_id, word_id, day, grade, was_new, interval_before)
    values (v_user, p_id, v_today, p_grade, v_new, w.interval_days);

  -- 今天到期的都複習完（而且今天至少複習了 10 個）→ 星屑 +2（有背包系統才發）
  select count(*) into v_left from public.vocab_words where user_id = v_user and reps > 0 and due <= v_today;
  if v_left = 0 and (select count(distinct word_id) from public.vocab_log where user_id = v_user and day = v_today) >= 10 then
    begin
      v_dust := public.grant_item(v_user, 'stardust', 2, 'vocab-day:' || v_today);
    exception when undefined_function then v_dust := false;
    end;
  end if;

  return json_build_object('success', true, 'interval', v_int, 'due', v_today + v_int, 'ease', v_ease, 'dust', v_dust, 'left', v_left);
end;
$function$;
revoke all on function public.vocab_review(bigint, integer) from public, anon;
grant execute on function public.vocab_review(bigint, integer) to authenticated;


-- ---------- 統計 ----------
create or replace function public.vocab_stats()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.vocab_today();
  v_streak integer := 0;
  d date;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  -- 連續複習天數（今天還沒複習就從昨天算）
  d := case when exists (select 1 from public.vocab_log where user_id = v_user and day = v_today) then v_today else v_today - 1 end;
  while exists (select 1 from public.vocab_log where user_id = v_user and day = d) loop
    v_streak := v_streak + 1; d := d - 1;
    exit when v_streak > 1000;
  end loop;

  return json_build_object(
    'total', (select count(*) from public.vocab_words where user_id = v_user),
    'buckets', json_build_object(
      'new', (select count(*) from public.vocab_words where user_id = v_user and reps = 0),
      'learning', (select count(*) from public.vocab_words where user_id = v_user and reps > 0 and interval_days < 7),
      'familiar', (select count(*) from public.vocab_words where user_id = v_user and interval_days between 7 and 29),
      'mastered', (select count(*) from public.vocab_words where user_id = v_user and interval_days >= 30)),
    'streak', v_streak,
    'retention', (select round(100.0 * count(*) filter (where grade > 0) / nullif(count(*), 0))
                  from public.vocab_log where user_id = v_user and not was_new and day >= v_today - 29),
    'forecast', (select json_agg(json_build_object('day', x::date,
                   'n', (select count(*) from public.vocab_words where user_id = v_user and reps > 0
                          and (case when x::date = v_today then due <= v_today else due = x::date end)))
                   order by x)
                 from generate_series(v_today, v_today + 6, interval '1 day') x),
    'history', (select json_agg(json_build_object('day', x::date,
                   'n', (select count(*) from public.vocab_log where user_id = v_user and day = x::date)) order by x)
                from generate_series(v_today - 13, v_today, interval '1 day') x),
    'hard', coalesce((select json_agg(json_build_object('id', id, 'word', word, 'meaning', meaning, 'lapses', lapses) order by lapses desc, id)
                      from (select * from public.vocab_words where user_id = v_user and lapses > 0 order by lapses desc, id limit 20) h), '[]'::json),
    'decks', coalesce((select json_agg(json_build_object('deck', deck, 'total', n, 'started', s, 'mastered', m) order by first)
                       from (select deck, count(*) n, count(*) filter (where reps > 0) s, count(*) filter (where interval_days >= 30) m, min(position) first
                             from public.vocab_words where user_id = v_user group by deck) g), '[]'::json),
    'new_per_day', coalesce((select new_per_day from public.vocab_settings where user_id = v_user), 20));
end;
$function$;
revoke all on function public.vocab_stats() from public, anon;
grant execute on function public.vocab_stats() to authenticated;


-- ---------- 查詢單字本（瀏覽、搜尋） ----------
create or replace function public.vocab_list(p_deck text default null, p_q text default null, p_offset integer default 0)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
  if v_user is null then raise exception '尚未登入'; end if;
  return json_build_object(
    'count', (select count(*) from public.vocab_words where user_id = v_user and (p_deck is null or deck = p_deck)
              and (v_q is null or word ilike '%' || v_q || '%' or meaning ilike '%' || v_q || '%')),
    'rows', coalesce((select json_agg(to_jsonb(w) - 'user_id' order by w.position) from (
        select * from public.vocab_words where user_id = v_user and (p_deck is null or deck = p_deck)
          and (v_q is null or word ilike '%' || v_q || '%' or meaning ilike '%' || v_q || '%')
        order by position offset greatest(p_offset, 0) limit 50) w), '[]'::json));
end;
$function$;
revoke all on function public.vocab_list(text, text, integer) from public, anon;
grant execute on function public.vocab_list(text, text, integer) to authenticated;


-- ---------- 修改、刪除、重設、設定 ----------
create or replace function public.vocab_update(p_id bigint, p_data jsonb)
returns json language plpgsql security definer set search_path to 'public'
as $function$
begin
  update public.vocab_words set
    pos = nullif(trim(coalesce(p_data->>'pos', pos)), ''),
    meaning = nullif(trim(coalesce(p_data->>'meaning', meaning)), ''),
    phonetic = nullif(trim(coalesce(p_data->>'phonetic', phonetic)), ''),
    example = nullif(trim(coalesce(p_data->>'example', example)), ''),
    example_zh = nullif(trim(coalesce(p_data->>'example_zh', example_zh)), ''),
    mnemonic = nullif(trim(coalesce(p_data->>'mnemonic', mnemonic)), '')
  where id = p_id and user_id = auth.uid();
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.vocab_update(bigint, jsonb) from public, anon;
grant execute on function public.vocab_update(bigint, jsonb) to authenticated;

create or replace function public.vocab_delete(p_ids bigint[])
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare n integer;
begin
  delete from public.vocab_words where user_id = auth.uid() and id = any(p_ids);
  get diagnostics n = row_count;
  return json_build_object('success', true, 'deleted', n);
end;
$function$;
revoke all on function public.vocab_delete(bigint[]) from public, anon;
grant execute on function public.vocab_delete(bigint[]) to authenticated;

create or replace function public.vocab_delete_deck(p_deck text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare n integer;
begin
  delete from public.vocab_words where user_id = auth.uid() and deck = p_deck;
  get diagnostics n = row_count;
  return json_build_object('success', true, 'deleted', n);
end;
$function$;
revoke all on function public.vocab_delete_deck(text) from public, anon;
grant execute on function public.vocab_delete_deck(text) to authenticated;

create or replace function public.vocab_rename_deck(p_old text, p_new text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_new text := nullif(left(trim(coalesce(p_new, '')), 40), '');
begin
  if v_new is null then raise exception '請輸入新名字'; end if;
  update public.vocab_words set deck = v_new where user_id = auth.uid() and deck = p_old;
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.vocab_rename_deck(text, text) from public, anon;
grant execute on function public.vocab_rename_deck(text, text) to authenticated;

create or replace function public.vocab_settings_set(p_new_per_day integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
begin
  if p_new_per_day not between 0 and 200 then raise exception '每天新字要在 0～200 之間'; end if;
  insert into public.vocab_settings (user_id, new_per_day) values (auth.uid(), p_new_per_day)
    on conflict (user_id) do update set new_per_day = excluded.new_per_day;
  return json_build_object('success', true);
end;
$function$;
revoke all on function public.vocab_settings_set(integer) from public, anon;
grant execute on function public.vocab_settings_set(integer) to authenticated;


-- ---------- 分享碼 ----------
create or replace function public.vocab_share(p_deck text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_code text; v_words jsonb;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select jsonb_agg(jsonb_build_object('word', word, 'pos', pos, 'meaning', meaning, 'phonetic', phonetic, 'example', example,
           'example_zh', example_zh, 'collocations', collocations, 'synonyms', synonyms, 'forms', forms,
           'mnemonic', mnemonic, 'tags', tags) order by position)
    into v_words from public.vocab_words where user_id = v_user and deck = p_deck;
  if v_words is null then raise exception '這本單字本是空的'; end if;
  delete from public.vocab_shares where owner = v_user and deck = p_deck;
  loop
    v_code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from public.vocab_shares where code = v_code);
  end loop;
  insert into public.vocab_shares (code, owner, deck, words) values (v_code, v_user, p_deck, v_words);
  return json_build_object('success', true, 'code', v_code, 'count', jsonb_array_length(v_words));
end;
$function$;
revoke all on function public.vocab_share(text) from public, anon;
grant execute on function public.vocab_share(text) to authenticated;

create or replace function public.vocab_share_peek(p_code text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare s public.vocab_shares%rowtype;
begin
  select * into s from public.vocab_shares where code = upper(trim(coalesce(p_code, '')));
  if not found then raise exception '找不到這個分享碼'; end if;
  return json_build_object('deck', s.deck, 'count', jsonb_array_length(s.words),
    'by', coalesce((select nullif(trim(username), '') from public.profiles where id = s.owner), '朋友'),
    'sample', (select jsonb_agg(x) from (select x from jsonb_array_elements(s.words) x limit 5) t));
end;
$function$;
revoke all on function public.vocab_share_peek(text) from public, anon;
grant execute on function public.vocab_share_peek(text) to authenticated;

create or replace function public.vocab_share_import(p_code text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare s public.vocab_shares%rowtype;
begin
  select * into s from public.vocab_shares where code = upper(trim(coalesce(p_code, '')));
  if not found then raise exception '找不到這個分享碼'; end if;
  return public.vocab_import(s.words, s.deck);
end;
$function$;
revoke all on function public.vocab_share_import(text) from public, anon;
grant execute on function public.vocab_share_import(text) to authenticated;

notify pgrst, 'reload schema';

select case
  when exists (select 1 from pg_proc where proname = 'vocab_queue' and pronamespace = 'public'::regnamespace)
    then '✅ 單字複習設定完成'
  else '⚠️ 設定失敗'
end as 檢查結果;
