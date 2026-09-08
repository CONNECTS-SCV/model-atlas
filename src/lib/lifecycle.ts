import type { PoolClient } from 'pg';
import { event } from './sync';
import { safeUrl } from './identity';
export async function setSuccessor(c:PoolClient,args:{predecessorId:string;successorId:string;scope:string;caveats:string;evidence:string;evidenceUrl:string;hide:boolean;relation?:'recommended_successor'|'duplicate_of'|'related_version'}) {
 const {predecessorId,successorId}=args;
 if(predecessorId===successorId||!safeUrl(args.evidenceUrl))throw new Error('Valid distinct models and an evidence URL are required');
 await c.query('SELECT pg_advisory_xact_lock(782135)');
 const rows=(await c.query('SELECT * FROM models WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[predecessorId,successorId]])).rows;
 const old=rows.find(m=>m.id===predecessorId),next=rows.find(m=>m.id===successorId);
 if(!old||!next)throw new Error('Model not found');
 if(next.lifecycle!=='active')throw new Error('The successor must be an active catalog entry');
 const cycle=(await c.query(`WITH RECURSIVE chain(id) AS (SELECT successor_id FROM model_relations WHERE predecessor_id=$1 UNION SELECT r.successor_id FROM model_relations r JOIN chain c ON r.predecessor_id=c.id) SELECT 1 FROM chain WHERE id=$2 LIMIT 1`,[successorId,predecessorId])).rowCount;
 if(cycle)throw new Error('Successor relationships cannot form a cycle');
 const sources=(await c.query('SELECT se.path,se.location,se.commit_sha,s.repo FROM source_entries se JOIN sources s ON s.id=se.source_id WHERE se.model_id=$1',[old.id])).rows;
 await c.query(`INSERT INTO model_relations(predecessor_id,successor_id,relation,scope,caveats,evidence,evidence_url,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(predecessor_id,successor_id,relation) DO UPDATE SET scope=excluded.scope,caveats=excluded.caveats,evidence=excluded.evidence,evidence_url=excluded.evidence_url,checked_at=now()`,[old.id,next.id,args.relation||'recommended_successor',args.scope,args.caveats,args.evidence,args.evidenceUrl,JSON.stringify({...old,sources})]);
 if(args.hide)await c.query("UPDATE models SET lifecycle=$2,lifecycle_reason=$3,lifecycle_at=now() WHERE id=$1",[old.id,args.relation==='duplicate_of'?'duplicate':'superseded',`${next.name}: ${args.scope}`]);
 await event(c,next.id,null,null,'predecessor_recorded',`${old.name} → ${next.name} · ${args.hide?'이전 항목 기본 목록에서 숨김':'관련 후속 버전 기록'}`,{id:old.id,name:old.name},{scope:args.scope,caveats:args.caveats,evidenceUrl:args.evidenceUrl});
}
