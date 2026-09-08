import type { PoolClient } from 'pg';
import type { Entry } from './types';
const unionFields=['targets','tasks','purposes','conditions','algorithms','accessibility','inputs','outputs','aliases'] as const;
const scalarFields=['description_ko','family','version','organization','first_public_date','publication_date','weights_url','demo_url','runtime_requirements'] as const;
/** Rebuild the effective source-derived view; retain historical entries and official/admin claims. */
export async function reconcileModel(c:PoolClient,id:string){
 const model=(await c.query('SELECT * FROM models WHERE id=$1 FOR UPDATE',[id])).rows[0];
 const entries=(await c.query("SELECT raw FROM source_entries WHERE model_id=$1 AND status='active' ORDER BY CASE WHEN path LIKE '%.yaml' THEN 0 ELSE 1 END,last_seen DESC,id",[id])).rows.map(r=>r.raw as Entry);
 if(!entries.length)return; // A removed last source never destroys the last known catalog record.
 const official=(await c.query("SELECT DISTINCT ON(field) field,value FROM claims WHERE model_id=$1 AND origin='official' ORDER BY field,checked_at DESC",[id])).rows;
 for(const field of unionFields){if(field in model.overrides)continue;const verified=official.find(c=>c.field===field);const values=verified&&Array.isArray(verified.value)?verified.value:[...new Set(entries.flatMap(e=>e[field]||[]))];await c.query(`UPDATE models SET ${field}=$2 WHERE id=$1`,[id,values]);}
 for(const field of scalarFields){if(field in model.overrides)continue;const verified=official.find(c=>c.field===field);const value=verified?model[field]:entries.find(e=>e[field]!==null&&e[field]!==undefined)?.[field]??null;await c.query(`UPDATE models SET ${field}=$2 WHERE id=$1`,[id,value]);}
 const codeUrls=[...new Set(entries.flatMap(e=>e.codeUrls))];
 if((await c.query("SELECT 1 FROM model_repositories WHERE model_id=$1 AND active AND link_origin<>'source' LIMIT 1",[id])).rowCount&&!('accessibility' in model.overrides))await c.query("UPDATE models SET accessibility=ARRAY(SELECT DISTINCT unnest(accessibility||ARRAY['코드 공개'])) WHERE id=$1",[id]);
 const roles=[...new Set(entries.flatMap(e=>['tool','library'].includes(e.kind)||Array.isArray(e.metadata.roles)&&e.metadata.roles.includes('tool')?['tool']:[]))];
 await c.query("UPDATE models SET metadata=jsonb_set(metadata,'{roles}',$2::jsonb) WHERE id=$1",[id,JSON.stringify(roles)]);
 await c.query("UPDATE model_repositories mr SET active=(r.url=ANY($2::text[])) FROM code_repositories r WHERE mr.repository_id=r.id AND mr.model_id=$1 AND mr.link_origin='source'",[id,codeUrls]);
 await c.query("UPDATE models SET search_text=concat_ws(' ',name,array_to_string(aliases,' '),description_ko,$2::text,array_to_string(targets,' '),array_to_string(tasks,' ')) WHERE id=$1",[id,entries.map(e=>e.title).join(' ')]);
}
