BEGIN;

CREATE TABLE miqaat_password_resets (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES miqaat_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX miqaat_password_resets_user_idx ON miqaat_password_resets(user_id, created_at DESC);
CREATE INDEX miqaat_password_resets_expiry_idx ON miqaat_password_resets(expires_at)
  WHERE used_at IS NULL;

COMMIT;
