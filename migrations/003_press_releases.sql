-- First-party press releases (campaign statements). Added by the team, NOT
-- AI-generated. Served by GET /api/press-releases; the frontend hides the
-- whole section when there are none.
CREATE TABLE IF NOT EXISTS press_releases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL,
  summary        text NOT NULL,
  body           text,
  url            text,
  published_date date NOT NULL DEFAULT current_date,
  published      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_press_published
  ON press_releases (published_date DESC) WHERE published;
