CREATE TABLE IF NOT EXISTS signal (
  signal_id   uuid PRIMARY KEY,
  service_id  uuid NOT NULL,
  name        text NOT NULL,
  source      text,
  severity    text,
  metadata    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
)
--;
CREATE INDEX ASYNC IF NOT EXISTS signal_service_idx ON signal (service_id)
