BEGIN;

CREATE TABLE google_calendar_event_mappings (
  google_connection_id uuid NOT NULL REFERENCES google_connections(id) ON DELETE CASCADE,
  local_night date NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'wake', 'last-third', 'part-4', 'part-5', 'dawud-prayer', 'part-6',
    'fajr-preparation', 'first-adhan-reminder', 'fajr', 'final-sixth', 'prayer'
  )),
  calendar_id text NOT NULL DEFAULT 'primary' CHECK (calendar_id = 'primary'),
  google_event_id text NOT NULL CHECK (google_event_id ~ '^[0-9a-f]{64}$'),
  payload_hash text CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  synced_at timestamptz,
  PRIMARY KEY (google_connection_id, local_night, event_type),
  UNIQUE (google_connection_id, google_event_id)
);

-- Durable mutual exclusion across tabs, sessions, and serverless instances.
CREATE TABLE google_calendar_sync_leases (
  google_connection_id uuid PRIMARY KEY REFERENCES google_connections(id) ON DELETE CASCADE,
  owner uuid NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE google_calendar_sync_preferences (
  google_connection_id uuid PRIMARY KEY REFERENCES google_connections(id) ON DELETE CASCADE,
  sync_mode text NOT NULL CHECK (sync_mode IN ('fixed', 'continuous')),
  -- Numeric horizon allows additional product choices without a schema migration.
  horizon_days integer NOT NULL CHECK (horizon_days BETWEEN 1 AND 3660),
  configuration_version integer NOT NULL DEFAULT 1 CHECK (configuration_version > 0),
  requested_start_date date NOT NULL,
  prayer_source jsonb NOT NULL CHECK (jsonb_typeof(prayer_source) = 'object'),
  selected_event_types text[] NOT NULL CHECK (cardinality(selected_event_types) BETWEEN 1 AND 32),
  planning_options jsonb NOT NULL CHECK (jsonb_typeof(planning_options) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A future authorized worker can enumerate rolling preferences; no worker runs now.
CREATE INDEX google_calendar_continuous_preferences_idx
  ON google_calendar_sync_preferences (google_connection_id) WHERE sync_mode = 'continuous';

COMMIT;
