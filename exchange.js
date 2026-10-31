// 동네 행정복지센터의 재활용품 교환 사업(우유팩→화장지, 폐건전지→새 건전지 등)을 웹에서 찾아 정리
// 다음 검색 API(카카오 키)로 블로그·웹문서를 찾고, 그 구·동 이름이 나오는 글만 골라 Gemini가 항목으로 뽑음.
// 출처 글을 같이 돌려주고, 동네별로 2주 동안 저장 (공유 저장소가 있으면 거기에, 아니면 cache/exchange.json)
"use strict";

const fs = require("fs");
const path = require("path");
const store = require("./store.js");

const KAKAO = process.env.KAKAO_REST_API_KEY || "";
const GEMINI = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const CACHE_FILE = path.join(__dirname, "cache", "exchange.json");
const CACHE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000; // 2년 넘은 글은 버림

let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); } catch (e) { /* 처음엔 없음 */ }
const pending = new Map(); // 같은 동네 동시 요청은 한 번만

function saveCache() {
  try { fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); } catch (e) { /* 무시 */ }
}

function clean(s) {
  return String(s || "").replace(/<[^>]+>/g, "").replace(/&#34;|&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

async function daum(kind, query) {
  const url = "https://dapi.kakao.com/v2/search/" + kind + "?" + new URLSearchParams({ query, size: "10", sort: "accuracy" });
  const res = await fetch(url, { headers: { Authorization: "KakaoAK " + KAKAO }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("다음 검색 " + res.status);
  return ((await res.json()).documents || []).map((d) => ({
    title: clean(d.title), text: clean(d.contents), url: d.url, date: String(d.datetime || "").slice(0, 10)
  }));
}

// "마포구" → ["마포구", "마포"], "서교동" → ["서교동"]
function names(sgg, dong) {
  const gu = sgg.split(" ").pop();
  const out = [gu];
  if (gu.length >= 3) out.push(gu.slice(0, -1));
  if (dong) out.push(dong.replace(/\d+동$/, "동"), dong);
  return [...new Set(out)];
}

async function search(sido, sgg, dong) {
  const gu = sgg.split(" ").pop();
  const queries = [
    gu + " 우유팩 화장지 교환", gu + " 폐건전지 새건전지 교환", gu + " 종이팩 교환 주민센터",
    gu + " 아이스팩 수거 주민센터", gu + " 재활용품 교환 행정복지센터"
  ];
  if (dong) queries.push(dong + " 주민센터 우유팩", dong + " 폐건전지 교환");
  const results = await Promise.all(queries.flatMap((q) => [daum("web", q), daum("blog", q)].map((p) => p.catch(() => []))));
  const keys = names(sgg, dong), seen = new Set();
  // 다른 지역 글을 걸러냄: 시군구 이름이 들어 있고 2년 안의 글만
  return results.flat().filter((d) => {
    if (seen.has(d.url)) return false;
    seen.add(d.url);
    const text = d.title + " " + d.text;
    if (!keys.some((k) => text.includes(k))) return false;
    if (!/우유팩|종이팩|건전지|아이스팩|교환|수거/.test(text)) return false;
    return !d.date || Date.now() - new Date(d.date).getTime() < MAX_AGE_MS;
  }).slice(0, 24);
}

async function extract(sido, sgg, dong, docs) {
  const where = sido + " " + sgg + (dong ? " " + dong : "");
  const prompt = [
    "아래는 '" + where + "'의 재활용품 교환·수거 사업을 찾으려고 검색한 글 목록이야.",
    "글에 '" + sgg + "'" + (dong ? " 또는 '" + dong + "'" : "") + "에서 실제로 운영한다고 분명히 적힌 사업만 뽑아. 다른 지역 이야기, 일반적인 설명('주민센터에 물어보세요' 등), 추측은 빼.",
    "같은 사업은 하나로 합치고, 가장 최근 글을 기준으로 해. 없으면 빈 배열.",
    "JSON 배열로만 답해. 각 항목: {\"give\": 가져갈 것(짧게), \"get\": 받는 것(짧게), \"condition\": 교환 기준·기간 등(모르면 빈 문자열), \"scope\": \"" + sgg + " 전체\" 또는 동 이름, \"sources\": [글 번호들]}",
    "",
    docs.map((d, i) => "[" + i + "] (" + (d.date || "날짜 모름") + ") " + d.title + " — " + d.text).join("\n")
  ].join("\n");
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent", {
    method: "POST", signal: AbortSignal.timeout(30000),
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2048 } })
  });
  if (!res.ok) throw new Error("Gemini " + res.status);
  const j = await res.json();
  const text = (((j.candidates || [])[0] || {}).content || { parts: [] }).parts.map((p) => p.text || "").join("");
  let items;
  try { items = JSON.parse(text); } catch (e) { throw new Error("Gemini 응답이 JSON이 아님"); }
  if (!Array.isArray(items)) return [];
  return items.filter((it) => it && it.give && it.get).map((it) => {
    const src = (Array.isArray(it.sources) ? it.sources : []).map(Number).filter((n) => docs[n]).slice(0, 3).map((n) => docs[n]);
    return {
      give: String(it.give).slice(0, 60), get: String(it.get).slice(0, 60),
      condition: String(it.condition || "").slice(0, 120), scope: String(it.scope || sgg).slice(0, 30),
      sources: src.map((d) => ({ title: d.title.slice(0, 60), url: d.url, date: d.date }))
    };
  }).filter((it) => it.sources.length); // 출처 없는 항목은 버림
}

async function find(sido, sgg, dong) {
  const key = [sido, sgg, dong].join(" ").trim();
  const hit = cache[key];
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  if (pending.has(key)) return pending.get(key);
  const job = (async () => {
    // 다른 서버가 이미 찾아 둔 결과가 있으면 그대로 사용
    const shared = await store.get("exchange:" + key);
    if (shared && Date.now() - shared.at < CACHE_MS) { cache[key] = shared; return shared.data; }
    const docs = await search(sido, sgg, dong);
    const items = docs.length ? await extract(sido, sgg, dong, docs) : [];
    const data = { area: key, items, searched: docs.length, at: new Date().toISOString().slice(0, 10) };
    cache[key] = { at: Date.now(), data };
    saveCache();
    await store.set("exchange:" + key, cache[key], CACHE_MS / 1000);
    return data;
  })().catch((e) => { if (hit) return hit.data; throw e; }).finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

module.exports = { find, enabled: !!(KAKAO && GEMINI) };
