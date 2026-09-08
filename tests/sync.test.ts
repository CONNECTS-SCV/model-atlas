import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/lib/db';
import { parseMarkdown } from '../src/lib/adapters';
import { setSuccessor } from '../src/lib/lifecycle';
import { applyEntries } from '../src/lib/sync';
const enabled=process.env.TEST_DATABASE==='1';
const md=(name:string,doi:string,repo='shared')=>`# Protein generation\n* **${name}: Protein design**\n[paper](https://doi.org/${doi}) | [code](https://github.com/test/${repo})\n`;
test('transactional sync: identity, overrides, updates, removals, rollback', {skip:!enabled},async()=>{
 const c=await pool.connect();
 try {
  await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(782134)');
  const source={id:'test-sync-'+Date.now(),repo:'test/atlas'};
  await c.query("INSERT INTO sources(id,repo,label,adapter) VALUES($1,$2,'Test','protein')",[source.id,source.id]);
  const job=(await c.query('INSERT INTO jobs(source_id) VALUES($1) RETURNING id',[source.id])).rows[0].id;
  const stats={added:0,changed:0,removed:0,review:0};
  const entries=parseMarkdown('protein','README.md',md('AtlasTest-A','10.9999/atlas-a')+md('AtlasTest-B','10.9999/atlas-b'));
  await applyEntries(c,source,'README.md','one',job,entries,stats);
  const first=(await c.query('SELECT * FROM source_entries WHERE source_id=$1 ORDER BY entry_key',[source.id])).rows;
  assert.equal(first.length,2);assert.notEqual(first[0].model_id,first[1].model_id);
  const count=await c.query('SELECT count(*) FROM events WHERE job_id=$1',[job]);
  await applyEntries(c,source,'README.md','one',job,entries,stats);
  assert.equal((await c.query('SELECT count(*) FROM events WHERE job_id=$1',[job])).rows[0].count,count.rows[0].count);
  const id=first.find(e=>e.raw.name==='AtlasTest-A').model_id;
  await c.query("UPDATE models SET description_ko='관리자 확인',overrides='{"+'"description_ko":"관리자 확인"'+"}' WHERE id=$1",[id]);
  const changed=[{...entries[0],description_ko:'자동 변경',weights_url:'https://huggingface.co/test/atlas'}];
  await applyEntries(c,source,'README.md','two',job,changed,stats);
  assert.equal((await c.query('SELECT description_ko FROM models WHERE id=$1',[id])).rows[0].description_ko,'관리자 확인');
  assert.equal((await c.query("SELECT count(*) FROM source_entries WHERE source_id=$1 AND status='removed'",[source.id])).rows[0].count,'1');
  assert.equal((await c.query('SELECT count(*) FROM models WHERE id=ANY($1::uuid[])',[first.map(e=>e.model_id)])).rows[0].count,'2');
  assert.equal((await c.query("SELECT count(*) FROM events WHERE job_id=$1 AND type='weights_released'",[job])).rows[0].count,'1');
  await c.query('SAVEPOINT parser_failure');
  await assert.rejects(async()=>{await applyEntries(c,source,'README.md','bad',job,[{...changed[0],kind:'invalid' as never}],stats);});
  await c.query('ROLLBACK TO parser_failure');
  assert.equal((await c.query('SELECT commit_sha FROM source_entries WHERE model_id=$1',[id])).rows[0].commit_sha,'two');
  // A confirmed upstream withdrawal removes current links while retaining history.
  await applyEntries(c,source,'README.md','four',job,[{...changed[0],weights_url:null,codeUrls:[],accessibility:[]}],stats);
  assert.equal((await c.query('SELECT weights_url FROM models WHERE id=$1',[id])).rows[0].weights_url,null);
  assert.equal((await c.query('SELECT active FROM model_repositories WHERE model_id=$1',[id])).rows[0].active,false);
  // Same model and paper listed in a second source attaches to the same model.
  const second={id:source.id+'-second',repo:'test/second'};
  await c.query("INSERT INTO sources(id,repo,label,adapter) VALUES($1,$2,'Second','protein')",[second.id,second.id]);
  await applyEntries(c,second,'README.md','three',job,[entries[0]],stats);
  assert.equal((await c.query('SELECT model_id FROM source_entries WHERE source_id=$1',[second.id])).rows[0].model_id,id);
  const successor=first.find(e=>e.model_id!==id).model_id;
  const relation={predecessorId:id,successorId:successor,scope:'Verified successor for a defined task',caveats:'Previous checkpoint remains necessary for reproducibility',evidence:'Official release describes the successor and the task scope',evidenceUrl:'https://github.com/test/releases',hide:false};
  await setSuccessor(c,relation);
  await assert.rejects(()=>setSuccessor(c,{...relation,predecessorId:successor,successorId:id}),/cycle/);
  await setSuccessor(c,{...relation,hide:true});
  await applyEntries(c,second,'README.md','five',job,[entries[0]],stats);
  assert.equal((await c.query('SELECT lifecycle FROM models WHERE id=$1',[id])).rows[0].lifecycle,'superseded');
  assert.equal((await c.query('SELECT snapshot FROM model_relations WHERE predecessor_id=$1',[id])).rows[0].snapshot.name,'AtlasTest-A');
  const officialRepo=(await c.query("INSERT INTO code_repositories(url) VALUES('https://github.com/test/atlas-official') RETURNING id")).rows[0].id;
  await c.query("INSERT INTO model_repositories(model_id,repository_id,link_origin,active) VALUES($1,$2,'official',true)",[id,officialRepo]);
  await applyEntries(c,second,'README.md','six',job,[{...entries[0],codeUrls:[]}],stats);
  assert.equal((await c.query('SELECT active FROM model_repositories WHERE model_id=$1 AND repository_id=$2',[id,officialRepo])).rows[0].active,true);

 }finally{await c.query('ROLLBACK');c.release();}
});
test('model admission requires an active verified repository and follows removal/recovery', {skip:!enabled},async()=>{
 const c=await pool.connect();try{await c.query('BEGIN');
 const m=(await c.query("INSERT INTO models(name,normalized_name,kind,weights_url) VALUES('AdmissionTest','admissiontest','model','https://huggingface.co/test/weights') RETURNING id")).rows[0].id;
 const visible=async()=>Boolean((await c.query('SELECT 1 FROM admitted_models WHERE id=$1',[m])).rowCount);
 assert.equal(await visible(),false); // A weights card alone is insufficient.
 const repo=(await c.query("INSERT INTO code_repositories(url) VALUES('https://github.com/test/admission-test') RETURNING id")).rows[0].id;
 await c.query('INSERT INTO model_repositories(model_id,repository_id) VALUES($1,$2)',[m,repo]);assert.equal(await visible(),false);
 await c.query("UPDATE code_repositories SET verification_status='verified' WHERE id=$1",[repo]);assert.equal(await visible(),true);
 await c.query("UPDATE code_repositories SET verification_status='unavailable' WHERE id=$1",[repo]);assert.equal(await visible(),false);
 await c.query("UPDATE code_repositories SET verification_status='verified' WHERE id=$1",[repo]);assert.equal(await visible(),true);
 await c.query('UPDATE model_repositories SET active=false WHERE model_id=$1',[m]);assert.equal(await visible(),false);
 await c.query("UPDATE models SET kind='paper' WHERE id=$1",[m]);assert.equal(await visible(),true);
 }finally{await c.query('ROLLBACK');c.release();}
});
test.after(async()=>{await pool.end();});
