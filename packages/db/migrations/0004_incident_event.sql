CREATE TABLE IF NOT EXISTS incident_event (
  event_id       uuid PRIMARY KEY,
  incident_id    uuid NOT NULL,
  type           text NOT NULL,
  payload        jsonb NOT NULL,
  actor          text,
  origin_region  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
)
--;
CREATE INDEX ASYNC IF NOT EXISTS incident_event_stream_idx ON incident_event (incident_id, created_at)
