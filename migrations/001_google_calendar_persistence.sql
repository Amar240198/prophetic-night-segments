BEGIN;

CREATE TABLE google_connections (
  id uuid PRIMARY KEY,
  google_subject text NOT NULL UNIQUE CHECK (length(google_subject) BETWEEN 1 AND 255),
  google_account_email text NOT NULL CHECK (length(google_account_email) BETWEEN 1 AND 254),
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text,
  access_token_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- id is SHA-256 of the random browser session secret, never the cookie itself.
CREATE TABLE browser_sessions (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
  google_connection_id uuid NOT NULL REFERENCES google_connections(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX browser_sessions_connection_idx ON browser_sessions(google_connection_id);
CREATE INDEX browser_sessions_expiry_idx ON browser_sessions(expires_at);

COMMIT;
