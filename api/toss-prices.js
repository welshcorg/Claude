// Vercel Serverless Function: proxies Toss Securities Open API price quotes.
// Keeps TOSS_CLIENT_ID / TOSS_CLIENT_SECRET server-side only (never sent to the client),
// and adds CORS headers so the Capacitor app (origin https://localhost) and the web
// deployment can call this endpoint directly.

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
  // 만료 60초 전에 미리 갱신
  cachedTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "GET만 지원합니다." });
    return;
  }

  const symbols = req.query.symbols;
  if (!symbols || typeof symbols !== "string" || !SYMBOL_PATTERN.test(symbols)) {
    res.status(400).json({ error: "유효한 symbols 파라미터가 필요합니다." });
    return;
  }

  try {
    const token = await getAccessToken();
    const priceRes = await fetch(`${TOSS_BASE}/api/v1/prices?symbols=${encodeURIComponent(symbols)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await priceRes.json();
    res.status(priceRes.status).json(data);
  } catch (e) {
    res.status(502).json({ error: `프록시 오류: ${e?.message || "알 수 없는 오류"}` });
  }
}
