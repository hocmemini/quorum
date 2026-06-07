CREATE TABLE IF NOT EXISTS incident (
  incident_id    uuid PRIMARY KEY,
  signal_id      uuid,
  origin_region  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
)
--;
CREATE INDEX ASYNC IF NOT EXISTS incident_created_idx ON incident (created_at)
