import { pool,query } from './db';
export async function updateStatus(id?:string){
 const batch=(await query(id?'SELECT * FROM catalog_updates WHERE id=$1':'SELECT * FROM catalog_updates ORDER BY created_at DESC LIMIT 1',id?[id]:[])).rows[0];
 if(!batch)return null;
 const jobs=(await query('SELECT j.id,j.source_id,j.status,j.stats,j.error,s.label FROM jobs j JOIN sources s ON s.id=j.source_id WHERE j.id=ANY($1::uuid[]) ORDER BY s.id',[batch.job_ids])).rows;
 const complete=jobs.filter(j=>['success','failed'].includes(j.status)).length;
 const failed=jobs.filter(j=>j.status==='failed').length;
 const running=complete<jobs.length;
 return {id:batch.id,created_at:batch.created_at,status:running?'running':failed?'partial_failure':'success',complete,total:jobs.length,failed,added:jobs.reduce((n,j)=>n+Number(j.stats?.added||0),0),changed:jobs.reduce((n,j)=>n+Number(j.stats?.changed||0),0),removed:jobs.reduce((n,j)=>n+Number(j.stats?.removed||0),0),jobs};
}
export async function requestUpdate(){
 const c=await pool.connect();let id:string;
 try{
  await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(782137)');
  const previous=(await c.query("SELECT u.id FROM catalog_updates u WHERE u.created_at>now()-interval '60 seconds' OR EXISTS(SELECT 1 FROM jobs j WHERE j.id=ANY(u.job_ids) AND j.status IN ('queued','running')) ORDER BY u.created_at DESC LIMIT 1")).rows[0];
  if(previous)id=previous.id;
  else{
   const worker=(await c.query("SELECT 1 FROM worker_state WHERE id='scheduler' AND heartbeat_at>now()-interval '45 seconds' AND phase<>'stopped'")).rowCount;
   if(!worker)throw new Error('WORKER_OFFLINE');
   const sources=(await c.query('SELECT id FROM sources WHERE enabled ORDER BY id')).rows;
   if(!sources.length)throw new Error('NO_SOURCES');
   const jobs:string[]=[];
   for(const source of sources){const job=(await c.query("INSERT INTO jobs(source_id) VALUES($1) ON CONFLICT(source_id) WHERE status IN ('queued','running') AND type='sync' DO UPDATE SET source_id=excluded.source_id RETURNING id",[source.id])).rows[0];jobs.push(job.id);}
   id=(await c.query('INSERT INTO catalog_updates(job_ids) VALUES($1) RETURNING id',[jobs])).rows[0].id;
  }
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 return updateStatus(id!);
}
