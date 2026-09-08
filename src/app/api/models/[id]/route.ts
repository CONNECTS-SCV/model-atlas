import { modelDetail } from '@/lib/catalog';
export const dynamic='force-dynamic';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const model=await modelDetail(id);return Response.json(model||{error:'항목을 찾을 수 없습니다.'},{status:model?200:404});}
