BEGIN;
ALTER TABLE miqaat_routines DROP CONSTRAINT miqaat_routines_recurrence_check;
ALTER TABLE miqaat_routines ADD CONSTRAINT miqaat_routines_recurrence_check
  CHECK (recurrence IN ('daily','weekdays','selected-weekdays','friday','monday','thursday','white-days','fasting-days'));
ALTER TABLE miqaat_routines ADD COLUMN notification_minutes integer
  CHECK (notification_minutes IN (0,5,10,15,30));
CREATE TABLE miqaat_automation (
  user_id uuid PRIMARY KEY REFERENCES miqaat_users(id) ON DELETE CASCADE,
  google_connection_id uuid REFERENCES google_connections(id),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  enabled boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  last_attempted_at timestamptz,
  last_success_at timestamptz,
  last_error_code text CHECK (length(last_error_code) <= 80),
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  next_sync_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX miqaat_automation_due_idx ON miqaat_automation(next_sync_at, user_id) WHERE enabled;
ALTER TABLE miqaat_entitlements DROP CONSTRAINT miqaat_entitlements_status_check;
ALTER TABLE miqaat_entitlements ADD CONSTRAINT miqaat_entitlements_status_check CHECK (status IN ('trial','active','past_due','cancelled','expired'));
ALTER TABLE miqaat_entitlements ADD COLUMN trial_started_at timestamptz;
ALTER TABLE miqaat_entitlements ADD COLUMN trial_ends_at timestamptz;
ALTER TABLE miqaat_entitlements ADD CONSTRAINT miqaat_trial_window CHECK (
  (trial_started_at IS NULL AND trial_ends_at IS NULL) OR
  (trial_started_at IS NOT NULL AND trial_ends_at = trial_started_at + interval '168 hours'));
COMMIT;
