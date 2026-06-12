-- Daily-curated external news coverage, populated by scripts/fetch-news.js
-- (Claude + web search). Each run writes a batch; the API serves the newest.
CREATE TABLE IF NOT EXISTS news_articles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url            text NOT NULL UNIQUE,
  title          text NOT NULL,
  source         text NOT NULL,
  summary        text NOT NULL,
  published_date date,
  language       text NOT NULL DEFAULT 'en',
  batch_id       uuid NOT NULL,
  position       integer NOT NULL DEFAULT 0,
  fetched_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_fetched_at ON news_articles (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_batch ON news_articles (batch_id);
