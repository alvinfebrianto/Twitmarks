ALTER TABLE tweets ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_tweets_sort_order ON tweets(sort_order);
