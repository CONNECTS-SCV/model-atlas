export const staticAtlas=process.env.NEXT_PUBLIC_STATIC_ATLAS==='true';
export const atlasBase=staticAtlas?'/model-atlas':'';
export const actionsUrl='https://github.com/CONNECTS-SCV/model-atlas/actions/workflows/pages.yml';
let cache:{version:string;rows:any[]}|null=null;
export function filterCatalog(rows:any[],p:URLSearchParams){
 const q=(p.get('q')||'').toLowerCase(),kind=p.get('kind'),life=p.get('lifecycle')||'active';
 const ids=p.has('ids')?new Set(p.get('ids')!.split(',')):null;
 let result=rows.filter(m=>{
  if(life==='active'&&m.lifecycle!=='active'||life==='archived'&&m.lifecycle==='active')return false;
  if(q&&!String(m.search_text).toLowerCase().includes(q))return false;
  if(kind==='tool'?!(['tool','library'].includes(m.kind)||m.metadata?.roles?.includes('tool')):kind&&kind!=='all'&&m.kind!==kind)return false;
  if(ids&&!ids.has(m.id))return false;
  if(p.get('source')&&!m.source_ids.includes(p.get('source')))return false;
  for(const axis of ['targets','tasks','algorithms','accessibility','purposes','conditions']){const vs=p.getAll(axis);if(vs.length&&!vs.some(v=>m[axis]?.includes(v)))return false;}
  if(p.get('verified')==='true'&&!m.verified||p.get('license')==='verified'&&!m.code_license)return false;
  return true;
 });
 const field=({newest:'first_public_date',updated:'updated_at',discovered:'first_seen'} as Record<string,string>)[p.get('sort')||''];
 result=result.sort((a,b)=>{if(field){if(!a[field]&&b[field])return 1;if(a[field]&&!b[field])return -1;const delta=String(b[field]||'').localeCompare(String(a[field]||''));if(delta)return delta;}return a.name.localeCompare(b.name)||a.id.localeCompare(b.id);});
 const page=Math.max(1,Number(p.get('page'))||1),pageSize=30;return {rows:result.slice((page-1)*pageSize,page*pageSize),total:result.length,page,pageSize};
}
export async function atlasFetch(url:string,init?:RequestInit):Promise<Response>{
 if(!staticAtlas)return fetch(url,init);
 const u=new URL(url,'https://atlas.local');
 const manifestResponse=await fetch(`${atlasBase}/data/manifest.json`,{cache:'no-store',signal:init?.signal});if(!manifestResponse.ok)return manifestResponse;
 const manifest=await manifestResponse.json();const root=`${atlasBase}/data/${manifest.version}`;
 if(u.pathname==='/api/catalog'&&u.searchParams.has('overview'))return fetch(`${root}/overview.json`,init);
 if(u.pathname==='/api/catalog'){
  if(cache?.version!==manifest.version){const r=await fetch(`${root}/catalog.json`,init);if(!r.ok)return r;cache={version:manifest.version,rows:await r.json()};}
  return Response.json(filterCatalog(cache!.rows,u.searchParams));
 }
 if(u.pathname.startsWith('/api/models/'))return fetch(`${root}/models/${u.pathname.split('/').at(-1)}.json`,init);
 if(u.pathname==='/api/update'){
  const r=await fetch(`${root}/overview.json`,init);if(!r.ok)return r;const o=await r.json();const sources=o.sources||[];
  return Response.json({update:{id:manifest.version,created_at:manifest.published_at,status:sources.some((s:any)=>s.last_error)?'partial_failure':'success',complete:sources.length,total:sources.length,failed:sources.filter((s:any)=>s.last_error).length,added:sources.reduce((n:number,s:any)=>n+(s.stats?.added||0),0),changed:sources.reduce((n:number,s:any)=>n+(s.stats?.changed||0),0),removed:sources.reduce((n:number,s:any)=>n+(s.stats?.removed||0),0),jobs:sources.map((s:any)=>({id:s.id,label:s.label,status:s.last_error?'failed':'success',error:s.last_error}))}});
 }
 return Response.json({error:'GitHub Pages에서는 관리자 작업을 GitHub 저장소에서 관리합니다.'},{status:403});
}
