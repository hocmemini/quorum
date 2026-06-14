CREATE TABLE IF NOT EXISTS rate_limit (
  id         uuid PRIMARY KEY,
  ip_hash    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)
--;
CREATE INDEX ASYNC IF NOT EXISTS rate_limit_ip_created_idx ON rate_limit (ip_hash, created_at)
