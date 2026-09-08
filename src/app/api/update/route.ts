import { requestUpdate,updateStatus } from '@/lib/manual-update';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const id=new URL(req.url).searchParams.get('id')||undefined;
 if(id&&!/^[0-9a-f-]{36}$/i.test(id))return Response.json({error:'잘못된 업데이트 ID입니다.'},{status:400});
 try{return Response.json({update:await updateStatus(id)});}catch{return Response.json({error:'업데이트 상태를 확인하지 못했습니다.'},{status:503});}
}
export async function POST(req:Request){
 // This public action can only refresh configured sources; no arbitrary URL or edits.
 if(req.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'사이트에서 업데이트 버튼을 눌러 주세요.'},{status:403});
 try{const update=await requestUpdate();return Response.json({update},{status:update?.status==='running'?202:200});}
 catch(e){const code=e instanceof Error?e.message:'';return Response.json({error:code==='WORKER_OFFLINE'?'수집기가 연결되어 있지 않습니다. 실행 후 다시 눌러 주세요.':code==='NO_SOURCES'?'활성화된 수집원이 없습니다.':'업데이트를 시작하지 못했습니다. 잠시 후 다시 눌러 주세요.'},{status:503});}
}
