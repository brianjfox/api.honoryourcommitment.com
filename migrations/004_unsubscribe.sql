-- Suppression list for campaign-update broadcasts. An email in this table is
-- never sent another broadcast, regardless of consent_contact, until/unless an
-- operator removes it. Unsubscribing also flips signatures.consent_contact to
-- false (see the API's /api/unsubscribe route) so the opt-out is demonstrable.
CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email      text PRIMARY KEY,
  reason     text NOT NULL DEFAULT 'unsubscribe',
  created_at timestamptz NOT NULL DEFAULT now()
);
