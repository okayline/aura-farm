-- v0.47: a player's profile pic, one of A.PICS (public/engine/aura.js). NULL: none picked, so the page picks one from the name.
--   npx wrangler d1 execute aura-db --remote --file=migrations/006_pics.sql
ALTER TABLE players ADD COLUMN pic TEXT;
