-- AURA FARMING SIMULATOR database (Cloudflare D1)
--   npx wrangler d1 execute aura-db --remote --file=schema.sql

-- A player is a browser cookie. The cookie holds a random token; only its SHA-256 hash is stored.
-- Every player has a name: a random two-word one (src/names.js) until they pick their own.
CREATE TABLE IF NOT EXISTS players (
  id          INTEGER PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  name        TEXT,
  name_key    TEXT UNIQUE,            -- lowercase name, so names are unique ignoring case
  created_at  INTEGER NOT NULL,       -- unix seconds
  seen_at     INTEGER NOT NULL
);

-- A farm is a style on the board, sealed by a commitment (SHA-256 of the style and a random salt). The poster picks
-- DRIP, RIZZ or MOG when they post it; the taker picks theirs, and both are revealed at once (v0.6).
--   open    - on the board, standing (farms aura), waiting for a taker (at most 3 per player per day)
--   done    - taken: both styles faced off at once, sealed on the ledger
--   expired - the day ended with nobody taking it
-- Farms from before v0.6 were card duels (status draft too, now gone); their c_style and t_style stay null.
CREATE TABLE IF NOT EXISTS farms (
  id          INTEGER PRIMARY KEY,
  day         TEXT NOT NULL,          -- "2027-01-01" (UTC), the day it was posted
  status      TEXT NOT NULL DEFAULT 'open',
  c_id        INTEGER NOT NULL REFERENCES players(id),   -- poster (side 0)
  t_id        INTEGER REFERENCES players(id),            -- taker (side 1)
  c_salt      TEXT,
  c_commit    TEXT,
  t_salt      TEXT,
  t_commit    TEXT,
  result      TEXT,                   -- JSON, once done
  c_delta     INTEGER,
  t_delta     INTEGER,
  created_at  INTEGER NOT NULL,
  posted_at   INTEGER,
  taken_at    INTEGER,
  ended_at    INTEGER,
  c_style     TEXT,                   -- "D", "R" or "M": secret until the farm is taken
  t_style     TEXT
);
CREATE INDEX IF NOT EXISTS farms_status ON farms (status, day);
CREATE INDEX IF NOT EXISTS farms_c ON farms (c_id, day);
CREATE INDEX IF NOT EXISTS farms_t ON farms (t_id, day);

-- The ledger: one entry per finished farm (finished duel before v0.6), a SHA-256 hash chain (src/ledger.js).
CREATE TABLE IF NOT EXISTS ledger (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,          -- farm (duel before v0.6)
  day         TEXT NOT NULL,
  farm_id     INTEGER NOT NULL UNIQUE,  -- one entry per farm
  record      TEXT NOT NULL,          -- the sealed JSON record (player ids, never names)
  prev_hash   TEXT NOT NULL UNIQUE,   -- one entry per chain head: the chain can't fork
  hash        TEXT NOT NULL UNIQUE,   -- SHA-256(prev_hash + "|" + record)
  created_at  INTEGER NOT NULL
);

-- Devices loaded later with a save code or passkey: each has its own cookie token here (v0.2, migrations/001).
-- The first device's token is players.token_hash. Save codes and passkeys themselves live in the shared Accounts
-- service (dungeon-items), not here.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,         -- SHA-256 of the cookie token
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  seen_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_player ON sessions (player_id);

-- New players made by logging in, per hashed IP and hour (v0.2, migrations/001).
CREATE TABLE IF NOT EXISTS rate_limits (
  key           TEXT NOT NULL,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);
