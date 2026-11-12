-- =========================================================
-- 序光計畫：🎯 多益系統（已經在線上套用過；可以重複執行）
--   toeic_settings 考試日期／目標／每日時間／聲音
--   toeic_answers 每一題作答紀錄（弱點分析、預估分數）
--   toeic_review 錯題本（1→3→7→14 天）
--   toeic_qbank AI 出的題目
--   toeic_mocks 小模考紀錄
--   storage bucket toeic-audio：AI 語音快取
-- =========================================================
insert into storage.buckets (id, name, public) values ('toeic-audio', 'toeic-audio', true) on conflict (id) do nothing;
create table if not exists public.toeic_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  exam_date date, target integer not null default 650, start_score integer not null default 400, daily_min integer not null default 45,
  voice text not null default 'ai', updated_at timestamptz not null default now());
create table if not exists public.toeic_answers (
  id bigserial primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  qid text not null, part integer not null, tag text not null, correct boolean not null, ms integer, mode text not null default 'daily',
  day date not null default public.app_today(), created_at timestamptz not null default now());
create index if not exists toeic_answers_user on public.toeic_answers (user_id, created_at desc);
create table if not exists public.toeic_review (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, qid text not null, part integer not null, tag text not null,
  stage integer not null default 0, due date not null, primary key (user_id, qid));
create table if not exists public.toeic_qbank (
  id text primary key, user_id uuid references auth.users(id) on delete cascade, part integer not null, tag text not null, data jsonb not null,
  flagged boolean not null default false, created_at timestamptz not null default now());
create table if not exists public.toeic_mocks (
  id bigserial primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, l_acc numeric, r_acc numeric, est integer, detail jsonb, created_at timestamptz not null default now());
do $$ declare t text; begin
  foreach t in array array['toeic_settings','toeic_answers','toeic_review','toeic_qbank','toeic_mocks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'own all') then
      execute format('create policy "own all" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    end if;
  end loop;
end $$;
grant usage, select on sequence public.toeic_answers_id_seq, public.toeic_mocks_id_seq to authenticated;

create or replace function public.toeic_task_done(p_task text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); amt integer; g boolean;
begin
  if u is null then raise exception '尚未登入'; end if;
  amt := case p_task when 'p5' then 30 when 'p2' then 30 when 'review' then 20 when 'vocab' then 20 when 'mock' then 150 when 'bonus' then 20 when 'allday' then 50 else 0 end;
  if amt = 0 then raise exception '沒有這個任務'; end if;
  g := public.grant_item(u, 'stardust', amt, 'toeic:' || t || ':' || p_task);
  return json_build_object('granted', g, 'amount', amt);
end; $$;
revoke all on function public.toeic_task_done(text) from public, anon;
grant execute on function public.toeic_task_done(text) to authenticated;

-- 完整模擬試題（一回 200 題，分段由 AI 產生）
create table if not exists public.toeic_tests (
  id bigserial primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null, theme text, parts jsonb not null default '{}', created_at timestamptz not null default now());
alter table public.toeic_tests enable row level security;
grant select, insert, update, delete on public.toeic_tests to authenticated;
grant usage, select on sequence public.toeic_tests_id_seq to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'toeic_tests' and policyname = 'own all') then
    create policy "own all" on public.toeic_tests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
create or replace function public.toeic_test_put(p_id bigint, p_uid uuid, p_chunk text, p_items jsonb)
returns boolean language sql security definer set search_path to 'public' as $$
  update public.toeic_tests set parts = parts || jsonb_build_object(p_chunk, p_items) where id = p_id and user_id = p_uid returning true $$;
revoke all on function public.toeic_test_put(bigint, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.toeic_test_put(bigint, uuid, text, jsonb) to service_role;
