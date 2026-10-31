// 공공데이터포털 전국 표준데이터: 폐형광등·폐건전지 수거함, 폐의약품 수거함
// 지자체마다 시군구 표기가 달라 이름으로 거르지 않고, 전체를 하루 한 번 받아 두고 좌표 거리로 찾음
"use strict";

const KEY = process.env.DATA_GO_KR_API_KEY || "";
const seoul = require("./seoul-bins.js");
const DAY = 24 * 60 * 60 * 1000;
const PAGE = 1000, MAX_PAGES = 100;

const SETS = {
  battery: {
    url: "https://api.data.go.kr/openapi/tn_pubr_public_waste_lamp_battery_collection_box_api",
    // 명세는 대문자(INSTL_PLC_NM)인데 실제 응답은 camelCase(instlPlcNm)라 둘 다 받음
    row: (r) => ({
      name: r.instlPlcNm || r.INSTL_PLC_NM, detail: r.dtlPstnCn || r.DTL_PSTN_CN, sido: r.ctpvNm || r.CTPV_NM, sgg: r.sggNm || r.SGG_NM,
      address: r.lctnRoadNmAddr || r.lctnLotnoAddr || r.LCTN_ROAD_NM_ADDR || r.LCTN_LOTNO_ADDR, lat: r.lat || r.LAT, lng: r.lot || r.LOT,
      what: r.cltItemNm || r.CLT_ITEM_NM, phone: r.mngInstTelno || r.MNG_INST_TELNO, org: r.mngInstNm || r.MNG_INST_NM, date: r.dataCrtrYmd || r.DATA_CRTR_YMD
    })
  },
  medicine: {
    url: "https://api.data.go.kr/openapi/tn_pubr_public_lung_medicine_api",
    row: (r) => ({
      name: r.instlPlcNm, detail: r.actlPstn, sido: r.ctpvNm, sgg: r.sggNm,
      address: r.lctnRoadNm || r.lctnLotnoAddr, lat: r.lat, lng: r.lot,
      what: "폐의약품", phone: r.mngInstTelno, org: r.mngInstNm, date: r.crtrYmd
    })
  }
};
const fs = require("fs");
const path = require("path");
const store = {}; // id → { at, rows, loading, error }
// 마지막으로 받은 전체 데이터를 파일로 저장 → 서버를 다시 켜거나 포털이 멈춰도 바로 씀
const cacheFile = (id) => path.join(__dirname, "cache", "bins-" + id + ".json");
function loadSaved(id) {
  try { const f = cacheFile(id); return { rows: JSON.parse(fs.readFileSync(f, "utf8")), at: fs.statSync(f).mtimeMs }; } catch (e) { return null; }
}
function save(id, rows) {
  try { fs.mkdirSync(path.dirname(cacheFile(id)), { recursive: true }); fs.writeFileSync(cacheFile(id), JSON.stringify(rows)); } catch (e) { /* 저장 실패는 무시 */ }
}

async function page(set, n) {
  const url = new URL(set.url);
  url.search = new URLSearchParams({ serviceKey: KEY, pageNo: String(n), numOfRows: String(PAGE), type: "json" });
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch (e) { throw new Error("응답이 JSON이 아님 " + res.status + ": " + text.slice(0, 150)); }
  if (j.OpenAPI_ServiceResponse) throw new Error(j.OpenAPI_ServiceResponse.cmmMsgHeader.errMsg);
  const root = j.response || j; // 응답이 { response: {header, body} } 또는 { header, body }
  const head = root.header;
  if (head && head.resultCode !== "00" && head.resultCode !== "0" && head.resultCode !== "03") throw new Error(head.resultCode + " " + head.resultMsg);
  const body = root.body || {};
  const items = body.items;
  const rows = Array.isArray(items) ? items : items && items.item ? [].concat(items.item) : [];
  return { rows, total: Number(body.totalCount) || 0 };
}

async function loadAll(id) {
  const set = SETS[id], all = [];
  const first = await page(set, 1);
  all.push(...first.rows);
  const pages = Math.min(Math.ceil(first.total / PAGE), MAX_PAGES);
  for (let n = 2; n <= pages; n++) all.push(...(await page(set, n)).rows);
  const list = all.map(set.row).map((r) => Object.assign(r, { lat: parseFloat(r.lat), lng: parseFloat(r.lng) }))
    .filter((r) => r.name || r.address);
  // 전국 표준데이터에 없는 서울 자치구 데이터로 보충
  if (id === "battery") list.push(...(await seoul.loadSeoul()));
  return list;
}

// 하루 지난 데이터는 뒤에서 새로 받고, 받는 동안엔 있던 데이터를 그대로 씀
function rows(id) {
  if (!store[id]) { const saved = loadSaved(id); store[id] = saved ? { at: saved.at, rows: saved.rows } : { at: 0, rows: null }; }
  const s = store[id];
  if (!s.loading && Date.now() - s.at > DAY) {
    s.loading = loadAll(id).then((r) => { s.rows = r; s.at = Date.now(); s.error = null; save(id, r); console.log("[bins] " + id + " " + r.length + "건 받음"); })
      .catch((e) => { s.error = e.message; s.at = Date.now() - DAY + 10 * 60 * 1000; console.error("[bins] " + id, e.message); })
      .finally(() => { s.loading = null; });
  }
  return s.rows ? Promise.resolve(s.rows) : s.loading.then(() => s.rows || []);
}

function meters(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// center: { lat, lng }, region: { sido, sgg, dong } — 좌표 없는 줄은 같은 시군구·동 주소로 보충
async function near(id, center, region, radius, limit) {
  const list = await rows(id);
  const gu = region.sgg.split(" ").pop();
  const out = [];
  list.forEach((r) => {
    let d = null;
    if (center && isFinite(r.lat) && isFinite(r.lng) && r.lat > 30) d = meters(center, r);
    else if (!(String(r.sgg || "").includes(gu) || String(r.address || "").includes(gu))) return;
    else if (region.dong && !(String(r.address || "") + " " + (r.dong || "")).includes(region.dong)) return;
    if (d !== null && d > radius) return;
    out.push({
      name: r.name || r.address,
      address: [r.address, r.detail].filter(Boolean).join(" · "),
      phone: r.phone || "",
      distance: d,
      what: r.what || "",
      url: isFinite(r.lat) && r.lat > 30
        ? "https://map.kakao.com/link/map/" + encodeURIComponent(r.name || "수거함") + "," + r.lat + "," + r.lng
        : "https://map.kakao.com/link/search/" + encodeURIComponent(r.address || r.name)
    });
  });
  out.sort((a, b) => (a.distance === null) - (b.distance === null) || (a.distance || 0) - (b.distance || 0));
  // 한 장소에 수거함이 여러 개(형광등용·건전지용 등)면 한 번만
  const seen = new Set();
  return out.filter((p) => { const k = p.name + "|" + p.address; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit);
}

function status() {
  return Object.keys(SETS).reduce((o, id) => { const s = store[id] || {}; o[id] = { rows: s.rows ? s.rows.length : null, error: s.error || null }; return o; }, {});
}

// 서버 시작 때 미리 받아 두기 (첫 사용자가 기다리지 않게)
function warm() { if (KEY) Object.keys(SETS).forEach((id) => rows(id).catch(() => {})); }

module.exports = { near, warm, status, enabled: !!KEY };
