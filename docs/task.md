# 작업 목록 (Task List)

## 프로젝트 설정
- [x] Next.js 프로젝트 초기화 및 필수 패키지 설치 (`puppeteer`, `xlsx` 등)
- [x] 프로젝트 폴더 구조 정리 (`docs`, `src` 하위 폴더 등)

## 백엔드/크롤러 구현
- [x] `src/utils/crawler.ts` 구현 (Puppeteer 설정 및 브라우저 실행)
- [x] 네이버 지도 검색 및 리스트 진입 로직 구현
- [x] "V" 버튼 클릭 및 상세 주소(지번) 추출 로직 구현 (가장 중요)
- [x] `src/app/api/crawl/route.ts` API 핸들러 구현

## 프론트엔드 구현
- [x] `src/components/search/SearchForm.tsx` 구현 (검색어, 개수 입력)
- [x] `src/components/result/ResultTable.tsx` 구현 (테이블, 페이지네이션)
- [x] `src/components/common/ExcelExportButton.tsx` 구현 (엑셀 다운로드)
- [x] `src/hooks/useMapCrawler.ts` 구현 (상태 관리 및 데이터 연동)
- [x] `src/app/page.tsx` 메인 페이지 UI 구성

## 검증 및 마무리
- [x] 검색 및 데이터 수집 통합 테스트
- [x] 엑셀 다운로드 기능 확인
- [x] 최종 문서 업데이트 (`walkthrough.md`)
