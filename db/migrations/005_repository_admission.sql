ALTER TABLE code_repositories ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified' CHECK(verification_status IN ('unverified','verified','unavailable'));
UPDATE code_repositories r SET verification_status=CASE
 WHEN EXISTS(SELECT 1 FROM enrichment_jobs e WHERE e.repository_id=r.id AND e.status='failed' AND e.error ~ '(404|410)') THEN 'unavailable'
 WHEN r.checked_at IS NOT NULL AND r.metadata->>'private'='false' THEN 'verified'
 ELSE 'unverified' END;
CREATE OR REPLACE VIEW admitted_models AS
 SELECT m.* FROM models m WHERE m.kind<>'model' OR EXISTS(
 SELECT 1 FROM model_repositories mr JOIN code_repositories r ON r.id=mr.repository_id
 WHERE mr.model_id=m.id AND mr.active AND r.verification_status='verified'
 );
COMMENT ON VIEW admitted_models IS 'Public catalog: AI models require an active, verified public code repository. Raw candidates remain internal for source identity and future verification.';
