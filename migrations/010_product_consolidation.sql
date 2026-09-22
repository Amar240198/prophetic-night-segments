BEGIN;
ALTER TABLE miqaat_preferences ADD COLUMN prayer_configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(prayer_configuration)='object');
ALTER TABLE miqaat_preferences ADD COLUMN onboarding_step text NOT NULL DEFAULT 'welcome' CHECK (onboarding_step IN ('welcome','prayer','plan','calendar','selection','automation','complete'));
ALTER TABLE miqaat_preferences ADD COLUMN revision bigint NOT NULL DEFAULT 1;
-- Preserve established prayer configuration and automation preferences, including old horizons.
UPDATE miqaat_preferences p SET prayer_configuration=jsonb_build_object('source',a.configuration->'source','timezone',a.configuration->>'timezone'),
 onboarding_step=CASE WHEN a.configuration->>'onboardingComplete'='true' THEN 'complete' ELSE 'prayer' END
FROM miqaat_automation a WHERE a.user_id=p.user_id AND a.configuration ? 'source' AND a.configuration ? 'timezone' AND a.configuration->'source'->>'kind'<>'london-unified';
UPDATE miqaat_preferences p SET onboarding_step='complete' WHERE EXISTS (SELECT 1 FROM google_connections g WHERE g.user_id=p.user_id AND g.disconnected_at IS NULL) AND p.prayer_configuration <> '{}'::jsonb;
-- Existing browser-only choices are imported explicitly in the new UI, never discarded.
CREATE TABLE miqaat_rate_limits (
 key_hash text PRIMARY KEY,
 window_start timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 1 CHECK(attempts>0)
);
CREATE INDEX miqaat_rate_limits_window ON miqaat_rate_limits(window_start);
COMMIT;
