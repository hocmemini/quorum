CREATE TABLE IF NOT EXISTS proof_race (
  race_id    uuid PRIMARY KEY,
  version    integer NOT NULL,
  status     text NOT NULL,
  region     text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
)
