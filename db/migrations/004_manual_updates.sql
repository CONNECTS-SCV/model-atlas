CREATE TABLE IF NOT EXISTS catalog_updates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 job_ids uuid[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS catalog_updates_created_idx ON catalog_updates(created_at DESC);
