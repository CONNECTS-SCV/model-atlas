# GitHub Pages 전환 검증

확인일: 2026-09-08

## 배포 결과

- 최종 주소: https://tech.curieus.net/model-atlas/
- 실제 앱 소스·수집 데이터: https://github.com/CONNECTS-SCV/model-atlas
- 주소 변경이나 trycloudflare 리다이렉트 없이 HTTPS 200 응답 확인.
- 임시 Cloudflare Tunnel, Mac의 production 서버와 수집기를 종료한 뒤에도 정상 동작 확인.
- 현재 공개 자료 2,606개, AI 모델 647개, 도구 역할 91개, 이전 모델 보관 5개.

## GitHub에서 실행한 검증

- [코드 검사](https://github.com/CONNECTS-SCV/model-atlas/actions/runs/34196175512): 성공. 단위 테스트·실제 PostgreSQL 통합 테스트·TypeScript·production build.
- [첫 Actions Pages 배포](https://github.com/CONNECTS-SCV/model-atlas/actions/runs/34196175532): 성공. 저장 상태 복원 → JSON 생성 → 정적 빌드 → Pages 배포.
- [실제 수동 재수집과 배포](https://github.com/CONNECTS-SCV/model-atlas/actions/runs/34196235444): 성공. 다섯 수집원 모두 2026-09-08 06:48 UTC에 최신 commit 점검 성공. 원본 변경 없음 확인.
- 수집 결과를 `github-actions[bot]`이 `cc63bdf` 커밋으로 저장한 것을 확인. 다음 실행에서도 상태·정리 기준·식별자가 유지됨.
- 일부 문서 보완 요청의 Crossref HTTP 429는 큐의 재시도 시각에 반영. 원본 저장소 점검 성공과 문서 보완 완료 여부는 별개.

## 공개 사이트 브라우저 확인

`STATIC_BASE_URL=https://tech.curieus.net/model-atlas/ npx playwright test tests/pages.spec.ts`

2개 시나리오 통과:

- 검색·원문 상세·비교·즐겨찾기 유지. 런타임 `/api/` 요청 없음. 최종 URL 유지.
- 이전 모델 보관 기준·접이식 수집원 패널·GitHub Actions 실행 링크·관리자 토큰 입력 제거·모바일 가로 넘침 없음.

로컬 정적 빌드에서도 같은 테스트를 통과했고, 별도 임시 DB에 Git 저장 상태를 복원하는 과정을 검증했습니다.

## 자동 운영

Workflow `.github/workflows/pages.yml`이 활성화됐습니다. UTC `17 */6 * * *`, 한국 시간 `03:17 / 09:17 / 15:17 / 21:17`에 예약되며 GitHub 실행 상황에 따라 지연될 수 있습니다. 6시간 경과 자체를 기다린 테스트는 아니며 동일 workflow의 수동 실행 경로를 실제 검증했습니다.

수동 수집은 사이트의 `수집 실행 ↗` → GitHub `Run workflow`에서 실행합니다. 저장소 쓰기 권한이 필요합니다. API용 인증 토큰은 웹페이지나 정적 데이터에 넣지 않았습니다.

기존 서버 기반 개발 환경의 기록은 [server-development.md](server-development.md), 현재 실행 방법은 [README](../README.md)를 참고하세요.
