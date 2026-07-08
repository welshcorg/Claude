import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as d3 from "d3";

// ---------------------------------------------------------------------------
// 색상: 0%를 중립 회색으로 두고 ±3%를 포화 구간으로 하는 발산형(diverging) 스케일
// ---------------------------------------------------------------------------
const NEUTRAL = "#2a2e35";
const UP = "#16c784";
const DOWN = "#ea3943";
function colorForChange(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "#1a1d22";
  const clamped = Math.max(-3, Math.min(3, pct));
  if (clamped === 0) return NEUTRAL;
  return clamped > 0
    ? d3.interpolateRgb(NEUTRAL, UP)(clamped / 3)
    : d3.interpolateRgb(NEUTRAL, DOWN)(-clamped / 3);
}

// 사용자가 입력한 프록시 주소(쿼리스트링에 ?key=... 포함 가능)에 실제 API 경로/파라미터를 합쳐줌
function buildProxyUrl(rawBase, path, extraParams) {
  const u = new URL(rawBase);
  const key = u.searchParams.get("key");
  const target = new URL(path, u.origin);
  Object.entries(extraParams).forEach(([k, v]) => target.searchParams.set(k, v));
  if (key) target.searchParams.set("key", key);
  return target.toString();
}

// ---------------------------------------------------------------------------
// 미국(나스닥/S&P) 데이터셋 — 시가총액 단위: 십억 달러(근사치)
// ---------------------------------------------------------------------------
const US_SECTORS = [
  { name: "Technology", stocks: [
    { t: "AAPL", cap: 3400, name: "Apple Inc.", price: 230 },
    { t: "MSFT", cap: 3200, name: "Microsoft Corporation", price: 430 },
    { t: "NVDA", cap: 3300, name: "NVIDIA Corporation", price: 140 },
    { t: "AVGO", cap: 900, name: "Broadcom Inc.", price: 180 },
    { t: "ORCL", cap: 500, name: "Oracle Corporation", price: 170 },
    { t: "CRM", cap: 250, name: "Salesforce, Inc.", price: 330 },
    { t: "ADBE", cap: 220, name: "Adobe Inc.", price: 500 },
    { t: "CSCO", cap: 220, name: "Cisco Systems, Inc.", price: 55 },
    { t: "AMD", cap: 250, name: "Advanced Micro Devices, Inc.", price: 160 },
    { t: "QCOM", cap: 180, name: "Qualcomm Incorporated", price: 170 },
    { t: "TXN", cap: 160, name: "Texas Instruments Incorporated", price: 200 },
    { t: "NOW", cap: 190, name: "ServiceNow, Inc.", price: 950 },
    { t: "INTC", cap: 90, name: "Intel Corporation", price: 22 },
    { t: "IBM", cap: 200, name: "International Business Machines Corp.", price: 190 },
  ]},
  { name: "Communication Services", stocks: [
    { t: "GOOGL", cap: 2200, name: "Alphabet Inc. (Class A)", price: 175 },
    { t: "META", cap: 1500, name: "Meta Platforms, Inc.", price: 560 },
    { t: "NFLX", cap: 350, name: "Netflix, Inc.", price: 700 },
    { t: "DIS", cap: 200, name: "The Walt Disney Company", price: 110 },
    { t: "TMUS", cap: 230, name: "T-Mobile US, Inc.", price: 190 },
    { t: "VZ", cap: 170, name: "Verizon Communications Inc.", price: 40 },
  ]},
  { name: "Consumer Cyclical", stocks: [
    { t: "AMZN", cap: 2100, name: "Amazon.com, Inc.", price: 195 },
    { t: "TSLA", cap: 900, name: "Tesla, Inc.", price: 250 },
    { t: "HD", cap: 400, name: "The Home Depot, Inc.", price: 400 },
    { t: "NKE", cap: 100, name: "Nike, Inc.", price: 75 },
    { t: "MCD", cap: 210, name: "McDonald's Corporation", price: 290 },
    { t: "SBUX", cap: 100, name: "Starbucks Corporation", price: 95 },
  ]},
  { name: "Consumer Defensive", stocks: [
    { t: "WMT", cap: 700, name: "Walmart Inc.", price: 90 },
    { t: "PG", cap: 380, name: "The Procter & Gamble Company", price: 165 },
    { t: "KO", cap: 280, name: "The Coca-Cola Company", price: 65 },
    { t: "PEP", cap: 230, name: "PepsiCo, Inc.", price: 170 },
    { t: "COST", cap: 400, name: "Costco Wholesale Corporation", price: 900 },
  ]},
  { name: "Healthcare", stocks: [
    { t: "LLY", cap: 800, name: "Eli Lilly and Company", price: 850 },
    { t: "JNJ", cap: 380, name: "Johnson & Johnson", price: 155 },
    { t: "UNH", cap: 480, name: "UnitedHealth Group Incorporated", price: 520 },
    { t: "ABBV", cap: 330, name: "AbbVie Inc.", price: 180 },
    { t: "MRK", cap: 260, name: "Merck & Co., Inc.", price: 105 },
    { t: "PFE", cap: 150, name: "Pfizer Inc.", price: 27 },
    { t: "TMO", cap: 200, name: "Thermo Fisher Scientific Inc.", price: 550 },
  ]},
  { name: "Financial", stocks: [
    { t: "JPM", cap: 600, name: "JPMorgan Chase & Co.", price: 215 },
    { t: "V", cap: 550, name: "Visa Inc.", price: 280 },
    { t: "MA", cap: 450, name: "Mastercard Incorporated", price: 490 },
    { t: "BAC", cap: 320, name: "Bank of America Corporation", price: 40 },
    { t: "WFC", cap: 230, name: "Wells Fargo & Company", price: 65 },
    { t: "GS", cap: 160, name: "The Goldman Sachs Group, Inc.", price: 490 },
    { t: "AXP", cap: 180, name: "American Express Company", price: 270 },
  ]},
  { name: "Industrials", stocks: [
    { t: "GE", cap: 200, name: "GE Aerospace", price: 180 },
    { t: "CAT", cap: 180, name: "Caterpillar Inc.", price: 360 },
    { t: "RTX", cap: 150, name: "RTX Corporation", price: 115 },
    { t: "BA", cap: 120, name: "The Boeing Company", price: 180 },
  ]},
  { name: "Energy", stocks: [
    { t: "XOM", cap: 500, name: "Exxon Mobil Corporation", price: 115 },
    { t: "CVX", cap: 300, name: "Chevron Corporation", price: 155 },
  ]},
  { name: "Utilities", stocks: [{ t: "NEE", cap: 150, name: "NextEra Energy, Inc.", price: 70 }] },
  { name: "Basic Materials", stocks: [{ t: "LIN", cap: 220, name: "Linde plc", price: 440 }] },
];

// ---------------------------------------------------------------------------
// 코스피 데이터셋 — 시가총액 단위: 조원(근사치). code는 Finnhub 조회용 KRX 종목코드.
// ---------------------------------------------------------------------------
const KOSPI_SECTORS = [
  { name: "전기전자", stocks: [
    { t: "삼성전자", code: "005930", cap: 450, name: "삼성전자", price: 75000 },
    { t: "SK하이닉스", code: "000660", cap: 150, name: "SK하이닉스", price: 200000 },
    { t: "LG전자", code: "066570", cap: 15, name: "LG전자", price: 90000 },
    { t: "삼성SDI", code: "006400", cap: 20, name: "삼성SDI", price: 300000 },
  ]},
  { name: "자동차", stocks: [
    { t: "현대차", code: "005380", cap: 55, name: "현대차", price: 230000 },
    { t: "기아", code: "000270", cap: 45, name: "기아", price: 100000 },
    { t: "현대모비스", code: "012330", cap: 25, name: "현대모비스", price: 230000 },
  ]},
  { name: "화학/에너지", stocks: [
    { t: "LG화학", code: "051910", cap: 20, name: "LG화학", price: 300000 },
    { t: "LG에너지솔루션", code: "373220", cap: 70, name: "LG에너지솔루션", price: 350000 },
    { t: "SK이노베이션", code: "096770", cap: 15, name: "SK이노베이션", price: 120000 },
    { t: "한화솔루션", code: "009830", cap: 8, name: "한화솔루션", price: 25000 },
    { t: "S-Oil", code: "010950", cap: 7, name: "S-Oil", price: 60000 },
  ]},
  { name: "금융", stocks: [
    { t: "KB금융", code: "105560", cap: 30, name: "KB금융", price: 75000 },
    { t: "신한지주", code: "055550", cap: 25, name: "신한지주", price: 50000 },
    { t: "하나금융지주", code: "086790", cap: 18, name: "하나금융지주", price: 55000 },
    { t: "삼성생명", code: "032830", cap: 15, name: "삼성생명", price: 80000 },
  ]},
  { name: "바이오/제약", stocks: [
    { t: "삼성바이오로직스", code: "207940", cap: 65, name: "삼성바이오로직스", price: 950000 },
    { t: "셀트리온", code: "068270", cap: 30, name: "셀트리온", price: 180000 },
  ]},
  { name: "통신/서비스", stocks: [
    { t: "NAVER", code: "035420", cap: 35, name: "NAVER", price: 180000 },
    { t: "카카오", code: "035720", cap: 20, name: "카카오", price: 45000 },
    { t: "KT", code: "030200", cap: 10, name: "KT", price: 40000 },
    { t: "LG유플러스", code: "032640", cap: 6, name: "LG유플러스", price: 10000 },
  ]},
  { name: "철강/소재", stocks: [
    { t: "POSCO홀딩스", code: "005490", cap: 25, name: "POSCO홀딩스", price: 350000 },
    { t: "고려아연", code: "010130", cap: 15, name: "고려아연", price: 500000 },
    { t: "현대제철", code: "004020", cap: 5, name: "현대제철", price: 28000 },
  ]},
  { name: "유통/기타", stocks: [
    { t: "삼성물산", code: "028260", cap: 20, name: "삼성물산", price: 130000 },
    { t: "KT&G", code: "033780", cap: 12, name: "KT&G", price: 95000 },
  ]},
];

const KOSPI_CODE_MAP = Object.fromEntries(
  KOSPI_SECTORS.flatMap((s) => s.stocks.map((st) => [st.t, st.code]))
);
const kospiSymbolFormatter = (t) => {
  const code = KOSPI_CODE_MAP[t];
  return code ? `${code}.KS` : t;
};

const REFRESH_OPTIONS = [
  { label: "60초", value: 60 },
  { label: "90초", value: 90 },
  { label: "120초", value: 120 },
];

// 웹소켓 체결이 뜸한 종목도 최소 이 주기 안에는 REST로 보정 갱신되도록 하는 하한선
const LIVE_FALLBACK_REFRESH_SEC = 90;

// 토스 프록시 폴링 주기(ms) — 한 번에 전 종목을 배치 조회하므로 짧게 잡아도 안전함
const TOSS_POLL_INTERVAL_MS = 3000;

function makeDemoQuotes(stockList, prev) {
  const next = {};
  stockList.forEach(({ t, price }) => {
    const prior = prev?.[t]?.dp ?? (Math.random() * 4 - 2);
    const step = (Math.random() - 0.5) * 0.6;
    let dp = prior + step;
    dp = Math.max(-6, Math.min(6, dp));
    const c = typeof price === "number" ? price * (1 + dp / 100) : null;
    next[t] = { dp, c, stale: false, updatedAt: Date.now() };
  });
  return next;
}

// ---------------------------------------------------------------------------
// 마켓맵 패널 (단일 시장용)
// ---------------------------------------------------------------------------
function MarketMapPanel({ title, sectors, symbolFormatter, defaultRefresh = 90, marketId = "us", currency = "usd", marketSwitcher = null, dataSource = "finnhub" }) {
  const tickers = useMemo(() => sectors.flatMap((s) => s.stocks.map((x) => x.t)), [sectors]);
  const stockList = useMemo(() => sectors.flatMap((s) => s.stocks), [sectors]);
  const tickerInfo = useMemo(() => {
    const map = {};
    sectors.forEach((s) => s.stocks.forEach((st) => { map[st.t] = { ...st, sector: s.name }; }));
    return map;
  }, [sectors]);
  const codeToTicker = useMemo(() => {
    const map = {};
    tickers.forEach((t) => { const code = tickerInfo[t]?.code; if (code) map[code] = t; });
    return map;
  }, [tickers, tickerInfo]);
  const [selectedTicker, setSelectedTicker] = useState(null);

  const credentialStorageKey = dataSource === "toss-proxy" ? `toss_proxy_url_${marketId}` : "finnhub_api_key";
  const storedKey = typeof window !== "undefined" ? localStorage.getItem(credentialStorageKey) : null;
  const [apiKey, setApiKey] = useState(storedKey || "");
  const [keyDraft, setKeyDraft] = useState(storedKey || "");
  const [mode, setMode] = useState(storedKey ? "live" : "demo");
  const quotesCacheKey = `finnhub_last_quotes_${marketId}`;
  const [quotes, setQuotes] = useState(() => {
    try {
      const raw = localStorage.getItem(quotesCacheKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const staled = {};
      Object.keys(parsed).forEach((k) => { staled[k] = { ...parsed[k], stale: true }; });
      return staled;
    } catch {
      return {};
    }
  });
  const [refreshSec, setRefreshSec] = useState(defaultRefresh);
  const [countdown, setCountdown] = useState(defaultRefresh);
  const [status, setStatus] = useState({ type: "idle", msg: "" });
  const [size, setSize] = useState({ w: 1000, h: 600 });
  const containerRef = useRef(null);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.max(320, width), h: Math.max(420, height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const fetchingRef = useRef(false);
  const wsRef = useRef(null);
  const prevCloseRef = useRef({});
  const manualCloseRef = useRef(false);
  const authInvalidRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const [wsState, setWsState] = useState("idle"); // idle | connecting | open | closed
  const [liveCountdown, setLiveCountdown] = useState(LIVE_FALLBACK_REFRESH_SEC);

  const symbolToTicker = useMemo(() => {
    const map = {};
    tickers.forEach((t) => { map[symbolFormatter ? symbolFormatter(t) : t] = t; });
    return map;
  }, [tickers, symbolFormatter]);

  const persistQuotes = useCallback((updater) => {
    setQuotes((prev) => {
      const next = updater(prev);
      try { localStorage.setItem(quotesCacheKey, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, [quotesCacheKey]);

  // 종목별 전일 종가(pc)를 받아오고(최초 1회) 웹소켓 체결이 뜸한 종목까지 보정 갱신(주기적으로)하는 REST 폴백
  // 종목마다 응답이 오는 즉시 화면에 반영해서, 전체가 끝날 때까지 기다리지 않아도 되게 함
  const fetchBaselineQuotes = useCallback(async ({ silent = false } = {}) => {
    if (!apiKey || fetchingRef.current) return false;
    fetchingRef.current = true;
    authInvalidRef.current = false;
    if (!silent) setStatus({ type: "loading", msg: "기준 시세를 가져오는 중..." });
    let hadAuthError = false;
    let authErrorDetail = "";
    let authErrorStatus = 0;
    let rateLimited = false;
    let networkFailCount = 0;
    let successCount = 0;
    let lastErrorDetail = "";

    for (let i = 0; i < tickers.length; i++) {
      const rawTicker = tickers[i];
      const symbol = symbolFormatter ? symbolFormatter(rawTicker) : rawTicker;
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`
        );
        if (res.status === 401 || res.status === 403) {
          hadAuthError = true;
          authErrorStatus = res.status;
          try {
            const body = await res.json();
            authErrorDetail = body?.error || JSON.stringify(body);
          } catch {
            try { authErrorDetail = await res.text(); } catch { /* noop */ }
          }
          break;
        }
        if (res.status === 429) {
          rateLimited = true;
          networkFailCount += 1;
          lastErrorDetail = "HTTP 429 (분당 요청 한도 초과)";
          persistQuotes((prev) => ({ ...prev, [rawTicker]: { dp: null, stale: true, updatedAt: Date.now() } }));
        } else if (!res.ok) {
          networkFailCount += 1;
          lastErrorDetail = `HTTP ${res.status}`;
          persistQuotes((prev) => ({ ...prev, [rawTicker]: { dp: null, stale: true, updatedAt: Date.now() } }));
        } else {
          const data = await res.json();
          const dp = typeof data?.dp === "number" ? data.dp : null;
          const c = typeof data?.c === "number" ? data.c : null;
          const pc = typeof data?.pc === "number" ? data.pc : null;
          if (pc !== null) prevCloseRef.current[rawTicker] = pc;
          if (dp === null) { networkFailCount += 1; lastErrorDetail = "응답에 dp 필드 없음(심볼 오류 가능)"; }
          else successCount += 1;
          persistQuotes((prev) => ({ ...prev, [rawTicker]: { dp, c, stale: dp === null, updatedAt: Date.now() } }));
        }
      } catch (e) {
        networkFailCount += 1;
        lastErrorDetail = e?.message || "fetch 실패 (CORS 또는 네트워크 차단 가능)";
        persistQuotes((prev) => ({ ...prev, [rawTicker]: { dp: null, stale: true, updatedAt: Date.now() } }));
      }
      // Finnhub 무료 티어 한도(분당 60회)를 넘지 않도록 요청 간 1.1초 간격을 둠
      await new Promise((r) => setTimeout(r, 1100));
    }

    fetchingRef.current = false;

    if (hadAuthError) {
      authInvalidRef.current = true;
      setStatus({
        type: "error",
        msg: `API 오류 (HTTP ${authErrorStatus}): ${authErrorDetail || "키를 확인해 주세요"}`,
      });
      return false;
    }

    if (rateLimited && successCount === 0) {
      setStatus({
        type: "error",
        msg: `분당 요청 한도 초과(429) · 기준 시세 일부 실패 · 잠시 후 다시 시도해 주세요`,
      });
    } else if (successCount === 0 && networkFailCount > 0) {
      setStatus({
        type: "error",
        msg: `전체 요청 실패 (${networkFailCount}/${tickers.length}) · 마지막 오류: ${lastErrorDetail} · CORS/네트워크 차단으로 보입니다`,
      });
    } else {
      setStatus({
        type: "ok",
        msg: silent
          ? `보정 갱신 완료 · ${new Date().toLocaleTimeString("ko-KR")}`
          : `기준 시세 로딩 완료`,
      });
    }
    return true;
  }, [apiKey, tickers, symbolFormatter, persistQuotes]);

  const closeWebSocket = useCallback(() => {
    clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) {
      manualCloseRef.current = true;
      try { wsRef.current.close(); } catch { /* noop */ }
      wsRef.current = null;
    }
    setWsState("idle");
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!apiKey) return;
    manualCloseRef.current = false;
    setWsState("connecting");
    const ws = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsState("open");
      tickers.forEach((t) => {
        const symbol = symbolFormatter ? symbolFormatter(t) : t;
        ws.send(JSON.stringify({ type: "subscribe", symbol }));
      });
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type !== "trade" || !Array.isArray(msg.data) || msg.data.length === 0) return;
      setQuotes((prev) => {
        const next = { ...prev };
        msg.data.forEach((tr) => {
          const rawTicker = symbolToTicker[tr.s] || tr.s;
          const pc = prevCloseRef.current[rawTicker];
          const dp = typeof pc === "number" && pc > 0 ? ((tr.p - pc) / pc) * 100 : next[rawTicker]?.dp ?? null;
          next[rawTicker] = { dp, c: tr.p, stale: false, updatedAt: tr.t || Date.now() };
        });
        return next;
      });
      setStatus({ type: "ok", msg: `실시간 체결 수신 중 · ${new Date().toLocaleTimeString("ko-KR")}` });
    };

    ws.onerror = () => {
      if (authInvalidRef.current) return;
      setStatus({ type: "error", msg: "웹소켓 연결 오류가 발생했습니다." });
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (manualCloseRef.current) {
        manualCloseRef.current = false;
        setWsState("idle");
        return;
      }
      if (authInvalidRef.current) {
        setWsState("idle");
        return;
      }
      setWsState("closed");
      reconnectTimerRef.current = setTimeout(() => connectWebSocket(), 3000);
    };
  }, [apiKey, tickers, symbolFormatter, symbolToTicker]);

  // 토스 프록시: 전일 종가(pc)를 한 번 받아옴 — apiKey는 이 데이터소스에서 프록시 서버 주소로 쓰임
  const fetchTossBaseline = useCallback(async () => {
    if (!apiKey) return false;
    setStatus({ type: "loading", msg: "전일 종가를 가져오는 중..." });
    const symbolsParam = tickers.map((t) => tickerInfo[t]?.code || t).join(",");
    try {
      const res = await fetch(buildProxyUrl(apiKey, "/api/toss-baseline", { symbols: symbolsParam }));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus({ type: "error", msg: `프록시 오류: ${body?.error || `HTTP ${res.status}`}` });
        return false;
      }
      const data = await res.json();
      Object.entries(data.result || {}).forEach(([code, v]) => {
        const ticker = codeToTicker[code] || code;
        if (typeof v?.pc === "number") prevCloseRef.current[ticker] = v.pc;
      });
      setStatus({ type: "ok", msg: "전일 종가 로딩 완료" });
      return true;
    } catch (e) {
      setStatus({ type: "error", msg: `프록시 연결 실패: ${e?.message || "알 수 없는 오류"}` });
      return false;
    }
  }, [apiKey, tickers, tickerInfo, codeToTicker]);

  // 토스 프록시: 전 종목 현재가를 한 번에 배치 조회
  const pollTossPrices = useCallback(async () => {
    if (!apiKey) return;
    const symbolsParam = tickers.map((t) => tickerInfo[t]?.code || t).join(",");
    try {
      const res = await fetch(buildProxyUrl(apiKey, "/api/toss-prices", { symbols: symbolsParam }));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus({ type: "error", msg: `프록시 오류: ${body?.error || `HTTP ${res.status}`}` });
        return;
      }
      const data = await res.json();
      const results = {};
      (data.result || []).forEach((item) => {
        const ticker = codeToTicker[item.symbol] || item.symbol;
        const price = Number(item.lastPrice);
        const pc = prevCloseRef.current[ticker];
        const dp = typeof pc === "number" && pc > 0 ? ((price - pc) / pc) * 100 : null;
        results[ticker] = { dp, c: price, stale: false, updatedAt: new Date(item.timestamp).getTime() || Date.now() };
      });
      setQuotes((prev) => {
        const merged = { ...prev, ...results };
        try { localStorage.setItem(quotesCacheKey, JSON.stringify(merged)); } catch { /* noop */ }
        return merged;
      });
      setStatus({ type: "ok", msg: `실시간 갱신 · ${new Date().toLocaleTimeString("ko-KR")}` });
    } catch (e) {
      setStatus({ type: "error", msg: `프록시 연결 실패: ${e?.message || "알 수 없는 오류"}` });
    }
  }, [apiKey, tickers, tickerInfo, codeToTicker, quotesCacheKey]);

  const runDemoTick = useCallback(() => {
    setQuotes((prev) => makeDemoQuotes(stockList, prev));
    setStatus({ type: "ok", msg: `데모 갱신: ${new Date().toLocaleTimeString("ko-KR")}` });
  }, [stockList]);

  // 데모 모드: 일정 간격으로 랜덤워크 시세 갱신
  useEffect(() => {
    if (mode !== "demo") return;
    runDemoTick();
    setCountdown(refreshSec);
    const tick = () => { runDemoTick(); setCountdown(refreshSec); };
    timerRef.current = setInterval(tick, refreshSec * 1000);
    countdownRef.current = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => { clearInterval(timerRef.current); clearInterval(countdownRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, refreshSec]);

  // 실시간 모드(토스 프록시): 전일 종가 로딩 후 짧은 주기로 배치 폴링
  useEffect(() => {
    if (mode !== "live" || !apiKey || dataSource !== "toss-proxy") return;
    let cancelled = false;

    (async () => {
      const ok = await fetchTossBaseline();
      if (ok && !cancelled) pollTossPrices();
    })();

    const pollId = setInterval(() => { if (!cancelled) pollTossPrices(); }, TOSS_POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(pollId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, apiKey, dataSource]);

  // 실시간 모드(Finnhub): 기준 시세(전일 종가) REST 로딩과 웹소켓 구독을 동시에 시작(하나가 끝나길 기다리지 않음)
  // + 체결이 뜸한 종목을 위한 90초 보정 갱신
  useEffect(() => {
    if (mode !== "live" || !apiKey || dataSource !== "finnhub") return;
    let cancelled = false;

    fetchBaselineQuotes();
    connectWebSocket();

    setLiveCountdown(LIVE_FALLBACK_REFRESH_SEC);
    const refreshId = setInterval(() => {
      if (!cancelled) fetchBaselineQuotes({ silent: true });
      setLiveCountdown(LIVE_FALLBACK_REFRESH_SEC);
    }, LIVE_FALLBACK_REFRESH_SEC * 1000);
    const countdownId = setInterval(() => setLiveCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);

    return () => {
      cancelled = true;
      clearInterval(refreshId);
      clearInterval(countdownId);
      closeWebSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, apiKey, dataSource]);

  const handleConnect = () => {
    if (!keyDraft.trim()) {
      setStatus({ type: "error", msg: dataSource === "toss-proxy" ? "프록시 서버 주소를 입력해 주세요." : "API 키를 입력해 주세요." });
      return;
    }
    const trimmed = keyDraft.trim();
    setApiKey(trimmed);
    setMode("live");
    localStorage.setItem(credentialStorageKey, trimmed);
  };

  const handleForgetKey = () => {
    localStorage.removeItem(credentialStorageKey);
    setApiKey("");
    setKeyDraft("");
    setMode("demo");
    setStatus({ type: "idle", msg: "" });
  };

  const layout = useMemo(() => {
    const root = {
      name: "root",
      children: sectors.map((s) => ({
        name: s.name,
        children: s.stocks.map((st) => ({ name: st.t, value: st.cap })),
      })),
    };
    const hierarchy = d3.hierarchy(root).sum((d) => d.value).sort((a, b) => b.value - a.value);
    const treemap = d3.treemap()
      .tile(d3.treemapSquarify)
      .size([size.w, size.h])
      .paddingOuter(3)
      .paddingTop((d) => (d.depth === 1 ? 22 : 3))
      .paddingInner(2)
      .round(true);
    treemap(hierarchy);
    return hierarchy;
  }, [size, sectors]);

  const sectorNodes = layout.descendants().filter((d) => d.depth === 1);
  const leafNodes = layout.leaves();

  const movers = useMemo(() => {
    const arr = tickers.map((t) => ({ t, dp: quotes[t]?.dp })).filter((x) => typeof x.dp === "number");
    return arr.sort((a, b) => Math.abs(b.dp) - Math.abs(a.dp)).slice(0, 14);
  }, [quotes, tickers]);

  return (
    <div className="w-full h-full min-h-screen bg-[#0A0C10] text-[#E6E8EB] flex flex-col font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        .font-sans { font-family: 'Inter', system-ui, sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .marquee-track { animation: marquee 40s linear infinite; }
      `}</style>

      {/* 상단 티커 테이프 */}
      <div className="w-full overflow-hidden border-b border-[#1F242C] bg-[#0D1015] h-8 flex items-center">
        <div className="marquee-track flex whitespace-nowrap font-mono text-xs">
          {[...movers, ...movers].map((m, i) => (
            <span key={i} className="mx-4 flex items-center gap-1">
              <span className="text-[#7A828E]">{m.t}</span>
              <span style={{ color: m.dp >= 0 ? UP : DOWN }}>
                {m.dp >= 0 ? "▲" : "▼"} {m.dp.toFixed(2)}%
              </span>
            </span>
          ))}
          {movers.length === 0 && (
            <span className="mx-4 text-[#7A828E]">데이터를 불러오면 상위 변동 종목이 이 자리에 표시됩니다.</span>
          )}
        </div>
      </div>

      {/* 헤더 / 컨트롤 */}
      <div className="border-b border-[#1F242C] bg-[#0D1015] px-3 py-2 sm:px-5 sm:py-3 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#E8A33D" }} />
          <h1 className="text-[13px] sm:text-[15px] font-semibold tracking-tight">{title}</h1>
          <span className="hidden sm:inline text-[11px] text-[#7A828E] font-mono">sector · market cap treemap</span>
        </div>

        {marketSwitcher}

        <div className="flex-1" />

        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 text-xs">
          <button
            onClick={() => { setMode("demo"); setStatus({ type: "idle", msg: "" }); }}
            className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-md border transition-colors ${
              mode === "demo"
                ? "border-[#E8A33D] text-[#E8A33D] bg-[#E8A33D0F]"
                : "border-[#1F242C] text-[#7A828E] hover:text-[#E6E8EB]"
            }`}
          >
            데모 모드
          </button>
          <input
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder={dataSource === "toss-proxy" ? "프록시 주소 (http://주소:8787?key=...)" : "Finnhub API 키 입력"}
            className={`font-mono text-xs bg-[#12151B] border border-[#1F242C] rounded-md px-2 py-1 sm:py-1.5 outline-none focus:border-[#E8A33D] text-[#E6E8EB] placeholder-[#4A505A] ${
              dataSource === "toss-proxy" ? "w-36 sm:w-56" : "w-28 sm:w-44"
            }`}
          />
          <button
            onClick={handleConnect}
            className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-md border transition-colors ${
              mode === "live"
                ? "border-[#E8A33D] text-[#E8A33D] bg-[#E8A33D0F]"
                : "border-[#1F242C] text-[#7A828E] hover:text-[#E6E8EB]"
            }`}
          >
            실시간 연결
          </button>
          {apiKey && (
            <button
              onClick={handleForgetKey}
              title="저장된 API 키 삭제"
              className="px-2 py-1 sm:py-1.5 rounded-md border border-[#1F242C] text-[#7A828E] hover:text-[#ea3943] hover:border-[#ea3943] transition-colors text-[11px]"
            >
              키 삭제
            </button>
          )}

          {mode === "demo" ? (
            <>
              <select
                value={refreshSec}
                onChange={(e) => setRefreshSec(Number(e.target.value))}
                className="font-mono text-xs bg-[#12151B] border border-[#1F242C] rounded-md px-2 py-1 sm:py-1.5 text-[#E6E8EB] outline-none"
              >
                {REFRESH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label} 간격</option>
                ))}
              </select>
              <span className="font-mono text-[#7A828E] w-14 sm:w-16 text-right">{countdown}s 후 갱신</span>
            </>
          ) : dataSource === "toss-proxy" ? (
            <span className="font-mono text-[11px] flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: status.type === "error" ? "#ea3943" : UP }}
              />
              <span className="text-[#7A828E]">
                {status.type === "error" ? "연결 오류" : "3초마다 배치 조회 중"}
              </span>
            </span>
          ) : (
            <span className="font-mono text-[11px] flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background:
                    wsState === "open" ? UP
                    : wsState === "connecting" ? "#E8A33D"
                    : wsState === "closed" ? "#ea3943"
                    : "#4A505A",
                }}
              />
              <span className="text-[#7A828E]">
                {wsState === "open" ? "실시간 스트림 연결됨"
                  : wsState === "connecting" ? "연결 중..."
                  : wsState === "closed" ? "연결 끊김 · 재연결 중"
                  : "대기 중"}
              </span>
              <span className="text-[#4A505A]">· 보정 갱신 {liveCountdown}s 후</span>
            </span>
          )}
        </div>
      </div>

      {/* 상태 표시줄 */}
      <div className="px-3 sm:px-5 py-1.5 text-[10px] sm:text-[11px] font-mono border-b border-[#1F242C] bg-[#0A0C10] text-[#7A828E] flex flex-wrap items-center gap-2 sm:gap-3">
        <span>모드: <span className="text-[#E6E8EB]">
          {mode === "demo" ? "데모(랜덤워크)" : dataSource === "toss-proxy" ? "실시간(토스 프록시)" : "실시간(Finnhub)"}
        </span></span>
        {status.msg && (
          <span className={status.type === "error" ? "text-[#ea3943]" : "text-[#7A828E]"}>{status.msg}</span>
        )}
        {mode === "demo" && dataSource === "finnhub" && (
          <span className="hidden sm:inline text-[#4A505A]">· Finnhub 무료 API 키 발급: finnhub.io/register</span>
        )}
      </div>

      {/* 트리맵 본체 */}
      <div ref={containerRef} className="relative flex-1 w-full min-h-[500px]">
        {sectorNodes.map((sector, si) => (
          <div
            key={si}
            className="absolute border border-[#1F242C]"
            style={{
              left: sector.x0, top: sector.y0,
              width: sector.x1 - sector.x0, height: sector.y1 - sector.y0,
              background: "#0D1015",
            }}
          >
            <div className="absolute top-0 left-0 right-0 h-[22px] flex items-center px-1.5 text-[10px] font-mono tracking-wide text-[#7A828E] uppercase truncate">
              {sector.data.name}
            </div>
          </div>
        ))}

        {leafNodes.map((leaf, li) => {
          const q = quotes[leaf.data.name];
          const dp = q?.dp;
          const w = leaf.x1 - leaf.x0;
          const h = leaf.y1 - leaf.y0;
          const showPct = w > 40 && h > 24;
          const showTime = w > 44 && h > 40 && q?.updatedAt;
          return (
            <div
              key={li}
              title={`${leaf.data.name} · 시총 ${currency === "krw" ? `${leaf.data.value}조원` : `${leaf.data.value}B`} ${typeof dp === "number" ? `· ${dp.toFixed(2)}%` : ""}`}
              onClick={() => setSelectedTicker(leaf.data.name)}
              className="absolute flex flex-col items-center justify-center overflow-hidden select-none cursor-pointer active:brightness-125"
              style={{
                left: leaf.x0, top: leaf.y0, width: w, height: h,
                background: colorForChange(dp),
                transition: "background 0.6s ease",
                opacity: q?.stale ? 0.55 : 1,
              }}
            >
              {w > 26 && h > 18 && (
                <span className="font-mono font-semibold leading-none truncate px-0.5" style={{ fontSize: Math.max(9, Math.min(15, w / 6)) }}>
                  {leaf.data.name}
                </span>
              )}
              {showPct && typeof dp === "number" && (
                <span className="font-mono leading-none mt-0.5" style={{ fontSize: Math.max(8, Math.min(12, w / 8)) }}>
                  {dp >= 0 ? "+" : ""}{dp.toFixed(2)}%
                </span>
              )}
              {showTime && (
                <span className="font-mono leading-none mt-0.5 opacity-70" style={{ fontSize: Math.max(7, Math.min(10, w / 10)) }}>
                  {new Date(q.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 종목 상세 모달 */}
      {selectedTicker && (() => {
        const info = tickerInfo[selectedTicker];
        const q = quotes[selectedTicker];
        const dp = q?.dp;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
            onClick={() => setSelectedTicker(null)}
          >
            <div
              className="bg-[#12151B] border border-[#1F242C] rounded-lg p-5 w-full max-w-xs font-mono"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-[#E6E8EB]">{selectedTicker}</div>
                  <div className="text-[12px] text-[#7A828E] font-sans mt-0.5">{info?.name || "-"}</div>
                </div>
                <button
                  onClick={() => setSelectedTicker(null)}
                  className="text-[#7A828E] hover:text-[#E6E8EB] text-lg leading-none px-1"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-[#E6E8EB]">
                  {typeof q?.c === "number"
                    ? currency === "krw"
                      ? `₩${Math.round(q.c).toLocaleString("ko-KR")}`
                      : `$${q.c.toFixed(2)}`
                    : "-"}
                </span>
                {typeof dp === "number" && (
                  <span className="text-sm" style={{ color: dp >= 0 ? UP : DOWN }}>
                    {dp >= 0 ? "▲" : "▼"} {dp >= 0 ? "+" : ""}{dp.toFixed(2)}%
                  </span>
                )}
              </div>

              <div className="mt-4 text-[11px] text-[#7A828E] space-y-1">
                <div>섹터: <span className="text-[#E6E8EB]">{info?.sector || "-"}</span></div>
                <div>
                  시가총액(근사): <span className="text-[#E6E8EB]">
                    {currency === "krw" ? `${info?.cap}조원` : `$${info?.cap}B`}
                  </span>
                </div>
                <div>
                  마지막 갱신: <span className="text-[#E6E8EB]">
                    {q?.updatedAt ? new Date(q.updatedAt).toLocaleTimeString("ko-KR") : "-"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 하단 범례 */}
      <div className="border-t border-[#1F242C] bg-[#0D1015] px-3 sm:px-5 py-2 flex flex-wrap items-center gap-2 sm:gap-4 text-[11px] font-mono text-[#7A828E]">
        <span className="hidden sm:inline">박스 크기 = 시가총액(근사)</span>
        <span className="hidden sm:inline">색상 = 등락률</span>
        <div className="flex items-center sm:ml-auto gap-1">
          {[-3, -2, -1, 0, 1, 2, 3].map((v) => (
            <div key={v} className="flex flex-col items-center gap-0.5">
              <div className="w-7 sm:w-9 h-3 rounded-sm" style={{ background: colorForChange(v) }} />
              <span className="text-[9px] text-[#4A505A]">{v > 0 ? `+${v}` : v}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LiveMarketMap() {
  const [market, setMarket] = useState("us");

  const marketSwitcher = (
    <div className="flex items-center gap-1 text-[11px] font-mono">
      <button
        onClick={() => setMarket("us")}
        className={`px-2 py-1 rounded-md border transition-colors ${
          market === "us"
            ? "border-[#E8A33D] text-[#E8A33D] bg-[#E8A33D0F]"
            : "border-[#1F242C] text-[#7A828E] hover:text-[#E6E8EB]"
        }`}
      >
        나스닥/S&P
      </button>
      <button
        onClick={() => setMarket("kospi")}
        className={`px-2 py-1 rounded-md border transition-colors ${
          market === "kospi"
            ? "border-[#E8A33D] text-[#E8A33D] bg-[#E8A33D0F]"
            : "border-[#1F242C] text-[#7A828E] hover:text-[#E6E8EB]"
        }`}
      >
        코스피
      </button>
    </div>
  );

  return market === "us" ? (
    <MarketMapPanel
      key="us"
      title="실시간 마켓맵 — 나스닥 / S&P"
      sectors={US_SECTORS}
      symbolFormatter={(t) => t}
      marketId="us"
      currency="usd"
      marketSwitcher={marketSwitcher}
      dataSource="toss-proxy"
    />
  ) : (
    <MarketMapPanel
      key="kospi"
      title="실시간 마켓맵 — 코스피"
      sectors={KOSPI_SECTORS}
      symbolFormatter={kospiSymbolFormatter}
      marketId="kospi"
      currency="krw"
      marketSwitcher={marketSwitcher}
      dataSource="toss-proxy"
    />
  );
}
