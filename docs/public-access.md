# 공개 접속 주소

- 최종 주소: https://tech.curieus.net/model-atlas/
- 코드·수집 상태 저장소: https://github.com/CONNECTS-SCV/model-atlas
- 배포·수집 workflow: https://github.com/CONNECTS-SCV/model-atlas/actions/workflows/pages.yml

GitHub Pages가 정적 HTML·JavaScript·버전별 JSON을 직접 제공합니다. Cloudflare 임시 터널이나 Mac 서버로 리다이렉트하지 않습니다. 기존 `tech.curieus.net` 홈페이지·DNS는 유지하고 프로젝트 Pages의 `/model-atlas/` 경로를 사용합니다.

Actions는 임시 PostgreSQL에 Git 저장소의 수집 상태를 복원하고, 변경분을 수집한 뒤 상태를 커밋하고 Pages를 재배포합니다. 영구 외부 DB·상시 웹 서버·개인 컴퓨터 기동은 필요하지 않습니다.

수동 수집 버튼은 GitHub Actions의 Run workflow 화면으로 이동합니다. 실행 권한은 GitHub 계정과 저장소 권한으로 관리합니다. 사이트에서 익명 사용자가 원격 작업을 시작하는 API는 제공하지 않습니다.

기존 trycloudflare 주소는 전환 전 미리보기이며 최종 서비스 주소가 아닙니다.
