-- =========================================================
-- 序光計畫：🧠 複習系統（已經在線上套用過；可以重複執行）
--   kb_sources 導入的資料（一份講義／筆記／文章）
--   kb_points  知識點（由簡單到難：1 認識 2 理解 3 比較 4 應用 5 綜合）
--   kb_cards   各種形式的題卡（問答、填空、選擇、是非、配對、排序、比喻、比較表、簡答）＋遺忘曲線
--   kb_log     每次作答紀錄（統計、每日任務）
--   kb_done()  每日任務星屑
-- =========================================================
create table if not exists public.kb_sources (
  id bigserial primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject text not null default '其他', title text not null, kind text not null default 'text',
  summary text, raw text, status text not null default 'outline', created_at timestamptz not null default now());
create table if not exists public.kb_points (
  id bigserial primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id bigint not null references public.kb_sources(id) on delete cascade,
  pos integer not null default 0, section text, title text not null, level integer not null default 1,
  summary text, analogy text, key_terms text[], excerpt text, cards_ready boolean not null default false,
  learned_at timestamptz, created_at timestamptz not null default now());
create table if not exists public.kb_cards (
  id bigserial primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  point_id bigint not null references public.kb_points(id) on delete cascade,
  source_id bigint not null references public.kb_sources(id) on delete cascade,
  type text not null, level integer not null default 1, data jsonb not null,
  reps integer not null default 0, lapses integer not null default 0, ease numeric not null default 2.5, ivl integer not null default 0,
  due date, last_at timestamptz, suspended boolean not null default false, created_at timestamptz not null default now());
create table if not exists public.kb_log (
  id bigserial primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id bigint references public.kb_cards(id) on delete cascade, source_id bigint, grade integer not null, mode text not null default 'review',
  day date not null default public.app_today(), created_at timestamptz not null default now());
create index if not exists kb_points_src on public.kb_points (source_id, pos);
create index if not exists kb_cards_due on public.kb_cards (user_id, due);
create index if not exists kb_cards_point on public.kb_cards (point_id);
create index if not exists kb_log_user on public.kb_log (user_id, day);

do $$ declare t text; begin
  foreach t in array array['kb_sources','kb_points','kb_cards','kb_log'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'own all') then
      execute format('create policy "own all" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    end if;
  end loop;
end $$;
grant select, insert, update, delete on public.kb_sources, public.kb_points, public.kb_cards, public.kb_log to authenticated;
grant usage, select on sequence public.kb_sources_id_seq, public.kb_points_id_seq, public.kb_cards_id_seq, public.kb_log_id_seq to authenticated;

/* 每日任務：review 複習完到期卡（至少 10 張）30 星屑；learn 學完一個單元 20 星屑（一天一次）；import 第一次導入資料 50 星屑（一次） */
create or replace function public.kb_done(p_task text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); amt integer; g boolean; k text;
begin
  if u is null then raise exception '尚未登入'; end if;
  amt := case p_task when 'review' then 30 when 'learn' then 20 when 'import' then 50 else 0 end;
  if amt = 0 then raise exception '沒有這個任務'; end if;
  if p_task = 'review' and (select count(*) from public.kb_log where user_id = u and day = t) < 10 then return json_build_object('granted', false, 'amount', 0); end if;
  if p_task = 'learn' and not exists (select 1 from public.kb_points where user_id = u and learned_at >= now() - interval '1 day') then return json_build_object('granted', false, 'amount', 0); end if;
  if p_task = 'import' and not exists (select 1 from public.kb_sources where user_id = u) then return json_build_object('granted', false, 'amount', 0); end if;
  k := case when p_task = 'import' then 'kb:first-import' else 'kb:' || t || ':' || p_task end;
  g := public.grant_item(u, 'stardust', amt, k);
  return json_build_object('granted', g, 'amount', amt);
end; $$;
revoke all on function public.kb_done(text) from public, anon;
grant execute on function public.kb_done(text) to authenticated;
