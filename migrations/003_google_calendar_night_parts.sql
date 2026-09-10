BEGIN;

-- Add duration-event IDs while retaining every existing marker and mapping.
ALTER TABLE google_calendar_event_mappings
  DROP CONSTRAINT google_calendar_event_mappings_event_type_check;
ALTER TABLE google_calendar_event_mappings
  ADD CONSTRAINT google_calendar_event_mappings_event_type_check CHECK (event_type IN (
    'wake', 'last-third', 'part-4', 'part-5', 'dawud-prayer', 'part-6',
    'fajr-preparation', 'first-adhan-reminder', 'fajr', 'final-sixth', 'prayer',
    'night-part-1', 'night-part-2', 'night-part-3',
    'night-part-4', 'night-part-5', 'night-part-6'
  ));

COMMIT;
