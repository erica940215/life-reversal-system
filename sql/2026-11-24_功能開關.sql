alter table public.user_settings add column if not exists features jsonb not null default '{}'::jsonb;
