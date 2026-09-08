import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/lib/db';
import { enrichBatch } from '../src/lib/enrich';
import { enrichDocuments } from '../src/lib/documents';
test('verified license uses the actual filename and fills a conflicting catalog claim with review',async(t)=>{
 const calls:{sql:string;values:any[]}[]=[];
 const client={release(){},async query(sql:string,values:any[]=[]){calls.push({sql,values});
  if(sql.startsWith('SELECT e.*'))return {rows:[{repository_id:'repo',url:'https://github.com/test/atlas',metadata:{}}]};
  if(sql.startsWith('SELECT m.*'))return {rows:[{id:'model',name:'Atlas',active:true,overrides:{},code_license:null}]};
  if(sql.startsWith('SELECT value FROM claims'))return {rows:[{value:'GPL-3.0-only'}]};
  return {rows:[]};}};
 t.mock.method(pool,'connect',async()=>client as any);
 t.mock.method(globalThis,'fetch',async(input:any)=>Response.json(String(input).endsWith('/license')?{license:{spdx_id:'MIT'},path:'LICENCE',html_url:'https://github.com/test/atlas/blob/main/LICENCE',content:Buffer.from('MIT License').toString('base64')}:{license:{spdx_id:'MIT'},default_branch:'main',private:false,pushed_at:'2026-01-01'}));
 assert.equal(await enrichBatch(1),1);
 assert.ok(calls.some(c=>c.sql.startsWith('UPDATE code_repositories')&&c.values[3]==='https://github.com/test/atlas/blob/main/LICENCE'));
 assert.ok(calls.some(c=>c.sql.startsWith('UPDATE models SET code_license=$2')&&c.values[1]==='MIT'));
 assert.ok(calls.some(c=>c.sql.startsWith('INSERT INTO reviews')&&c.values[1]==='conflicting_license'));
});
test('document rate limit backs off the provider queue and stops the current batch',async(t)=>{
 const calls:{sql:string;values:any[]}[]=[];let fetches=0;
 const client={release(){},async query(sql:string,values:any[]=[]){calls.push({sql,values});return {rows:sql.startsWith('SELECT * FROM document_jobs')?[{id:'document',kind:'paper',url:'https://api.crossref.org/works/10.1000/example'}]:[]};}};
 t.mock.method(pool,'connect',async()=>client as any);t.mock.method(pool,'query',async(sql:string,values:any[]=[])=>{calls.push({sql,values});return {rows:[]} as any;});
 t.mock.method(globalThis,'fetch',async()=>{fetches++;return new Response('',{status:429,headers:{'retry-after':'120'}});});
 const before=Date.now();await enrichDocuments(5);assert.equal(fetches,1);
 const backoff=calls.find(c=>c.sql.includes('next_run=greatest(next_run'))!;
 assert.equal(backoff.values[1],'paper');assert.ok(backoff.values[0].getTime()>=before+120000);
});
test('missing repositories are excluded while transient API limits preserve previous verification',async(t)=>{
 for(const status of [404,403]){
  const calls:string[]=[];
  const client={release(){},async query(sql:string){calls.push(sql);return {rows:sql.startsWith('SELECT e.*')?[{repository_id:'repo',url:'https://github.com/test/missing',metadata:{}}]:[]};}};
  const connect=t.mock.method(pool,'connect',async()=>client as any);
  const fetch=t.mock.method(globalThis,'fetch',async()=>new Response('',{status}));
  await enrichBatch(1);
  assert.equal(calls.some(sql=>sql.includes("verification_status='unavailable'")),status===404);
  connect.mock.restore();fetch.mock.restore();
 }
});
test.after(async()=>{await pool.end();});
