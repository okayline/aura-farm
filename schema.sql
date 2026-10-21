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

-- A duel starts as a challenge. Its two 5-card hands come from its own seed (HMAC of the server secret, its day and
-- its id), so they are never stored. A lineup is 3 slots of a hand in play order, sealed by a commitment
-- (SHA-256 of the cards and a random salt) when it is locked in.
--   draft   - dealt to the challenger, lineup not locked yet (counts toward their 3)
--   open    - on the board, standing (farms aura), waiting for a taker
--   live    - taken: rounds being played
--   done    - finished, sealed on the ledger
--   expired - the day ended with nobody taking it
CREATE TABLE IF NOT EXISTS duels (
  id          INTEGER PRIMARY KEY,
  day         TEXT NOT NULL,          -- "2027-01-01" (UTC), the day it was dealt
  status      TEXT NOT NULL DEFAULT 'draft',
  c_id        INTEGER NOT NULL REFERENCES players(id),   -- challenger (side 0)
  t_id        INTEGER REFERENCES players(id),            -- taker (side 1)
  c_slots     TEXT,                   -- JSON [2,0,4]
  c_plan      TEXT,                   -- JSON ["lock","farm","farm"]: the poster's move for each round (v0.3)
  c_salt      TEXT,
  c_commit    TEXT,
  t_slots     TEXT,
  t_salt      TEXT,
  t_commit    TEXT,
  moves       TEXT NOT NULL DEFAULT '[]',   -- JSON [["lock","farm"], ...], one pair per finished round
  n           INTEGER NOT NULL DEFAULT 0,   -- length of moves (guards against two requests resolving one round)
  t_reads     TEXT NOT NULL DEFAULT '[]',   -- the taker's VIBES peeks
  result      TEXT,                   -- JSON, once done
  c_delta     INTEGER,
  t_delta     INTEGER,
  created_at  INTEGER NOT NULL,
  posted_at   INTEGER,
  taken_at    INTEGER,
  ended_at    INTEGER
);
CREATE INDEX IF NOT EXISTS duels_status ON duels (status, day);
CREATE INDEX IF NOT EXISTS duels_c ON duels (c_id, day);
CREATE INDEX IF NOT EXISTS duels_t ON duels (t_id, day);

-- VIBES: everyone holds 1 at the start of each UTC day, +1 per DIP (up to 3), -1 per read.
CREATE TABLE IF NOT EXISTS vibes (
  player_id   INTEGER NOT NULL REFERENCES players(id),
  day         TEXT NOT NULL,
  balance     INTEGER NOT NULL,
  PRIMARY KEY (player_id, day)
);

-- The ledger: one entry per finished duel, a SHA-256 hash chain (src/ledger.js).
CREATE TABLE IF NOT EXISTS ledger (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,          -- duel
  day         TEXT NOT NULL,
  duel_id     INTEGER NOT NULL UNIQUE,  -- one entry per duel
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
