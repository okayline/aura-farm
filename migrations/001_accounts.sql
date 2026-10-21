CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, seen_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_player ON sessions (player_id);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT NOT NULL, window_start INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (key, window_start));
