create table if not exists public.study_items (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject text not null, title text not null, plan_date date,
  done boolean not null default false, done_at timestamptz,
  sort integer not null default 0, created_at timestamptz not null default now());
alter table public.study_items enable row level security;
create policy "own all" on public.study_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.study_items to authenticated;
grant all on public.study_items to service_role;
