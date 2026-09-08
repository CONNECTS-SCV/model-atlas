ALTER TABLE model_repositories ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS document_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('paper','weights')),
 model_id uuid REFERENCES models(id), paper_id uuid REFERENCES papers(id), url text UNIQUE NOT NULL,
 status text NOT NULL DEFAULT 'queued', attempts int NOT NULL DEFAULT 0, next_run timestamptz DEFAULT now(),
 checked_at timestamptz, etag text, cache jsonb, error text
);
