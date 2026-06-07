CREATE TABLE IF NOT EXISTS service (
  service_id  uuid PRIMARY KEY,
  name        text NOT NULL,
  tier        text,
  metadata    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
)
