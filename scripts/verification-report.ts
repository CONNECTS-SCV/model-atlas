import { writeFile } from 'node:fs/promises';
import { pool } from '../src/lib/db';
import { overview } from '../src/lib/catalog';
const o=await overview();
const sources=(await pool.query(`SELECT s.*,coalesce((SELECT sum(entry_count) FROM source_files WHERE source_id=s.id),0)::int parsed FROM sources s ORDER BY s.id`)).rows;
const documents=(await pool.query('SELECT kind,status,count(*)::int count FROM document_jobs GROUP BY kind,status ORDER BY kind,status')).rows;
const relations=(await pool.query('SELECT p.name predecessor,s.name successor,r.scope FROM model_relations r JOIN models p ON p.id=r.predecessor_id JOIN models s ON s.id=r.successor_id ORDER BY p.name')).rows;
const excluded=(await pool.query("SELECT count(*)::int count FROM models m WHERE kind='model' AND lifecycle='active' AND NOT EXISTS(SELECT 1 FROM admitted_models a WHERE a.id=m.id)")).rows[0].count;
const weights=(await pool.query('SELECT count(*)::int count FROM models WHERE weights_license IS NOT NULL')).rows[0].count;
const report=`# 검증 보고서

작성 시각: ${new Date().toISOString()}

공개 주소 [tech.curieus.net/model-atlas](https://tech.curieus.net/model-atlas/)에서 새 production 화면으로 이동하고 실제 데이터를 표시하는 것을 확인했습니다. 서버·DB·worker는 현재 이 Mac에서 실행됩니다.

## 정리 결과

- 코드 저장소 미확인 모델 ${excluded}개를 공개 검색·집계·상세에서 제외했습니다. 새 모델도 검증을 통과한 뒤 등록합니다.
- 현재 자료 ${o.counts.total}개, AI 모델 ${o.counts.models}개, 도구 역할 ${o.counts.tools}개. 도구는 라이브러리와 명시적 소프트웨어 역할을 포함하므로 모델 집계와 일부 겹칠 수 있습니다.
- 이전 항목 ${o.counts.archived}개를 기본 목록에서 제외하고 후속 모델 상세에 근거·호환성 차이·이전 원문 snapshot을 보존했습니다.
- 코드 라이선스가 채워진 자료 ${o.counts.verified_licenses}개, 가중치 라이선스 ${weights}개. 서로 다른 자산의 라이선스를 전용하지 않습니다.
- 코드 저장소 링크 ${o.coverage.repositories}개 중 API 확인 ${o.coverage.checked}개, 접근 실패 ${o.coverage.failures}개. 외부 사이트·비 GitHub 링크는 동일 API로 검증할 수 없습니다.
- 코드 링크가 아직 없는 모델 ${o.coverage.missing_code_links}개. 원문 미제공·미발견이며 비공개로 단정하지 않습니다. AntBO, AlphaFold-Multimer, RNAFM, AbLang, AIDO.RNA 등의 공식 구현 링크를 별도로 보완했습니다.

| 이전 항목 | 후속 항목 | 정리 범위 |
|---|---|---|
${relations.map(r=>`| ${r.predecessor} | ${r.successor} | ${r.scope} |`).join('\n')}

AbLang의 두 항목은 출판사 페이지와 DOI로 따로 수집된 같은 연구를 가리킵니다. 후속 모델에서 두 기록을 확인할 수 있습니다. 연식만으로 모델을 지우거나 모든 작업에서의 우월성을 주장하지 않습니다. ESM-1v·ESM-IF1·DNABERT-S 등 특화 목적은 유지합니다.

## 수집원과 자동 갱신

| 수집원 | 출처 항목 | 적용 commit | 마지막 성공 | 다음 예정 | 오류 |
|---|---:|---|---|---|---|
${sources.map(s=>`| ${s.label} | ${s.parsed} | ${s.commit_sha.slice(0,10)} | ${new Date(s.last_success).toISOString()} | ${new Date(s.next_run).toISOString()} | ${s.last_error||'없음'} |`).join('\n')}

UTC 시각입니다. 화면에서는 브라우저의 현지 시각으로 표시합니다. 초기 3/5 표시는 두 수집원의 익명 GitHub API 403 이후 최근 성공 여부를 집계한 결과였습니다. 기존 데이터는 남아 있었으며 현재 기존 gh keychain 인증을 서버 측에서 사용해 다섯 수집원 모두 재수집했습니다.

Worker heartbeat online: **${Boolean(o.worker?.online)}**, 인증 모드: **${o.worker?.auth_mode||'없음'}**. 브라우저 없이 독립 worker가 기본 6시간마다 출처 변경을 확인하고 보완 큐를 처리합니다. 코드 7일, 논문·모델 카드 14일 재확인. UI는 30초마다 상태 갱신. API 제한 시 재시도 시각을 따릅니다. Mac 종료·절전 시 중단되며 상시 호스팅이나 GitHub Actions 운영 배포를 완료한 것은 아닙니다.

## 검증 결과

- 단위 테스트 17개 통과: parser·identity·인증·GitHub 제한·정확한 라이선스 파일 URL·상충 주장 처리·문서 API 제한 backoff.
- 실제 PostgreSQL 통합 테스트 2개 통과: 동기화·rollback·출처 삭제·관리자 수정 유지에 더해 후속 관계 순환 방지·이전 원문 보존·보관 상태 유지·공식 보완 링크 유지, 저장소 미검증·확인·삭제·복구·연결 철회에 따른 모델 등록 기준 확인.
- Production Playwright 6개 통과: 검색·비교·즐겨찾기·저장 필터·관리자 인증·모바일·후속 모델의 이전 메모와 보관 검색, 공개 업데이트 버튼의 다섯 저장소 재점검·중복 요청 공유·완료 후 표시.
- Next.js production build와 TypeScript 확인. 공개 주소에서 실제 브라우저 리다이렉트, 5/5 성공 표시와 worker 가동 표시 확인.
- 수동 대기 큐를 독립 worker가 처리하는 것을 확인했습니다. 6시간 경과 전체를 기다린 시험은 아닙니다.

## 보완 큐와 한계

${documents.map(d=>`- ${d.kind} / ${d.status}: ${d.count}`).join('\n')}

논문 DOI 제공자 미등록·404·API 429와 접근 제한 모델 카드 오류는 기록하고 재시도합니다. 남은 문서 큐는 worker가 순차 처리합니다. 라이선스 없는 저장소는 공식 미제공, 코드 링크 없음과 외부 저장소는 별도 상태로 표시합니다. 임의 실험 근거·GPU 사양·논문 전문 요약을 만들어 채우지 않습니다.

운영 설명은 [README](../README.md), 공개 주소 구조는 [public-access.md](public-access.md)를 참고하세요.
`;
await writeFile('docs/verification.md',report);console.log('Wrote docs/verification.md');await pool.end();
