BEGIN;
ALTER TABLE miqaat_preferences ALTER COLUMN prayer_source SET DEFAULT 'aladhan';
-- Retain existing prayer_source values as review evidence. Only new accounts default
-- to AlAdhan; existing users must explicitly confirm a replacement in Settings.
-- Pause and preserve the original source until the user explicitly chooses a replacement. No calendar events are changed.
UPDATE miqaat_automation
SET enabled=false, next_sync_at=NULL, last_error_code='PRAYER_SOURCE_REMOVED',
    revision=revision+1, updated_at=now(),
    configuration=jsonb_set(configuration, '{onboardingComplete}', 'false'::jsonb)
WHERE configuration->'source'->>'kind'='london-unified';
COMMIT;
