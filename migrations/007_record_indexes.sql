
-- v0.63: so a player's finished farms (their record of styles, on The Farm and on a farm's page) are found without
-- reading every finished farm in the game.
--   npx wrangler d1 execute aura-db --remote --file=migrations/007_record_indexes.sql
CREATE INDEX IF NOT EXISTS farms_c_status ON farms (c_id, status, id);
CREATE INDEX IF NOT EXISTS farms_t_status ON farms (t_id, status, id);
