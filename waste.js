// 공공데이터포털 '생활쓰레기배출정보'(행정안전부) 조회 + 앱에서 쓰는 지역 규칙 모양으로 변환
"use strict";

const BASE = process.env.WASTE_API_BASE || "https://apis.data.go.kr/1741000/household_waste_info";
const KEY = process.env.DATA_GO_KR_API_KEY || "";
const CACHE_MS = 6 * 60 * 60 * 1000;
const fs = require("fs");
const path = require("path");
const shared = require("./store.js");
// 받아 온 내용은 공유 저장소에도 1년 동안 남겨 둠. 포털이 멈추거나 서버가 새로 떠도 예전 내용이라도 보여 주려고
const KEEP_SEC = 365 * 24 * 60 * 60;
// 시군구 검색어 → { at, zones }. 포털이 멈춰도 검색되도록 파일에도 저장해 두고, 실패하면 오래된 값이라도 씀
const CACHE_FILE = path.join(__dirname, "cache", "waste.json");
let cache = new Map();
try { cache = new Map(Object.entries(JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")))); } catch (e) { /* 처음엔 없음 */ }
function saveCache() {
  try { fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(cache))); } catch (e) { /* 저장 실패는 무시 */ }
}

const DOW = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

// "일+월+화", "월~금", "매일", "월요일, 수요일" 같은 값을 요일 번호 배열로
function parseDays(s) {
  s = String(s || "").replace(/요일/g, "").trim();
  if (!s || s === "-") return [];
  if (/매일/.test(s)) return [0, 1, 2, 3, 4, 5, 6];
  const out = new Set();
  s.split(/[+,\s/·]+/).forEach((part) => {
    const range = /^([일월화수목금토])\s*[~-]\s*([일월화수목금토])$/.exec(part);
    if (range) {
      for (let d = DOW[range[1]], n = 0; n < 7; d = (d + 1) % 7, n++) { out.add(d); if (d === DOW[range[2]]) break; }
      return;
    }
    for (const ch of part) if (ch in DOW) out.add(DOW[ch]);
  });
  return [...out].sort();
}

// "18:00" / "1800" / "18시" / "6:00" → "18:00"
function fmtTime(t) {
  const m = /^(\d{1,2})\s*[:시]?\s*(\d{2})?/.exec(String(t || "").trim());
  return m ? m[1].padStart(2, "0") + ":" + (m[2] || "00") : String(t || "").trim();
}
function timeRange(a, b) {
  a = fmtTime(a); b = fmtTime(b);
  if (!a && !b) return "시간 정보 없음";
  return (a || "?") + "~" + (b === "00:00" ? "24:00" : b || "?");
}

function rule(row, prefix, place) {
  const days = parseDays(row[prefix + "_EMSN_DOW"]);
  if (!days.length) return null;
  return {
    days,
    time: timeRange(row[prefix + "_EMSN_BGNG_TM"], row[prefix + "_EMSN_END_TM"]),
    place,
    bag: (row[prefix + "_EMSN_MTHD"] || "").trim() || "구청 안내 확인"
  };
}

// API 한 줄(관리구역 하나) → 앱 지역 객체 (dong 은 고른 동이 있을 때 채움)
function toRegion(row, dong) {
  const place = (row.EMSN_PLC || "").trim() || "지정 장소";
  const rules = {};
  const g = rule(row, "LF_WST", place), f = rule(row, "FOD_WST", place), r = rule(row, "RCYCL", place);
  if (g) rules.general = g;
  if (f) rules.food = f;
  if (r) rules.recycle = r;
  const zone = isNone(row.MNG_ZONE_NM) ? "" : row.MNG_ZONE_NM.trim();
  const areas = splitAreas(row.MNG_ZONE_TRGT_RGN_NM).filter((a) => a !== row.SGG_NM && !/전체|관내|전역/.test(a) && !a.endsWith(" " + row.SGG_NM));
  const only = areas.length === 1 && areas[0].length <= 20 ? areas[0] : null;
  // 공공데이터엔 구청 홈페이지 주소가 없어서 '대형폐기물 신고' 검색 결과로 연결
  const query = row.CTPV_NM + " " + row.SGG_NM + "청 대형폐기물 신고";
  return {
    id: "pub:" + row.MNG_NO + (dong ? ":" + dong : ""),
    source: "public",
    sgg: row.SGG_NM,
    sido: row.CTPV_NM,
    gu: row.SGG_NM,
    dong: dong || only,
    level: dong || only ? "동" : "시군구",
    zone,
    areas,
    areaText: isNone(row.MNG_ZONE_TRGT_RGN_NM) ? "" : row.MNG_ZONE_TRGT_RGN_NM.split("+").join(", "),
    site: "https://search.naver.com/search.naver?query=" + encodeURIComponent(query),
    siteLabel: row.SGG_NM + "청",
    siteKind: "search",
    dept: row.SGG_NM + " " + (row.MNG_DEPT_NM || "청소 담당 부서"),
    phone: row.MNG_DEPT_TELNO || "120",
    phoneNote: row.MNG_DEPT_TELNO ? "구청 담당 부서" : "지역 콜센터",
    updated: String(row.DAT_UPDT_PNT || row.DAT_CRTR_YMD || "").slice(0, 10),
    offDays: (row.UNCLLT_DAY || "").replace(/\+/g, ", ") || "구청 안내 확인",
    rules
  };
}

function isNone(s) { s = String(s || "").trim(); return !s || s === "-" || s === "없음"; }
function splitAreas(s) {
  return String(s || "").split("+").map((x) => x.trim()).filter((x) => !isNone(x));
}

async function fetchRows(sgg) {
  const url = new URL(BASE + "/info");
  if (KEY) url.searchParams.set("serviceKey", KEY);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("returnType", "json");
  url.searchParams.set("cond[SGG_NM::LIKE]", sgg);
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch (e) { throw new Error("공공데이터 응답이 JSON이 아님 (" + res.status + "): " + text.slice(0, 200)); }
  const head = j.response && j.response.header;
  if (head && head.resultCode !== "0" && head.resultCode !== "00") throw new Error("공공데이터 오류 " + head.resultCode + " " + head.resultMsg);
  const items = j.response && j.response.body && j.response.body.items;
  const rows = items ? (Array.isArray(items) ? items : items.item) : [];
  return Array.isArray(rows) ? rows : rows ? [rows] : [];
}

// 시군구 이름으로 관리구역 목록 (같은 구역은 최신 갱신본만)
async function searchZones(sgg) {
  sgg = String(sgg || "").trim();
  let hit = cache.get(sgg);
  if (!hit && shared.enabled) { hit = await shared.get("waste:" + sgg); if (hit) cache.set(sgg, hit); }
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.zones;
  let rows;
  try { rows = await fetchRows(sgg); }
  catch (e) {
    if (hit) { console.error("[waste] 응답 없음, 저장해 둔 " + sgg + " 데이터 사용 (" + new Date(hit.at).toISOString().slice(0, 10) + "):", e.message); return hit.zones; }
    throw e;
  }
  // 같은 구역의 옛 버전(관리번호 앞자리가 연도)이 섞여 오므로 구역별 최신 한 줄만 남김
  const latest = new Map();
  rows.forEach((row) => {
    const k = [row.CTPV_NM, row.SGG_NM, row.MNG_ZONE_NM, row.MNG_ZONE_TRGT_RGN_NM].join("|");
    const prev = latest.get(k);
    const newer = !prev || String(row.DAT_UPDT_PNT) + row.MNG_NO > String(prev.DAT_UPDT_PNT) + prev.MNG_NO;
    if (newer) latest.set(k, row);
  });
  const zones = [...latest.values()].map((row) => toRegion(row)).filter((z) => Object.keys(z.rules).length);
  // 빈 응답으로 저장해 둔 예전 내용을 덮어쓰지 않음
  if (!zones.length && hit && hit.zones.length) return hit.zones;
  const entry = { at: Date.now(), zones };
  cache.set(sgg, entry);
  saveCache();
  if (zones.length) await shared.set("waste:" + sgg, entry, KEEP_SEC);
  return zones;
}

// "pub:관리번호[:동]" → 지역 객체 (AI 프롬프트용, sgg 로 다시 조회)
async function findRegion(id, sgg) {
  const m = /^pub:([^:]+)(?::(.+))?$/.exec(id || "");
  if (!m || !sgg) return null;
  const zone = (await searchZones(sgg)).find((z) => z.id === "pub:" + m[1]);
  if (!zone) return null;
  return m[2] && zone.areas.indexOf(m[2]) > -1 ? Object.assign({}, zone, { id, dong: m[2], level: "동" }) : zone;
}

module.exports = { searchZones, findRegion, parseDays, enabled: !!KEY || !!process.env.WASTE_API_BASE };
