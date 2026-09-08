import { pool } from './db';
import { event,review } from './sync';
import { paperIdentifier } from './identity';
import type { PoolClient } from 'pg';
const dateParts=(v:unknown):string|null=>{const parts=(v as {'date-parts'?:number[][]})?.['date-parts']?.[0];return parts?.length?parts.map((n,i)=>i?String(n).padStart(2,'0'):String(n)).join('-'):null;};
export async function seedDocumentQueue(){
 await pool.query(`INSERT INTO document_jobs(kind,paper_id,url) SELECT DISTINCT 'paper',p.id,'https://api.crossref.org/works/'||substring(i from 5) FROM papers p CROSS JOIN unnest(p.identifiers) i WHERE i LIKE 'doi:%' ON CONFLICT(url) DO NOTHING`);
 await pool.query(`INSERT INTO document_jobs(kind,model_id,url) SELECT 'weights',m.id,regexp_replace(m.weights_url,'^https://huggingface.co/([^/]+/[^/?#]+).*','https://huggingface.co/api/models/\\1') FROM admitted_models m WHERE m.weights_url ~ '^https://huggingface.co/[^/]+/[^/?#]+' ON CONFLICT(url) DO NOTHING`);
}
async function officialField(c:PoolClient,m:Record<string,any>,field:string,value:string,url:string,evidence:string) {
 await c.query("INSERT INTO claims(model_id,field,value,origin,evidence,url) VALUES($1,$2,$3,'official',$4,$5) ON CONFLICT(model_id,field,origin,url) DO UPDATE SET value=excluded.value,evidence=excluded.evidence,checked_at=now()",[m.id,field,JSON.stringify(value),evidence,url]);
 if(field in m.overrides)return;
 if(m[field]&&m[field]!==value&&!(field.includes('date')&&value.startsWith(m[field]))) {await review(c,m.id,field.includes('license')?'conflicting_license':'conflicting_official_metadata',{field,existing:m[field],official:value,url});return;}
 if(m[field]!==value){await c.query(`UPDATE models SET ${field}=$2,updated_at=now() WHERE id=$1`,[m.id,value]);await event(c,m.id,null,null,field==='publication_date'?'paper_published':'metadata_verified',`${m.name} · ${field} 공식 근거 확인`,m[field],value);}
}
export async function enrichDocuments(limit=5) {
 for(let i=0;i<limit;i++) {
  const c=await pool.connect();let id:string|undefined;let kind:string|undefined;let retryAt:Date|undefined;
  try {
   await c.query('BEGIN');
   const task=(await c.query("SELECT * FROM document_jobs dj WHERE (dj.kind<>'weights' OR EXISTS(SELECT 1 FROM admitted_models am WHERE am.id=dj.model_id)) AND status IN ('queued','done','failed') AND next_run<=now() ORDER BY (kind=$1) DESC,next_run FOR UPDATE SKIP LOCKED LIMIT 1",[i%2===0?'weights':'paper'])).rows[0];
   if(!task){await c.query('ROLLBACK');break;}id=task.id;kind=task.kind;
   await c.query("UPDATE document_jobs SET status='running',next_run=now()+interval '10 minutes' WHERE id=$1",[id]);await c.query('COMMIT');
   const u=new URL(task.url);
   if(!((u.hostname==='api.crossref.org'&&u.pathname.startsWith('/works/'))||(u.hostname==='huggingface.co'&&u.pathname.startsWith('/api/models/'))))throw new Error('Unapproved metadata endpoint');
   let res:Response|undefined;
   for(let retry=0;retry<3;retry++){res=await fetch(u,{headers:{'User-Agent':'Curieus-Model-Atlas/1.0',...(task.etag?{'If-None-Match':task.etag}:{})},signal:AbortSignal.timeout(25000),redirect:'error'});if(res.status<500)break;await new Promise(r=>setTimeout(r,500*2**retry));}
   if([429,403].includes(res!.status)){const header=res!.headers.get('retry-after');const seconds=Number(header);retryAt=new Date(header&&Number.isFinite(seconds)?Date.now()+Math.max(60,seconds)*1000:header&&!Number.isNaN(Date.parse(header))?Math.max(Date.now()+60000,Date.parse(header)):Date.now()+15*60000);}
   if(!res!.ok&&res!.status!==304)throw new Error(`Official ${task.kind} metadata HTTP ${res!.status}`);
   const body=res!.status===304?task.cache:await res!.json();
   await c.query('BEGIN');
   if(task.kind==='weights') {
    const license=body.cardData?.license;
    const models=(await c.query("SELECT * FROM models WHERE regexp_replace(weights_url,'^https://huggingface.co/([^/]+/[^/?#]+).*','https://huggingface.co/api/models/\\1')=$1 FOR UPDATE",[task.url])).rows;
    for(const m of models) {
     if(typeof license==='string')await officialField(c,m,'weights_license',license,task.url,`Linked model card license: ${license}. Model ID: ${body.id}. Publisher identity may require review.`);
     const claimedDoi=(body.tags||[]).filter((t:string)=>t.startsWith('arxiv:'));
     await c.query("INSERT INTO claims(model_id,field,value,origin,evidence,url) VALUES($1,'weights_card',$2,'official',$3,$4) ON CONFLICT(model_id,field,origin,url) DO UPDATE SET value=excluded.value,checked_at=now()",[m.id,JSON.stringify({id:body.id,gated:body.gated,license:license||null}),JSON.stringify({cardData:body.cardData||null,paper_ids:claimedDoi}),task.url]);
    }
   } else {
    const p=body.message;
    if(!p?.DOI)throw new Error('Crossref response missing DOI');
    const published=p.type==='posted-content'?null:dateParts(p['published-online'])||dateParts(p['published-print'])||dateParts(p.published);
    const first=p.type==='posted-content'?dateParts(p.posted)||dateParts(p.published):null;
    const relations=Object.entries(p.relation||{}).flatMap(([relation,rs])=>['is-preprint-of','has-preprint','is-version-of','has-version'].includes(relation)?(rs as any[]).filter(r=>r['id-type']==='doi').map(r=>({relation,identifier:paperIdentifier(`https://doi.org/${r.id}`),url:`https://doi.org/${r.id}`})):[]);
    await c.query('UPDATE papers SET metadata=metadata || $2::jsonb,publication_date=coalesce($3,publication_date),first_public_date=coalesce(first_public_date,$4),identifiers=ARRAY(SELECT DISTINCT unnest(identifiers || $5::text[])),urls=ARRAY(SELECT DISTINCT unnest(urls || $7::text[])),versions=(SELECT jsonb_agg(DISTINCT v) FROM jsonb_array_elements(versions || $6::jsonb) v) WHERE id=$1',[task.paper_id,JSON.stringify({crossref:{DOI:p.DOI,title:p.title,publisher:p.publisher,type:p.type,relation:p.relation||{},checked_at:new Date().toISOString()}}),published,first,relations.map(r=>r.identifier),JSON.stringify(relations),relations.map(r=>r.url)]);
    const models=(await c.query('SELECT m.* FROM models m JOIN model_papers mp ON mp.model_id=m.id WHERE mp.paper_id=$1 ORDER BY m.id FOR UPDATE OF m',[task.paper_id])).rows;
    for(const m of models){if(published)await officialField(c,m,'publication_date',published,`https://doi.org/${p.DOI}`,JSON.stringify({type:p.type,published:p.published,'published-online':p['published-online']}));if(first)await officialField(c,m,'first_public_date',first,`https://doi.org/${p.DOI}`,JSON.stringify({type:p.type,posted:p.posted}));}
   }
   await c.query("UPDATE document_jobs SET status='done',checked_at=now(),next_run=now()+interval '14 days',etag=$2,cache=$3,error=null,attempts=0 WHERE id=$1",[id,res!.headers.get('etag'),JSON.stringify(body)]);await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');const message=e instanceof Error?e.message:'Metadata enrichment failed';if(id)await c.query("UPDATE document_jobs SET status='failed',error=$2,attempts=attempts+1,next_run=now()+interval '1 day' WHERE id=$1",[id,message]);if(retryAt)await c.query("UPDATE document_jobs SET next_run=greatest(next_run,$1::timestamptz) WHERE kind=$2 AND status IN ('queued','failed')",[retryAt,kind]);console.error(JSON.stringify({type:'document_enrich',job:id,error:message}));if(/429|403/.test(message))break;}
  finally{c.release();}
 }
}
