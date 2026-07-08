// 로컬 PC에서 직접 돌리는 토스증권 API 프록시.
// 이 PC의 공인 IP가 토스 Open API 허용 IP 목록에 등록돼 있어야 동작합니다.
// 실행: node --env-file=.env.local local-toss-proxy.js
import http from "node:http";

const PORT = process.env.PORT || 8787;
const TOSS_BASE = "https://openapi.tossinvest.com";
const SYMBOL_PATTERN = /^[A-Za-z0-9.\-,]{1,1200}$/;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) {
    return cachedToken;
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.TOSS_CLIENT_ID,
    client_secret: process.env.TOSS_CLIENT_SECRET,
  });
  const res = await fetch(`${TOSS_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`token request failed: HTTP ${res.status} ${detail}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // 아무나 인터넷에서 우리 토스 API 쿼터를 소진시키지 못하도록 공유 비밀키 확인
  if (url.searchParams.get("key") !== process.env.PROXY_KEY) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "인증되지 않은 요청입니다." }));
    return;
  }

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const symbols = url.searchParams.get("symbols");
  if (!symbols || !SYMBOL_PATTERN.test(symbols)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "유효한 symbols 파라미터가 필요합니다." }));
    return;
  }

  if (url.pathname === "/api/toss-prices" && req.method === "GET") {
    try {
      const token = await getAccessToken();
      const priceRes = await fetch(`${TOSS_BASE}/api/v1/prices?symbols=${encodeURIComponent(symbols)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await priceRes.text();
      res.writeHead(priceRes.status, { "Content-Type": "application/json" });
      res.end(data);
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `프록시 오류: ${e?.message || "알 수 없는 오류"}` }));
    }
    return;
  }

  if (url.pathname === "/api/toss-baseline" && req.method === "GET") {
    try {
      const token = await getAccessToken();
      const symbolList = symbols.split(",");
      const result = {};
      const isKrxSymbol = (s) => /^\d{6}$/.test(s);
      for (const symbol of symbolList) {
        try {
          // 종목이 상장된 거래소 기준 시간대로 "오늘"을 판단(미국은 뉴욕, 코스피는 서울) —
          // 안 그러면 시차 때문에 아직 안 끝난 오늘 장 캔들을 전일 종가로 잘못 집을 수 있음
          const marketTz = isKrxSymbol(symbol) ? "Asia/Seoul" : "America/New_York";
          const todayInMarket = new Date().toLocaleDateString("sv-SE", { timeZone: marketTz });
          const candleRes = await fetch(
            `${TOSS_BASE}/api/v1/candles?symbol=${encodeURIComponent(symbol)}&interval=1d&count=3`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (candleRes.ok) {
            const candleData = await candleRes.json();
            const candles = (candleData?.result?.candles || [])
              .slice()
              .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // 최신순 정렬(순서 가정하지 않음)
            const prevCandle = candles.find((c) => {
              const d = new Date(c.timestamp).toLocaleDateString("sv-SE", { timeZone: marketTz });
              return d !== todayInMarket;
            }) || candles[0];
            if (prevCandle) result[symbol] = { pc: Number(prevCandle.closePrice) };
          }
        } catch { /* 개별 종목 실패는 건너뜀 */ }
        await new Promise((r) => setTimeout(r, 150));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ result }));
    } catch (e) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `프록시 오류: ${e?.message || "알 수 없는 오류"}` }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`토스 프록시 서버 실행 중: http://0.0.0.0:${PORT}`);
  console.log(`같은 Wi-Fi의 폰에서는 이 PC의 로컬 IP:${PORT} 로 접속하세요.`);
});
