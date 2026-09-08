import { githubToken } from './github-auth';
import type { TreeFile } from './types';
export class UpstreamError extends Error {constructor(public status:number,message:string,public retryAt?:string){super(message);}}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export async function github<T>(path:string,etag?:string,redirects=0):Promise<{data:T;etag:string|null;notModified:boolean}> {
 const token=githubToken();
 if(!/^\/(repos\/|repositories\/\d+)/.test(path))throw new Error('Unsupported GitHub API path');
 for(let attempt=0;attempt<4;attempt++) {
  let res:Response;
  try {res=await fetch(`https://api.github.com${path}`,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Curieus-Model-Atlas',...(token?{Authorization:`Bearer ${token}`} : {}),...(etag?{'If-None-Match':etag}:{})},signal:AbortSignal.timeout(25000),cache:'no-store',redirect:'manual'});}
  catch {if(attempt<3){await sleep(500*2**attempt);continue;}throw new UpstreamError(0,'GitHub network timeout or connection error');}
  if([301,302,307,308].includes(res.status)){const location=res.headers.get('location');if(!location||redirects>=3)throw new UpstreamError(res.status,'GitHub redirect limit exceeded');const next=new URL(location,'https://api.github.com');if(next.origin!=='https://api.github.com')throw new UpstreamError(res.status,'Refused off-host GitHub redirect');return github<T>(next.pathname+next.search,etag,redirects+1);}
  if(res.status===304)return {data:null as T,etag:etag||null,notModified:true};
  if(res.ok)return {data:await res.json() as T,etag:res.headers.get('etag'),notModified:false};
  if(res.status===401)throw new UpstreamError(401,'GitHub authentication failed (401). Check server GITHUB_TOKEN.');
  const reset=res.headers.get('x-ratelimit-reset');
  if(res.status===403||res.status===429) {
   const retry=reset?new Date(Number(reset)*1000).toISOString():new Date(Date.now()+60000).toISOString();
   throw new UpstreamError(res.status,`GitHub rate limit or permission denied (${res.status}); retry after ${retry}`,retry);
  }
  if(res.status>=500&&attempt<3){await sleep(1000*2**attempt);continue;}
  throw new UpstreamError(res.status,`GitHub request failed (${res.status}) at ${path.split('?')[0]}`);
 }
 throw new Error('GitHub retries exhausted');
}
export async function latestCommit(repo:string) {const {data}=await github<{sha:string}[]>(`/repos/${repo}/commits?per_page=1&page=1`);if(!data[0]?.sha)throw new Error('Empty commit response');return data[0].sha;}
export async function repositoryTree(repo:string,sha:string):Promise<TreeFile[]> {
 const {data}=await github<{tree:TreeFile[];truncated:boolean}>(`/repos/${repo}/git/trees/${sha}?recursive=1`);
 if(!data.truncated)return data.tree;
 // A truncated recursive tree must never look like removed files. Walk each tree page explicitly.
 async function walk(treeSha:string,prefix=''):Promise<TreeFile[]> {
  const {data:d}=await github<{tree:TreeFile[];truncated:boolean}>(`/repos/${repo}/git/trees/${treeSha}`);
  if(d.truncated)throw new Error('GitHub nonrecursive tree truncated');
  const all:TreeFile[]=[];
  for(const f of d.tree){if(f.type==='tree')all.push(...await walk(f.sha,`${prefix}${f.path}/`));else all.push({...f,path:prefix+f.path});}
  return all;
 }
 return walk(sha);
}
export async function rawFile(repo:string,sha:string,path:string) {
 const url=`https://raw.githubusercontent.com/${repo}/${sha}/${path.split('/').map(encodeURIComponent).join('/')}`;
 for(let attempt=0;attempt<3;attempt++) {
  try {
   const res=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error'});
   if(!res.ok)throw new Error(`HTTP ${res.status}`);
   const text=await res.text();if(text.length>12_000_000)throw new Error('File size limit exceeded');return text;
  }catch{if(attempt===2)throw new Error(`Failed to download source file ${path}`);await sleep(500*2**attempt);}
 }
 throw new Error('Download retries exhausted');
}
