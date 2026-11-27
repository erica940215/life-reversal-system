-- 斗羅・羈絆與日常
create table if not exists public.douluo_bond (user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
alter table public.douluo_bond enable row level security;
create policy "own all" on public.douluo_bond for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.douluo_bond to authenticated;
grant all on public.douluo_bond to service_role;
