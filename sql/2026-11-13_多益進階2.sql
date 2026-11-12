-- =========================================================
-- 序光計畫：🎯 多益進階 2（已經在線上套用過；可以重複執行）
--   toeic_settings.plan_adj：模考 AI 診斷後，自動調整每日練習比例（7 天有效）
--   toeic_reading：Part 7 閱讀速度紀錄（每組文章：字數、秒數、每分鐘字數、答對）
--   toeic_task_done 新增「weak」弱點專練任務
-- =========================================================
alter table public.toeic_settings add column if not exists plan_adj jsonb;

create table if not exists public.toeic_reading (
  id bigserial primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gid text not null, words integer not null, secs integer not null, wpm integer not null, correct integer not null, total integer not null,
  day date not null default public.app_today(), created_at timestamptz not null default now());
create index if not exists toeic_reading_user on public.toeic_reading (user_id, created_at desc);
alter table public.toeic_reading enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'toeic_reading' and policyname = 'own all') then
    create policy "own all" on public.toeic_reading for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
grant select, insert, update, delete on public.toeic_reading to authenticated;
grant usage, select on sequence public.toeic_reading_id_seq to authenticated;

create or replace function public.toeic_task_done(p_task text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); amt integer; g boolean;
begin
  if u is null then raise exception '尚未登入'; end if;
  amt := case p_task when 'p5' then 30 when 'p2' then 30 when 'review' then 20 when 'vocab' then 20 when 'mock' then 150 when 'bonus' then 20 when 'weak' then 20 when 'allday' then 50 else 0 end;
  if amt = 0 then raise exception '沒有這個任務'; end if;
  g := public.grant_item(u, 'stardust', amt, 'toeic:' || t || ':' || p_task);
  return json_build_object('granted', g, 'amount', amt);
end; $$;
revoke all on function public.toeic_task_done(text) from public, anon;
grant execute on function public.toeic_task_done(text) to authenticated;
