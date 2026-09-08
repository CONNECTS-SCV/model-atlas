ALTER TABLE models ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'active' CHECK(lifecycle IN ('active','superseded','retired','duplicate'));
ALTER TABLE models ADD COLUMN IF NOT EXISTS lifecycle_reason text;
ALTER TABLE models ADD COLUMN IF NOT EXISTS lifecycle_at timestamptz;
CREATE TABLE IF NOT EXISTS model_relations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), predecessor_id uuid NOT NULL REFERENCES models(id),
 successor_id uuid NOT NULL REFERENCES models(id), relation text NOT NULL CHECK(relation IN ('recommended_successor','duplicate_of','related_version')),
 scope text NOT NULL, caveats text NOT NULL, evidence text NOT NULL, evidence_url text NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now(), snapshot jsonb NOT NULL,
 UNIQUE(predecessor_id,successor_id,relation),CHECK(predecessor_id<>successor_id)
);
CREATE TABLE IF NOT EXISTS worker_state (
 id text PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now(), heartbeat_at timestamptz NOT NULL DEFAULT now(),
 phase text NOT NULL, auth_mode text NOT NULL, last_error text
);
ALTER TABLE sources ADD COLUMN IF NOT EXISTS adapter_revision text;
ALTER TABLE model_repositories ADD COLUMN IF NOT EXISTS link_origin text NOT NULL DEFAULT 'source' CHECK(link_origin IN ('source','official','admin'));
CREATE INDEX IF NOT EXISTS models_lifecycle_idx ON models(lifecycle,kind);
