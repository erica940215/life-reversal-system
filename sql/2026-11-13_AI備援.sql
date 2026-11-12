-- =========================================================
-- 序光計畫：🛟 AI 備援（已經在線上套用過；可以重複執行）
--   ai_quota：記錄哪個 AI 模型額度用完、到什麼時候前先跳過（只有後台 edge function 用）
--   edge function toeic、kb 的 ai.ts 會依序試：
--   gemini-3.8-flash → 3.7-flash → 3-flash-preview → 3.5-flash-lite → 3.1-flash-lite → 3.6-flash → 3.5-flash → gemma-4-31b → gemma-4-26b
--   （每個模型的免費額度分開算；想改順序可以在 Supabase 設定 secret「AI_TEXT_MODELS」，用逗號分隔）
-- =========================================================
create table if not exists public.ai_quota (model text primary key, until timestamptz not null, reason text, updated_at timestamptz not null default now());
alter table public.ai_quota enable row level security;
revoke all on public.ai_quota from anon, authenticated;
grant select, insert, update, delete on public.ai_quota to service_role;
