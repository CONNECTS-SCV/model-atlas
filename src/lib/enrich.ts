import { pool } from './db';
import { github,UpstreamError } from './github';
import { event,review } from './sync';
const foldLicense=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
export async function enrichBatch(limit=10) {
 let completed=0;
 for(let i=0;i<limit;i++) {
  const c=await pool.connect();let id:string|undefined;
  try {
   await c.query('BEGIN');
   const task=(await c.query("SELECT e.*,r.url,r.metadata FROM enrichment_jobs e JOIN code_repositories r ON r.id=e.repository_id WHERE e.next_run<=now() AND e.status IN ('queued','done','failed') ORDER BY e.attempts,e.next_run FOR UPDATE OF e SKIP LOCKED LIMIT 1")).rows[0];
   if(!task){await c.query('ROLLBACK');break;}
   id=task.repository_id;await c.query("UPDATE enrichment_jobs SET status='running',next_run=now()+interval '10 minutes' WHERE repository_id=$1",[id]);await c.query('COMMIT');
   const repo=task.url.replace('https://github.com/','');
   const result=await github<any>(`/repos/${repo}`,task.metadata?.etag);
   const data=result.notModified?task.metadata:result.data;
   if(data.private)throw new Error('비공개 저장소의 메타데이터는 공개 카탈로그에 수집하지 않습니다.');
   await c.query("UPDATE code_repositories SET verification_status='verified',checked_at=now() WHERE id=$1",[id]);
   let license=data.license?.spdx_id&&data.license.spdx_id!=='NOASSERTION'?data.license.spdx_id:null;
   let licenseUrl=data.license?.spdx_id?`https://api.github.com/repos/${repo}`:null;
   let licenseFileChecked=Boolean(task.metadata.license_file_checked);
   let licensePath=task.metadata.license_path||null;
   let licenseEvidence=`GitHub repository API license.spdx_id = ${license||'not detected'}`;
   // Custom terms must not be silently treated as absent or as an open-source license.
   if(!result.notModified||!licenseFileChecked) {
    try {const {data:l}=await github<any>(`/repos/${repo}/license`);license=l.license?.spdx_id&&l.license.spdx_id!=='NOASSERTION'?l.license.spdx_id:'사용자 정의';licenseUrl=l.html_url;licensePath=l.path;licenseEvidence=JSON.stringify({path:l.path,sha:l.sha,spdx:l.license?.spdx_id||null,excerpt:Buffer.from(l.content||'','base64').toString('utf8').slice(0,1000)});}
    catch(e){if(!(e instanceof UpstreamError&&e.status===404))throw e;}
    licenseFileChecked=true;
   }
   if(result.notModified&&task.metadata.license_file_checked){license=task.metadata.atlas_license??license;licenseUrl=task.metadata.atlas_license_url??licenseUrl;}
   await c.query('BEGIN');
   await c.query('UPDATE code_repositories SET verification_status=\'verified\',last_activity=$2,checked_at=now(),license=$3,license_url=$4,metadata=$5 WHERE id=$1',[id,data.pushed_at,license,licenseUrl,JSON.stringify({...data,etag:result.etag||task.metadata.etag,atlas_license:license,atlas_license_url:licenseUrl,license_file_checked:licenseFileChecked,license_path:licensePath,license_state:license?'verified':'not_provided'})]);
   const models=(await c.query('SELECT m.*,mr.active FROM models m JOIN model_repositories mr ON mr.model_id=m.id WHERE mr.repository_id=$1 ORDER BY m.id FOR UPDATE OF m',[id])).rows;
   for(const m of models) {
    await c.query("INSERT INTO claims(model_id,field,value,origin,evidence,url) VALUES($1,'code_repository',$2,'official',$3,$4) ON CONFLICT(model_id,field,origin,url) DO UPDATE SET value=excluded.value,checked_at=now(),evidence=excluded.evidence",[m.id,JSON.stringify({url:task.url,exists:true,archived:data.archived}),JSON.stringify({pushed_at:data.pushed_at,license:data.license,description:data.description,checked:'GitHub public API'}),task.url]);
    if(!m.active)continue;
    if(license) {
     await c.query("INSERT INTO claims(model_id,field,value,origin,evidence,url) VALUES($1,'code_license',$2,'official',$3,$4) ON CONFLICT(model_id,field,origin,url) DO UPDATE SET value=excluded.value,evidence=excluded.evidence,checked_at=now()",[m.id,JSON.stringify(license),licenseEvidence,licenseUrl||`https://api.github.com/repos/${repo}`]);
     const reported=(await c.query("SELECT value FROM claims WHERE model_id=$1 AND field='reported_code_license'",[m.id])).rows;
     const others=(await c.query('SELECT DISTINCT r.license FROM code_repositories r JOIN model_repositories mr ON mr.repository_id=r.id WHERE mr.model_id=$1 AND mr.active AND r.id<>$2 AND r.license IS NOT NULL',[m.id,id])).rows;
     const differing=others.filter(r=>foldLicense(r.license)!==foldLicense(license));
     if(differing.length){await review(c,m.id,'multiple_code_licenses',{licenses:[license,...differing.map(r=>r.license)],reason:'연결된 코드 저장소별 라이선스가 다름. 각 저장소 상세 참조.'});if(!('code_license' in m.overrides))await c.query("UPDATE models SET code_license='저장소별 상이' WHERE id=$1",[m.id]);}
     else if(!('code_license' in m.overrides)) {
      await c.query('UPDATE models SET code_license=$2 WHERE id=$1',[m.id,license]);
      if(m.code_license!==license)await event(c,m.id,null,null,'license_verified',`${m.name} · 공식 코드 라이선스 확인: ${license}`,m.code_license,license);
     }
     if(reported.some(r=>foldLicense(String(r.value))!==foldLicense(license)))await review(c,m.id,'conflicting_license',{reported:reported.map(r=>r.value),official:license,url:licenseUrl,reason:'공식 확인값 표시. 목록 제공자의 주장과 다름.'});
     } else if(!('code_license' in m.overrides)) {
     const others=(await c.query('SELECT DISTINCT r.license FROM code_repositories r JOIN model_repositories mr ON mr.repository_id=r.id WHERE mr.model_id=$1 AND mr.active AND r.id<>$2 AND r.license IS NOT NULL',[m.id,id])).rows;
     const effective=others.length>1?'저장소별 상이':others[0]?.license||null;
     if(effective!==m.code_license){await c.query('UPDATE models SET code_license=$2 WHERE id=$1',[m.id,effective]);await event(c,m.id,null,null,'metadata_changed',`${m.name} · 코드 라이선스 재확인`,m.code_license,effective);}
    }
   }
   await c.query("UPDATE enrichment_jobs SET status='done',attempts=0,error=null,next_run=now()+interval '7 days' WHERE repository_id=$1",[id]);await c.query('COMMIT');completed++;
  }catch(e){await c.query('ROLLBACK');const message=e instanceof Error?e.message:'Enrichment failed';if(id)await c.query("UPDATE enrichment_jobs SET status='failed',attempts=attempts+1,error=$2,next_run=now()+interval '1 hour' WHERE repository_id=$1",[id,message]);if(id&&e instanceof UpstreamError&&[404,410].includes(e.status))await c.query("UPDATE code_repositories SET verification_status='unavailable' WHERE id=$1",[id]);if(e instanceof Error&&e.message.startsWith('비공개 저장소')&&id)await c.query("UPDATE code_repositories SET verification_status='unavailable' WHERE id=$1",[id]);if(e instanceof UpstreamError&&e.retryAt)await c.query("UPDATE enrichment_jobs SET next_run=greatest(next_run,$1::timestamptz) WHERE status IN ('queued','failed')",[e.retryAt]);console.error(JSON.stringify({type:'enrich',repository:id,error:message}));if(/rate limit|authentication/.test(message))break;}
  finally{c.release();}
 }
 return completed;
}
