import { catalog,overview } from '@/lib/catalog';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{const p=new URL(req.url).searchParams;return Response.json(p.has('overview')?await overview():await catalog(p));}catch(e){console.error('Catalog database request failed',e instanceof Error?e.name:'Error');return Response.json({error:'데이터베이스 연결을 확인하고 migration을 실행해 주세요.'},{status:503});}}
