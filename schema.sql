CREATE TABLE IF NOT EXISTS tweets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  embed_html TEXT NOT NULL,
  search_text TEXT,
  tweet_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tweets_sort_order ON tweets(sort_order);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
  ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (scope, key_hash, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_created_at
  ON rate_limits(created_at);
