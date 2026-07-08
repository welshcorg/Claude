# 프로젝트 맥락: 실시간 마켓맵 (live-market-map)

Claude Code에게: 이 프로젝트는 사용자가 Claude.ai 채팅에서 이미 작업을 진행하다가
로컬 개발 환경으로 옮기는 중입니다. 아래 맥락을 참고해서 처음부터 다시 설명을 요구하지 말고
바로 이어서 도와주세요.

## 무엇을 만들고 있는가

- 나스닥/S&P 대형주를 섹터별·시가총액 비례 트리맵(treemap)으로 보여주는 React 웹앱
- Finviz(finviz.com/map.ashx)의 마켓맵 기능을 벤치마킹함
- 색상 = 당일 등락률(%), 박스 크기 = 시가총액(근사치, 정적 데이터)
- 데모 모드(랜덤워크 데이터)와 실시간 모드(Finnhub API) 두 가지 지원

## 현재까지 진행 상황

1. Claude.ai 아티팩트(React)로 먼저 프로토타입 제작 완료 — 정상 작동 확인
2. 코스피 버전도 나란히 띄우는 것을 시도했다가, 코스피 실시간 데이터 신뢰성 문제로 사용자가 제외 요청 → 현재는 나스닥/S&P 단일 버전만 유지
3. Claude.ai 아티팩트 안에서 Finnhub API 키를 넣고 테스트 → **모든 요청이 "Failed to fetch"로 실패**
   - 원인: Claude 아티팩트가 실행되는 샌드박스 iframe에서 외부 API(Finnhub)로의 네트워크 요청이 CORS/보안 정책으로 차단되는 것으로 추정됨 (100% 확정은 아니나 정황상 유력)
   - 결론: 아티팩트 안에서는 실시간 데이터 연동이 구조적으로 불가능 → 일반 웹사이트로 배포해야 함
4. 사용자가 로컬 환경(Windows, Vite)에 프로젝트를 만드는 중
   - `npm create vite@latest live-market-map -- --template react` 완료
   - Tailwind CSS 설치 중 `npx tailwindcss init -p` 오류 발생
     → 원인: `npm install -D tailwindcss postcss autoprefixer`로 설치하면 최신 **Tailwind v4**가 깔리는데, v4부터는 `init` 명령어와 CLI 바이너리가 제거됨
     → 해결책 안내됨: v4 방식(`npm install tailwindcss @tailwindcss/vite` + `vite.config.js`에 플러그인 추가 + `src/index.css`에 `@import "tailwindcss";` 한 줄)으로 진행하거나, v3를 명시적으로 설치(`npm install -D tailwindcss@3 postcss autoprefixer`)하는 두 가지 옵션 제시함
   - **사용자가 실제로 이 단계를 완료했는지는 미확인** — Claude Code가 이어서 확인 필요

## 다음에 할 일 (Claude Code가 확인해야 할 것)

1. Tailwind 설치가 v3/v4 중 어느 쪽으로 정리되었는지 확인하고, 아직이면 마무리
2. `npm run dev`로 로컬 실행 확인
3. `LiveMarketMap.jsx` 코드(아래 첨부)를 `src/`에 배치하고 `App.jsx`에서 렌더링
4. Finnhub API 키로 실시간 데이터가 정상적으로 오는지 확인 (로컬 환경은 iframe 샌드박스가 아니므로 정상 작동할 가능성이 높다고 판단했었음 — 이 가정이 맞는지 검증 필요)
5. 정상 작동 확인되면 Vercel 또는 Netlify 배포까지 도와주기

## 사용자 정보 (응답 시 참고)

- 화학공학 박사과정 학생, OECT/EGT 연구자. 이 마켓맵 프로젝트는 연구와 무관한 개인 사이드 프로젝트임
- 존댓말 사용 선호
- 확실하지 않은 내용은 솔직하게 모른다고 말해주는 것을 선호함
- 기술적 원인을 정확히 짚어주는 것을 선호함 (모호한 뭉뚱그림보다 구체적 진단)

## 코드 원본 위치

아래 코드를 `src/LiveMarketMap.jsx`로 저장하세요 (전체 코드는 사용자가 별도로 이 파일과
함께 전달할 `live-market-map.jsx` 파일 참고).
