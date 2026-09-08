import { pool } from '../src/lib/db';
import { syncSource } from '../src/lib/sync';
import { seedDocumentQueue, enrichDocuments } from '../src/lib/documents';
import { enrichBatch } from '../src/lib/enrich';
import { githubAuthMode } from '../src/lib/github-auth';
const once=process.argv.includes('--once');const onlyEnrich=process.argv.includes('--enrich');const daemon=!once&&!onlyEnrich;
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
let phase='starting';
const heartbeat=async()=>{if(daemon)await pool.query("INSERT INTO worker_state(id,phase,auth_mode) VALUES('scheduler',$1,$2) ON CONFLICT(id) DO UPDATE SET heartbeat_at=now(),phase=excluded.phase,auth_mode=excluded.auth_mode",[phase,githubAuthMode()]);};
async function tick() {
 if(!onlyEnrich) {
  phase='checking_sources';await heartbeat();
  const sources=(await pool.query(`SELECT DISTINCT s.id FROM sources s LEFT JOIN jobs j ON j.source_id=s.id AND j.status IN ('queued','running') WHERE (s.enabled=true AND ($1 OR s.next_run<=now())) OR j.id IS NOT NULL ORDER BY s.id`,[once])).rows;
  for(const s of sources.filter(s=>!process.argv.some(a=>a.startsWith('--source='))||process.argv.includes('--source='+s.id))){if(stopping)break;phase='sync:'+s.id;await heartbeat();const result=await syncSource(s.id,undefined,process.argv.includes('--force'));if(once&&'error' in result)process.exitCode=1;}
 }
 if(stopping)return;
 phase='enriching_code';await heartbeat();
 await pool.query("UPDATE enrichment_jobs SET status='queued' WHERE status='running' AND next_run<now()");
 await enrichBatch(Number(process.env.ENRICH_BATCH_SIZE||'15'));
 phase='enriching_documents';await heartbeat();
 await seedDocumentQueue();
 await pool.query("UPDATE document_jobs SET status='queued' WHERE status='running' AND next_run<now()");
 await enrichDocuments(Number(process.env.ENRICH_BATCH_SIZE||'5'));
 phase='waiting';await heartbeat();
}
const lease=daemon?await pool.connect():null;
let ownsLease=false;
let timer:ReturnType<typeof setInterval>|undefined;
try {
 if(lease&&!(await lease.query('SELECT pg_try_advisory_lock(782136) locked')).rows[0].locked)throw new Error('A scheduler is already running');
 ownsLease=Boolean(lease);
 if(daemon){await heartbeat();timer=setInterval(()=>{heartbeat().catch(()=>{});},10000);}
 do {try{await tick();}catch(e){const error=e instanceof Error?e.message:'Worker failure';if(!daemon)throw e;phase='error';await pool.query("UPDATE worker_state SET phase='error',last_error=$1 WHERE id='scheduler'",[error]);console.error(JSON.stringify({type:'worker',error}));}if(daemon&&!stopping)await new Promise(r=>setTimeout(r,15000));}while(daemon&&!stopping);
}finally{if(timer)clearInterval(timer);if(lease&&ownsLease){await pool.query("UPDATE worker_state SET phase='stopped' WHERE id='scheduler'");await lease.query('SELECT pg_advisory_unlock(782136)');}lease?.release();await pool.end();}
