-- =========================================================
-- 序光計畫：📈 累積（各科時數＋健康）
-- 可以重複執行。
--
--   water_logs       喝水：按一下記一筆（水壺 750 ml、馬克杯 250 ml）
--   exercise_logs    運動：種類＋分鐘
--   meal_logs        多兩個勾：有蔬菜、有蛋白質
--   focus_sessions   多一欄 note：這次專注完成了什麼（選填）
--   user_settings    多一欄 accum：累積規則（幾分鐘加一點、幾點升一級、每天目標）
-- =========================================================


-- ---------- 💧 喝水（按一下記一筆：水壺 750、馬克杯 250） ----------
create table if not exists public.water_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null default (public.app_today()),
  ml integer not null check (ml > 0 and ml <= 3000),
  created_at timestamptz not null default now()
);

create index if not exists water_logs_user_date on public.water_logs (user_id, log_date);


-- ---------- 🏃 運動（種類＋分鐘） ----------
create table if not exists public.exercise_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null default (public.app_today()),
  kind text not null check (char_length(kind) between 1 and 20),
  minutes integer not null check (minutes > 0 and minutes <= 600),
  created_at timestamptz not null default now()
);

create index if not exists exercise_logs_user_date on public.exercise_logs (user_id, log_date);


-- ---------- 🍱 三餐：有沒有蔬菜、蛋白質 ----------
alter table public.meal_logs
  add column if not exists has_veg boolean not null default false,
  add column if not exists has_protein boolean not null default false;


-- ---------- ⏱️ 專注：這次完成了什麼（選填） ----------
alter table public.focus_sessions
  add column if not exists note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'focus_sessions_note_len') then
    alter table public.focus_sessions
      add constraint focus_sessions_note_len check (note is null or char_length(note) <= 200);
  end if;
end $$;


-- ---------- ⚙️ 累積規則（幾分鐘加一點、幾點升一級、每天目標） ----------
alter table public.user_settings
  add column if not exists accum jsonb not null default '{}'::jsonb;


-- ---------- 💧🏃 不能記未來的日子 ----------
create or replace function public.health_log_rules()
returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if new.log_date > public.app_today() then
    raise exception '不能記錄未來的日子';
  end if;
  return new;
end;
$function$;

drop trigger if exists water_log_rules on public.water_logs;
create trigger water_log_rules before insert or update on public.water_logs
  for each row execute function public.health_log_rules();

drop trigger if exists exercise_log_rules on public.exercise_logs;
create trigger exercise_log_rules before insert or update on public.exercise_logs
  for each row execute function public.health_log_rules();


-- ---------- 🔒 門鎖：本人可以看 / 新增 / 修改 / 刪除 ----------
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['water_logs', 'exercise_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p, t);
    end loop;
    execute format('create policy "own select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "own insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "own update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "own delete" on public.%I for delete using (auth.uid() = user_id)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;



-- ---------- 讓網站馬上看到新的表 ----------
notify pgrst, 'reload schema';


-- ---------- ✅ 檢查結果 ----------
select coalesce(string_agg(missing, '、'), '✅ 累積 設定完成') as 檢查結果
from (
  select '缺少表 ' || t as missing
  from unnest(array['water_logs', 'exercise_logs']) t
  where to_regclass('public.' || t) is null
  union all
  select '缺少欄位 ' || x
  from unnest(array['meal_logs.has_veg', 'meal_logs.has_protein', 'focus_sessions.note', 'user_settings.accum']) x
  where not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = split_part(x, '.', 1) and column_name = split_part(x, '.', 2))
) x;
