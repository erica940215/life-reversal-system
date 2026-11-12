-- =========================================================
-- 序光計畫：🐣 新手教室（12 堂投資入門課，一週一堂，完成拿星屑）
-- 可以重複執行。
-- =========================================================
create table if not exists public.newbie_lessons (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson integer not null,
  score integer not null default 0,
  total integer not null default 0,
  done_at timestamptz not null default now(),
  primary key (user_id, lesson)
);
alter table public.newbie_lessons enable row level security;
grant select on public.newbie_lessons to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'newbie_lessons' and policyname = 'own select') then
    create policy "own select" on public.newbie_lessons for select using (auth.uid() = user_id);
  end if;
end $$;

-- 完成一堂：要照順序、上一堂完成滿 7 天；第一次完成給 80 星屑
create or replace function public.newbie_done(p_lesson integer, p_score integer, p_total integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); prev timestamptz; g boolean := false;
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_lesson < 1 or p_lesson > 12 then raise exception '沒有這堂課'; end if;
  if p_lesson > 1 then
    select done_at into prev from public.newbie_lessons where user_id = u and lesson = p_lesson - 1;
    if prev is null then raise exception '要先完成前一堂'; end if;
    if prev > now() - interval '7 days' and not exists (select 1 from public.newbie_lessons where user_id = u and lesson = p_lesson) then raise exception '這堂還沒解鎖'; end if;
  end if;
  insert into public.newbie_lessons (user_id, lesson, score, total) values (u, p_lesson, greatest(0, p_score), greatest(0, p_total))
    on conflict (user_id, lesson) do update set score = greatest(public.newbie_lessons.score, excluded.score);
  g := public.grant_item(u, 'stardust', 80, 'newbie:' || p_lesson);
  return json_build_object('granted', g);
end; $$;
revoke all on function public.newbie_done(integer, integer, integer) from public, anon;
grant execute on function public.newbie_done(integer, integer, integer) to authenticated;
