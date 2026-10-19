-- =========================================================
-- 序光計畫：👥 好友
-- 整段貼到 Supabase 的 SQL Editor 按 Run，可以重複執行。
--
--   friend_codes       每個人的好友碼、要不要讓好友看到狀態
--   friendships        好友關係（pending 等對方同意 / accepted 已經是好友）
--   focus_presence     現在是不是在專注（網頁上按開始、暫停、結束時會更新）
--
--   friend_my_code()            我的好友碼（第一次呼叫會自動產生）
--   friend_set_share(bool)      要不要讓好友看到我的狀態
--   friend_request(code)        用好友碼送出邀請（對方也邀請過你就直接成為好友）
--   friend_respond(uuid, bool)  同意／拒絕邀請
--   friend_remove(uuid)         刪除好友或取消邀請
--   friend_presence(...)        更新自己的專注狀態
--   friend_list()               好友清單＋每個人今天的狀態
--
-- 好友看到的只有：名字、今天完成幾個任務、現在是否在專注、這次專注多久、今天專注幾分鐘。
-- 看不到任務名稱、專注科目或其他資料。三張表都不能直接讀寫，只能透過上面的函式。
-- =========================================================


-- ---------- 🎫 好友碼 ----------
create table if not exists public.friend_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  share boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- 🤝 好友關係（user_a < user_b，一對只存一列） ----------
create table if not exists public.friendships (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create index if not exists friendships_b on public.friendships (user_b);

-- ---------- ⏱️ 專注狀態 ----------
create table if not exists public.focus_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'idle' check (status in ('running', 'paused', 'idle')),
  seg_start timestamptz,          -- 這一段開始的時間（running 才有）
  acc_ms bigint not null default 0, -- 之前幾段加起來幾毫秒
  started_at timestamptz,         -- 這次專注開始的時間
  updated_at timestamptz not null default now()
);

alter table public.friend_codes enable row level security;
alter table public.friendships enable row level security;
alter table public.focus_presence enable row level security;
revoke all on public.friend_codes from anon, authenticated;
revoke all on public.friendships from anon, authenticated;
revoke all on public.focus_presence from anon, authenticated;


-- ---------- 小工具 ----------
create or replace function public.friend_pair(p_x uuid, p_y uuid, out a uuid, out b uuid)
language sql immutable
as $$ select least(p_x, p_y), greatest(p_x, p_y) $$;

create or replace function public.friend_new_code()
returns text language plpgsql volatile
as $function$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- 拿掉容易看錯的 0 O 1 I
  v text;
begin
  loop
    v := '';
    for i in 1..6 loop
      v := v || substr(chars, 1 + floor(random() * length(chars))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.friend_codes where code = v);
  end loop;
  return v;
end;
$function$;

revoke all on function public.friend_pair(uuid, uuid) from public, anon, authenticated;
revoke all on function public.friend_new_code() from public, anon, authenticated;


-- ---------- 🎫 我的好友碼 ----------
create or replace function public.friend_my_code()
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  r public.friend_codes;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select * into r from public.friend_codes where user_id = v_user;
  if not found then
    insert into public.friend_codes (user_id, code) values (v_user, public.friend_new_code())
      on conflict (user_id) do nothing;
    select * into r from public.friend_codes where user_id = v_user;
  end if;
  return jsonb_build_object('code', r.code, 'share', r.share);
end;
$function$;

grant execute on function public.friend_my_code() to authenticated;


create or replace function public.friend_set_share(p_share boolean)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not signed in'; end if;
  perform public.friend_my_code();
  update public.friend_codes set share = coalesce(p_share, true) where user_id = v_user;
  return jsonb_build_object('ok', true, 'share', coalesce(p_share, true));
end;
$function$;

grant execute on function public.friend_set_share(boolean) to authenticated;


-- ---------- 🤝 送出邀請 ----------
create or replace function public.friend_request(p_code text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_other uuid;
  v_a uuid;
  v_b uuid;
  r public.friendships;
begin
  if v_user is null then raise exception 'not signed in'; end if;

  select user_id into v_other from public.friend_codes where code = upper(trim(coalesce(p_code, '')));
  if v_other is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_other = v_user then return jsonb_build_object('ok', false, 'reason', 'self'); end if;

  select a, b into v_a, v_b from public.friend_pair(v_user, v_other);
  select * into r from public.friendships where user_a = v_a and user_b = v_b for update;

  if found then
    if r.status = 'accepted' then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
    if r.requested_by = v_user then return jsonb_build_object('ok', false, 'reason', 'pending'); end if;
    /* 對方已經邀請過你 → 直接成為好友 */
    update public.friendships set status = 'accepted', accepted_at = now() where user_a = v_a and user_b = v_b;
    return jsonb_build_object('ok', true, 'status', 'accepted');
  end if;

  /* 一個人最多 100 個好友／邀請 */
  if (select count(*) from public.friendships where user_a = v_user or user_b = v_user) >= 100 then
    return jsonb_build_object('ok', false, 'reason', 'limit');
  end if;

  insert into public.friendships (user_a, user_b, requested_by) values (v_a, v_b, v_user);
  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$function$;

grant execute on function public.friend_request(text) to authenticated;


-- ---------- ✅ 同意／拒絕 ----------
create or replace function public.friend_respond(p_other uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_a uuid;
  v_b uuid;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select a, b into v_a, v_b from public.friend_pair(v_user, p_other);

  if p_accept then
    update public.friendships set status = 'accepted', accepted_at = now()
      where user_a = v_a and user_b = v_b and status = 'pending' and requested_by <> v_user;
  else
    delete from public.friendships
      where user_a = v_a and user_b = v_b and status = 'pending' and requested_by <> v_user;
  end if;

  return jsonb_build_object('ok', found);
end;
$function$;

grant execute on function public.friend_respond(uuid, boolean) to authenticated;


-- ---------- ❌ 刪除好友／取消邀請 ----------
create or replace function public.friend_remove(p_other uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_a uuid;
  v_b uuid;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select a, b into v_a, v_b from public.friend_pair(v_user, p_other);
  delete from public.friendships where user_a = v_a and user_b = v_b;
  return jsonb_build_object('ok', found);
end;
$function$;

grant execute on function public.friend_remove(uuid) to authenticated;


-- ---------- ⏱️ 更新自己的專注狀態 ----------
create or replace function public.friend_presence(p_status text, p_seg_start timestamptz, p_acc_ms bigint, p_started_at timestamptz)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_status text := case when p_status in ('running', 'paused') then p_status else 'idle' end;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  insert into public.focus_presence (user_id, status, seg_start, acc_ms, started_at, updated_at)
  values (v_user, v_status,
          case when v_status = 'running' then least(coalesce(p_seg_start, now()), now()) end,
          case when v_status = 'idle' then 0 else greatest(0, least(coalesce(p_acc_ms, 0), 86400000)) end,
          case when v_status = 'idle' then null else least(coalesce(p_started_at, now()), now()) end,
          now())
  on conflict (user_id) do update
    set status = excluded.status, seg_start = excluded.seg_start, acc_ms = excluded.acc_ms,
        started_at = excluded.started_at, updated_at = now();
end;
$function$;

grant execute on function public.friend_presence(text, timestamptz, bigint, timestamptz) to authenticated;


-- ---------- 📋 好友清單 ----------
create or replace function public.friend_list()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_day date := public.app_today();
  v_start timestamptz := (v_day::timestamp + interval '2 hours') at time zone 'Asia/Taipei';
  v_out jsonb := '[]'::jsonb;
  f record;
  v_name text;
  v_share boolean;
  v_tasks integer;
  v_focus_sec bigint;
  p public.focus_presence;
  v_live_ms bigint;
  v_state text;
  v_last timestamptz;
begin
  if v_user is null then raise exception 'not signed in'; end if;

  for f in
    select case when user_a = v_user then user_b else user_a end as other,
           status, requested_by, created_at, accepted_at
      from public.friendships
     where user_a = v_user or user_b = v_user
     order by status, coalesce(accepted_at, created_at) desc
  loop
    select coalesce(nullif(trim(username), ''), '玩家') into v_name from public.profiles where id = f.other;
    v_name := coalesce(v_name, '玩家');

    if f.status <> 'accepted' then
      v_out := v_out || jsonb_build_object('id', f.other, 'name', v_name, 'status', 'pending',
                                           'incoming', f.requested_by <> v_user, 'since', f.created_at);
      continue;
    end if;

    select coalesce(share, true) into v_share from public.friend_codes where user_id = f.other;
    v_share := coalesce(v_share, true);

    if not v_share then
      v_out := v_out || jsonb_build_object('id', f.other, 'name', v_name, 'status', 'accepted', 'hidden', true);
      continue;
    end if;

    begin
      execute 'select count(*) from public.tasks where user_id = $1 and completed = true and completed_at >= $2'
        into v_tasks using f.other, v_start;
    exception when others then v_tasks := 0; end;

    select coalesce(sum(duration_seconds), 0) into v_focus_sec
      from public.focus_sessions where user_id = f.other and session_date = v_day;

    select * into p from public.focus_presence where user_id = f.other;
    v_state := 'idle';
    v_live_ms := 0;
    /* 超過 12 小時沒更新的就當作沒在專注 */
    if found and p.status <> 'idle' and p.updated_at > now() - interval '12 hours' then
      v_state := p.status;
      v_live_ms := p.acc_ms + case when p.status = 'running' and p.seg_start is not null
                                   then (extract(epoch from (now() - p.seg_start)) * 1000)::bigint else 0 end;
    end if;

    select greatest(
             (select max(completed_at) from public.tasks where user_id = f.other and completed = true),
             (select max(ended_at) from public.focus_sessions where user_id = f.other),
             p.updated_at)
      into v_last;

    v_out := v_out || jsonb_build_object(
      'id', f.other, 'name', v_name, 'status', 'accepted',
      'tasks_today', v_tasks,
      'focus_today_sec', v_focus_sec,
      'focus_state', v_state,
      'focus_live_ms', v_live_ms,
      'last_active', v_last
    );
  end loop;

  return jsonb_build_object('now', now(), 'friends', v_out);
end;
$function$;

grant execute on function public.friend_list() to authenticated;
