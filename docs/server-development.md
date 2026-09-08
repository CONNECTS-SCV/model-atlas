# Curieus Model Atlas

생명과학 AI 모델·논문·도구를 다섯 공개 GitHub 저장소에서 수집하는 실제 데이터 기반 카탈로그입니다. Next.js 16 / React 19 / TypeScript / PostgreSQL 17 / 독립 TypeScript worker로 구성했습니다. 샘플 seed 데이터는 사용하지 않습니다.

## 로컬 실행

Node.js 20.19+ 또는 22, PostgreSQL 15+가 필요합니다.

```sh
npm ci
createdb curieus_atlas
cp .env.example .env.local
# .env.local의 DATABASE_URL과 ADMIN_TOKEN 설정
# 관리자 토큰 생성: openssl rand -hex 32
npm run db:migrate
npm run sync
npm run dev
```

웹: http://localhost:3000

별도 터미널에서 예약 수집과 관리자 수동 작업을 처리합니다.

```sh
npm run worker
```

Worker는 15초마다 DB의 대기 작업을 확인하고, 수집원별 `next_run`에 따라 기본 6시간마다 동기화합니다. 웹 페이지를 열 필요가 없습니다. `npm run sync`는 1회 전체 확인, `npm run sync -- --force`는 같은 commit도 다시 파싱합니다. `--source=protein`처럼 수집원을 한정할 수 있습니다. `npm run enrich`는 공식 메타데이터 큐를 1회 처리합니다. 최초 초기화는 목록 크기와 외부 API에 따라 수 분이 걸립니다.

현재 작업 환경에는 `.env.local`, 실제 PostgreSQL 데이터베이스와 초기 수집 결과가 준비되어 있습니다. 토큰 파일은 Git에 포함되지 않습니다. 관리자 화면에 입력할 토큰은 이 파일의 `ADMIN_TOKEN`입니다.

## 환경변수

| 변수 | 용도 |
|---|---|
| `DATABASE_URL` | 웹·worker·migration이 사용하는 동일한 PostgreSQL 접속 URL |
| `ADMIN_TOKEN` | 최소 24자, 권장 64자 무작위 secret. 없거나 짧으면 모든 관리자 API 차단 |
| `GITHUB_TOKEN` | 공개 저장소 읽기용 선택 토큰. 익명 API 제한 때문에 운영 시 권장. 서버 worker에서만 사용 |
| `GITHUB_USE_GH_AUTH` | 로컬에서 `true`이면 기존 gh keychain 로그인을 서버 측에서 재사용. 기본 false |
| `SYNC_INTERVAL_HOURS` | 기본 `6`. 수집원별 예약 간격 |
| `ENRICH_BATCH_SIZE` | worker 주기당 공식 저장소·문서 보완 수. 기본 코드 `15`, 문서 `5` |
| `POSTGRES_PASSWORD` | Docker Compose에서 사용하는 DB 비밀번호 |

단순 공개 저장소 읽기에는 관리자·쓰기 권한이 필요 없습니다. Fine-grained token은 필요한 공개 저장소의 읽기 범위로 제한하세요. 웹 클라이언트에는 GitHub 토큰을 전달하지 않습니다. 관리자 토큰은 메모리에만 두며 localStorage에 저장하지 않습니다.

## 화면

- 모델 탐색: 서버 검색, 다중 대상·작업·알고리즘·접근성 필터, 출처 필터, 정렬, 30개씩 pagination, 열 선택.
- 모델·도구·논문·전체 자료 탭. 도구 탭은 라이브러리와 명시적 도구 역할도 포함하며 논문 없는 소프트웨어 링크도 파싱. 데이터셋·리뷰·라이브러리·벤치마크는 모델 집계에서 제외.
- 즐겨찾기·저장된 탐색·열 설정은 현재 브라우저의 localStorage에 저장. 계정 간 동기화는 제공하지 않음.
- 모델 상세: 별칭, 계열, 입출력, 조건, 라이선스, 논문 버전, 원문 위치·commit, 필드별 근거와 이력.
- 최대 5개 모델 비교. 이질적인 벤치마크 수치로 성능 순위를 만들지 않음.
- 업데이트 피드: 최근 100건의 의미 있는 변경, 변경 전후 데이터 확인.
- 수집 관리: 마지막 성공, commit, 다음 실행, 오류, 작업 이력, 관리자 인증 후 수동 동기화·예약 중지·검토 처리.
- 관리자 인증 상태에서 상세 패널의 필드를 수정하면 `overrides`로 보존. `kind` 수정으로 불명확한 논문을 근거 검토 후 모델·도구로 분류 가능. 검토 완료 버튼은 판단을 기록하며 자동으로 항목을 병합하지 않음.

## 수집원과 adapter

| 수집원 | 실제 수집 경로 |
|---|---|
| [AI4MolConformation-MD](https://github.com/AspirinCode/awesome-AI4MolConformation-MD) | `README.md` |
| [Molecular Design](https://github.com/AspirinCode/papers-for-molecular-design-using-DL) | `README.md`, `Molecular_Optimization.md` |
| [Protein Design](https://github.com/Peldom/papers_for_protein_design_using_DL) | `README.md` |
| [AI Antibody Design](https://github.com/JY-Bioinfo/awesome-ai-antibody-design) | `data/{methods,databases,software,reading}/*.yaml` |
| [Nucleotide Foundation Models](https://github.com/WangHuiNEU/Awesome-Nucleotide-Foundation-Models) | `data/models.yaml`, `data/benchmarks.yaml`, `data/surveys.yaml` |

2026-09-08 실제 구조 조사 기준입니다. 항체의 `data/index.json`, `docs/catalog.md`, `site/data.json`과 핵산의 생성 README는 중복 수집하지 않습니다. 핵산 `catalog.yaml`은 카탈로그 설정, `candidates.yaml`·`excluded.yaml`은 정식 모델 목록이 아니므로 제외합니다.

Markdown은 remark AST, YAML은 실제 YAML parser로 처리합니다. 제목·섹션·원본 필드를 근거로 규칙 기반 한국어 분류 요약을 생성하며 `inferred`로 기록합니다. 정확한 이름을 확정할 수 없는 논문은 논문 자료로 보존하고 검토 큐에 넣습니다. 이름만 유사한 항목이나 공식 저장소만 같은 서로 다른 모델은 자동 병합하지 않습니다.

LLM 키와 모델 코드 실행은 사용하지 않습니다. LLM 보완 기능은 이번 구현에 포함되지 않았으며 기본 수집에는 필요하지 않습니다. 외부 문서는 데이터로만 처리하고 문서의 명령을 실행하지 않습니다.

## 데이터 구조와 변경 처리

- `models`: 자료 유형이 명시된 카탈로그 엔티티. 모델 외 자료도 동일 탐색 UI에서 보되 집계 분리.
- `papers`, `model_papers`: 모델과 논문의 다대다 관계. DOI/arXiv 버전 정규화, 원래 URL과 `versions` 이력 보존.
- `code_repositories`, `model_repositories`: 모델·코드 저장소 다대다 관계. 공유 저장소를 모델 동일성으로 사용하지 않음.
- `source_entries`, `source_files`, `sources`: 원문, 파일 SHA, commit, 위치, 상태, 소스별 추적.
- `claims`: `source` / `inferred` / `official` / `admin`, 근거·URL·확인 시각.
- `jobs`, `enrichment_jobs`, `document_jobs`: 수집 및 공식 메타데이터 보완 큐.
- `events`, `reviews`: 변경 전후 감사 기록과 검토 대기.

동일 commit과 동일 adapter revision은 건너뛰고 파일 blob SHA가 바뀐 파일만 다운로드·파싱합니다. 재파싱한 항목의 의미상 hash가 같으면 변경 이벤트를 생성하지 않습니다. 제목과 목록에서 확인된 DOI/arXiv·공식 코드, 정규화 이름·별칭을 함께 사용합니다. 같은 논문을 가리키는 별도 구현은 논문 엔티티를 공유할 수 있지만 모델은 구분합니다. 유사 제목 fuzzy 자동 병합은 하지 않습니다.

저장소 단위 advisory lock과 대기 작업 unique index로 중복 실행을 막습니다. 서로 다른 저장소의 동시 신규 모델 판단은 transaction advisory lock으로 직렬화합니다. 변경 파일 전부를 먼저 파싱한 후 트랜잭션으로 반영합니다. 파서 오류·빈 목록·예상 파일 부재·50% 초과 급감(기존 20건 초과)은 전체 반영을 취소하고 기존 상태를 보존합니다. 정상 삭제는 출처만 `removed`로 표시합니다. 원문에 포함되지 않는 필드·권한·공식 검증을 임의로 채우지 않습니다.

관리자 수정 필드는 자동 동기화와 공식 보완이 덮어쓰지 않습니다. 코드·가중치·데이터 라이선스는 별도 필드입니다. 날짜는 확인된 정밀도(연·월·일)를 문자열로 보존하며 발견일을 공개일로 쓰지 않습니다.

## 공식 근거 보완

- GitHub 저장소 API: 실제 코드 존재·최근 push·GitHub의 SPDX 라이선스 식별 결과. ETag 캐시, 7일 TTL.
- Crossref DOI API: 등록된 논문 출판 시점, posted-content 최초 공개일, preprint/version 관계. 14일 캐시.
- 연결된 Hugging Face 모델 카드 API: 카드에 기재된 가중치 라이선스와 공개·gated 상태. 14일 캐시. 링크 제공자의 소유자 동일성은 별도 검토가 필요할 수 있음.

수집 목록의 라이선스 주장은 `reported_code_license`로만 저장합니다. 공식 결과와 상충하면 공식 확인값을 표시하고 검토 필요 표시를 붙입니다. 관리자 수정값은 유지합니다. 저장소마다 라이선스가 다르면 저장소별로 확인할 수 있습니다. 공식 보완 큐는 수집 이후 차례로 처리하므로 전체 항목의 공식 검증 완료를 의미하지 않습니다. GitHub license endpoint에서 실제 라이선스 파일명·URL을 확인합니다. 커스텀 약관은 사용자 정의로 표시합니다. 링크 미제공, 외부 저장소 확인 필요, 보완 대기, 공식 라이선스 미제공, 저장소 접근 실패를 구분합니다. 실험 검증·실행 요구사항 등 원문 근거가 없는 필드는 미확인입니다. 임의 논문 PDF 전문 분석, arXiv 전용 API 보완, 자동 실험 근거 추출은 현재 제공하지 않습니다.

HTTP timeout, 5xx/연결 재시도, 인증 오류·rate-limit 리셋 시각, recursive tree 잘림 시 하위 tree 순회가 구현되어 있습니다. GitHub commit 목록은 `per_page=1&page=1`로 최신 1개만 요청하며 전체 commit pagination은 필요하지 않습니다. 대형 파일은 크기 제한을 적용합니다. 오류는 관리자 화면에 기록하고 토큰은 로그에 남기지 않습니다.

## 운영

### Docker Compose

```sh
# .env 파일에 POSTGRES_PASSWORD와 ADMIN_TOKEN을 설정. 필요 시 GITHUB_TOKEN 설정.
docker compose up --build -d
```

PostgreSQL, migration, web, worker를 분리합니다. DB는 named volume에 유지되며 worker는 `restart: unless-stopped`로 재실행됩니다. 운영 서비스는 HTTPS reverse proxy 뒤에 두고 PostgreSQL 접속·백업 정책을 설정하세요. 이 작업 환경에는 Docker가 없어 컨테이너 실행 자체는 검증하지 않았습니다.

### GitHub Actions

`.github/workflows/sync.yml`은 UTC `17 */6 * * *`에 실행합니다. GitHub repository secrets에 외부에서 접근 가능한 운영 `DATABASE_URL`과 선택 `ATLAS_GITHUB_TOKEN`을 설정하세요. 같은 영구 DB를 사용하므로 실행마다 임시 카탈로그를 만드는 방식이 아닙니다. 자동 스케줄은 repository 기본 branch에 workflow를 올린 뒤 활성화됩니다. 여기서는 원격 저장소 생성·push·secret 설정을 수행하지 않았습니다.

Actions만 운영하면 관리자 수동 큐는 다음 Actions 실행 때 처리합니다. 즉시 수동 실행 처리가 필요하면 상시 worker를 함께 운영하세요. 양쪽을 동시에 실행해도 DB lock으로 중복 작업을 막습니다. 예약 시간은 플랫폼 지연과 API rate limit에 따라 늦어질 수 있습니다.

`npm run build && npm start`로 production Next 서버를 실행할 수 있습니다. `DATABASE_URL`은 build 시 필수로 연결하지 않고 API 요청 때 사용합니다.

## 검증

```sh
npm test
TEST_DATABASE=1 npx tsx --env-file-if-exists=.env.local --test tests/sync.test.ts
npm run typecheck
npm run build
npx playwright install chromium
# dev 서버를 별도 터미널에서 실행한 다음:
node --env-file=.env.local node_modules/@playwright/test/cli.js test
```

DB 통합 테스트는 `test-sync-*` 수집원을 transaction 내에서 만들고 전부 rollback합니다. 브라우저 테스트는 실제 수집 데이터가 있는 DB를 사용하며 관리자 큐 dedup 검증은 수동 작업 1건을 등록합니다. 실제 결과와 남은 운영 설정은 [검증 보고서](docs/verification.md)를 참고하세요.

## 주요 파일

- `src/lib/adapters.ts`: 수집원별 파일 선택·parser
- `src/lib/sync.ts`, `reconcile.ts`: identity·반영·삭제·관리자 우선권
- `src/lib/github.ts`, `enrich.ts`, `documents.ts`: API·공식 보완
- `scripts/worker.ts`: 독립 scheduler
- `db/migrations/`: 버전 관리 migration
- `src/app/api/`: 공개 검색·상세·보호된 관리자 API
- `src/components/Atlas.tsx`: 웹 인터페이스
- `tests/`: parser·DB·HTTP 오류·브라우저 검증

테스트의 실제 YAML fixture는 [AI Antibody Design 원본](https://github.com/JY-Bioinfo/awesome-ai-antibody-design/blob/6a2908bf49595d9a127ce6b85b85efdd23a4a851/data/methods/generative_design.yaml)의 짧은 메타데이터 발췌입니다. 카탈로그는 원 소유자의 코드나 가중치를 복제하지 않습니다.

## 2026-09-08 정리 및 현재 운영

공개 주소: https://tech.curieus.net/model-atlas/ — 실제 서버와 worker는 이 Mac에서 실행됩니다. GitHub Pages는 연결 페이지입니다. Mac 절전·종료 시 중단됩니다. [접속 구조](docs/public-access.md), [최신 검증](docs/verification.md).

후속 모델이 공식 근거로 확인된 이전 항목은 `lifecycle=superseded`로 기본 검색에서 제외하고, 후속 모델 상세에 범위·호환성 차이·근거 URL·이전 원문 snapshot을 남깁니다. 연식만으로 일괄 삭제하지 않으며 특화 작업 모델은 유지합니다. 보관 선택으로 다시 열 수 있고 인증된 관리자는 복원할 수 있습니다. 관리자 API의 `successor` 작업은 순환 관계를 차단합니다. 새 후속 버전의 우열 판단은 근거 검토가 필요한 수동 정리이며 정기 수집이 임의로 삭제하지 않습니다.

`model_repositories.link_origin=official`인 보완 링크와 공식 입출력은 다음 출처 동기화에서도 보존됩니다. `worker_state` heartbeat로 실제 가동 여부를 확인하고 화면은 30초마다 상태를 갱신합니다. 수집 6시간, 코드 7일, 논문·모델 카드 14일 주기이며 API 제한 시 재시도 시각을 따릅니다.

```sh
npx tsx --env-file-if-exists=.env.local scripts/curate.ts
npx tsx --env-file-if-exists=.env.local scripts/backfill.ts
npx tsx --env-file-if-exists=.env.local scripts/backfill-documents.ts
```

정리 스크립트는 검토한 공식 근거만 적용합니다. backfill은 큐에 있는 공개 메타데이터를 처리합니다.

## 업데이트 버튼

우측 상단의 `업데이트`는 로그인 없이 활성화된 다섯 수집원의 최신 commit을 다시 점검하도록 작업을 등록합니다. 실행 중에는 진행률을 표시하고, 완료되면 검색 목록·집계·업데이트 피드를 새로 불러옵니다. 동일 commit은 변경 없음으로 처리하며, 변경된 파일만 파싱합니다. 일부 수집원이 실패하면 기존 데이터를 유지하고 결과에 실패 수를 표시합니다.

실행 중이거나 최근 60초 안에 요청한 작업은 같은 결과를 공유해 중복 수집을 막습니다. 임의 저장소 추가나 메타데이터 수정 권한을 열지 않으며, 수집기 heartbeat가 없을 때는 요청 실패 이유를 표시합니다. 상태와 작업 ID는 DB에 저장되어 새로고침 후에도 진행 중인 작업을 확인할 수 있습니다. 큰 통계 카드는 제거하고 모델·자료·수집 성공 개수를 상단 오른쪽에 간결하게 표시합니다.


## AI 모델 등록 기준

AI 모델은 **실제로 접근 가능한 공개 코드 저장소가 하나 이상 확인된 경우에만** 카탈로그에 등록합니다. 논문·모델명·웹 데모·가중치 링크만 있는 항목은 이 기준을 통과하지 않습니다. 라이선스 유무는 저장소 존재 확인과 별도입니다.

- 새 수집 항목은 코드 저장소 검증 전까지 내부 수집 후보로만 유지하며 검색·즐겨찾기·전체 자료·집계·공개 상세에서 제외합니다.
- GitHub 공개 저장소 API 확인에 성공하면 자동 등록합니다. 현재 비 GitHub 저장소는 검증기가 없어 확인 전까지 제외합니다.
- 404/410 또는 비공개 전환을 확인하면 제외합니다. 복구되어 다시 확인되면 자동으로 목록에 돌아옵니다.
- API 제한·일시적 네트워크 오류는 저장소 부재의 증거가 아니므로 이전에 확인된 모델을 제거하지 않습니다.
- 출처 추적과 중복 방지를 위한 내부 원문은 유지합니다. 이 기준은 AI 모델에 적용하며 논문·도구 자체의 등록 기준과는 구분합니다.

공개 API는 공통 DB view `admitted_models`를 사용하므로 브라우저 필터를 우회해 미확인 모델을 검색하거나 상세 조회할 수 없습니다. 후속 모델에 남긴 이전 항목의 메모는 이력으로 보존합니다.
