/** Generate a data-only report from Git's persisted state; does not claim to run tests. */
import {readFile,writeFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
const state=JSON.parse(gunzipSync(await readFile('data/state.json.gz')).toString()).tables;
const verified=new Set(state.code_repositories.filter((r:any)=>r.verification_status==='verified').map((r:any)=>r.id));
const admitted=new Set(state.model_repositories.filter((r:any)=>r.active&&verified.has(r.repository_id)).map((r:any)=>r.model_id));
const rows=state.models.filter((m:any)=>m.kind!=='model'||admitted.has(m.id));
const active=rows.filter((m:any)=>m.lifecycle==='active');
const report=`# 저장된 카탈로그 데이터 상태\n\n생성 ${new Date().toISOString()}\n\n활성 자료 ${active.length}개 · AI 모델 ${active.filter((m:any)=>m.kind==='model').length}개 · 이전 항목 ${rows.length-active.length}개.\n\n${state.sources.map((s:any)=>`- ${s.label}: ${s.last_success} / ${s.last_error||'최근 수집 성공'}`).join('\n')}\n\nGit 상태 파일에서 읽은 결과이며 테스트 실행 결과는 아닙니다. 배포 검증은 [verification.md](verification.md)를 참고하세요.\n`;
await writeFile('docs/data-status.md',report);console.log('Wrote docs/data-status.md');
