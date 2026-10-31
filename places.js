// 혜택 탭 근처 수거·교환 장소: 공공데이터 수거함(bins.js) + 카카오 로컬 API(행정복지센터, 공공데이터가 없을 때 대형마트·약국)
"use strict";

const KEY = process.env.KAKAO_REST_API_KEY || "";
const API = "https://dapi.kakao.com/v2/local/search/";
const CACHE_MS = 24 * 60 * 60 * 1000;
const RADIUS = 3000; // m
const BIN_RADIUS = 2000; // 공공데이터 수거함 검색 반경
const cache = new Map(); // 지역 문자열 → { at, data }
const bins = require("./bins.js");

// 카카오맵엔 수거함·무인회수기가 장소로 거의 없어서(서교동 반경 20km 0건), 수거함이 흔히 있는 곳을 찾아 줌.
// 각 그룹은 키워드(queries)·분류(categories) 검색 결과를 합쳐 거리순. match 는 엉뚱한 곳을 거르는 이름/분류 조건
const GROUPS = [
  { id: "center", title: "행정복지센터", items: ["milk", "papercup", "battery", "fluorescent", "icepack"], queries: ["행정복지센터"], match: /행정복지센터|주민센터/, exclude: /무인민원|발급/, limit: 2,
    note: "우유팩→화장지, 폐건전지→새 건전지 교환, 형광등·아이스팩 수거를 하는 곳이 많아요. 운영 여부는 센터마다 달라서 가기 전에 전화로 확인해 보세요." },
  { id: "mart", title: "대형마트", items: ["battery", "fluorescent", "glass"], categories: ["MT1"], match: /./, limit: 3,
    note: "폐건전지·폐형광등 수거함을 두는 곳이 많고, 보증금 표시가 있는 빈병은 판매하는 매장에서 돌려받을 수 있어요." },
  { id: "pharmacy", title: "약국·보건소", items: ["medicine"], queries: ["보건소"], categories: ["PM9"], match: /약국|보건소|보건지소/, limit: 3,
    note: "폐의약품은 약국·보건소 수거함에 넣어요. 모든 약국이 받지는 않으니 확인해 보세요." }
];

async function kakao(kind, params) {
  const url = new URL(API + kind + ".json");
  Object.keys(params).forEach((k) => url.searchParams.set(k, params[k]));
  const res = await fetch(url, { headers: { Authorization: "KakaoAK " + KEY }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("카카오 " + kind + " " + res.status + " " + (await res.text()).slice(0, 200));
  return (await res.json()).documents || [];
}

// "서울특별시 마포구 서교동" → 좌표 (주소 검색이 안 되면 키워드 검색으로)
async function locate(area) {
  const byAddr = await kakao("address", { query: area, size: 1 });
  if (byAddr.length) return { x: byAddr[0].x, y: byAddr[0].y };
  const byKw = await kakao("keyword", { query: area, size: 1 });
  if (byKw.length) return { x: byKw[0].x, y: byKw[0].y };
  return null;
}

function toPlace(d) {
  return {
    name: d.place_name,
    address: d.road_address_name || d.address_name,
    phone: d.phone || "",
    distance: Number(d.distance) || 0,
    lat: parseFloat(d.y), lng: parseFloat(d.x),
    url: d.place_url || "https://map.kakao.com/link/search/" + encodeURIComponent(d.place_name)
  };
}

// 카카오 쪽(좌표 + 행정복지센터·대형마트·약국)은 동네별로 하루 캐시
async function kakaoPart(area) {
  const hit = cache.get(area);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const at = await locate(area);
  const groups = {};
  if (at) await Promise.all(GROUPS.map(async (g) => {
    const seen = new Set(), list = [];
    const near = { x: at.x, y: at.y, radius: RADIUS, sort: "distance", size: 15 };
    const results = await Promise.all([
      ...(g.queries || []).map((q) => kakao("keyword", Object.assign({ query: q }, near))),
      ...(g.categories || []).map((c) => kakao("category", Object.assign({ category_group_code: c }, near)))
    ]);
    results.flat().forEach((d) => {
      const text = d.place_name + " " + d.category_name;
      if (seen.has(d.id) || !g.match.test(text) || (g.exclude && g.exclude.test(text))) return;
      seen.add(d.id); list.push(toPlace(d));
    });
    list.sort((x, y) => x.distance - y.distance);
    groups[g.id] = { id: g.id, title: g.title, items: g.items, note: g.note || "", source: "카카오맵", places: list.slice(0, g.limit || 5) };
  }));
  const data = { center: at ? { lat: parseFloat(at.y), lng: parseFloat(at.x) } : null, groups };
  cache.set(area, { at: Date.now(), data });
  return data;
}

// 공공데이터 수거함이 있으면 그걸 먼저, 없으면 카카오의 대형마트·약국으로 대신 안내
const BIN_GROUPS = {
  battery: { id: "battery-bin", title: "폐건전지·폐형광등 수거함", items: ["battery", "fluorescent"], fallback: "mart" },
  medicine: { id: "medicine-bin", title: "폐의약품 수거함", items: ["medicine"], fallback: "pharmacy" }
};

// 행정복지센터마다 공공데이터 수거함이 그 센터에 등록돼 있는지 확인 (좌표 150m 안 + 이름에 센터가 들어간 수거함, 또는 40m 안)
const COLLECT_LABEL = { medicine: "폐의약품", battery: "폐건전지·폐형광등" };
async function withCollects(group, region) {
  if (!bins.enabled) return group;
  const places = await Promise.all(group.places.map(async (pl) => {
    if (!isFinite(pl.lat)) return pl;
    const collects = [];
    for (const id of Object.keys(COLLECT_LABEL)) {
      const found = await bins.near(id, { lat: pl.lat, lng: pl.lng }, { sgg: region.sgg || "", dong: "" }, 150, 20).catch(() => []);
      if (found.some((b) => b.distance !== null && (b.distance <= 40 || /주민센터|행정복지센터|복지센터|동사무소/.test(b.name)))) collects.push(COLLECT_LABEL[id]);
    }
    return Object.assign({}, pl, { collects });
  }));
  return Object.assign({}, group, { places });
}

async function nearby(area, region) {
  area = String(area || "").trim();
  const k = KEY ? await kakaoPart(area) : { center: null, groups: {} };
  const out = [];
  for (const id of Object.keys(BIN_GROUPS)) {
    const g = BIN_GROUPS[id];
    const found = bins.enabled ? await bins.near(id, k.center, region, BIN_RADIUS, 5).catch(() => []) : [];
    if (found.length) out.push({ id: g.id, title: g.title, items: g.items, source: "", places: found, note: "" });
    else if (k.groups[g.fallback]) out.push(k.groups[g.fallback]);
  }
  if (k.groups.center) out.push(await withCollects(k.groups.center, region));
  return { area, radius: RADIUS, groups: out };
}

module.exports = { nearby, enabled: !!KEY || bins.enabled };
