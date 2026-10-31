(function () {
  "use strict";

  var D = window.BinRightData;
  var DAYS = D.DAYS, GROUPS = D.GROUPS, ORDER = D.ORDER, REGIONS = D.REGIONS, CATS = D.CATS, ITEMS = D.ITEMS, BENEFITS = D.BENEFITS;
  var localBenefits = D.localBenefits, daysText = D.daysText, regionLabel = D.regionLabel;
  function benefitsFor(itemId, r) {
    return localBenefits(r).concat(BENEFITS).filter(function (b) { return b.items.indexOf(itemId) > -1; });
  }

  /* ───────── 상태 ───────── */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var state = {
    tab: "today",
    regionId: store.get("bb.region", null),
    pub: store.get("bb.pubRegion", null),
    query: "",
    detail: null,
    cat: "paper",
    weekSel: 0,
    chat: [],
    asking: false,
    draft: "",
    recent: store.get("bb.recent", [])
  };
  // 첫 화면이 비어 있지 않도록: 저장된 지역이 없으면 설정 화면을 띄우되 뒤에는 예시 지역으로 채워 둠
  var firstVisit = !state.regionId || !findRegion(state.regionId);
  if (firstVisit) state.regionId = REGIONS[0].id;

  // 예전에 저장된 공공데이터 지역의 "18:00~2400" 같은 시간 표기를 "18:00~24:00" 으로
  if (state.pub && state.pub.rules) Object.keys(state.pub.rules).forEach(function (k) {
    var ru = state.pub.rules[k];
    ru.time = String(ru.time).replace(/(^|~)(\d{1,2})(\d{2})(?=~|$)/g, function (_, p, h, m) { return p + (h.length < 2 ? "0" + h : h) + ":" + m; });
  });
  function findRegion(id) { if (state.pub && state.pub.id === id) return state.pub; for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i]; return null; }
  function region() { return findRegion(state.regionId) || REGIONS[0]; }

  /* ───────── 유틸 ───────── */
  var $ = function (s, el) { return (el || document).querySelector(s); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function groupFor(cat, r) {
    var g = CATS[cat].group;
    if ((g === "pet" || g === "vinyl") && !r.rules[g]) return "recycle";
    return g;
  }
  function nextDay(days, from) {
    for (var i = 0; i < 7; i++) { var d = (from + i) % 7; if (days.indexOf(d) > -1) return i; }
    return -1;
  }
  function relDay(offset, dayIdx) {
    if (offset === 0) return "오늘";
    if (offset === 1) return "내일";
    return DAYS[dayIdx] + "요일";
  }

  // 한글 초성
  var CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  function chosung(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i) - 0xAC00;
      out += (c >= 0 && c <= 11171) ? CHO[Math.floor(c / 588)] : s[i];
    }
    return out;
  }
  function isChoOnly(s) { return /^[ㄱ-ㅎ]+$/.test(s); }
  function norm(s) { return s.toLowerCase().replace(/\s+/g, ""); }
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 9;
    var m = [], i, j;
    for (i = 0; i <= a.length; i++) m[i] = [i];
    for (j = 0; j <= b.length; j++) m[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i-1][j] + 1, m[i][j-1] + 1, m[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    return m[a.length][b.length];
  }
  function search(q) {
    q = norm(q);
    if (!q) return [];
    var cho = isChoOnly(q), scored = [];
    ITEMS.forEach(function (it) {
      var names = [it.name].concat(it.aliases).map(norm), best = 0;
      names.forEach(function (n, idx) {
        var w = idx === 0 ? 1 : 0.9, s = 0;
        if (cho) { if (chosung(n).indexOf(q) > -1) s = 60; }
        else if (n === q) s = 100;
        else if (n.indexOf(q) === 0) s = 85;
        else if (n.indexOf(q) > -1) s = 70;
        else if (q.length >= 2 && lev(n, q) <= 1) s = 55;
        else if (q.length >= 3 && q.indexOf(n) > -1) s = 50;
        best = Math.max(best, s * w);
      });
      if (best > 0) scored.push({ it: it, s: best });
    });
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.map(function (x) { return x.it; });
  }
  function matchedAlias(it, q) {
    q = norm(q);
    if (!q || norm(it.name).indexOf(q) > -1) return "";
    for (var i = 0; i < it.aliases.length; i++) if (norm(it.aliases[i]).indexOf(q) > -1 || chosung(norm(it.aliases[i])).indexOf(q) > -1) return it.aliases[i];
    return "";
  }
  function toast(msg) {
    var t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 1800);
  }
  function chipFor(cat) {
    var g = CATS[cat].group;
    var cls = g === "bulky" ? "c-bulky" : g === "special" ? "c-special" : (GROUPS[g] ? GROUPS[g].chip : "c-general");
    return '<span class="chip ' + cls + '">' + esc(CATS[cat].label) + "</span>";
  }

  /* ───────── 화면: 오늘 ───────── */
  function renderToday() {
    var r = region(), now = new Date(), d = now.getDay();
    var keys = ORDER.filter(function (k) { return r.rules[k]; });
    var todayKeys = keys.filter(function (k) { return r.rules[k].days.indexOf(d) > -1; });
    var tomorrowKeys = keys.filter(function (k) { return r.rules[k].days.indexOf((d + 1) % 7) > -1; });
    var dateStr = (now.getMonth() + 1) + "월 " + now.getDate() + "일 " + DAYS[d] + "요일";
    var time = todayKeys.length ? r.rules[todayKeys[0]].time : "";

    var html = '<div class="view">';
    html += '<div class="home-top">';
    html += '<button class="home-search" type="button" id="homeSearch" aria-label="품목 검색 열기"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>버릴 물건을 검색해 보세요</button>';
    html += '<button class="ai-btn" type="button" data-goto="ask" aria-label="AI에게 물어보기"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>AI</button></div>';
    html += '<p class="date">' + dateStr + " · " + esc(regionLabel(r, true)) + " 기준</p>";
    html += '<section class="hero" aria-labelledby="heroTitle">';
    if (r.noRules) {
      html += '<span class="hero-label" id="heroTitle">배출 요일 정보를 아직 못 받았어요</span>';
      html += '<div class="hero-main none">' + esc(r.siteLabel) + "에 확인해 주세요</div>";
      html += '<div class="hero-time">배출 정보가 들어오면 자동으로 채워져요</div>';
    } else if (todayKeys.length) {
      html += '<span class="hero-label" id="heroTitle">오늘 내놓을 수 있어요</span>';
      html += '<div class="hero-main">' + todayKeys.map(function (k) { return GROUPS[k].label; }).join(" · ") + "</div>";
      html += '<div class="hero-time">' + esc(time) + " 사이에 내놓으세요</div>";
    } else {
      html += '<span class="hero-label" id="heroTitle">오늘은 배출하는 날이 아니에요</span>';
      html += '<div class="hero-main none">' + (tomorrowKeys.length ? "내일 " + tomorrowKeys.map(function (k) { return GROUPS[k].label; }).join(" · ") + " 배출" : "다음 배출일까지 집에 보관해 주세요") + "</div>";
      html += '<div class="hero-time">미수거일: ' + esc(r.offDays) + "</div>";
    }
    html += "</section>";

    html += '<section class="section"><h2>분류별 다음 배출일</h2><div class="cards">';
    keys.forEach(function (k) {
      var rule = r.rules[k], off = nextDay(rule.days, d);
      var when = off < 0 ? "-" : relDay(off, (d + off) % 7);
      html += '<div class="gcard"><span class="chip ' + GROUPS[k].chip + '">' + GROUPS[k].label + "</span>" +
        "<b>" + when + (off === 0 ? " 배출" : "") + " <span style=\"font-weight:400;color:var(--text-sub);font-size:14px\">(" + daysText(rule.days) + ")</span></b>" +
        "<p>" + esc(rule.time) + " · " + esc(rule.bag) + "</p></div>";
    });
    html += "</div></section>";

    html += '<section class="section"><h2>이번 주 배출 달력</h2><div class="week">';
    for (var i = 0; i < 7; i++) {
      var dd = new Date(now); dd.setDate(now.getDate() + i);
      var di = dd.getDay(), ks = keys.filter(function (k) { return r.rules[k].days.indexOf(di) > -1; });
      html += '<button type="button" data-wday="' + i + '" aria-pressed="' + (i === state.weekSel) + '" aria-label="' + (dd.getMonth() + 1) + "월 " + dd.getDate() + "일 세부정보" + '" class="day' + (i === 0 ? " today" : "") + (i === state.weekSel ? " sel" : "") + (di === 0 ? " sun" : "") + '"><div class="d">' + (i === 0 ? "오늘" : DAYS[di]) + "<strong>" + dd.getDate() + "</strong></div>";
      html += ks.length ? '<div class="dots">' + ks.map(function (k) { return '<span class="bar ' + GROUPS[k].bar + '" title="' + GROUPS[k].label + '"></span>'; }).join("") + "</div>" : '<span class="noday">수거 없음</span>';
      html += "</button>";
    }
    html += '</div><div class="legend">' + keys.map(function (k) { return '<span><i class="' + GROUPS[k].bar + '"></i>' + GROUPS[k].label + "</span>"; }).join("") + "</div>";
    var sd = new Date(now); sd.setDate(now.getDate() + state.weekSel);
    var sdi = sd.getDay(), sks = keys.filter(function (k) { return r.rules[k].days.indexOf(sdi) > -1; });
    html += '<div class="dayinfo" aria-live="polite"><h3>' + (sd.getMonth() + 1) + "월 " + sd.getDate() + "일 " + DAYS[sdi] + "요일" + (state.weekSel === 0 ? " (오늘)" : state.weekSel === 1 ? " (내일)" : "") + "</h3>";
    if (sks.length) {
      sks.forEach(function (k) {
        var ru = r.rules[k];
        html += '<div class="dayrow"><span class="chip ' + GROUPS[k].chip + '">' + GROUPS[k].label + "</span><p>" + esc(ru.time) + " · " + esc(ru.place) + "<small>" + esc(ru.bag) + "</small></p></div>";
      });
    } else {
      html += '<p class="none">수거하지 않는 날이에요. 쓰레기는 다음 배출일까지 집에 보관해 주세요.<br><small>미수거일: ' + esc(r.offDays) + "</small></p>";
    }
    html += "</div></section>";

    html += '<button class="promo" type="button" data-goto="benefit"><div><b>버리고 돌려받기</b><span>' + esc(regionLabel(r, true)) + " 교환 " + localBenefits(r).length + "개 · 전국 포인트·환급 " + BENEFITS.length + '개</span></div><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    html += '<section class="section"><h2>이건 어떻게 버려요?</h2><div class="quick">';
    ["아이스팩", "택배 상자", "투명 페트병", "닭뼈", "깨진 유리", "건전지", "우유팩", "컵라면 용기"].forEach(function (n) {
      html += '<button class="qbtn" type="button" data-item-name="' + esc(n) + '">' + esc(n) + "</button>";
    });
    html += "</div></section>";

    html += sourceNote(r);
    html += "</div>";
    return html;
  }

  /* ───────── 화면: 검색 ───────── */
  function renderSearch() {
    var html = '<div class="view">';
    html += '<div class="search-head"><button class="back" type="button" id="searchBack" aria-label="홈으로"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 5-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    html += '<div class="search-box"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      '<input id="q" type="search" placeholder="버릴 물건 이름 (예: 아이스팩, ㅇㅇㅍ)" autocomplete="off" aria-label="품목 검색" value="' + esc(state.query) + '">' +
      '<button class="clear" id="qClear" type="button" aria-label="검색어 지우기"' + (state.query ? "" : " hidden") + '>×</button></div></div>';
    html += '<div id="searchBody">' + searchBody() + "</div></div>";
    return html;
  }
  function searchBody() {
    var q = state.query.trim(), html = "";
    if (!q) {
      if (state.recent.length) {
        html += '<section class="section"><h2>최근 검색</h2><div class="recent">' +
          state.recent.map(function (n) { return '<button class="rbtn" type="button" data-query="' + esc(n) + '">' + esc(n) + "</button>"; }).join("") +
          '<button class="linkbtn" type="button" id="clearRecent">지우기</button></div></section>';
      }
      html += '<section class="section" style="margin-top:16px"><h2>자주 찾는 품목</h2><div class="quick">';
      ["아이스팩", "영수증", "배달 플라스틱 용기", "스티로폼 상자", "달걀 껍데기", "커피 찌꺼기", "형광등", "가구"].forEach(function (n) {
        html += '<button class="qbtn" type="button" data-item-name="' + esc(n) + '">' + esc(n) + "</button>";
      });
      html += '</div></section><section class="section" style="margin-top:16px"><h2>분류로 찾기</h2><div class="cats">';
      Object.keys(CATS).forEach(function (c) {
        var n = ITEMS.filter(function (it) { return it.cat === c; }).length;
        if (n) html += '<button class="cat" type="button" data-cat="' + c + '">' + esc(CATS[c].label) + " <small>" + n + "</small></button>";
      });
      html += "</div></section>";
      return html;
    }
    var catMatch = /^cat:(\w+)$/.exec(q);
    var list = catMatch ? ITEMS.filter(function (it) { return it.cat === catMatch[1]; }) : search(q);
    if (!list.length) {
      var r = region();
      return '<div class="empty"><b>"' + esc(q) + '"에 맞는 품목이 아직 없어요</b>' +
        "<span>재질을 기준으로 다시 찾아보세요. 예: 플라스틱, 비닐, 종이, 유리병</span>" +
        '<div class="quick"><button class="qbtn" type="button" data-cat="plastic">플라스틱</button><button class="qbtn" type="button" data-cat="vinyl">비닐</button><button class="qbtn" type="button" data-cat="general">일반쓰레기</button></div>' +
        '<button class="btn primary" type="button" data-ask="' + esc(q) + ' 어떻게 버려요?">AI에게 물어보기</button>' +
        '<span class="note">그래도 모르겠다면 ' + esc(r.dept) + "에 물어보세요. 전화 " + esc(r.phone) + "</span></div>";
    }
    html += '<div class="results" role="list">';
    list.forEach(function (it) {
      var al = catMatch ? "" : matchedAlias(it, q);
      html += '<button class="res" role="listitem" type="button" data-item="' + it.id + '"><span class="n">' + esc(it.name) +
        (al ? '<span class="a">' + esc(al) + "(으)로 검색됨</span>" : "") + "</span>" + chipFor(it.cat) + "</button>";
    });
    html += "</div>";
    return html;
  }

  /* ───────── 화면: 품목 상세 ───────── */
  function renderDetail(it) {
    var r = region(), g = groupFor(it.cat, r), d = new Date().getDay();
    var html = '<div class="view detail">';
    html += '<button class="back" type="button" id="back"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 5-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>뒤로</button>';
    html += '<div class="d-head">' + chipFor(it.cat) + "<h1>" + esc(it.name) + "</h1>" +
      (it.aliases.length ? '<span class="d-alias">' + esc(it.aliases.join(", ")) + "</span>" : "") + "</div>";

    if (GROUPS[g] && r.rules[g]) {
      var rule = r.rules[g], off = nextDay(rule.days, d);
      html += '<section class="when" aria-label="우리 동네 배출 일정"><span class="t">' + esc(regionLabel(r, true)) + "에서는</span>" +
        '<span class="v">' + GROUPS[g].label + " · " + daysText(rule.days) + " " + esc(rule.time) + "</span>" +
        '<span class="s">' + (off === 0 ? "오늘 내놓을 수 있어요" : off > 0 ? "다음 배출: " + relDay(off, (d + off) % 7) : "") + " · " + esc(rule.place) + "</span></section>";
    } else if (g === "bulky") {
      html += '<section class="when special"><span class="t">' + esc(regionLabel(r, true)) + '에서는</span><span class="v">신고 후 배출</span>' +
        '<span class="s">' + esc(r.siteLabel) + " 홈페이지 또는 주민센터에서 신고 · 문의 " + esc(r.phone) + '</span><div style="margin-top:8px">' + siteLink(r) + "</div></section>";
    } else {
      html += '<section class="when special"><span class="t">요일 상관없이</span><span class="v">전용 수거함에 넣어요</span>' +
        '<span class="s">가까운 주민센터, 아파트, 대형마트 수거함</span></section>';
    }

    html += '<section class="section"><h2>버리는 방법</h2><ol class="steps">' + it.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol></section>";
    if (it.myth) html += '<section class="myth"><b>흔히 헷갈려요</b><p>' + esc(it.myth) + "</p></section>";
    var bs = benefitsFor(it.id, r);
    if (bs.length) {
      html += '<section class="section"><h2>이걸로 받을 수 있는 혜택</h2><div class="mini-benefits">' +
        bs.map(function (b) { return '<button class="mb" type="button" data-goto="benefit"><div><b>' + esc(b.title) + '</b><div style="font-size:14px;color:var(--text-sub)">' + esc(b.get) + "</div></div><span>" + (b.local ? "우리 동네" : "전국") + "</span></button>"; }).join("") +
        "</div></section>";
    }
    html += '<button class="btn" type="button" data-askdraft="' + esc(it.name) + ' 버릴 때 궁금한 게 있어요. ">AI에게 더 물어보기</button>';
    html += '<p class="src">품목 기준: 환경부 재활용품 분리배출 가이드라인' + (r.source === "public" ? "" : " · 배출 요일: 예시 데이터") + "</p>";
    html += "</div>";
    return html;
  }

  /* ───────── 화면: 우리동네 ───────── */
  function renderLocal() {
    var r = region(), d = new Date().getDay();
    var keys = ORDER.filter(function (k) { return r.rules[k]; });
    var cols = [1, 2, 3, 4, 5, 6, 0];
    var html = '<div class="view">';
    html += '<div class="local-head"><div><h1>' + esc(regionLabel(r)) + '</h1><span class="lv">' +
      (r.source === "public" ? (r.zone && r.zone !== r.gu ? "관리구역 " + esc(r.zone) : "") : r.level === "동" ? "동 단위 규칙" : "구 단위 규칙 · 동마다 다를 수 있어요") + "</span></div>" +
      '<button class="btn" type="button" id="changeRegion">지역 변경</button></div>';

    if (r.noRules) html += '<section class="section"><h2>요일표</h2><p class="note">배출 요일을 아직 받아 오지 못했어요. 받아 오면 자동으로 채워져요. 그 전에는 아래 담당 부서에 확인해 주세요.</p></section>';
    else html += '<section class="section"><h2>요일표</h2><div class="table-wrap"><table><thead><tr><th scope="col">분류</th>' +
      cols.map(function (c) { return '<th scope="col"' + (c === d ? ' class="today-col"' : "") + ">" + DAYS[c] + "</th>"; }).join("") + "</tr></thead><tbody>";
    keys.forEach(function (k) {
      html += '<tr><th scope="row" style="font-weight:600;color:var(--text);font-size:14px">' + GROUPS[k].label + "</th>" +
        cols.map(function (c) {
          var on = r.rules[k].days.indexOf(c) > -1;
          return "<td" + (c === d ? ' class="today-col"' : "") + ">" + (on ? '<span class="mark ' + GROUPS[k].mark + '" role="img" aria-label="배출"></span>' : '<span aria-label="없음" style="color:var(--border)">·</span>') + "</td>";
        }).join("") + "</tr>";
    });
    if (!r.noRules) html += "</tbody></table></div></section>";

    html += '<section class="section"><h2>배출 장소와 봉투</h2><dl class="infolist" style="margin:0">';
    keys.forEach(function (k) {
      var rule = r.rules[k];
      html += '<div class="info"><dt>' + GROUPS[k].label + "</dt><dd>" + esc(rule.place) + "<small>" + esc(rule.time) + " · " + esc(rule.bag) + "</small></dd></div>";
    });
    html += '<div class="info"><dt>대형폐기물</dt><dd>' + esc(r.siteLabel) + ' 홈페이지·주민센터에서 신고 후 스티커 부착<small>대형 가전은 무상방문수거 1599-0903</small></dd></div>';
    html += '<div class="info"><dt>미수거일</dt><dd>' + esc(r.offDays) + "</dd></div>";
    html += "</dl></section>";

    html += '<section class="section"><h2>헷갈리면 물어보세요</h2><dl class="infolist" style="margin:0"><div class="info"><dt>담당 부서</dt><dd>' + esc(r.dept) + "</dd></div>" +
      '<div class="info"><dt>' + (r.source === "public" ? "구청 안내" : "홈페이지") + "</dt><dd>" + siteLink(r) + (r.source === "public" ? "" : "<small>공지사항에서 배출 요일 변경, 대형폐기물 신고를 확인할 수 있어요</small>") + "</dd></div>" +
      '<div class="info"><dt>전화</dt><dd><div class="call"><span class="num">' + esc(r.phone) + '</span><button class="mini" type="button" id="copyPhone">번호 복사</button></div><small>' + esc(r.phoneNote) + "</small></dd></div></dl></section>";

    html += sourceNote(r) + "</div>";
    return html;
  }

  /* ───────── AI에게 물어보기 ───────── */
  // 서버(/api/ask)가 Claude API를 대신 호출하고, 답을 NDJSON 줄 단위로 흘려보냄
  var askCtl = null;

  function askServer(messages, opts) {
    var text = "";
    function fail(code) { var e = new Error(code); e.code = code; e.text = text; throw e; }
    return fetch("/api/ask", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: opts.signal,
      body: JSON.stringify({ regionId: state.regionId, sgg: region().sgg, area: region().noRules ? { sido: region().sido, gu: region().gu, dong: region().dong } : undefined, messages: messages })
    }).then(function (res) {
      if (!res.ok || !res.body) {
        return res.json().then(function (j) { fail(j.error || "network"); }, function () { fail("network"); });
      }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "", result = null;
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) { if (!result) fail("network"); return result; }
          buf += dec.decode(r.value, { stream: true });
          var lines = buf.split("\n"); buf = lines.pop();
          for (var i = 0; i < lines.length; i++) {
            if (!lines[i]) continue;
            var ev = JSON.parse(lines[i]);
            if (ev.t) { text += ev.t; opts.onText({ text: text }); }
            else if (ev.error) fail(ev.error);
            else if (ev.done) result = { text: text, truncated: !!ev.truncated };
          }
          return pump();
        });
      }
      return pump();
    }).catch(function (e) {
      if (e && e.name === "AbortError") { var c = new Error("cancelled"); c.code = "cancelled"; c.text = text; throw c; }
      if (e && !e.code) { e.code = "network"; e.text = text; }
      throw e;
    });
  }

  function renderAsk() {
    var r = region();
    var html = '<div class="view">';
    html += '<div class="ask-head"><button class="back" type="button" data-goto="today" aria-label="홈으로"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 5-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      "<div><h1>AI에게 물어보기</h1><p>" + esc(regionLabel(r, true)) + " 규칙을 기준으로 답해요</p></div></div>";
    if (!state.chat.length) {
      html += '<div class="ask-intro"><p>검색으로 안 나오는 물건이나 애매한 상황을 편하게 물어보세요.</p><div class="quick">';
      ["치킨 먹고 남은 뼈랑 상자는 어떻게 버려요?", "이사 왔는데 음식물 쓰레기는 언제 내놔요?", "깨진 접시는 어디에 버려요?", "페트병 라벨이 잘 안 떨어지면요?"].forEach(function (s) {
        html += '<button class="qbtn" type="button" data-ask="' + esc(s) + '">' + esc(s) + "</button>";
      });
      html += "</div></div>";
    }
    html += '<div class="msgs" id="msgs">';
    state.chat.forEach(function (m, i) {
      html += '<div class="msg ' + m.role + (m.pending && !m.content ? " pending" : "") + (m.err ? " err" : "") + '" data-i="' + i + '">' +
        esc(m.content || (m.pending ? "생각하는 중…" : "")) + "</div>";
    });
    html += "</div>";
      html += '<form class="composer" id="askForm"><textarea id="askInput" rows="1" placeholder="궁금한 걸 물어보세요" aria-label="질문 입력">' + esc(state.draft) + "</textarea>" +
        (state.asking ? '<button type="button" class="btn" id="askStop">멈추기</button>' : '<button type="submit" class="btn primary">보내기</button>') + "</form>";
    html += '<div class="ask-foot"><span class="src">AI 답변은 틀릴 수 있어요. ' + (region().source === "public" ? "" : "지역 규칙은 시연용 예시예요.") + "</span>" +
      (state.chat.length && !state.asking ? '<button class="linkbtn" type="button" id="askReset">대화 지우기</button>' : "") + "</div>";
    html += "</div>";
    return html;
  }

  function askErrorText(code) {
    if (code === "not_configured") return "서버에 AI 키(GEMINI_API_KEY)가 설정되지 않아서 답할 수 없어요.";
    if (code === "rate_limited") return "질문이 너무 많거나 오늘 무료 한도를 다 썼어요. 잠시 후에 다시 물어봐 주세요.";
    if (code === "too_long") return "질문이 너무 길어요. 조금 줄여서 다시 물어봐 주세요.";
    if (code === "refused") return "이 질문에는 답할 수 없어요. 분리배출과 관련된 질문으로 바꿔 주세요.";
    return "답을 받다가 연결이 끊겼어요. 다시 보내 주세요.";
  }
  function scrollChatEnd() {
    var c = $(".composer") || $("#msgs"); if (c) window.scrollTo(0, document.body.scrollHeight);
  }
  function sendAsk(text) {
    text = (text || "").trim();
    if (!text || state.asking) return;
    if (state.tab !== "ask" || state.detail) { state.tab = "ask"; state.detail = null; try { history.replaceState(null, "", "#ask"); } catch (e) {} }
    state.draft = "";
    state.chat.push({ role: "user", content: text });
    var msg = { role: "assistant", content: "", pending: true };
    state.chat.push(msg);
    state.asking = true; render(); scrollChatEnd();
    var idx = state.chat.length - 1;
    var history = state.chat.slice(0, -1).filter(function (m) { return !m.err && m.content; }).slice(-10)
      .map(function (m) { return { role: m.role, content: m.content }; });
    while (history.length && history[0].role !== "user") history.shift();
    askCtl = new AbortController();
    askServer(history, {
      signal: askCtl.signal,
      onText: function (u) {
        msg.content = u.text;
        var el = document.querySelector('.msg[data-i="' + idx + '"]');
        if (el) { el.textContent = u.text; el.classList.remove("pending"); }
      }
    }).then(function (res) {
      msg.content = res.text + (res.truncated ? "\n\n(답이 길어서 중간에 끊겼어요)" : "");
    }, function (e) {
      var code = e && e.code;
      if (code === "cancelled") { msg.content = (e.text || "") + (e.text ? "\n\n(멈춤)" : "멈췄어요."); if (!e.text) msg.err = true; }
      else if (e && e.text && code !== "refused") msg.content = e.text + "\n\n(" + askErrorText(code) + ")";
      else { msg.content = askErrorText(code); msg.err = true; }
    }).then(function () {
      msg.pending = false; state.asking = false; askCtl = null;
      if (state.tab === "ask" && !state.detail) { render(); scrollChatEnd(); }
    });
  }

  /* ───────── 화면: 카테고리 ───────── */
  var CAT_ORDER = ["paper", "pack", "plastic", "pet", "vinyl", "styro", "can", "glass", "food", "general", "nonflam", "special", "bulky"];
  var S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var ICONS = {
    paper:   '<path d="M4 8.5 12 5l8 3.5v8L12 20l-8-3.5v-8Z" ' + S + '/><path d="M4 8.5 12 12l8-3.5M12 12v8" ' + S + '/>',
    pack:    '<path d="M7 9 9 4h6l2 5v11H7V9Z" ' + S + '/><path d="M7 9h10M10 13h4" ' + S + '/>',
    plastic: '<path d="M9 3h6v3l2 3v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9l2-3V3Z" ' + S + '/><path d="M7 13h10" ' + S + '/>',
    pet:     '<path d="M10 3h4v2.5c2 1 3 2.5 3 4.5v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V10c0-2 1-3.5 3-4.5V3Z" ' + S + '/><path d="M7 12h10v4H7" ' + S + '/>',
    vinyl:   '<path d="M6 8h12l-1 12H7L6 8Z" ' + S + '/><path d="M9 8a3 3 0 0 1 6 0" ' + S + '/>',
    styro:   '<rect x="4" y="6" width="16" height="12" rx="1.5" ' + S + '/><path d="M8 10h.01M12 10h.01M16 10h.01M10 14h.01M14 14h.01" ' + S + ' stroke-width="2.4"/>',
    can:     '<ellipse cx="12" cy="5.5" rx="5" ry="2" ' + S + '/><path d="M7 5.5v13c0 1.1 2.2 2 5 2s5-.9 5-2v-13" ' + S + '/><path d="M7 10h10" ' + S + '/>',
    glass:   '<path d="M10.5 3h3v4c1.5.8 2.5 2.2 2.5 4v9H8v-9c0-1.8 1-3.2 2.5-4V3Z" ' + S + '/>',
    food:    '<path d="M12 8c-3.5-2-7-.5-7 4 0 4 3 8 5 8 1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-4 5-8 0-4.5-3.5-6-7-4Z" ' + S + '/><path d="M12 8c0-2 1-3.5 3-4" ' + S + '/>',
    general: '<path d="M5 7h14l-1.2 12.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 7Z" ' + S + '/><path d="M3.5 7h17M9.5 7V4.5h5V7" ' + S + '/>',
    nonflam: '<path d="M5 6h14l-2 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L5 6Z" ' + S + '/><path d="m11 6 1.5 4-2 2.5 2 3" ' + S + '/>',
    special: '<rect x="7" y="5" width="10" height="16" rx="1.5" ' + S + '/><path d="M10 3h4M10 13h4M12 11v4" ' + S + '/>',
    bulky:   '<path d="M7 11V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v6" ' + S + '/><path d="M5 11h14v4H5zM7 15v5M17 15v5" ' + S + '/>'
  };
  function iconClass(cat) {
    var g = CATS[cat].group;
    if (g === "food") return "ic-food";
    if (g === "general") return "ic-general";
    if (g === "special" || g === "bulky") return "ic-blue";
    return "ic-recycle";
  }
  function renderCategory() {
    var r = region(), cat = state.cat, g = groupFor(cat, r);
    var list = ITEMS.filter(function (it) { return it.cat === cat; });
    var html = '<div class="catwrap"><nav class="side" role="tablist" aria-label="분류">';
    CAT_ORDER.forEach(function (c) {
      html += '<button type="button" role="tab" data-side="' + c + '" aria-selected="' + (c === cat) + '">' + esc(CATS[c].label) + "</button>";
    });
    html += '</nav><div class="catmain"><div class="cathead"><h1>' + esc(CATS[cat].label) + "</h1>";
    if (GROUPS[g] && r.rules[g]) html += "<p>" + esc(regionLabel(r, true)) + " <b>" + GROUPS[g].label + " · " + daysText(r.rules[g].days) + "</b> " + esc(r.rules[g].time) + "</p>";
    else if (g === "bulky") html += "<p>요일 없이 <b>신고 후 배출</b></p>";
    else html += "<p>요일 없이 <b>전용 수거함</b>에 넣어요</p>";
    html += '</div><div class="igrid">';
    list.forEach(function (it) {
      html += '<button class="icell" type="button" data-item="' + it.id + '"><span class="icircle ' + iconClass(cat) + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[cat] + "</svg></span>" + esc(it.name) + "</button>";
    });
    html += "</div></div></div>";
    return html;
  }

  function sourceNote(r) {
    if (r.noRules) return '<p class="sample">배출 요일·장소는 아직 받아 오지 못했어요. ' + esc(r.dept) + "에 확인해 주세요.</p>";
    if (r.source === "public") return '<p class="src">갱신일 ' + esc(r.updated) + "<br>실제 공지와 다르면 " + esc(r.dept) + " 안내가 우선이에요.</p>";
    return '<p class="sample">시연용 예시 데이터예요. 실제 배출 요일은 ' + esc(r.dept) + " 공지를 확인해 주세요.</p>" +
      '<p class="src">데이터 기준일 ' + r.updated + "</p>";
  }
  function siteLink(r) {
    if (r.siteKind === "search" || r.source === "public") return '<a class="blink" href="' + esc(r.site) + '" target="_blank" rel="noopener">' + esc(r.gu + "청") + ' 대형폐기물 신고 방법 찾기 ↗</a><small style="margin-top:4px">네이버 검색 결과로 열려요</small>';
    return '<a class="blink" href="' + r.site + '" target="_blank" rel="noopener">' + esc(r.siteLabel) + ' 홈페이지 ↗</a><small style="margin-top:4px">' + esc(r.site.replace(/^https?:\/\//, "")) + "</small>";
  }

  /* ───────── 화면: 혜택 ───────── */
  function benefitCard(b) {
    return '<article class="bcard"><div class="bcard-top"><h3>' + esc(b.title) + "</h3>" +
      (b.local ? '<span class="tag tag-ex">' + (b.real ? "구청 발표" : b.check ? "확인 필요" : "예시") + "</span>" : '<span class="tag tag-nat">전국</span>') + "</div>" +
      '<dl class="bdl"><dt>가져갈 것</dt><dd>' + esc(b.give) + '</dd><dt>받는 것</dt><dd class="bget">' + esc(b.get) + "</dd><dt>어디서</dt><dd>" + esc(b.where) + "</dd></dl>" +
      (b.link ? '<a class="blink" href="' + b.link + '" target="_blank" rel="noopener">' + esc(b.linkLabel) + " ↗</a>" : "") + "</article>";
  }
  /* 카카오 장소검색: 동네 주변 수거함·회수기·행정복지센터 */
  function placeArea(r) { return r.sido + " " + r.gu + (r.dong ? " " + r.dong.split(/[/(]/)[0].trim() : ""); }
  /* 웹 검색으로 찾은 동네 교환 사업 (서버가 다음 검색 + Gemini로 정리) */
  function loadExchange(r) {
    var dong = r.dong ? r.dong.split(/[/(]/)[0].trim() : "";
    var key = r.sido + " " + r.gu + " " + dong;
    if (state.exchange && state.exchange.key === key) return state.exchange;
    state.exchange = { key: key, status: "loading" };
    fetch("/api/exchange?" + new URLSearchParams({ sido: r.sido, sgg: r.gu, dong: dong })).then(function (res) { return res.json(); }).then(function (j) {
      if (!j.items) throw new Error(j.error);
      if (state.exchange.key === key) state.exchange = { key: key, status: "ok", data: j };
    }).catch(function () {
      if (state.exchange.key === key) state.exchange = { key: key, status: "error" };
    }).then(function () { if (state.tab === "benefit" && !state.detail) render(); });
    return state.exchange;
  }
  function exchangeSection(r) {
    var ex = loadExchange(r);
    var html = '<section class="section"><h2>' + esc(r.gu) + " 주민센터 교환 사업</h2>";
    if (ex.status === "loading") return html + '<p class="note">웹에서 찾는 중이에요…</p></section>';
    if (ex.status === "error") return html + '<p class="note">교환 사업을 찾지 못했어요. 가까운 행정복지센터에 전화로 확인해 주세요.</p></section>';
    var items = ex.data.items;
    if (!items.length) html += '<p class="note">웹에서 이 동네 교환 사업 소식을 찾지 못했어요. 가까운 행정복지센터에 전화로 확인해 주세요.</p>';
    items.forEach(function (it) {
      html += '<article class="bcard"><div class="bcard-top"><h3>' + esc(it.give) + " → " + esc(it.get) + '</h3><span class="tag tag-ex">확인 필요</span></div>' +
        '<dl class="bdl">' + (it.condition ? "<dt>기준</dt><dd>" + esc(it.condition) + "</dd>" : "") + "<dt>어디서</dt><dd>" + esc(it.scope) + " 주민센터</dd></dl>" +
        '<ul class="srcs">' + it.sources.map(function (s) {
          return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + "</a>" + (s.date ? " <span>" + esc(s.date) + "</span>" : "") + "</li>";
        }).join("") + "</ul></article>";
    });
    return html + '<p class="src">다음 검색 결과를 AI가 정리했어요(' + esc(ex.data.at) + " 기준). 틀리거나 끝난 사업일 수 있으니 출처 날짜를 보고, 가기 전에 주민센터에 확인해 주세요.</p></section>";
  }
  function loadPlaces(r) {
    var key = placeArea(r);
    if (state.places && state.places.key === key) return state.places;
    state.places = { key: key, status: "loading" };
    fetch("/api/places?" + new URLSearchParams({ area: key, sido: r.sido, sgg: r.gu, dong: r.dong ? r.dong.split(/[/(]/)[0].trim() : "" })).then(function (res) { return res.json(); }).then(function (j) {
      if (!j.groups) throw new Error(j.error);
      if (state.places.key === key) state.places = { key: key, status: "ok", data: j };
    }).catch(function () {
      if (state.places.key === key) state.places = { key: key, status: "error" };
    }).then(function () { if (state.tab === "benefit" && !state.detail) render(); });
    return state.places;
  }
  function distText(m) { return m >= 1000 ? (m / 1000).toFixed(1) + "km" : m + "m"; }
  function placeGroup(g, area) {
    var html = '<article class="bcard"><div class="bcard-top"><h3>' + esc(g.title) + '</h3>' + (g.source === "" ? "" : '<span class="tag tag-nat">' + esc(g.source || "카카오맵") + "</span>") + "</div>";
    if (g.places.length) {
      html += '<ul class="plist">' + g.places.map(function (p) {
        return '<li><a href="' + esc(p.url) + '" target="_blank" rel="noopener"><b>' + esc(p.name) + "</b>" + (p.distance === null ? "" : "<span>" + distText(p.distance) + "</span>") + "</a>" +
          "<small>" + esc(p.address) + (p.phone ? ' · <a href="tel:' + esc(p.phone.replace(/[^0-9]/g, "")) + '">' + esc(p.phone) + "</a>" : "") + "</small>" +
          (p.collects && p.collects.length ? '<span class="collects">수거함 있음: ' + p.collects.map(esc).join(" · ") + "</span>" : "") + "</li>";
      }).join("") + "</ul>";
    } else {
      html += '<p class="note">근처에서 찾지 못했어요. 아파트 단지나 대형마트 안에 있는 경우가 많아요.</p>';
    }
    if (g.note) html += '<p class="note">' + esc(g.note) + "</p>";
    html += '<a class="blink" href="https://map.kakao.com/link/search/' + encodeURIComponent(area.split(" ").slice(-1)[0] + " " + g.title.split("·")[0].replace("가까운 ", "")) + '" target="_blank" rel="noopener">카카오맵에서 더 찾기 ↗</a></article>';
    return html;
  }
  function renderBenefit() {
    var r = region();
    var html = '<div class="view">';
    html += '<div class="page-head"><h1>버리고 돌려받기</h1><p>제대로 분리해서 내면 포인트나 물건으로 돌려받을 수 있어요.</p></div>';
    if (r.source === "public" && config.exchange) html += exchangeSection(r);
    if (r.source === "public" && config.places) {
      var pl = loadPlaces(r);
      html += '<section class="section"><h2>' + esc(regionLabel(r, true)) + " 근처 수거·교환 장소</h2>";
      if (pl.status === "loading") html += '<p class="note">주변 장소를 찾는 중이에요…</p>';
      else if (pl.status === "error") html += '<p class="note">주변 장소를 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>';
      else html += pl.data.groups.map(function (g) { return placeGroup(g, pl.key); }).join("");
      html += '<p class="src">' + esc(placeArea(r)) + " 근처 · 수거함 반경 2km · 장소: 카카오맵(반경 3km)</p></section>";
    } else {
      html += '<section class="section"><h2>' + esc(regionLabel(r, true)) + " 교환·수거</h2>" + localBenefits(r).map(benefitCard).join("") +
        (r.source === "public" ? '<p class="note">운영 여부와 교환 기준은 동네마다 달라요. 가까운 행정복지센터에 확인해 주세요.</p>'
          : '<p class="sample">우리 동네 항목은 시연용 예시예요. 교환 기준(무게·개수)과 운영 여부는 동네마다 달라서 주민센터에 확인해 주세요.</p>') +
        "<div>" + siteLink(r) + "</div></section>";
    }
    html += '<section class="section"><h2>전국 어디서나</h2>' + BENEFITS.map(benefitCard).join("") +
      '<p class="src">금액·연간 한도·참여 조건은 해마다 바뀔 수 있어요. 각 공식 안내를 확인해 주세요.</p></section>';
    html += "</div>";
    return html;
  }

  /* ───────── 렌더 & 라우팅 ───────── */
  var main = $("#main");
  function render() {
    $("#regionName").textContent = regionLabel(region(), true);
    var active = (state.tab === "search" || state.tab === "ask") ? "today" : state.tab;
    document.querySelectorAll(".tab").forEach(function (t) { t.setAttribute("aria-selected", String(t.dataset.tab === active)); });
    if (state.detail) main.innerHTML = renderDetail(state.detail);
    else if (state.tab === "search") main.innerHTML = renderSearch();
    else if (state.tab === "local") main.innerHTML = renderLocal();
    else if (state.tab === "benefit") main.innerHTML = renderBenefit();
    else if (state.tab === "category") main.innerHTML = renderCategory();
    else if (state.tab === "ask") main.innerHTML = renderAsk();
    else main.innerHTML = renderToday();
    main.classList.toggle("flush", state.tab === "category" && !state.detail);
  }
  function go(tab) {
    state.tab = tab; state.detail = null;
    if (location.hash !== "#" + tab) { try { history.replaceState(null, "", "#" + tab); } catch (e) { location.hash = tab; } }
    render(); window.scrollTo(0, 0);
  }
  function openItem(it) {
    if (!it) return;
    var rec = state.recent.filter(function (n) { return n !== it.name; });
    rec.unshift(it.name); state.recent = rec.slice(0, 6); store.set("bb.recent", state.recent);
    state.detail = it; render(); window.scrollTo(0, 0);
  }
  function itemByName(n) { for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].name === n) return ITEMS[i]; return search(n)[0]; }

  document.querySelectorAll(".tab").forEach(function (t) { t.addEventListener("click", function () { go(t.dataset.tab); }); });
  window.addEventListener("hashchange", function () {
    var h = location.hash.slice(1);
    if (["today", "search", "local", "benefit", "category", "ask"].indexOf(h) > -1 && (h !== state.tab || state.detail)) { state.tab = h; state.detail = null; render(); }
  });

  main.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.goto) { go(b.dataset.goto); if (b.dataset.goto === "ask") { var ai = $("#askInput"); if (ai) ai.focus(); } return; }
    if (b.dataset.ask) { sendAsk(b.dataset.ask); return; }
    if (b.dataset.askdraft) { state.draft = b.dataset.askdraft; go("ask"); var ad = $("#askInput"); if (ad) { ad.focus(); ad.setSelectionRange(ad.value.length, ad.value.length); } return; }
    if (b.id === "askStop") { if (askCtl) askCtl.abort(); return; }
    if (b.id === "askReset") { state.chat = []; render(); return; }
    if (b.dataset.wday) { state.weekSel = +b.dataset.wday; var y = window.scrollY; render(); window.scrollTo(0, y); return; }
    if (b.dataset.side) { state.cat = b.dataset.side; var keep = $(".side") ? $(".side").scrollTop : 0; render(); if ($(".side")) $(".side").scrollTop = keep; return; }
    if (b.dataset.item) { openItem(ITEMS.filter(function (i) { return i.id === b.dataset.item; })[0]); return; }
    if (b.dataset.itemName) { openItem(itemByName(b.dataset.itemName)); return; }
    if (b.dataset.query) { state.query = b.dataset.query; render(); return; }
    if (b.dataset.cat) { state.tab = "search"; state.detail = null; state.query = "cat:" + b.dataset.cat; render(); var qi = $("#q"); if (qi) qi.value = CATS[b.dataset.cat].label + " 전체"; state.query = "cat:" + b.dataset.cat; return; }
    if (b.id === "back") { state.detail = null; render(); if (state.tab === "search") { var qb = $("#q"); if (qb && !state.query) qb.focus(); } return; }
    if (b.id === "homeSearch") { state.query = ""; go("search"); var qs = $("#q"); if (qs) qs.focus(); return; }
    if (b.id === "searchBack") { state.query = ""; go("today"); return; }
    if (b.id === "qClear") { state.query = ""; render(); var q = $("#q"); if (q) q.focus(); return; }
    if (b.id === "clearRecent") { state.recent = []; store.set("bb.recent", []); $("#searchBody").innerHTML = searchBody(); return; }
    if (b.id === "changeRegion") { openSetup(false); return; }
    if (b.id === "copyPhone") {
      var num = region().phone;
      var done = function () { toast("번호를 복사했어요"); };
      try { navigator.clipboard.writeText(num).then(done, function () { selectNum(); }); } catch (err) { selectNum(); }
      return;
    }
  });
  function selectNum() {
    var el = $(".call .num"); if (!el) return;
    var range = document.createRange(); range.selectNodeContents(el);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    toast("번호를 선택했어요. 복사해서 쓰세요");
  }
  main.addEventListener("submit", function (e) {
    if (e.target.id !== "askForm") return;
    e.preventDefault();
    var t = $("#askInput"); sendAsk(t ? t.value : "");
  });
  main.addEventListener("input", function (e) {
    if (e.target.id === "askInput") {
      state.draft = e.target.value;
      e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
      return;
    }
    if (e.target.id !== "q") return;
    state.query = e.target.value;
    $("#qClear").hidden = !state.query;
    $("#searchBody").innerHTML = searchBody();
  });
  main.addEventListener("keydown", function (e) {
    if (e.target.id === "askInput" && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault(); sendAsk(e.target.value); return;
    }
    if (e.target.id === "q" && e.key === "Enter") {
      var first = $(".res"); if (first) first.click();
    }
  });

  /* ───────── 지역 설정 ───────── */
  // 공공데이터 키가 있으면 전국 시·도 → 시·군·구 → 읍·면·동 목록(regions-kr.json)에서 고르고, 배출 요일은 고른 뒤 공공데이터에서 받아 채움.
  // 키가 없거나 목록을 못 받으면 예시 지역(REGIONS)만 고름
  var config = { ai: false, waste: false, places: false }, kr = null;
  var setup = $("#setup"), saveBtn = $("#saveRegion"), pickGrid = $("#pickGrid"), pickFilter = $("#pickFilter");
  function useKr() { return !!(config.waste && kr); }
  // 고르는 목록: { 시·도: { 시·군·구: [{ value, label }] } }. 예시 모드에선 value 가 예시 지역 id
  function tree() {
    if (useKr()) return kr;
    var t = {};
    REGIONS.forEach(function (r) { ((t[r.sido] = t[r.sido] || {})[r.gu] = t[r.sido][r.gu] || []).push({ value: r.id, label: r.dong || "구 전체" }); });
    return t;
  }
  function dongItems(sido, gu) {
    var list = (tree()[sido] || {})[gu] || [];
    return list.map(function (d) { return typeof d === "string" ? { value: d, label: d } : d; });
  }
  // 목록은 행정동 이름이라 주소에 쓰는 법정동으로 찾으면 안 나옴 → 행정동: [법정동] 으로 같이 찾게 함
  var LEGAL_DONG = {
    "고양시 덕양구": {
      "창릉동": ["동산동", "용두동"], "삼송1동": ["오금동"], "행신2동": ["강매동"], "능곡동": ["내곡동", "대장동", "신평동"],
      "관산동": ["내유동"], "흥도동": ["도내동"], "고양동": ["벽제동", "선유동"], "효자동": ["북한동"],
      "원신동": ["신원동", "원당동"], "행주동": ["행주내동", "행주외동"], "화전동": ["향동동"], "대덕동": ["현천동"]
    }
  };
  function legalMatch(label, q) {
    var list = pickStep() === 2 && (LEGAL_DONG[pick.gu] || {})[label] || [];
    return list.filter(function (n) { return n.indexOf(q) > -1; })[0] || "";
  }
  var STEPS = ["시·도", "시·군·구", "읍·면·동"];
  var pick = { sido: "", gu: "", dong: "" };
  function pickStep() { return !pick.sido ? 0 : !pick.gu ? 1 : 2; }
  function pickItems(step) {
    if (step === 0) return Object.keys(tree()).map(function (s) { return { value: s, label: s }; });
    if (step === 1) return Object.keys(tree()[pick.sido] || {}).map(function (g) { return { value: g, label: g }; });
    return dongItems(pick.sido, pick.gu);
  }
  function renderPicker() {
    var step = pickStep(), items = pickItems(step), cur = [pick.sido, pick.gu, pick.dong][step];
    var path = [pick.sido, pick.gu].filter(Boolean);
    $("#pickPath").innerHTML = path.length ? path.map(function (p, i) { return '<button type="button" data-back="' + i + '" aria-label="' + STEPS[i] + " 다시 고르기: " + esc(p) + '">' + esc(p) + "</button>"; }).join('<span aria-hidden="true">›</span>') +
      '<span aria-hidden="true">›</span><span class="picker-now">' + STEPS[step] + "</span>" : "";
    $("#pickTitle").textContent = ["시·도를", "시·군·구를", "읍·면·동을"][step] + " 골라 주세요";
    $("#pickStep").textContent = (step + 1) + " / 3";
    var q = pickFilter.value.trim();
    pickFilter.hidden = step === 0 || items.length <= 12;
    pickFilter.placeholder = STEPS[step] + " 이름으로 찾기";
    var shown = q ? items.filter(function (it) { return it.label.indexOf(q) > -1 || legalMatch(it.label, q); }) : items;
    pickGrid.className = "picker-grid" + (step === 0 ? " wide" : "");
    pickGrid.innerHTML = shown.length ? shown.map(function (it) {
      var legal = q && it.label.indexOf(q) < 0 ? legalMatch(it.label, q) : "";
      return '<button class="pick" type="button" data-v="' + esc(it.value) + '" aria-pressed="' + (it.value === cur) + '">' + esc(it.label) + (legal ? " (" + esc(legal) + ")" : "") + "</button>";
    }).join("") : '<p class="hint">"' + esc(q) + '"에 해당하는 곳이 없어요.</p>';
    var chosen = pick.dong && dongItems(pick.sido, pick.gu).filter(function (d) { return d.value === pick.dong; })[0];
    saveBtn.disabled = !chosen;
    saveBtn.textContent = chosen ? (pick.gu.split(" ").pop() + " " + chosen.label + " 기준으로 시작하기") : "동네를 골라 주세요";
  }
  pickGrid.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]"); if (!b) return;
    var step = pickStep(), v = b.dataset.v;
    if (step === 0) pick = { sido: v, gu: "", dong: "" };
    else if (step === 1) pick = { sido: pick.sido, gu: v, dong: "" };
    else pick.dong = v;
    if (step < 2) pickFilter.value = "";
    renderPicker();
    if (step < 2) { setup.scrollTop = 0; var first = pickGrid.querySelector("button"); if (first) first.focus(); }
    else saveBtn.focus();
  });
  $("#pickPath").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-back]"); if (!b) return;
    if (b.dataset.back === "0") pick = { sido: "", gu: "", dong: "" };
    else pick = { sido: pick.sido, gu: "", dong: "" };
    pickFilter.value = ""; renderPicker();
  });
  pickFilter.addEventListener("input", renderPicker);
  saveBtn.addEventListener("click", function () {
    if (!pick.dong) return;
    if (useKr()) {
      var b = D.blankRegion(pick.sido, pick.gu, pick.dong);
      choosePub(b); loadRules(b);
      return;
    }
    state.regionId = pick.dong; store.set("bb.region", state.regionId);
    setup.hidden = true; document.body.style.overflow = "";
    render(); toast(regionLabel(region(), true) + " 기준으로 바꿨어요");
  });
  $("#cancelSetup").addEventListener("click", function () { setup.hidden = true; document.body.style.overflow = ""; });
  function openSetup(first) {
    $("#setupNote").innerHTML = useKr() ? "실제 구청 공지와 다르면 구청 안내가 우선이에요."
      : "지금은 시연용 예시 지역 6곳만 들어 있어요.<br class=\"pc\"> 요일·장소는 실제 구청 공지와 다를 수 있어요.";
    var r = region();
    pick = first ? { sido: "", gu: "", dong: "" } : { sido: r.sido, gu: r.gu, dong: useKr() ? r.dong || "" : r.id };
    if (!(tree()[pick.sido] || {})[pick.gu]) pick = { sido: "", gu: "", dong: "" };
    pickFilter.value = "";
    renderPicker();
    $("#cancelSetup").hidden = first;
    setup.hidden = false; document.body.style.overflow = "hidden"; setup.scrollTop = 0;
  }
  $("#regionBtn").addEventListener("click", function () { openSetup(false); });

  function choosePub(z) {
    state.pub = z; store.set("bb.pubRegion", z);
    state.regionId = z.id; store.set("bb.region", z.id);
    setup.hidden = true; document.body.style.overflow = "";
    render(); toast(regionLabel(z, true) + " 기준으로 바꿨어요");
  }

  // 공공데이터 시·도 이름이 행정동 목록과 다를 수 있어서(전라북도 ↔ 전북특별자치도 등) 앞 두 글자 약칭으로 비교
  var SIDO_SHORT = { 전라북도: "전북", 전라남도: "전남", 경상북도: "경북", 경상남도: "경남", 충청북도: "충북", 충청남도: "충남" };
  function sidoKey(s) { return SIDO_SHORT[s] || s.slice(0, 2); }
  function sameSido(a, b) { return a === b || a.indexOf(sidoKey(b)) > -1 || b.indexOf(sidoKey(a)) > -1; }
  function dongKey(s) { return String(s).replace(/\s/g, "").replace(/제?[\d·.,]+가?동$/, "동"); }
  // 고른 동네(b)에 맞는 관리구역: 같은 구 > 시 전체, 그 안에서 동 이름이 든 구역 > 구 전체 구역 > 첫 구역
  function matchZone(zones, b) {
    var gu = b.gu.replace(/\s/g, ""), city = b.gu.split(" ")[0], last = b.gu.split(" ").pop();
    var inSido = zones.filter(function (z) { return sameSido(z.sido, b.sido); });
    var exact = inSido.filter(function (z) { var g = z.gu.replace(/\s/g, ""); return g === gu || (last !== city && g.slice(-last.length) === last); });
    var cand = exact.length ? exact : inSido.filter(function (z) { return z.gu === city || z.gu.indexOf(city.replace(/시$/, "")) === 0; }); // 세종시 ↔ 세종특별자치시
    if (!cand.length) return null;
    var dk = dongKey(b.dong);
    return cand.filter(function (z) { return z.areas.some(function (a) { return a === b.dong || dongKey(a) === dk; }); })[0] ||
      cand.filter(function (z) { return !z.areas.length; })[0] || cand[0];
  }
  // 목록에서 고른 동네의 배출 요일을 공공데이터에서 받아 채움 (실패하면 "구청 확인" 안내로 남음)
  function loadRules(b) {
    if (!config.waste) return;
    fetch("/api/waste?sgg=" + encodeURIComponent(b.sgg)).then(function (r) { return r.json(); }).then(function (j) {
      var z = matchZone(j.zones || [], b);
      if (!z || !state.pub || state.pub.id !== b.id) return;
      z = Object.assign({}, z, { id: z.id + ":" + b.dong, sido: b.sido, gu: b.gu, dong: b.dong, level: "동" });
      var shown = state.regionId === b.id;
      state.pub = z; store.set("bb.pubRegion", z);
      if (shown) { state.regionId = z.id; store.set("bb.region", z.id); }
      if (shown && !state.asking) render();
    }).catch(function () {});
  }
  // 저장해 둔 공공데이터 지역은 열 때마다 최신 내용으로 조용히 갱신
  function refreshPub() {
    var p = state.pub; if (!p || !config.waste) return;
    if (p.noRules) return loadRules(p);
    fetch("/api/waste?sgg=" + encodeURIComponent(p.sgg)).then(function (r) { return r.json(); }).then(function (j) {
      var base = p.id.split(":").slice(0, 2).join(":");
      var z = (j.zones || []).filter(function (x) { return x.id === base; })[0];
      if (!z) return;
      z = Object.assign({}, z, { id: p.id, sido: p.sido, gu: p.gu, dong: p.dong, level: p.level });
      state.pub = z; store.set("bb.pubRegion", z);
      if (state.regionId === z.id && !state.asking) render();
    }).catch(function () {});
  }

  /* ───────── 시작 ───────── */
  var h = location.hash.slice(1);
  if (["today", "search", "local", "benefit", "category", "ask"].indexOf(h) > -1) state.tab = h;
  render();
  fetch("/api/config").then(function (r) { return r.json(); }).then(function (c) { config = c; }, function () {}).then(function () {
    if (!config.waste) return;
    return fetch("regions-kr.json").then(function (r) { return r.json(); }).then(function (j) { kr = j; }, function () {});
  }).then(function () {
    if (firstVisit) openSetup(true); else refreshPub();
    if (state.tab === "benefit") render();
  });
})();
