CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS sources (
 id text PRIMARY KEY, repo text UNIQUE NOT NULL, label text NOT NULL, adapter text NOT NULL,
 commit_sha text, last_success timestamptz, next_run timestamptz DEFAULT now(), last_error text,
 stats jsonb NOT NULL DEFAULT '{}', enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id text REFERENCES sources(id),
 type text NOT NULL DEFAULT 'sync', status text NOT NULL DEFAULT 'queued', commit_sha text,
 started_at timestamptz, finished_at timestamptz, created_at timestamptz DEFAULT now(),
 stats jsonb NOT NULL DEFAULT '{}', error text
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_sync ON jobs(source_id) WHERE status IN ('queued','running') AND type='sync';
CREATE TABLE IF NOT EXISTS models (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, normalized_name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('model','tool','paper','dataset','review','library','benchmark')),
 aliases text[] NOT NULL DEFAULT '{}', family text, version text, description_ko text,
 targets text[] NOT NULL DEFAULT '{}', tasks text[] NOT NULL DEFAULT '{}', purposes text[] NOT NULL DEFAULT '{}',
 conditions text[] NOT NULL DEFAULT '{}', algorithms text[] NOT NULL DEFAULT '{}', accessibility text[] NOT NULL DEFAULT '{}',
 inputs text[] NOT NULL DEFAULT '{}', outputs text[] NOT NULL DEFAULT '{}', organization text,
 first_public_date text, publication_date text, code_license text, weights_license text, data_license text,
 weights_url text, demo_url text, runtime_requirements text, experimental_evidence jsonb,
 metadata jsonb NOT NULL DEFAULT '{}', overrides jsonb NOT NULL DEFAULT '{}',
 first_seen timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 search_text text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS model_name_idx ON models(normalized_name);
CREATE INDEX IF NOT EXISTS model_search_idx ON models USING gin(search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS model_targets_idx ON models USING gin(targets);
CREATE INDEX IF NOT EXISTS model_tasks_idx ON models USING gin(tasks);
CREATE TABLE IF NOT EXISTS papers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), identity text UNIQUE NOT NULL, title text NOT NULL,
 identifiers text[] NOT NULL DEFAULT '{}', urls text[] NOT NULL DEFAULT '{}',
 versions jsonb NOT NULL DEFAULT '[]', first_public_date text, publication_date text
);
CREATE INDEX IF NOT EXISTS paper_identifiers_idx ON papers USING gin(identifiers);
CREATE TABLE IF NOT EXISTS model_papers (model_id uuid REFERENCES models(id), paper_id uuid REFERENCES papers(id), PRIMARY KEY(model_id,paper_id));
CREATE TABLE IF NOT EXISTS code_repositories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), url text UNIQUE NOT NULL,
 last_activity timestamptz, checked_at timestamptz, license text, license_url text, metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS model_repositories (model_id uuid REFERENCES models(id), repository_id uuid REFERENCES code_repositories(id), PRIMARY KEY(model_id,repository_id));
CREATE TABLE IF NOT EXISTS source_files (
 source_id text REFERENCES sources(id), path text NOT NULL, blob_sha text NOT NULL, commit_sha text NOT NULL,
 entry_count int NOT NULL, PRIMARY KEY(source_id,path)
);
CREATE TABLE IF NOT EXISTS source_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id text REFERENCES sources(id), path text NOT NULL,
 entry_key text NOT NULL, model_id uuid REFERENCES models(id), commit_sha text NOT NULL,
 location text NOT NULL, raw jsonb NOT NULL, semantic_hash text NOT NULL,
 status text NOT NULL DEFAULT 'active', first_seen timestamptz DEFAULT now(), last_seen timestamptz DEFAULT now(),
 UNIQUE(source_id,path,entry_key)
);
CREATE INDEX IF NOT EXISTS source_entry_model_idx ON source_entries(model_id);
CREATE TABLE IF NOT EXISTS claims (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), model_id uuid REFERENCES models(id), field text NOT NULL,
 value jsonb NOT NULL, origin text NOT NULL CHECK(origin IN ('source','inferred','official','admin')),
 evidence text NOT NULL, url text, checked_at timestamptz DEFAULT now(),
 UNIQUE(model_id,field,origin,url)
);
CREATE TABLE IF NOT EXISTS events (
 id bigserial PRIMARY KEY, model_id uuid REFERENCES models(id), source_id text REFERENCES sources(id),
 job_id uuid REFERENCES jobs(id), type text NOT NULL, summary text NOT NULL, before_value jsonb, after_value jsonb,
 created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_date_idx ON events(created_at DESC);
CREATE TABLE IF NOT EXISTS reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), model_id uuid REFERENCES models(id),
 reason text NOT NULL, details jsonb NOT NULL, status text NOT NULL DEFAULT 'pending',
 resolution text, created_at timestamptz DEFAULT now(), resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_review ON reviews(model_id,reason) WHERE status='pending';
CREATE TABLE IF NOT EXISTS enrichment_jobs (
 repository_id uuid PRIMARY KEY REFERENCES code_repositories(id), status text NOT NULL DEFAULT 'queued',
 next_run timestamptz DEFAULT now(), attempts int NOT NULL DEFAULT 0, error text
);
INSERT INTO sources(id,repo,label,adapter) VALUES
 ('conformation','AspirinCode/awesome-AI4MolConformation-MD','Molecular Conformation & MD','conformation'),
 ('molecular','AspirinCode/papers-for-molecular-design-using-DL','Molecular Design','molecular'),
 ('protein','Peldom/papers_for_protein_design_using_DL','Protein Design','protein'),
 ('antibody','JY-Bioinfo/awesome-ai-antibody-design','AI Antibody Design','antibody'),
 ('nucleotide','WangHuiNEU/Awesome-Nucleotide-Foundation-Models','Nucleotide Foundation Models','nucleotide')
ON CONFLICT(id) DO NOTHING;
