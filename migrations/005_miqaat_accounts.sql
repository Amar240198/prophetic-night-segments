BEGIN;

CREATE TABLE miqaat_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (length(email) BETWEEN 3 AND 254),
  password_hash text NOT NULL CHECK (length(password_hash) BETWEEN 50 AND 512),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE miqaat_sessions (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES miqaat_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX miqaat_sessions_user_idx ON miqaat_sessions(user_id);
CREATE INDEX miqaat_sessions_expiry_idx ON miqaat_sessions(expires_at);

CREATE TABLE miqaat_preferences (
  user_id uuid PRIMARY KEY REFERENCES miqaat_users(id) ON DELETE CASCADE,
  selected_prayers jsonb NOT NULL DEFAULT '["fajr","dhuhr","asr","maghrib","isha"]'::jsonb,
  default_sync_horizon text NOT NULL DEFAULT '30',
  enabled_modules jsonb NOT NULL DEFAULT '["today","all-prayers","sixth-of-the-night","calendar"]'::jsonb,
  prayer_source text NOT NULL DEFAULT 'london-unified',
  location text NOT NULL DEFAULT 'gb-london',
  fasting_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  notification_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE miqaat_routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES miqaat_users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  routine_type text NOT NULL CHECK (routine_type ~ '^[a-z][a-z-]{1,39}$'),
  enabled boolean NOT NULL DEFAULT true,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 0 AND 1440),
  recurrence text NOT NULL DEFAULT 'daily' CHECK (recurrence IN ('daily','weekdays')),
  weekdays jsonb NOT NULL DEFAULT '[]'::jsonb,
  timing_rule jsonb NOT NULL,
  calendar_sync_enabled boolean NOT NULL DEFAULT false,
  notification_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX miqaat_routines_user_idx ON miqaat_routines(user_id, enabled);

CREATE TABLE miqaat_entitlements (
  user_id uuid PRIMARY KEY REFERENCES miqaat_users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE','PRO','BUSINESS','ENTERPRISE')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','cancelled','expired')),
  provider_customer_id text,
  provider_subscription_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE google_connections ADD COLUMN user_id uuid REFERENCES miqaat_users(id) ON DELETE SET NULL;
CREATE INDEX google_connections_user_idx ON google_connections(user_id);

COMMIT;
