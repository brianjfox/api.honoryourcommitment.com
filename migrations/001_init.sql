-- Initial schema for the campaign API.
-- Postgres 13+ provides gen_random_uuid() in core (no extension needed).

-- ============================================================
-- Petition signatures
-- ============================================================
CREATE TABLE IF NOT EXISTS signatures (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name             text NOT NULL,
  last_name              text NOT NULL,
  email                  text NOT NULL UNIQUE,
  country                text NOT NULL,
  consent_processing     boolean NOT NULL,
  consent_public         boolean NOT NULL DEFAULT false,
  consent_contact        boolean NOT NULL DEFAULT false,
  privacy_policy_version text NOT NULL,
  locale                 text NOT NULL DEFAULT 'en',
  confirm_token          text,
  confirmed_at           timestamptz,
  ip_hash                text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Documented cases (evidence base)
-- ============================================================
CREATE TABLE IF NOT EXISTS cases (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name             text NOT NULL,
  last_name              text NOT NULL,
  email                  text NOT NULL UNIQUE,
  phone                  text,
  country                text NOT NULL,
  application_year       integer NOT NULL,
  investment_type        text NOT NULL,
  investment_amount      numeric(14,2),
  family_members         integer,
  status                 text,
  story                  text,
  consent_processing     boolean NOT NULL,
  privacy_policy_version text NOT NULL,
  locale                 text NOT NULL DEFAULT 'en',
  confirm_token          text,
  confirmed_at           timestamptz,
  ip_hash                text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Potential legal claimants
-- ============================================================
CREATE TABLE IF NOT EXISTS claimants (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name              text NOT NULL,
  email                  text NOT NULL UNIQUE,
  country                text NOT NULL,
  application_year       integer,
  message                text,
  consent_processing     boolean NOT NULL,
  privacy_policy_version text NOT NULL,
  locale                 text NOT NULL DEFAULT 'en',
  confirm_token          text,
  confirmed_at           timestamptz,
  ip_hash                text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Indexes for confirmation lookups and stats (confirmed-only) queries.
CREATE INDEX IF NOT EXISTS idx_signatures_confirm_token
  ON signatures (confirm_token) WHERE confirm_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signatures_confirmed_at
  ON signatures (confirmed_at) WHERE confirmed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cases_confirm_token
  ON cases (confirm_token) WHERE confirm_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cases_confirmed_at
  ON cases (confirmed_at) WHERE confirmed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_claimants_confirm_token
  ON claimants (confirm_token) WHERE confirm_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claimants_confirmed_at
  ON claimants (confirmed_at) WHERE confirmed_at IS NOT NULL;
