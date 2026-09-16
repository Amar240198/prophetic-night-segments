BEGIN;

-- Add permanent identities without renaming existing provider tables or IDs.
-- Application identities are provider-neutral; legacy table names remain adapter details.
ALTER TABLE google_connections ADD COLUMN provider text NOT NULL DEFAULT 'google';
ALTER TABLE google_connections ADD COLUMN disconnected_at timestamptz;
ALTER TABLE google_connections ALTER COLUMN encrypted_access_token DROP NOT NULL;
ALTER TABLE google_connections ALTER COLUMN access_token_expires_at DROP NOT NULL;

ALTER TABLE google_connections ADD UNIQUE (provider, google_subject);
ALTER TABLE google_connections ADD CONSTRAINT calendar_provider_valid
  CHECK (provider ~ '^[a-z][a-z0-9-]{0,39}$');


ALTER TABLE google_calendar_event_mappings ADD COLUMN app_event_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE google_calendar_event_mappings ADD COLUMN metadata_version integer NOT NULL DEFAULT 0
  CHECK (metadata_version >= 0);
ALTER TABLE google_calendar_event_mappings ADD COLUMN deleted_at timestamptz;
ALTER TABLE google_calendar_event_mappings DROP CONSTRAINT google_calendar_event_mappings_calendar_id_check;
ALTER TABLE google_calendar_event_mappings DROP CONSTRAINT google_calendar_event_mappings_google_event_id_check;
ALTER TABLE google_calendar_event_mappings DROP CONSTRAINT google_calendar_event_mappings_event_type_check;
ALTER TABLE google_calendar_event_mappings ADD CHECK (length(calendar_id) BETWEEN 1 AND 1024);
ALTER TABLE google_calendar_event_mappings ADD CHECK (length(google_event_id) BETWEEN 1 AND 2048);
ALTER TABLE google_calendar_event_mappings ADD CHECK (length(event_type) BETWEEN 1 AND 100);
ALTER TABLE google_calendar_event_mappings DROP CONSTRAINT google_calendar_event_mappings_pkey;
DO $$ DECLARE constraint_name text; BEGIN
  FOR constraint_name IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'google_calendar_event_mappings'::regclass AND contype = 'u'
  LOOP EXECUTE format('ALTER TABLE google_calendar_event_mappings DROP CONSTRAINT %I', constraint_name); END LOOP;
END $$;
ALTER TABLE google_calendar_event_mappings ADD PRIMARY KEY (app_event_id);
ALTER TABLE google_calendar_event_mappings ADD UNIQUE (google_connection_id, calendar_id, google_event_id);
ALTER TABLE google_calendar_event_mappings ADD UNIQUE (google_connection_id, calendar_id, local_night, event_type);

CREATE TABLE app_calendar_events (
  app_event_id uuid PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES google_connections(id),
  owner_application text NOT NULL DEFAULT 'prophetic-night-segments'
    CHECK (owner_application = 'prophetic-night-segments'),
  ownership_version integer NOT NULL DEFAULT 1 CHECK (ownership_version = 1),
  service_date date NOT NULL,
  event_kind text NOT NULL CHECK (length(event_kind) BETWEEN 1 AND 100),
  service_timezone text,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((start_at IS NULL AND end_at IS NULL) OR end_at >= start_at),
  UNIQUE (app_event_id, connection_id, service_date, event_kind)
);
INSERT INTO app_calendar_events (app_event_id, connection_id, service_date, event_kind)
  SELECT app_event_id, google_connection_id, local_night, event_type FROM google_calendar_event_mappings;
ALTER TABLE google_calendar_event_mappings ADD CONSTRAINT calendar_event_owner_fk
  FOREIGN KEY (app_event_id, google_connection_id, local_night, event_type)
  REFERENCES app_calendar_events (app_event_id, connection_id, service_date, event_kind);
ALTER TABLE google_calendar_event_mappings ALTER COLUMN app_event_id DROP DEFAULT;

-- A changed schedule never changes the identity or Maghrib-associated service date.
CREATE FUNCTION protect_calendar_event_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.app_event_id, NEW.connection_id, NEW.owner_application, NEW.ownership_version,
         NEW.service_date, NEW.event_kind) IS DISTINCT FROM
     ROW(OLD.app_event_id, OLD.connection_id, OLD.owner_application, OLD.ownership_version,
         OLD.service_date, OLD.event_kind)
     OR (OLD.service_timezone IS NOT NULL AND NEW.service_timezone IS DISTINCT FROM OLD.service_timezone)
  THEN RAISE EXCEPTION 'Calendar identity is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_calendar_event_identity BEFORE UPDATE ON app_calendar_events
  FOR EACH ROW EXECUTE FUNCTION protect_calendar_event_identity();

CREATE FUNCTION protect_calendar_mapping_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.app_event_id, NEW.google_connection_id, NEW.local_night, NEW.event_type,
         NEW.calendar_id, NEW.google_event_id) IS DISTINCT FROM
     ROW(OLD.app_event_id, OLD.google_connection_id, OLD.local_night, OLD.event_type,
         OLD.calendar_id, OLD.google_event_id)
     OR NEW.metadata_version < OLD.metadata_version
  THEN RAISE EXCEPTION 'Calendar mapping identity is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_calendar_mapping_identity BEFORE UPDATE ON google_calendar_event_mappings
  FOR EACH ROW EXECUTE FUNCTION protect_calendar_mapping_identity();

CREATE FUNCTION protect_calendar_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW.provider, NEW.google_subject) IS DISTINCT FROM
     ROW(OLD.id, OLD.provider, OLD.google_subject)
  THEN RAISE EXCEPTION 'Calendar account identity is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_calendar_account_identity BEFORE UPDATE ON google_connections
  FOR EACH ROW EXECUTE FUNCTION protect_calendar_account_identity();

COMMIT;
