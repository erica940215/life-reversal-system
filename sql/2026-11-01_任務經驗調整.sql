-- =========================================================
-- 序光計畫：⚔️ 任務經驗調低（大約 -40%）
--   簡單 15 → 10、普通 30 → 18、困難 50 → 30、史詩 80 → 50
--   只改「還沒完成」的任務；已經完成的維持原本的數字（取消完成時才扣得對）
-- 可以重複執行。
-- =========================================================
update public.tasks set exp_reward = case difficulty when 'easy' then 10 when 'normal' then 18 when 'hard' then 30 when 'epic' then 50 else exp_reward end
where not completed and exp_reward is distinct from case difficulty when 'easy' then 10 when 'normal' then 18 when 'hard' then 30 when 'epic' then 50 else exp_reward end;
