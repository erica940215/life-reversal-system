alter table public.tasks add column if not exists study_item_id bigint references public.study_items(id) on delete set null;
