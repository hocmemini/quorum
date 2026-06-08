CREATE TABLE IF NOT EXISTS monitor_status (
  snapshot_id  uuid PRIMARY KEY,
  snapshot     jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
)
--;
CREATE INDEX ASYNC IF NOT EXISTS monitor_status_created_idx ON monitor_status (created_at)
