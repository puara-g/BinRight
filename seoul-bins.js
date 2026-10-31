// 지자체별 폐형광등·폐건전지 수거함 파일데이터 — 전국 표준데이터엔 서울이 은평구뿐이라 구별 데이터로 보충
// 서버가 하루 한 번 각 데이터 페이지에서 최신 파일 링크를 찾아 받음 (활용신청·수동 갱신 필요 없음)
//  - datagokr: 공공데이터포털 파일데이터 페이지 (data.go.kr/data/{번호}/fileData.do)
//  - page: 구청 홈페이지 공공데이터 상세 페이지 (공공데이터포털에 파일이 없는 구)
//  - seoul: 서울 열린데이터광장 파일 (data.seoul.go.kr)
//  - data/bins/*.csv: 위에 없는 지역을 직접 넣을 때. 지역은 파일 이름("서울특별시 마포구_...csv")에서 읽음
// 컬럼은 이름 패턴으로 찾고, 좌표가 없으면 카카오 주소 검색으로 구해 cache/geocode.json 에 저장
"use strict";

const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "data", "bins");
const KAKAO = process.env.KAKAO_REST_API_KEY || "";
const GEO_FILE = path.join(__dirname, "cache", "geocode.json");
const SIDO = /(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전북특별자치도|전라북도|전라남도|경상북도|경상남도|제주특별자치도)/;
const UA = { "User-Agent": "Mozilla/5.0 (BinRight)" };

const SOURCES = [
  { gu: "마포구", page: "https://www.mapo.go.kr/site/main/openData/view?dataId=194" },
  { gu: "강서구", seoul: "OA-21842" },
  { gu: "광진구", datagokr: "15038095" },
  { gu: "영등포구", datagokr: "15038093" },
  { gu: "송파구", datagokr: "15038206" },
  { gu: "강남구", datagokr: "15038090" },
  { gu: "양천구", datagokr: "15038109" },
  { gu: "동작구", datagokr: "15038384" },
  { gu: "중랑구", datagokr: "15038000" },
  { gu: "관악구", datagokr: "15038224" },
  { gu: "성동구", datagokr: "15038110" }
];

let geo = {};
try { geo = JSON.parse(fs.readFileSync(GEO_FILE, "utf8")); } catch (e) { /* 처음엔 없음 */ }
function saveGeo() {
  try { fs.mkdirSync(path.dirname(GEO_FILE), { recursive: true }); fs.writeFileSync(GEO_FILE, JSON.stringify(geo)); } catch (e) { console.error("[bins-csv] 좌표 캐시 저장 실패", e.message); }
}

// 공공데이터 CSV는 대부분 CP949(EUC-KR), 가끔 UTF-8
function decode(buf) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""); }
  catch (e) { return new TextDecoder("euc-kr").decode(buf); }
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  const head = (rows.shift() || []).map((h) => h.trim());
  return rows.map((r) => head.reduce((o, h, i) => { o[h] = (r[i] || "").trim(); return o; }, {}));
}

// 컬럼 이름 패턴 → 값 (먼저 맞는 컬럼)
function pick(row, patterns, skip) {
  const keys = Object.keys(row);
  for (const p of patterns) {
    const k = keys.find((key) => p.test(key) && !(skip && skip.test(key)) && row[key]);
    if (k) return row[k];
  }
  return "";
}

function toRow(sido, gu, r) {
  let address = pick(r, [/도로명/, /소재지/, /^주소$/, /주소/, /지번/]);
  const dong = pick(r, [/행정동/, /동명/, /^동$/, /읍면동/]);
  let place = pick(r, [/설치장소/, /장소명/, /아파트명/, /건물명/, /시설명/, /설치\s*위치/, /^위치$/, /위치/, /명칭/], /주소|좌표|위도|경도/);
  // 주소 칸이 없고 위치 칸에 "목동 404-13 푸르지오아파트" / "양천로67가길 63 염창동주민센터" 처럼 주소+이름이 붙은 경우 나눔
  if (!address && place) {
    const m = /^(.*?(?:로|길|동|가|리)\s*\d+(?:-\d+)?)(?:\s*,?\s+(.+))?$/.exec(place);
    if (m) { address = m[1]; place = m[2] || ""; }
  }
  const detail = pick(r, [/세부/, /상세/, /비고/], /주소/);
  return {
    name: place || (pick(r, [/^구분$/]) ? pick(r, [/^구분$/]) + " 수거함" : "") || address || dong,
    detail: detail && detail !== place ? detail : "",
    sido, sgg: gu,
    address: address ? (address.includes(gu) ? address : sido + " " + gu + " " + address) : "",
    dong,
    lat: parseFloat(pick(r, [/위도/, /^lat/i, /y좌표/i])),
    lng: parseFloat(pick(r, [/경도/, /^lo?ng/i, /^lot$/i, /x좌표/i])),
    what: pick(r, [/수거품목/, /품목/, /종류/]) || "폐형광등·폐건전지",
    phone: pick(r, [/전화/]),
    org: pick(r, [/관리기관/]) || gu + "청"
  };
}

async function kakao(kind, query) {
  const url = "https://dapi.kakao.com/v2/local/search/" + kind + ".json?size=1&query=" + encodeURIComponent(query);
  const res = await fetch(url, { headers: { Authorization: "KakaoAK " + KAKAO }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("카카오 " + res.status);
  const d = ((await res.json()).documents || [])[0];
  return d ? { lat: parseFloat(d.y), lng: parseFloat(d.x) } : null;
}

// 주소 → 좌표 (주소 검색, 안 되면 장소 키워드 검색). 실패도 저장해서 다시 묻지 않음
async function geocode(q) {
  if (q in geo) return geo[q];
  let at = null;
  try { at = (await kakao("address", q)) || (await kakao("keyword", q)); } catch (e) { return null; }
  geo[q] = at;
  return at;
}

async function get(url, opt) {
  const res = await fetch(url, Object.assign({ headers: UA, signal: AbortSignal.timeout(30000) }, opt));
  if (!res.ok) throw new Error(res.status + " " + url);
  return res;
}

// 받은 파일이 CSV인지 확인 후 읽기 (파일 이름이 CP949라 깨져 보여도 확장자는 그대로 읽힘)
async function readCsv(res) {
  const name = res.headers.get("content-disposition") || "";
  const buf = Buffer.from(await res.arrayBuffer());
  if (/\.xlsx?"?\s*;?\s*$/i.test(name) || buf.slice(0, 2).toString() === "PK") throw new Error("CSV가 아니라 엑셀 파일");
  return parseCsv(decode(buf));
}

async function fromDataGoKr(id) {
  const html = await (await get("https://www.data.go.kr/data/" + id + "/fileData.do")).text();
  const m = html.match(/fileDownload\.do\?atchFileId=(FILE_\d+)&(?:amp;)?fileDetailSn=(\d+)/);
  if (!m) throw new Error("페이지에서 파일 링크를 못 찾음");
  return readCsv(await get("https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=" + m[1] + "&fileDetailSn=" + m[2] + "&insertDataPrcus=N"));
}

async function fromPage(pageUrl) {
  const html = await (await get(pageUrl)).text();
  const links = [...new Set((html.match(/href="[^"]*\/file\/download\/[^"]+"/g) || []).map((m) => m.slice(6, -1)))];
  for (const link of links) {
    const res = await get(new URL(link, pageUrl));
    if (!/\.csv"?\s*;?\s*$/i.test(res.headers.get("content-disposition") || "")) { await res.arrayBuffer(); continue; }
    return readCsv(res);
  }
  throw new Error("페이지에서 CSV 파일을 못 찾음");
}

async function fromSeoul(infId) {
  return readCsv(await get("https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false", {
    method: "POST", headers: Object.assign({ "Content-Type": "application/x-www-form-urlencoded" }, UA),
    body: new URLSearchParams({ infId, seq: "1", infSeq: "1" })
  }));
}

async function fillCoords(rows, label) {
  let geocoded = 0, missing = 0;
  for (const r of rows) {
    if (isFinite(r.lat) && r.lat > 30) continue;
    const at = KAKAO ? await geocode(r.address || r.sido + " " + r.sgg + " " + (r.dong ? r.dong + " " : "") + r.name) : null;
    if (at) { r.lat = at.lat; r.lng = at.lng; geocoded++; } else missing++;
  }
  console.log("[bins-local] " + label + " " + rows.length + "건 (좌표 변환 " + geocoded + ", 좌표 없음 " + missing + ")");
  return rows;
}

// SOURCES + data/bins/*.csv 를 모두 읽어 좌표까지 채운 줄 목록. 받아 온 구의 직접 넣은 CSV는 무시
async function loadSeoul() {
  const out = [], done = new Set();
  for (const s of SOURCES) {
    let raw;
    try { raw = s.datagokr ? await fromDataGoKr(s.datagokr) : s.page ? await fromPage(s.page) : await fromSeoul(s.seoul); }
    catch (e) { console.error("[bins-local] " + s.gu + " 건너뜀:", e.message); continue; }
    const rows = raw.map((r) => toRow("서울특별시", s.gu, r)).filter((r) => r.name);
    out.push(...(await fillCoords(rows, "서울특별시 " + s.gu)));
    done.add("서울특별시 " + s.gu);
  }
  let files = [];
  try { files = fs.readdirSync(DIR).filter((f) => /\.csv$/i.test(f)); } catch (e) { /* 폴더 없음 */ }
  for (const f of files) {
    const sido = (f.match(SIDO) || [])[1] || "서울특별시";
    const gu = (f.replace(SIDO, "").match(/([가-힣]{1,5}(구|시|군))(?=[_\s])/) || [])[1];
    if (!gu) { console.error("[bins-local] " + f + ": 파일 이름에서 시군구를 못 찾아 건너뜀"); continue; }
    if (done.has(sido + " " + gu)) continue;
    const rows = parseCsv(decode(fs.readFileSync(path.join(DIR, f)))).map((r) => toRow(sido, gu, r)).filter((r) => r.name);
    out.push(...(await fillCoords(rows, sido + " " + gu + " (직접 넣은 CSV)")));
  }
  saveGeo();
  return out;
}

module.exports = { loadSeoul, parseCsv, decode, DIR, SOURCES };
