// 바로버림 웹 서버: public/ 정적 파일 제공 + /api/ask (Gemini API 프록시) + /api/waste (공공데이터 배출정보) + /api/places (카카오 주변 장소)
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const D = require("./public/data.js");

try { process.loadEnvFile(); } catch (e) { /* .env 없으면 환경변수만 사용 */ }
const waste = require("./waste.js");
const places = require("./places.js");
const exchange = require("./exchange.js");
require("./bins.js").warm();

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const PUBLIC = path.join(__dirname, "public");
const API_KEY = process.env.GEMINI_API_KEY || "";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json"
};

/* ───────── AI 프롬프트 ───────── */
function systemPrompt(r) {
  const d = new Date();
  const lines = [];
  lines.push("너는 '바로버림'이라는 분리배출 도우미야. 아래 [우리 동네 규칙], [혜택], [품목 사전]을 근거로 사용자 질문에 답해.");
  lines.push("- 한국어 존댓말로 3~6문장 이내로 짧게. #, **, 표 같은 마크다운 기호는 쓰지 말고, 필요하면 '1.' 처럼 줄바꿈 목록만 써.");
  lines.push("- 먼저 어디에 버리는지(분류)를 말하고, 버리는 방법, 그다음 이 동네의 배출 요일·시간을 덧붙여.");
  lines.push("- 품목 사전에 없으면 환경부 분리배출 일반 기준으로 답해. 확실하지 않으면 그렇다고 말하고 구청 확인을 권해.");
  lines.push("- 분리배출·쓰레기와 관계없는 질문이면 분리배출 질문만 도울 수 있다고 짧게 말해.");
  lines.push("");
  lines.push("오늘: " + (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + D.DAYS[d.getDay()] + "요일");
  if (r.noRules) lines.push("[우리 동네 규칙] " + D.regionLabel(r) + " (배출 요일·시간 정보를 아직 못 받음. 요일·시간은 지어내지 말고 " + r.dept + "에 확인하라고 안내해)");
  else lines.push("[우리 동네 규칙] " + D.regionLabel(r) + (r.source === "public" ? " (갱신일 " + r.updated + ")" : " (시연용 예시 데이터)"));
  D.ORDER.forEach((k) => {
    const ru = r.rules[k]; if (!ru) return;
    lines.push("- " + D.GROUPS[k].label + ": " + D.daysText(ru.days) + " " + ru.time + ", " + ru.place + ", " + ru.bag);
  });
  lines.push("- 미수거일: " + r.offDays + " / 대형폐기물: " + r.siteLabel + " 홈페이지·주민센터 신고 / 문의: " + r.dept + " " + r.phone);
  lines.push("[혜택]");
  D.localBenefits(r).concat(D.BENEFITS).forEach((b) => lines.push("- " + b.title + ": " + b.give + " → " + b.get + " (" + b.where + ")"));
  lines.push("[품목 사전]");
  D.ITEMS.forEach((it) => {
    lines.push("- " + it.name + (it.aliases.length ? "(" + it.aliases.join(",") + ")" : "") + " = " + D.CATS[it.cat].label + ": " + it.steps.join(" / ") + (it.myth ? " | 주의: " + it.myth : ""));
  });
  return lines.join("\n");
}

/* ───────── 요청 검사 ───────── */
const MAX_MSG = 600, MAX_TURNS = 10, MAX_BODY = 32 * 1024;
function cleanMessages(list) {
  if (!Array.isArray(list)) return null;
  const msgs = list.slice(-MAX_TURNS).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim());
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  if (msgs.some((m) => m.role === "user" && m.content.length > MAX_MSG)) return "too_long";
  return msgs.map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

// IP당 1분에 10번까지
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 10;
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

/* ───────── /api/ask ───────── */
async function handleAsk(req, res) {
  if (!API_KEY) return sendJson(res, 503, { error: "not_configured" });
  if (rateLimited(req.socket.remoteAddress)) return sendJson(res, 429, { error: "rate_limited" });

  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > MAX_BODY) return sendJson(res, 413, { error: "too_long" }); }
  let body;
  try { body = JSON.parse(raw); } catch (e) { return sendJson(res, 400, { error: "bad_request" }); }
  const msgs = cleanMessages(body.messages);
  if (msgs === "too_long") return sendJson(res, 400, { error: "too_long" });
  if (!msgs) return sendJson(res, 400, { error: "bad_request" });
  let region = D.REGIONS.find((r) => r.id === body.regionId);
  if (!region && waste.enabled) region = await waste.findRegion(body.regionId, body.sgg).catch(() => null);
  // 목록에서 고른 동네인데 배출 정보를 아직 못 받았으면 이름만 있는 지역으로 (예시 지역 규칙을 섞지 않도록)
  const a = body.area;
  if (!region && a && [a.sido, a.gu, a.dong].every((s) => typeof s === "string" && s.length > 0 && s.length <= 30)) region = D.blankRegion(a.sido, a.gu, a.dong);
  region = region || D.REGIONS[0];

  const ctl = new AbortController();
  res.on("close", () => { if (!res.writableFinished) ctl.abort(); });

  let upstream;
  try {
    upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":streamGenerateContent?alt=sse", {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(region) }] },
        contents: msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 2048 }
      })
    });
  } catch (err) {
    if (err.name !== "AbortError") { console.error("[ask]", err.message); sendJson(res, 502, { error: "network" }); }
    return;
  }
  if (!upstream.ok) {
    console.error("[ask] Gemini", upstream.status, (await upstream.text()).slice(0, 300));
    return sendJson(res, upstream.status === 429 ? 429 : 502, { error: upstream.status === 429 ? "rate_limited" : "network" });
  }

  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
  const write = (obj) => { if (!res.writableEnded) res.write(JSON.stringify(obj) + "\n"); };

  // SSE: "data: {...}" 줄마다 candidates[0].content.parts[].text 조각이 옴
  let buf = "", finish = "", blocked = false;
  const dec = new TextDecoder();
  try {
    for await (const chunk of upstream.body) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split(/\r?\n/); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const ev = JSON.parse(line.slice(5));
        if (ev.promptFeedback && ev.promptFeedback.blockReason) blocked = true;
        const c = ev.candidates && ev.candidates[0];
        if (!c) continue;
        const text = ((c.content && c.content.parts) || []).map((p) => p.text || "").join("");
        if (text) write({ t: text });
        if (c.finishReason) finish = c.finishReason;
      }
    }
    if (blocked || ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"].includes(finish)) write({ error: "refused" });
    else write({ done: true, truncated: finish === "MAX_TOKENS" });
  } catch (err) {
    if (err.name !== "AbortError") { console.error("[ask]", err.message); write({ error: "network" }); }
  }
  res.end();
}

/* ───────── 정적 파일 ───────── */
function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

/* ───────── /api/waste?sgg=마포구 ───────── */
async function handleWaste(req, res) {
  if (!waste.enabled) return sendJson(res, 503, { error: "not_configured" });
  const sgg = (new URL(req.url, "http://x").searchParams.get("sgg") || "").trim();
  if (sgg.length < 2 || sgg.length > 20) return sendJson(res, 400, { error: "bad_request" });
  try {
    sendJson(res, 200, { zones: await waste.searchZones(sgg) });
  } catch (e) {
    console.error("[waste]", e.message);
    sendJson(res, 502, { error: "upstream" });
  }
}

/* ───────── /api/places?area=서울특별시 마포구 서교동 ───────── */
async function handlePlaces(req, res) {
  if (!places.enabled) return sendJson(res, 503, { error: "not_configured" });
  const q = new URL(req.url, "http://x").searchParams;
  const area = (q.get("area") || "").trim();
  const region = { sido: (q.get("sido") || "").trim(), sgg: (q.get("sgg") || "").trim(), dong: (q.get("dong") || "").trim() };
  if (area.length < 2 || area.length > 60) return sendJson(res, 400, { error: "bad_request" });
  if (rateLimited("places:" + req.socket.remoteAddress)) return sendJson(res, 429, { error: "rate_limited" });
  try {
    sendJson(res, 200, await places.nearby(area, region));
  } catch (e) {
    console.error("[places]", e.message);
    sendJson(res, 502, { error: "upstream" });
  }
}

/* ───────── /api/exchange?sido=&sgg=&dong= ───────── */
async function handleExchange(req, res) {
  if (!exchange.enabled) return sendJson(res, 503, { error: "not_configured" });
  const q = new URL(req.url, "http://x").searchParams;
  const sido = (q.get("sido") || "").trim(), sgg = (q.get("sgg") || "").trim(), dong = (q.get("dong") || "").trim();
  if (sgg.length < 2 || sgg.length > 20 || dong.length > 20 || sido.length > 20) return sendJson(res, 400, { error: "bad_request" });
  if (rateLimited("exchange:" + req.socket.remoteAddress)) return sendJson(res, 429, { error: "rate_limited" });
  try {
    sendJson(res, 200, await exchange.find(sido, sgg, dong));
  } catch (e) {
    console.error("[exchange]", e.message);
    sendJson(res, 502, { error: "upstream" });
  }
}

function handler(req, res) {
  if (req.url === "/api/config") return sendJson(res, 200, { ai: !!API_KEY, waste: waste.enabled, places: places.enabled, exchange: exchange.enabled });
  if (req.url.startsWith("/api/waste?")) return handleWaste(req, res);
  if (req.url.startsWith("/api/places?")) return handlePlaces(req, res);
  if (req.url.startsWith("/api/exchange?")) return handleExchange(req, res);
  if (req.url === "/api/ask") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
    return handleAsk(req, res).catch((e) => { console.error(e); if (!res.headersSent) sendJson(res, 500, { error: "network" }); else res.end(); });
  }
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  serveStatic(req, res);
}

// Vercel에서는 api/index.js가 handler를 가져다 쓰고, 로컬에서는 직접 서버를 띄워요
module.exports = handler;
if (require.main === module) http.createServer(handler).listen(PORT, () => {
  console.log("바로버림: http://localhost:" + PORT);
  if (!waste.enabled) console.log("DATA_GO_KR_API_KEY가 없어서 지역 데이터는 시연용 예시 6곳만 보여요.");
  if (!places.enabled) console.log("KAKAO_REST_API_KEY가 없어서 혜택 탭의 주변 수거함 찾기는 꺼져 있어요.");
  if (!API_KEY) console.log("GEMINI_API_KEY가 없어서 'AI에게 물어보기'는 꺼져 있어요. .env에 키를 넣어 주세요.");
});
