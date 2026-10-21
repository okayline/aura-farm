UPDATE duels SET status = 'expired', taken_at = COALESCE(taken_at, CAST(strftime('%s', 'now') AS INTEGER)) WHERE status IN ('open', 'live');
ALTER TABLE duels ADD COLUMN c_plan TEXT;
ALTER TABLE duels DROP COLUMN c_move;
ALTER TABLE duels DROP COLUMN t_move;
ALTER TABLE duels DROP COLUMN c_reads;
