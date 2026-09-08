# Curieus Model Atlas

생명과학 AI 모델·논문·도구를 탐색하는 카탈로그입니다.

- **웹사이트:** https://tech.curieus.net/model-atlas/
- **코드·데이터:** https://github.com/CONNECTS-SCV/model-atlas
- **수집 실행·배포 로그:** https://github.com/CONNECTS-SCV/model-atlas/actions/workflows/pages.yml

## 운영 방식

GitHub Pages가 실제 웹사이트를 제공합니다. 임시 터널로 이동하지 않으며 개인 컴퓨터나 상시 웹 서버·DB가 필요 없습니다. 검색·필터·정렬·비교·즐겨찾기는 브라우저에서 동작합니다.

GitHub Actions는 UTC `00:17 / 06:17 / 12:17 / 18:17`에 수집을 예약합니다. 한국 시간으로 `03:17 / 09:17 / 15:17 / 21:17`입니다. GitHub 실행 상황에 따라 지연될 수 있습니다. 공개 저장소의 장기간 비활동 시 예약 workflow가 중지될 수 있으므로 Actions 실행 기록을 확인하세요.

1. 이전 수집 상태 `data/state.json.gz`를 임시 PostgreSQL에 복원합니다.
2. 다섯 원본 저장소의 최신 commit을 확인하고 변경 파일만 반영합니다.
3. 공개 코드 저장소와 라이선스·문서 보완 큐를 처리합니다.
4. 변경된 상태를 GitHub 저장소에 커밋합니다.
5. 등록 기준을 통과한 공개 데이터를 JSON으로 내보내고 정적 페이지를 빌드·배포합니다.

이 DB는 Actions 실행 중에만 존재하며 다음 실행은 저장된 상태에서 이어집니다. PostgreSQL 서버를 따로 운영하거나 DB secret을 설정할 필요가 없습니다. Workflow는 GitHub의 단기 `GITHUB_TOKEN`을 사용합니다.

## 수동 수집과 수정

사이트의 **수집 실행 ↗** 버튼은 GitHub Actions 화면을 엽니다. 저장소에 쓰기 권한이 있는 계정으로 로그인한 뒤 **Run workflow**를 누르세요. `refresh=true`이면 원본 재점검 후 배포하고, false이면 저장된 데이터로 재배포합니다. 완료되면 사이트는 30초마다 새 데이터 게시 여부를 확인합니다.

공개 페이지에는 관리자 토큰 입력이나 임의 수정 API가 없습니다. 코드·분류 기준은 PR/커밋으로 수정합니다. `scripts/curate.ts`에는 검토한 공식 저장소와 후속 모델 관계가 있습니다. 데이터 수정은 격리된 DB에 상태를 복원한 다음 정리 스크립트를 적용하고 상태를 저장해 커밋할 수 있습니다. 원문 추적·관리자 보정·이전 모델 메모는 상태 파일에 보존됩니다.

## 모델 등록 기준

AI 모델은 실제 접근 가능한 공개 코드 저장소가 확인된 경우에만 등록합니다. 미검증·주소 미제공 모델은 공개 검색·집계·상세에서 제외하며, 가중치·논문·데모 링크만으로 등록하지 않습니다. 현재 자동 저장소 검증은 GitHub를 지원합니다.

404/410 또는 비공개 전환을 확인하면 제외하고 복구 후 다시 확인되면 등록합니다. 일시적 API 제한은 기존 검증 결과를 무효화하지 않습니다. 논문·도구 자체의 수집 기준은 별도입니다. 코드·가중치·데이터 라이선스도 각각 구분합니다.

확인된 후속 모델이 있는 이전 항목은 기본 목록에서 보관하고 후속 모델에 범위·호환성 차이·공식 근거를 남깁니다. 연식만으로 일괄 삭제하지 않습니다.

## 로컬 정적 빌드

Node 22와 PostgreSQL 17을 사용합니다. 복원은 기존 데이터를 지우므로 별도 개발용 DB에서 실행하세요.

```sh
npm ci
createdb atlas_pages
export DATABASE_URL=postgresql://localhost:5432/atlas_pages
npm run db:migrate
ATLAS_ALLOW_RESTORE=1 npx tsx scripts/state.ts --restore
npx tsx scripts/export-pages.ts
npm run build:pages
```

정적 배포 결과는 `.pages-build/out`입니다. `/model-atlas/` 아래에서 제공해야 자산 경로가 일치합니다. 버전별 JSON을 생성하고 manifest를 사용해 페이지와 상세 데이터가 섞이지 않게 합니다.

```sh
npm test
TEST_DATABASE=1 npx tsx --test tests/sync.test.ts
npm run typecheck
# 정적 서버를 별도 실행한 뒤:
STATIC_BASE_URL=http://localhost:4173/model-atlas/ npx playwright test tests/pages.spec.ts
```

API·worker 기반 로컬 개발 도구도 유지합니다. 과거 서버 구성은 [서버 개발 기록](docs/server-development.md), 배포 구조는 [공개 접속 안내](docs/public-access.md)를 참고하세요. `.env.local`, 로컬 DB 접속 정보와 토큰은 커밋하거나 Pages에 내보내지 않습니다.
