import type { PoolClient } from 'pg';
import { pool } from './db';
import { hash, normalizeName, paperIdentifier } from './identity';
import { parseFile, selectFiles, semantic } from './adapters';
import { latestCommit, rawFile, repositoryTree, UpstreamError } from './github';
import { reconcileModel } from './reconcile';
import type { Entry } from './types';

export async function review(c:PoolClient,id:string,reason:string,details:unknown) {await c.query("INSERT INTO reviews(model_id,reason,details) VALUES($1,$2,$3) ON CONFLICT(model_id,reason) WHERE status='pending' DO UPDATE SET details=excluded.details",[id,reason,JSON.stringify(details)]);}
export async function event(c:PoolClient,model:string|null,source:string|null,job:string|null,type:string,summary:string,before:unknown=null,after:unknown=null){await c.query('INSERT INTO events(model_id,source_id,job_id,type,summary,before_value,after_value) VALUES($1,$2,$3,$4,$5,$6,$7)',[model,source,job,type,summary,before===null?null:JSON.stringify(before),after===null?null:JSON.stringify(after)]);}
const fields=['name','kind','aliases','family','version','description_ko','targets','tasks','purposes','conditions','algorithms','accessibility','inputs','outputs','organization','first_public_date','publication_date','weights_url','demo_url','runtime_requirements'] as const;
async function attachPapers(c:PoolClient,id:string,e:Entry) {
 if(e.paperUrls.length) {
  const identifiers=[...new Set(e.paperUrls.map(paperIdentifier))];
  let p=(await c.query('SELECT * FROM papers WHERE identifiers && $1::text[] ORDER BY id LIMIT 1',[identifiers])).rows[0];
  const versions=e.paperUrls.map(url=>({url,identifier:paperIdentifier(url)}));
  if(!p)p=(await c.query('INSERT INTO papers(identity,title,identifiers,urls,versions,first_public_date,publication_date) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(identity) DO UPDATE SET identity=excluded.identity RETURNING *',[identifiers[0],e.title,identifiers,e.paperUrls,JSON.stringify(versions),e.first_public_date,e.publication_date])).rows[0];
  else await c.query('UPDATE papers SET identifiers=ARRAY(SELECT DISTINCT unnest(identifiers || $2::text[])),urls=ARRAY(SELECT DISTINCT unnest(urls || $3::text[])),versions=(SELECT jsonb_agg(DISTINCT v) FROM jsonb_array_elements(versions || $4::jsonb) v),first_public_date=coalesce(first_public_date,$5),publication_date=coalesce(publication_date,$6) WHERE id=$1',[p.id,identifiers,e.paperUrls,JSON.stringify(versions),e.first_public_date,e.publication_date]);
  await c.query('INSERT INTO model_papers VALUES($1,$2) ON CONFLICT DO NOTHING',[id,p.id]);
 }
 for(const url of e.codeUrls) {
  const r=(await c.query('INSERT INTO code_repositories(url) VALUES($1) ON CONFLICT(url) DO UPDATE SET url=excluded.url RETURNING id',[url])).rows[0];
  await c.query('INSERT INTO model_repositories(model_id,repository_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,r.id]);
  if(url.startsWith('https://github.com/'))await c.query('INSERT INTO enrichment_jobs(repository_id) VALUES($1) ON CONFLICT DO NOTHING',[r.id]);
 }
}
async function resolveModel(c:PoolClient,e:Entry,existingId?:string):Promise<{id:string;created:boolean;ambiguous:boolean}> {
 if(existingId)return {id:existingId,created:false,ambiguous:false};
 const names=[e.name,...e.aliases].map(normalizeName);
 const ids=e.paperUrls.map(paperIdentifier);
 const candidates=(await c.query(`SELECT DISTINCT m.* FROM models m LEFT JOIN model_papers mp ON mp.model_id=m.id LEFT JOIN papers p ON p.id=mp.paper_id WHERE m.normalized_name=ANY($1::text[]) OR EXISTS(SELECT 1 FROM unnest(m.aliases) a WHERE lower(regexp_replace(a,'[^[:alnum:]]','','g'))=ANY($1::text[])) OR p.identifiers && $2::text[]`,[names,ids])).rows;
 const same=candidates.filter(m=>names.includes(m.normalized_name)||m.aliases.some((a:string)=>names.includes(normalizeName(a))));
 if(same.length===1) {
  const m=same[0];
  const repos=(await c.query('SELECT r.url FROM code_repositories r JOIN model_repositories mr ON mr.repository_id=r.id WHERE mr.model_id=$1',[m.id])).rows.map(x=>x.url);
  const sharedPaper=(await c.query('SELECT 1 FROM papers p JOIN model_papers mp ON mp.paper_id=p.id WHERE mp.model_id=$1 AND p.identifiers && $2::text[] LIMIT 1',[m.id,ids])).rowCount;
  if(sharedPaper||(e.demo_url&&m.demo_url&&e.demo_url.replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,'')===m.demo_url.replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,''))||e.codeUrls.some(x=>repos.some((r:string)=>r.toLowerCase()===x.toLowerCase()))||(!repos.length&&!e.codeUrls.length&&e.kind==='paper'))return {id:m.id,created:false,ambiguous:false};
 }
 // Named model vs anonymous paper can share a paper entity, but never merge distinct named implementations.
 const values=fields.map(k=>e[k]);
 const sql=`INSERT INTO models(${fields.join(',')},normalized_name,metadata,search_text) VALUES(${values.map((_,i)=>`$${i+1}`).join(',')},$${values.length+1},$${values.length+2},$${values.length+3}) RETURNING id`;
 const id=(await c.query(sql,[...values,normalizeName(e.name),JSON.stringify(e.metadata),[e.name,...e.aliases,e.title,e.description_ko,...e.targets,...e.tasks].join(' ')])).rows[0].id;
 const ambiguous=same.length>0;
 if(ambiguous)await review(c,id,'ambiguous_duplicate',{candidate_ids:same.map(m=>m.id),name:e.name,reason:'동일 이름이나 공통 논문·공식 코드 근거가 부족함'});
 if(e.needsReview)await review(c,id,'unclear_model_identity',{title:e.title,reason:'논문은 수집했으나 모델 이름을 확정하지 못함'});
 return {id,created:true,ambiguous};
}
export async function applyEntries(c:PoolClient,source:{id:string;repo:string},path:string,commit:string,job:string,entries:Entry[],stats:Record<string,number>) {
 const old=(await c.query('SELECT * FROM source_entries WHERE source_id=$1 AND path=$2',[source.id,path])).rows;
 if(old.filter(x=>x.status==='active').length>20&&entries.length<old.filter(x=>x.status==='active').length*.5)throw new Error(`Suspicious count drop in ${path}: manual parser review required; existing data preserved`);
 for(const e of entries) {
  const prior=old.find(x=>x.entry_key===e.key);const digest=hash(semantic(e));
  if(prior?.semantic_hash===digest&&prior.status==='active') {
   await c.query('UPDATE source_entries SET commit_sha=$1,location=$2,last_seen=now() WHERE id=$3',[commit,e.location,prior.id]);continue;
  }
  const {id,created,ambiguous}=await resolveModel(c,e,prior?.model_id);if(ambiguous||e.needsReview)stats.review++;
  await attachPapers(c,id,e);
  const model=(await c.query('SELECT * FROM models WHERE id=$1 FOR UPDATE',[id])).rows[0];
  const sourceUrl=`https://github.com/${source.repo}/blob/${commit}/${path}#${e.location.split(/[,-]/)[0]}`;
  for(const field of fields) {
   const value=e[field];if(value===null||Array.isArray(value)&&!value.length)continue;
   const origin=['description_ko','targets','tasks','purposes','conditions','algorithms','inputs','outputs','family'].includes(field)?'inferred':'source';
   await c.query('INSERT INTO claims(model_id,field,value,origin,evidence,url) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(model_id,field,origin,url) DO UPDATE SET value=excluded.value,checked_at=now()',[id,field,JSON.stringify(value),origin,`${e.title} | ${String(e.metadata.section||JSON.stringify(e.raw)).slice(0,1500)}`,sourceUrl]);
   if(field in (model.overrides||{}))continue;
   if(['name','kind','aliases'].includes(field)&&!prior)continue;
   if(Array.isArray(value))await c.query(`UPDATE models SET ${field}=ARRAY(SELECT DISTINCT unnest(${field} || $2::text[])) WHERE id=$1`,[id,value]);
   else if(prior||model[field]===null||model[field]==='')await c.query(`UPDATE models SET ${field}=$2 WHERE id=$1`,[id,value]);
  }
  const reported=e.metadata.reported_code_license;
  if(reported) {
   await c.query("INSERT INTO claims(model_id,field,value,origin,evidence,url) VALUES($1,'reported_code_license',$2,'source',$3,$4) ON CONFLICT(model_id,field,origin,url) DO NOTHING",[id,JSON.stringify(reported),'목록 제공자의 주장; 공식 원문 확인 전',sourceUrl]);
   if(model.code_license&&model.code_license!==reported)await review(c,id,'conflicting_license',{official:model.code_license,reported,sourceUrl});
  }
  await c.query("UPDATE models SET normalized_name=lower(regexp_replace(name,'[^[:alnum:]]','','g')),metadata=metadata || $2::jsonb,search_text=concat_ws(' ',name,array_to_string(aliases,' '),description_ko,$3::text,array_to_string(targets,' '),array_to_string(tasks,' ')),updated_at=now() WHERE id=$1",[id,JSON.stringify(e.metadata),e.title]);
  await c.query(`INSERT INTO source_entries(source_id,path,entry_key,model_id,commit_sha,location,raw,semantic_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(source_id,path,entry_key) DO UPDATE SET model_id=excluded.model_id,commit_sha=excluded.commit_sha,location=excluded.location,raw=excluded.raw,semantic_hash=excluded.semantic_hash,status='active',last_seen=now()`,[source.id,path,e.key,id,commit,e.location,JSON.stringify(e),digest]);
  const prev=prior?.raw as Entry|undefined;
  const type=created?(e.kind==='model'?'new_model':e.kind==='paper'?'new_paper':'new_resource'):prior?.status==='removed'?'source_restored':!prev?'source_added':!prev.weights_url&&e.weights_url?'weights_released':!prev.codeUrls.length&&e.codeUrls.length?'code_released':!prev.publication_date&&e.publication_date?'paper_published':'metadata_changed';
  await event(c,id,source.id,job,type,`${e.name} · ${created?'카탈로그에 추가':type==='source_added'?'출처 연결':'출처 정보 갱신'}`,prev?semantic(prev):null,semantic(e));
  stats[created?'added':'changed']++;
 }
 const keys=entries.map(e=>e.key);
 for(const removed of old.filter(x=>x.status==='active'&&!keys.includes(x.entry_key))) {
  await c.query("UPDATE source_entries SET status='removed',commit_sha=$2,last_seen=now() WHERE id=$1",[removed.id,commit]);
  await event(c,removed.model_id,source.id,job,'source_removed',`${path}에서 항목 삭제 · 기존 정보 보존`);stats.removed++;
 }
 const affected=(await c.query('SELECT DISTINCT model_id FROM source_entries WHERE source_id=$1 AND path=$2',[source.id,path])).rows;
 for(const m of affected)await reconcileModel(c,m.model_id);
}
export async function syncSource(sourceId:string,jobId?:string,force=false) {
 const c=await pool.connect();let locked=false;let job=jobId;const stats={added:0,changed:0,removed:0,review:0,files:0,entries:0,skipped:0};
 try {
  locked=(await c.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[`atlas:${sourceId}`])).rows[0].locked;
  if(!locked)return {locked:true};
  const source=(await c.query('SELECT * FROM sources WHERE id=$1',[sourceId])).rows[0];if(!source)throw new Error('Unknown source');
  if(!job)job=(await c.query("INSERT INTO jobs(source_id,status,started_at) VALUES($1,'running',now()) ON CONFLICT(source_id) WHERE status IN ('queued','running') AND type='sync' DO UPDATE SET status='running',started_at=now() RETURNING id",[sourceId])).rows[0].id;
  else await c.query("UPDATE jobs SET status='running',started_at=now() WHERE id=$1",[job]);
  const commit=await latestCommit(source.repo);
  await c.query('UPDATE jobs SET commit_sha=$2 WHERE id=$1',[job,commit]);
  if(!force&&source.adapter_revision==='2026-09-08.4'&&source.commit_sha===commit)stats.skipped++;
  else {
   const files=selectFiles(source.adapter,await repositoryTree(source.repo,commit));
   const previous=(await c.query('SELECT * FROM source_files WHERE source_id=$1',[sourceId])).rows;
   const parsed:{path:string;sha:string;entries:Entry[]}[]=[];
   for(const f of files) {
    if(!force&&source.adapter_revision==='2026-09-08.4'&&previous.some(p=>p.path===f.path&&p.blob_sha===f.sha)){stats.skipped++;continue;}
    const entries=parseFile(source.adapter,f.path,await rawFile(source.repo,commit,f.path));
    if(new Set(entries.map(e=>e.key)).size!==entries.length)throw new Error(`Duplicate entry identities in ${f.path}`);
    parsed.push({path:f.path,sha:f.sha,entries});
   }
   await c.query('BEGIN');
   // Serializes cross-source identity resolution so concurrent workers cannot create duplicates.
   await c.query('SELECT pg_advisory_xact_lock(782134)');
   try {
    for(const f of parsed){await applyEntries(c,source,f.path,commit,job!,f.entries,stats);stats.files++;stats.entries+=f.entries.length;await c.query('INSERT INTO source_files VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_id,path) DO UPDATE SET blob_sha=excluded.blob_sha,commit_sha=excluded.commit_sha,entry_count=excluded.entry_count',[sourceId,f.path,f.sha,commit,f.entries.length]);}
    for(const f of previous.filter(p=>!files.some(x=>x.path===p.path))) {
     const removed=(await c.query("UPDATE source_entries SET status='removed',commit_sha=$3 WHERE source_id=$1 AND path=$2 AND status='active' RETURNING model_id",[sourceId,f.path,commit])).rows;
     for(const r of removed)await event(c,r.model_id,sourceId,job!,'source_removed',`${f.path} 파일 삭제 · 모델 보존`);
     stats.removed+=removed.length;for(const r of removed)await reconcileModel(c,r.model_id);await c.query('DELETE FROM source_files WHERE source_id=$1 AND path=$2',[sourceId,f.path]);
    }
    await c.query("UPDATE sources SET commit_sha=$2,adapter_revision='2026-09-08.4' WHERE id=$1",[sourceId,commit]);await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');throw e;}
  }
  await c.query("UPDATE sources SET last_success=now(),last_error=null,next_run=now()+($2||' hours')::interval,stats=$3 WHERE id=$1",[sourceId,process.env.SYNC_INTERVAL_HOURS||'6',JSON.stringify(stats)]);
  await c.query("UPDATE jobs SET status='success',finished_at=now(),stats=$2 WHERE id=$1",[job,JSON.stringify(stats)]);
  console.log(JSON.stringify({job,source:sourceId,commit,...stats,status:'success'}));return stats;
 }catch(e) {
  const message=e instanceof Error?e.message:'Unknown synchronization failure';
  await c.query('UPDATE sources SET last_error=$2,next_run=coalesce($3::timestamptz,now()+interval \'30 minutes\') WHERE id=$1',[sourceId,message,e instanceof UpstreamError?e.retryAt||null:null]);
  if(job)await c.query("UPDATE jobs SET status='failed',finished_at=now(),error=$2 WHERE id=$1",[job,message]);
  await event(c,null,sourceId,job||null,'sync_failed',message);
  console.error(JSON.stringify({job,source:sourceId,status:'failed',error:message}));return {error:message};
 }finally {if(locked)await c.query('SELECT pg_advisory_unlock(hashtext($1))',[`atlas:${sourceId}`]);c.release();}
}
