# 바로버림

우리 동네 쓰레기 배출 요일, 품목별 분리배출 방법, 버리고 돌려받는 혜택을 알려주는 모바일 우선 웹앱.

## 실행

```bash
npm install
cp .env.example .env   # GEMINI_API_KEY(AI), DATA_GO_KR_API_KEY(지역 데이터), KAKAO_REST_API_KEY(주변 장소) — 모두 무료
npm start              # http://localhost:3000
```

개발 중에는 `npm run dev` (파일 바뀌면 서버 자동 재시작).

## 구조

```
server.js          정적 파일 제공 + /api/waste (배출정보) + /api/places (주변 장소) + /api/ask (Gemini API 프록시, IP당 분당 10회 제한)
waste.js           공공데이터포털 생활쓰레기배출정보 조회·정리 (요일 파싱, 옛 버전 중복 제거)
places.js          혜택 탭 주변 장소: 공공 수거함 + 카카오(행정복지센터, 데이터 없을 때 대형마트·약국)
bins.js            전국 표준데이터: 폐의약품·폐건전지 수거함 (하루 한 번 전체 받기, 좌표 거리로 검색)
exchange.js        주민센터 교환 사업: 다음 검색(카카오 키) → 그 구·동 글만 골라 Gemini가 정리, 출처와 함께 2주 캐시
store.js           Vercel 공유 저장소 (Upstash Redis). 연결돼 있으면 교환 사업 검색 결과를 모든 서버가 함께 씀
seoul-bins.js      서울 11개 구 폐건전지 수거함 파일 자동 수집 (공공데이터포털·구청·서울 열린데이터광장)
public/
  index.html       화면 뼈대 (상단 바, 하단 탭, 지역 설정)
  styles.css       스타일
  data.js          지역 규칙·품목 사전·혜택 데이터 (브라우저와 서버가 함께 사용)
  app.js           화면 렌더링, 검색, 라우팅, AI 채팅
```

- API 키는 서버에만 있고 브라우저로 나가지 않아요. 시스템 프롬프트도 서버가 `data.js`로 만들어요.
- 키가 없으면 'AI에게 물어보기'만 안내 메시지를 보여주고 나머지 기능은 그대로 동작해요.
- 지역 데이터: `DATA_GO_KR_API_KEY`가 있으면 공공데이터포털 [행정안전부_생활쓰레기배출정보](https://www.data.go.kr/data/15025450/standard.do)로 전국을 검색하고, 없으면 시연용 예시 6곳만 보여요.
- 혜택 탭: 폐의약품·폐건전지 수거함은 공공데이터(전국 표준데이터 + 서울 11개 구 파일)에서 반경 2km를 찾아요. 파일은 서버가 매일 각 페이지에서 최신 링크를 찾아 받으니 손으로 갱신할 필요 없어요. 다른 지역 CSV는 `data/bins/`에 넣으면 돼요.
