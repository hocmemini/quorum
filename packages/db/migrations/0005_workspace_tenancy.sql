ALTER TABLE incident ADD COLUMN IF NOT EXISTS org_id text
--;
CREATE TABLE IF NOT EXISTS workspace (
  org_id      text PRIMARY KEY,
  name        text NOT NULL,
  join_code   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
)
--;
CREATE INDEX ASYNC IF NOT EXISTS incident_org_idx ON incident (org_id, created_at)
--;
CREATE INDEX ASYNC IF NOT EXISTS workspace_join_code_idx ON workspace (join_code)
