import test from 'node:test';
import assert from 'node:assert/strict';
import { github,repositoryTree,UpstreamError } from '../src/lib/github';
import { authorized } from '../src/lib/auth';
test('authentication errors are explicit, redacted, and are not retried',async()=>{
 const original=global.fetch;let count=0;
 try{global.fetch=async()=>{count++;return new Response('',{status:401});};await assert.rejects(github('/repos/test/model'),(e:unknown)=>e instanceof UpstreamError&&e.status===401&&e.message.includes('authentication'));assert.equal(count,1);}finally{global.fetch=original;}
});
test('rate limits carry reset timestamp and are not interpreted as empty data',async()=>{
 const original=global.fetch;
 try{global.fetch=async()=>new Response('',{status:403,headers:{'x-ratelimit-reset':'2000000000'}});await assert.rejects(github('/repos/test/model'),(e:unknown)=>e instanceof UpstreamError&&e.status===403&&e.retryAt==='2033-05-18T03:33:20.000Z');}finally{global.fetch=original;}
});
test('truncated GitHub trees traverse every subtree',async()=>{
 const original=global.fetch;const paths:string[]=[];
 try{global.fetch=async(input)=>{const u=String(input);paths.push(u);return Response.json(u.includes('recursive=1')?{tree:[],truncated:true}:u.endsWith('/root')?{tree:[{type:'tree',path:'data',sha:'sub'},{type:'blob',path:'README.md',sha:'a'}],truncated:false}:{tree:[{type:'blob',path:'models.yaml',sha:'b'}],truncated:false});};const files=await repositoryTree('test/model','root');assert.deepEqual(files.map(f=>f.path).sort(),['README.md','data/models.yaml']);assert.equal(paths.length,3);}finally{global.fetch=original;}
});
test('admin APIs fail closed without a configured strong secret',()=>{
 const old=process.env.ADMIN_TOKEN;
 try{delete process.env.ADMIN_TOKEN;assert.equal(authorized(new Request('http://localhost')),false);process.env.ADMIN_TOKEN='a'.repeat(32);assert.equal(authorized(new Request('http://localhost',{headers:{Authorization:'Bearer '+'a'.repeat(32)}})),true);assert.equal(authorized(new Request('http://localhost',{headers:{Authorization:'Bearer '+'b'.repeat(32)}})),false);}finally{if(old)process.env.ADMIN_TOKEN=old;else delete process.env.ADMIN_TOKEN;}
});
