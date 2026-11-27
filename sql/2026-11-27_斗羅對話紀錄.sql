create table if not exists public.douluo_chats (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  who text not null check (who in ('tangsan','master')),
  role text not null check (role in ('me','them')),
  text text not null,
  created_at timestamptz not null default now());
create index if not exists douluo_chats_user on public.douluo_chats(user_id, who, created_at desc);
alter table public.douluo_chats enable row level security;
create policy "own all" on public.douluo_chats for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.douluo_chats to authenticated;
grant all on public.douluo_chats to service_role;
