# Map Crawler Project Analysis & PRD

## 1. 프로젝트 개요 (Project Overview)
**네이버 지도(Naver Map)**의 장소 데이터를 특정 키워드로 검색하여 자동으로 수집(Crawling)하는 웹 애플리케이션입니다. 수집된 데이터는 화면에 테이블 형태로 표시되며, 엑셀 파일로 다운로드할 수 있습니다.

### 주요 목표
- 사용자가 입력한 키워드에 대한 장소 정보(상호명, 지번 주소, 도로명 주소)를 대량으로 수집
- 정확한 **도로명 주소**와 **지번 주소** 분리 및 병합
- 엑셀 파일로 데이터 내보내기

---

## 2. 기술 스택 (Tech Stack)
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Crawler**: Puppeteer (Headless Chrome)
- **UI/Styling**: CSS Modules (Module based styling)
- **Export**: xlsx (SheetJS)
- **Deployment**: Local Environment (Windows)

---

## 3. 핵심 기능 및 로직 (Core Features & Logic)

### 3.1. 크롤링 프로세스 (Crawling Process)
1. 사용자가 키워드와 수집 개수(Limit)를 입력합니다.
2. Puppeteer가 백그라운드에서 크롬 브라우저를 실행합니다 (`headless: true`).
3. 네이버 지도 PC 버전(`https://map.naver.com/p/search/...`)으로 이동합니다.
4. `searchIframe` 내부의 리스트(`ul > li`)를 순회하며 데이터를 수집합니다.

### 3.2. 페이지네이션 및 스크롤 로직 (Pagination & Scroll)
네이버 지도의 데이터 로딩 방식인 **무한 스크롤(Infinite Scroll)**과 **페이지네이션(Pagination)**을 모두 처리합니다.

- **스크롤 (Scroll)**:
    - 리스트 영역을 스크롤하여 데이터를 추가 로딩합니다.
    - 스크롤 후 높이 변화가 없으면(`noScrollCount` 증가) 스크롤이 끝난 것으로 판단합니다.
- **페이지 이동 (Pagination)**:
    - 스크롤이 더 이상 동작하지 않고 수집 목표 개수에 도달하지 못했을 때, '다음 페이지' 버튼을 탐색합니다.
    - `span` 텍스트가 '다음페이지'인 요소를 포함하는 버튼(`a` 또는 `button`)을 찾아 클릭합니다.
    - 페이지 이동 후 `processedIndex`를 초기화하여 새 리스트의 0번부터 다시 수집합니다.

---

### 3.3. 상세 주소 추출 로직 (Address Extraction Logic) **[핵심]**
이 프로젝트에서 가장 중요한 로직으로, 기본 목록 정보와 상세 팝업 정보를 결합하여 완전한 주소를 생성합니다.

#### **Step 1: 기본 주소 (Basic Address) 확보**
    - **Priority 1 (거리 정보 활용 - refined v2)**: 리스트 아이템 내에서 **거리 정보(예: "11km")**를 포함하는 텍스트를 우선적으로 탐색합니다.
    - 부모 요소의 전체 텍스트(`innerText`)를 가져온 후, `\d+km` 패턴 뒤의 문자열을 추출합니다.
    - 추출된 문자열에서 "상세주소", "출발", "도착", "예약" 등 버튼으로 쓰이는 키워드가 나타나면 그 앞까지만 잘라내어 오염을 방지합니다. (`Regex Splitting`)
    - 이를 통해 "과천 중앙동"과 같은 주소를 깨끗하게 확보하고, 불필요한 텍스트가 섞이는 것을 차단합니다.
    - 상세 팝업 오픈을 위한 버튼은 **추출된 기본 주소(예: "과천 중앙동")를 포함하는 요소**나 "상세주소" 텍스트를 가진 요소를 찾아 식별합니다.
- **Priority 2 (기존 지역명 매칭)**: 거리 정보가 없는 경우, 기존 방식대로 시/도 구분(서울, 경기 등)으로 시작하는 텍스트를 찾습니다.
    - **추출 데이터**: `basicAddress` (예: "과천 중앙동", "서울 강동구")

#### **Step 2: 상세 팝업 오픈 (Expand)**
- 리스트 아이템의 '상세주소 열기'(주소 텍스트 영역) 버튼을 클릭하여 하단에 상세 주소 팝업을 엽니다.
- 상세 팝업에서 **'지번'** 섹션과 **'도로명'** 섹션의 텍스트를 각각 추출합니다.

#### **Step 3: 지번 주소 (Jibun Address) 병합**
- `지번` 텍스트(예: "성내동 123-4")를 추출합니다.
- 앞서 구한 `basicAddress`(서울 강동구)와 결합합니다.
- **중복 방지 로직**:
    - `jibunDetail`이 `basicAddress`의 마지막 단어(예: "강동구")로 시작하면 중복을 제거하고 붙입니다.
    - 예: "서울 강동구" + "강동구 성내동..." -> "서울 강동구 성내동..."

#### **Step 4: 도로명 주소 (Road Address) 완성**
- `도로명` 텍스트(예: "성내로9길 39 2층")를 추출합니다.
- 도로명 텍스트에는 보통 '시/군/구' 정보가 누락되어 있으므로 `basicAddress`에서 접두사(`siGuPrefix`)를 추출하여 붙입니다.
    - **Si/Gu Prefix 추출**: `basicAddress`의 첫 2~3어절을 사용 (예: "경기 남양주시" or "서울 강남구").
- **최종 병합**:
    - `siGuPrefix` + `roadDetail`
    - 마찬가지로 텍스트 중복 시 접두사를 제거하고 깔끔하게 연결합니다.
    - 도로명 정보가 없는 경우 빈 값으로 둡니다.

---

## 4. 데이터 구조 (Data Structure)
수집된 각 아이템은 다음 인터페이스를 따릅니다 (`src/hooks/useMapCrawler.ts`).

```typescript
export interface CrawlItem {
    id: number;           // 순번
    name: string;         // 상호명 (예: "딱풀리는수학")
    jibunAddress?: string; // 지번 주소 (예: "경기 부천시 원미구 중동 1140-2")
    roadAddress?: string;  // 도로명 주소 (예: "경기 부천시 원미구 조마루로297번길 31")
    category?: string;     // (현재 엑셀 출력에서 제외됨)
}
```

## 5. 엑셀 내보내기 (Excel Export)
- **라이브러리**: `xlsx`
- **파일명**: `crawled_data_<timestamp>.xlsx`
- **컬럼 구성**: 번호 | 상호명 | 지번 주소 | 도로명 주소 ('카테고리'는 제외됨)

---

## 6. 향후 개선 사항 (Future Improvements)
- **속도 최적화**: `Promise.all`을 이용한 탭 병렬 처리 (현재는 순차 처리).
- **중복 제거 강화**: 페이지네이션 시 중복된 아이템이 수집될 경우 ID 기반 필터링 추가.
- **에러 핸들링**: 특정 아이템 수집 실패 시 로그 파일 별도 저장.
