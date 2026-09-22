BEGIN;
ALTER TABLE google_connections ADD COLUMN granted_scopes text NOT NULL DEFAULT '';
ALTER TABLE google_connections ADD COLUMN management_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE miqaat_preferences ADD COLUMN prayer_analysis jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE calendar_preferences (
  connection_id uuid NOT NULL REFERENCES google_connections(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google','microsoft','apple','ics')),
  calendar_id text NOT NULL CHECK (length(calendar_id) BETWEEN 1 AND 1024),
  read_enabled boolean NOT NULL DEFAULT true,
  write_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, provider, calendar_id)
);
CREATE TABLE calendar_mutation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES google_connections(id),
  user_id uuid REFERENCES miqaat_users(id),
  provider text NOT NULL DEFAULT 'google',
  operation text NOT NULL,
  calendar_id text NOT NULL,
  external_event_id text,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  status text NOT NULL,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calendar_mutation_audit_connection ON calendar_mutation_audit(connection_id, created_at);
COMMIT;
