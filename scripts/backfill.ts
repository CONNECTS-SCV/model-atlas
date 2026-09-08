import { pool } from '../src/lib/db';
import { enrichBatch } from '../src/lib/enrich';
await pool.query("UPDATE enrichment_jobs SET next_run=now() WHERE status='queued' OR repository_id IN (SELECT id FROM code_repositories WHERE checked_at IS NOT NULL AND NOT metadata ? 'license_file_checked')");
const result=await Promise.all(Array.from({length:4},()=>enrichBatch(500)));
console.log(JSON.stringify({completed:result.reduce((a,b)=>a+b,0)}));await pool.end();
