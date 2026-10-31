// 여러 서버(Vercel 함수)가 함께 쓰는 저장소: Upstash Redis REST API (Vercel Storage에서 무료로 연결)
// 환경변수가 없으면 enabled=false 이고, 각 모듈은 기존처럼 cache/ 파일에만 저장
"use strict";

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const PREFIX = "binright:";

async function cmd(args) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(3000)
  });
  if (!r.ok) throw new Error("store " + r.status);
  return (await r.json()).result;
}

// 실패해도 앱은 돌아가야 하니 에러는 삼키고 null
async function get(key) {
  if (!URL_) return null;
  try { const v = await cmd(["GET", PREFIX + key]); return v ? JSON.parse(v) : null; }
  catch (e) { console.error("[store] get", e.message); return null; }
}
async function set(key, value, ttlSec) {
  if (!URL_) return;
  try { await cmd(["SET", PREFIX + key, JSON.stringify(value), "EX", String(ttlSec)]); }
  catch (e) { console.error("[store] set", e.message); }
}

module.exports = { get, set, enabled: !!(URL_ && TOKEN) };
