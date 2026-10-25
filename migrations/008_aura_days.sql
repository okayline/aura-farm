-- v0.98: a player's aura on each day that has ended, saved the first time someone opens their page (a day that has
-- ended never changes). A player's lifetime aura is these days added up plus today so far, worked out when the page loads.
--   npx wrangler d1 execute aura-db --remote --file=migrations/008_aura_days.sql
CREATE TABLE IF NOT EXISTS aura_days (
  player_id  INTEGER NOT NULL REFERENCES players(id),
  day        TEXT NOT NULL,           -- "2027-01-01" (UTC), a day that has ended
  aura       INTEGER NOT NULL,        -- the player's aura on that day (battles taken that day plus standing)
  PRIMARY KEY (player_id, day)
);
