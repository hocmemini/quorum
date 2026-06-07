CREATE TABLE IF NOT EXISTS spike_event (
  event_id      uuid PRIMARY KEY,
  origin_region text NOT NULL,
  seq           bigint NOT NULL,
  payload       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
)
--;
CREATE INDEX ASYNC IF NOT EXISTS spike_event_created_idx ON spike_event (created_at)
