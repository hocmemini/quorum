# Migrations

Hand-authored SQL only. Filenames sort lexicographically and run in that order, e.g.
`0001_init.sql`, `0002_events.sql`.

## Rules (enforced by the runner / locked in CLAUDE.md)

- **One DDL statement per transaction**, one explicit `COMMIT` each. The runner wraps every
  statement in its own `BEGIN`/`COMMIT`.
- Separate statements within a file with a line containing **only** `--;`.
- **`CREATE INDEX ASYNC` only**, never a synchronous index build.
- **No foreign keys, no sequences.** UUID v4 primary keys (`gen_random_uuid()`); integrity
  is enforced in the application layer.
- Isolation is **Repeatable Read** and is never changed.
- Prefer idempotent DDL (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX ASYNC IF NOT EXISTS`)
  so a partially-applied file is safe to re-run.

Applied migrations are tracked in `schema_migrations` (created automatically).

## Example

```sql
CREATE TABLE IF NOT EXISTS event (
  event_id   uuid PRIMARY KEY,        -- also the idempotency key
  stream_id  uuid NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)
--;
CREATE INDEX ASYNC IF NOT EXISTS event_stream_idx ON event (stream_id, created_at)
```

Run with:

```sh
pnpm --filter @quorum/db migrate
```
