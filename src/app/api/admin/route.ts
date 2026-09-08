import { setSuccessor } from '@/lib/lifecycle';
import { authorized } from '@/lib/auth';
import { pool,query } from '@/lib/db';
import { normalizeName } from '@/lib/identity';
import { reconcileModel } from '@/lib/reconcile';
import { event } from '@/lib/sync';
import { z } from 'zod';
export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('successor'),predecessorId:z.uuid(),successorId:z.uuid(),scope:z.string().min(5).max(2000),caveats:z.string().min(5).max(2000),evidence:z.string().min(10).max(3000),evidenceUrl:z.url(),hide:z.boolean()}),
 z.object({action:z.literal('restore'),modelId:z.uuid()}),
 z.object({action:z.literal('sync'),sourceId:z.string().max(50)}),
 z.object({action:z.literal('review'),reviewId:z.uuid(),resolution:z.string().min(4).max(2000),status:z.enum(['resolved','dismissed'])}),
 z.object({action:z.literal('edit'),modelId:z.uuid(),field:z.enum(['name','description_ko','family','version','organization','runtime_requirements','code_license','weights_license','data_license','first_public_date','publication_date','kind']),value:z.string().min(1).max(2000),evidence:z.string().min(4).max(2000)}),
 z.object({action:z.literal('settings'),sourceId:z.string().max(50),enabled:z.boolean()})
]);
export async function GET(req:Request) {
 if(!authorized(req))return Response.json({error:'관리자 토큰이 필요합니다.'},{status:401});
 const [jobs,reviews,enrichment,enrichmentErrors]=await Promise.all([query('SELECT j.*,s.label FROM jobs j LEFT JOIN sources s ON s.id=j.source_id ORDER BY j.created_at DESC LIMIT 100'),query("SELECT r.*,m.name FROM reviews r LEFT JOIN models m ON m.id=r.model_id WHERE r.status='pending' ORDER BY r.created_at DESC LIMIT 100"),query("SELECT 'code:'||status status,count(*)::int count FROM enrichment_jobs GROUP BY status UNION ALL SELECT kind||':'||status,count(*)::int FROM document_jobs GROUP BY kind,status"),query("SELECT 'code' kind,r.url,e.error,e.next_run FROM enrichment_jobs e JOIN code_repositories r ON r.id=e.repository_id WHERE e.error IS NOT NULL UNION ALL SELECT kind,url,error,next_run FROM document_jobs WHERE error IS NOT NULL LIMIT 50")]);
 return Response.json({jobs:jobs.rows,reviews:reviews.rows,enrichment:enrichment.rows,enrichmentErrors:enrichmentErrors.rows});
}
export async function POST(req:Request) {
 if(!authorized(req))return Response.json({error:'관리자 인증에 실패했습니다.'},{status:401});
 let body;try{body=schema.parse(await req.json());}catch{return Response.json({error:'올바르지 않은 요청입니다.'},{status:400});}
 if(body.action==='sync') {
  const s=(await query('SELECT id,enabled FROM sources WHERE id=$1',[body.sourceId])).rows[0];if(!s)return Response.json({error:'수집원 없음'},{status:404});
  const job=(await query("INSERT INTO jobs(source_id) VALUES($1) ON CONFLICT(source_id) WHERE status IN ('queued','running') AND type='sync' DO UPDATE SET source_id=excluded.source_id RETURNING *",[body.sourceId])).rows[0];
  return Response.json({job,message:'작업을 등록했습니다. 실행 중인 worker가 처리합니다.'},{status:202});
 }
 const c=await pool.connect();
 try {
  await c.query('BEGIN');
  if(body.action==='successor')await setSuccessor(c,body);
  if(body.action==='restore'){await c.query("UPDATE models SET lifecycle='active',lifecycle_reason=null,lifecycle_at=now() WHERE id=$1",[body.modelId]);await event(c,body.modelId,null,null,'catalog_restored','기본 목록으로 복원');}
  if(body.action==='review') {const r=(await c.query('UPDATE reviews SET status=$2,resolution=$3,resolved_at=now() WHERE id=$1 RETURNING model_id',[body.reviewId,body.status,body.resolution])).rows[0];if(!r)throw new Error('Review not found');await event(c,r.model_id,null,null,'review_resolved',body.resolution);}
  if(body.action==='settings') {await c.query('UPDATE sources SET enabled=$2 WHERE id=$1',[body.sourceId,body.enabled]);await event(c,null,body.sourceId,null,'settings_changed',`자동 수집 ${body.enabled?'활성':'비활성'}`);}
  if(body.action==='edit') {
   if(body.field==='kind'&&!['model','tool','paper','dataset','review','library','benchmark'].includes(body.value))throw new Error('Invalid resource kind');
   const before=(await c.query('SELECT * FROM models WHERE id=$1 FOR UPDATE',[body.modelId])).rows[0];if(!before)throw new Error('Model not found');
   await c.query(`UPDATE models SET ${body.field}=$2,overrides=overrides || $3::jsonb,updated_at=now(),search_text=search_text || ' ' || $2 WHERE id=$1`,[body.modelId,body.value,JSON.stringify({[body.field]:body.value})]);
   if(body.field==='name')await c.query("UPDATE models SET normalized_name=$2,aliases=ARRAY(SELECT DISTINCT unnest(aliases || $3::text[])) WHERE id=$1",[body.modelId,normalizeName(body.value),[before.name]]);
   await reconcileModel(c,body.modelId);
   await c.query("INSERT INTO claims(model_id,field,value,origin,evidence,url) VALUES($1,$2,$3,'admin',$4,'admin://manual') ON CONFLICT(model_id,field,origin,url) DO UPDATE SET value=excluded.value,evidence=excluded.evidence,checked_at=now()",[body.modelId,body.field,JSON.stringify(body.value),body.evidence]);
   await event(c,body.modelId,null,null,'admin_edit',`${body.field} 관리자 수정`,before[body.field],body.value);
  }
  await c.query('COMMIT');return Response.json({ok:true});
 }catch{return await c.query('ROLLBACK'),Response.json({error:'요청을 적용하지 못했습니다. 대상과 값을 확인해 주세요.'},{status:400});}finally{c.release();}
}
