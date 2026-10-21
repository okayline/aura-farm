-- v0.5: duels are lineup vs lineup, decided when taken. No plans, moves or rounds in play.
-- Drafts, open challenges and live duels were dealt from the old 20-card deck (the deal is different now): they
-- expire, and stop standing now.
UPDATE duels SET status = 'expired', taken_at = COALESCE(taken_at, CAST(strftime('%s', 'now') AS INTEGER)) WHERE status IN ('draft', 'open', 'live');
ALTER TABLE duels DROP COLUMN c_plan;
ALTER TABLE duels DROP COLUMN moves;
ALTER TABLE duels DROP COLUMN n;
ALTER TABLE duels DROP COLUMN t_reads;
CREATE TABLE IF NOT EXISTS peeks (
  duel_id     INTEGER NOT NULL REFERENCES duels(id),
  player_id   INTEGER NOT NULL REFERENCES players(id),
  slot        INTEGER NOT NULL,
  PRIMARY KEY (duel_id, player_id, slot)
);
