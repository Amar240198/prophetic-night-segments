BEGIN;
ALTER TABLE miqaat_entitlements DROP CONSTRAINT miqaat_entitlements_status_check;
ALTER TABLE miqaat_entitlements ADD CONSTRAINT miqaat_entitlements_status_check CHECK(status IN ('active','trial','trialing','past_due','unpaid','canceled','cancelled','expired','incomplete','incomplete_expired','paused'));
ALTER TABLE miqaat_entitlements ADD COLUMN stripe_price_id text;
ALTER TABLE miqaat_entitlements ADD COLUMN stripe_livemode boolean;
ALTER TABLE miqaat_entitlements ADD COLUMN current_period_start timestamptz;
ALTER TABLE miqaat_entitlements ADD COLUMN current_period_end timestamptz;
ALTER TABLE miqaat_entitlements ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false;
ALTER TABLE miqaat_entitlements ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE miqaat_entitlements ADD COLUMN checkout_session_id text;
ALTER TABLE miqaat_entitlements ADD COLUMN checkout_attempt_id uuid;
ALTER TABLE miqaat_entitlements ADD COLUMN billing_lock uuid;
ALTER TABLE miqaat_entitlements ADD COLUMN billing_lock_until timestamptz;
CREATE UNIQUE INDEX miqaat_stripe_customer_unique ON miqaat_entitlements(provider_customer_id) WHERE provider_customer_id IS NOT NULL;
CREATE UNIQUE INDEX miqaat_stripe_subscription_unique ON miqaat_entitlements(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;
CREATE TABLE miqaat_stripe_events (
 stripe_event_id text PRIMARY KEY,
 event_type text NOT NULL,
 livemode boolean NOT NULL,
 user_id uuid REFERENCES miqaat_users(id) ON DELETE SET NULL,
 processed_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
