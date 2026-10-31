/* 바로버림 공용 데이터 — 브라우저(window.BinRightData)와 Node 서버(require) 양쪽에서 사용 */
(function (root) {
  "use strict";

  // 지역 규칙: 시연용 예시 데이터. 실제 서비스는 공공데이터포털 생활쓰레기 배출정보 표준데이터를 정제해 교체.
  var DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  var GROUPS = {
    general: { label: "일반쓰레기", chip: "c-general", bar: "b-general", mark: "m-general" },
    food:    { label: "음식물",     chip: "c-food",    bar: "b-food",    mark: "m-food" },
    recycle: { label: "재활용",     chip: "c-recycle", bar: "b-recycle", mark: "m-recycle" },
    pet:     { label: "투명페트병", chip: "c-recycle", bar: "b-pet",     mark: "m-pet" },
    vinyl:   { label: "비닐",       chip: "c-recycle", bar: "b-vinyl",   mark: "m-vinyl" }
  };
  var ORDER = ["general", "food", "recycle", "pet", "vinyl"];

  var REGIONS = [
    { id: "seoul-jongno-sajik", site: "https://www.jongno.go.kr", siteLabel: "종로구청", sido: "서울특별시", gu: "종로구", dong: "사직동", level: "동",
      dept: "종로구청 청소행정과", phone: "120", phoneNote: "서울 다산콜센터에서 구청 담당 부서로 연결",
      updated: "2026-10-01", offDays: "토요일, 설·추석 당일",
      rules: {
        general: { days: [0,1,2,3,4], time: "19:00~24:00", place: "집 앞 또는 건물 앞 지정 장소", bag: "종로구 종량제 봉투(일반용)" },
        food:    { days: [0,1,2,3,4], time: "19:00~24:00", place: "음식물 전용 수거 용기", bag: "음식물 납부필증 부착 용기" },
        recycle: { days: [0,2,4],     time: "19:00~24:00", place: "집 앞, 일반쓰레기와 떨어진 곳", bag: "투명 비닐봉지에 종류별로" },
        pet:     { days: [3],         time: "19:00~24:00", place: "집 앞", bag: "투명 봉투에 투명페트병만" }
      } },
    { id: "seoul-jongno-cheongun", site: "https://www.jongno.go.kr", siteLabel: "종로구청", sido: "서울특별시", gu: "종로구", dong: "청운효자동", level: "동",
      dept: "종로구청 청소행정과", phone: "120", phoneNote: "서울 다산콜센터에서 구청 담당 부서로 연결",
      updated: "2026-10-01", offDays: "토요일, 설·추석 당일",
      rules: {
        general: { days: [0,1,2,3,4], time: "19:00~24:00", place: "골목 입구 지정 장소", bag: "종로구 종량제 봉투(일반용)" },
        food:    { days: [0,1,2,3,4], time: "19:00~24:00", place: "음식물 전용 수거 용기", bag: "음식물 납부필증 부착 용기" },
        recycle: { days: [1,3,5],     time: "19:00~24:00", place: "골목 입구, 일반쓰레기와 떨어진 곳", bag: "투명 비닐봉지에 종류별로" },
        pet:     { days: [4],         time: "19:00~24:00", place: "골목 입구", bag: "투명 봉투에 투명페트병만" }
      } },
    { id: "seoul-mapo-seogyo", site: "https://www.mapo.go.kr", siteLabel: "마포구청", sido: "서울특별시", gu: "마포구", dong: "서교동", level: "동",
      dept: "마포구청 자원순환과", phone: "120", phoneNote: "서울 다산콜센터에서 구청 담당 부서로 연결",
      updated: "2026-09-15", offDays: "토요일, 설·추석 당일",
      rules: {
        general: { days: [0,1,2,3,4], time: "18:00~24:00", place: "집 앞 또는 건물 앞", bag: "마포구 종량제 봉투(일반용)" },
        food:    { days: [0,1,2,3,4], time: "18:00~24:00", place: "음식물 전용 수거 용기", bag: "음식물 납부필증 부착 용기" },
        recycle: { days: [0,1,2,3,4], time: "18:00~24:00", place: "집 앞, 종류별로 묶어서", bag: "투명 비닐봉지" },
        vinyl:   { days: [2],         time: "18:00~24:00", place: "집 앞", bag: "투명 봉투에 비닐만" },
        pet:     { days: [4],         time: "18:00~24:00", place: "집 앞", bag: "투명 봉투에 투명페트병만" }
      } },
    { id: "gyeonggi-suwon-maetan", site: "https://www.suwon.go.kr", siteLabel: "수원시청 (영통구 포함)", sido: "경기도", gu: "수원시 영통구", dong: "매탄동", level: "동",
      dept: "영통구청 환경위생과", phone: "031-120", phoneNote: "경기도 콜센터",
      updated: "2026-08-20", offDays: "토요일",
      rules: {
        general: { days: [0,2,4],     time: "18:00~24:00", place: "단독·빌라: 집 앞 / 아파트: 단지 수거장", bag: "수원시 종량제 봉투" },
        food:    { days: [0,1,2,3,4], time: "18:00~24:00", place: "음식물 전용 용기 또는 단지 수거함", bag: "수원시 음식물 전용 봉투" },
        recycle: { days: [1,3,5],     time: "18:00~24:00", place: "집 앞 또는 단지 수거장", bag: "투명 비닐봉지에 종류별로" }
      } },
    { id: "busan-haeundae-u", site: "https://www.haeundae.go.kr", siteLabel: "해운대구청", sido: "부산광역시", gu: "해운대구", dong: "우동", level: "동",
      dept: "해운대구청 자원순환과", phone: "051-120", phoneNote: "부산시 콜센터",
      updated: "2026-07-30", offDays: "토요일, 명절 당일",
      rules: {
        general: { days: [0,1,2,3,4], time: "20:00~24:00", place: "집 앞 지정 장소", bag: "해운대구 종량제 봉투" },
        food:    { days: [0,1,2,3,4], time: "20:00~24:00", place: "단독주택 전용 용기 / 아파트 음식물 수거기", bag: "전용 용기" },
        recycle: { days: [1,3],       time: "20:00~24:00", place: "집 앞 지정 장소", bag: "투명 비닐봉지에 종류별로" }
      } },
    { id: "daegu-jung", site: "https://www.jung.daegu.kr", siteLabel: "대구 중구청", sido: "대구광역시", gu: "중구", dong: null, level: "시군구",
      dept: "대구 중구청 환경자원과", phone: "053-120", phoneNote: "대구시 콜센터",
      updated: "2026-06-30", offDays: "토요일",
      rules: {
        general: { days: [0,1,2,3,4], time: "18:00~24:00", place: "집 앞 지정 장소", bag: "중구 종량제 봉투" },
        food:    { days: [0,1,2,3,4], time: "18:00~24:00", place: "음식물 전용 용기", bag: "음식물 전용 봉투" },
        recycle: { days: [0,2,4],     time: "18:00~24:00", place: "집 앞, 종류별로 묶어서", bag: "투명 비닐봉지" }
      } }
  ];

  // 품목 분류 → 배출 그룹
  var CATS = {
    paper:   { label: "종이",       group: "recycle" },
    pack:    { label: "종이팩",     group: "recycle" },
    plastic: { label: "플라스틱",   group: "recycle" },
    pet:     { label: "투명페트병", group: "pet" },
    vinyl:   { label: "비닐",       group: "vinyl" },
    styro:   { label: "스티로폼",   group: "recycle" },
    can:     { label: "캔·고철",    group: "recycle" },
    glass:   { label: "유리병",     group: "recycle" },
    general: { label: "일반쓰레기", group: "general" },
    nonflam: { label: "불연성",     group: "general" },
    food:    { label: "음식물",     group: "food" },
    bulky:   { label: "대형폐기물", group: "bulky" },
    special: { label: "전용 수거함", group: "special" }
  };

  // 품목 사전: 환경부 재활용품 분리배출 가이드라인 기준으로 정리
  var ITEMS = [
    { id: "pet-clear", name: "투명 페트병", aliases: ["생수병", "물병", "음료 페트병", "페트"], cat: "pet",
      steps: ["내용물을 비우고 물로 헹궈요", "겉면 비닐 라벨을 떼요", "찌그러뜨려 부피를 줄이고 뚜껑을 닫아요", "다른 플라스틱과 섞지 말고 따로 내놔요"],
      myth: "라벨이 붙은 채로 내놓으면 고품질 재활용이 어려워요. 절취선이 없으면 가위로 잘라 떼요." },
    { id: "pet-color", name: "색깔 있는 페트병", aliases: ["유색 페트병", "음료수병", "콜라병"], cat: "plastic",
      steps: ["내용물을 비우고 헹궈요", "라벨을 떼요", "플라스틱으로 내놔요"],
      myth: "색이 들어간 페트병은 투명페트병 수거함이 아니라 일반 플라스틱으로 버려요." },
    { id: "plastic-delivery", name: "배달 플라스틱 용기", aliases: ["배달용기", "반찬통", "도시락 용기", "일회용 용기"], cat: "plastic",
      steps: ["남은 음식을 비워요", "세제로 한 번 씻어 기름기를 없애요", "플라스틱으로 내놔요"],
      myth: "씻어도 빨간 양념 물이 안 빠지면 재활용이 안 돼요. 그때는 일반쓰레기로 버려요." },
    { id: "cosmetic", name: "화장품 용기", aliases: ["로션통", "샴푸통", "펌프용기"], cat: "plastic",
      steps: ["내용물을 최대한 비우고 헹궈요", "펌프 부분은 분리해서 일반쓰레기로 버려요", "몸통은 재질 표시를 보고 플라스틱 또는 유리로 내놔요"],
      myth: "펌프 안에는 금속 스프링이 있어서 플라스틱으로 버리면 안 돼요." },
    { id: "styro-box", name: "스티로폼 상자", aliases: ["스티로폼", "아이스박스", "완충재", "발포스티렌"], cat: "styro",
      steps: ["테이프, 운송장, 스티커를 모두 떼요", "내용물을 비우고 깨끗한 상태로 내놔요", "부피가 크면 그대로, 작으면 모아서 투명 봉투에 담아요"],
      myth: "색깔 있는 스티로폼이나 음식물이 밴 스티로폼은 일반쓰레기예요." },
    { id: "cupramen", name: "컵라면 용기", aliases: ["컵라면", "라면 용기"], cat: "styro",
      steps: ["국물을 비우고 헹궈요", "깨끗하면 스티로폼이나 재질에 맞게 내놔요", "빨간 국물 자국이 남으면 일반쓰레기로 버려요"],
      myth: "종이 재질 컵라면 용기는 안쪽이 코팅되어 있어 종이가 아니라 일반쓰레기로 버리는 지역이 많아요." },
    { id: "vinyl-bag", name: "비닐봉지", aliases: ["비닐", "봉지", "과자봉지", "라면봉지", "택배 비닐"], cat: "vinyl",
      steps: ["내용물을 털어 비워요", "음식물이 묻었으면 헹궈요", "여러 장 모아서 투명 봉투에 담아 내놔요"],
      myth: "이물질이 씻기지 않는 비닐은 일반쓰레기예요." },
    { id: "bubble", name: "뽁뽁이", aliases: ["에어캡", "버블랩", "완충 비닐"], cat: "vinyl",
      steps: ["붙어 있는 테이프와 스티커를 떼요", "비닐로 내놔요"] },
    { id: "wrap", name: "랩", aliases: ["주방랩", "비닐랩", "음식 랩"], cat: "general",
      steps: ["음식물이 묻은 랩은 일반쓰레기로 버려요"],
      myth: "랩은 얇고 이물질이 잘 붙어서 대부분 재활용이 안 돼요." },
    { id: "box", name: "택배 상자", aliases: ["박스", "골판지", "종이박스", "상자"], cat: "paper",
      steps: ["테이프와 운송장을 모두 떼요", "상자를 납작하게 펼쳐요", "다른 종이와 함께 묶어서 내놔요"],
      myth: "운송장은 코팅·감열지라 종이가 아니에요. 개인정보도 있으니 떼어서 일반쓰레기로 버려요." },
    { id: "newspaper", name: "신문·책", aliases: ["신문지", "책", "공책", "잡지", "노트"], cat: "paper",
      steps: ["스프링, 비닐 표지, 테이프를 떼요", "물에 젖지 않게 끈으로 묶어서 내놔요"] },
    { id: "pizza", name: "치킨·피자 상자", aliases: ["피자박스", "치킨박스"], cat: "paper",
      steps: ["남은 음식과 소스를 비워요", "기름이 심하게 밴 부분은 찢어서 일반쓰레기로 버려요", "깨끗한 부분만 종이로 내놔요"],
      myth: "기름에 젖은 종이는 재활용 과정에서 다른 종이까지 망쳐요." },
    { id: "receipt", name: "영수증", aliases: ["카드 영수증", "감열지", "번호표"], cat: "general",
      steps: ["일반쓰레기로 버려요"],
      myth: "영수증은 종이처럼 보이지만 감열지라 재활용이 안 돼요." },
    { id: "milk", name: "우유팩", aliases: ["종이팩", "두유팩", "주스팩", "멸균팩"], cat: "pack",
      steps: ["내용물을 비우고 헹궈요", "펼쳐서 말려요", "일반 종이와 섞지 말고 종이팩끼리 따로 묶어 내놔요"],
      myth: "종이팩은 고급 펄프라 일반 종이와 섞으면 재활용 가치가 떨어져요. 주민센터에서 휴지로 바꿔주는 곳도 있어요." },
    { id: "papercup", name: "종이컵", aliases: ["일회용 컵", "커피컵"], cat: "pack",
      steps: ["남은 음료를 비우고 헹궈요", "플라스틱 뚜껑과 컵홀더는 분리해요", "종이팩과 함께 따로 내놔요"] },
    { id: "can", name: "음료 캔", aliases: ["캔", "맥주캔", "콜라캔", "참치캔", "통조림"], cat: "can",
      steps: ["내용물을 비우고 헹궈요", "가능하면 납작하게 눌러요", "캔류로 내놔요"],
      myth: "참치캔처럼 기름이 있는 캔은 꼭 헹궈야 해요." },
    { id: "butane", name: "부탄가스", aliases: ["가스통", "휴대용 가스", "스프레이"], cat: "can",
      steps: ["바람이 잘 통하는 곳에서 남은 가스를 끝까지 빼요", "구멍을 뚫어 남은 가스를 완전히 없애요", "캔류로 내놔요"],
      myth: "가스가 남은 채로 버리면 수거차 압축 과정에서 화재가 날 수 있어요." },
    { id: "pan", name: "프라이팬·냄비", aliases: ["후라이팬", "냄비", "주전자"], cat: "can",
      steps: ["플라스틱 손잡이를 분리할 수 있으면 떼요", "고철로 내놔요"] },
    { id: "glass", name: "유리병", aliases: ["소주병", "맥주병", "음료병", "잼병", "양념병"], cat: "glass",
      steps: ["뚜껑을 분리해요", "내용물을 비우고 헹궈요", "유리병으로 내놔요"],
      myth: "소주병·맥주병은 마트나 편의점에 가져가면 빈용기 보증금을 돌려받을 수 있어요." },
    { id: "broken-glass", name: "깨진 유리", aliases: ["유리 조각", "깨진 컵", "유리컵"], cat: "nonflam",
      steps: ["신문지 등으로 두껍게 감싸요", "'깨진 유리' 라고 써서 종량제 봉투에 넣어요", "양이 많으면 불연성 쓰레기 마대(특수규격 봉투)를 사서 담아요"],
      myth: "깨진 유리나 유리컵은 유리병 재활용이 아니에요. 녹는 온도가 달라서 섞이면 안 돼요." },
    { id: "ceramic", name: "도자기·뚝배기", aliases: ["그릇", "사기그릇", "뚝배기", "화분"], cat: "nonflam",
      steps: ["작으면 감싸서 종량제 봉투에 넣어요", "양이 많으면 불연성 쓰레기 마대에 담아요"] },
    { id: "icepack", name: "아이스팩", aliases: ["얼음팩", "보냉팩", "냉매"], cat: "general",
      steps: ["젤 형태는 뜯지 말고 그대로 종량제 봉투에 버려요", "물만 든 아이스팩은 물을 버리고 비닐은 비닐로 내놔요"],
      myth: "젤 아이스팩을 하수구에 버리면 안 돼요. 주민센터에 아이스팩 수거함이 있는 곳도 있어요." },
    { id: "tissue", name: "휴지·물티슈", aliases: ["휴지", "물티슈", "키친타월", "냅킨"], cat: "general",
      steps: ["일반쓰레기로 버려요"],
      myth: "물티슈는 플라스틱 섬유라 변기에 버리면 안 돼요." },
    { id: "mask", name: "마스크", aliases: ["일회용 마스크", "KF94"], cat: "general",
      steps: ["끈을 잘라 접어요", "일반쓰레기로 버려요"] },
    { id: "toothbrush", name: "칫솔", aliases: ["치약", "볼펜", "펜"], cat: "general",
      steps: ["여러 재질이 섞여 있어 일반쓰레기로 버려요"] },
    { id: "rubber-glove", name: "고무장갑", aliases: ["장갑", "목장갑"], cat: "general",
      steps: ["일반쓰레기로 버려요"] },
    { id: "chopsticks", name: "나무젓가락", aliases: ["젓가락", "이쑤시개", "아이스크림 막대"], cat: "general",
      steps: ["일반쓰레기로 버려요"] },
    { id: "straw", name: "빨대", aliases: ["플라스틱 빨대"], cat: "general",
      steps: ["크기가 작아 선별이 안 되니 일반쓰레기로 버려요"] },
    { id: "lighter", name: "일회용 라이터", aliases: ["라이터"], cat: "general",
      steps: ["가스를 다 쓴 뒤 일반쓰레기로 버려요"] },
    { id: "food-general", name: "남은 음식", aliases: ["음식물", "밥", "반찬", "국"], cat: "food",
      steps: ["국물과 물기를 최대한 빼요", "이쑤시개, 비닐, 뼈 같은 이물질을 골라내요", "음식물 전용 용기나 봉투에 담아요"],
      myth: "음식물 쓰레기는 동물 사료·퇴비가 될 수 있는 것만 넣어요. 짠 국물은 꼭 빼요." },
    { id: "fruit-peel", name: "과일 껍질", aliases: ["귤껍질", "사과껍질", "바나나껍질", "수박껍질"], cat: "food",
      steps: ["큰 껍질은 잘게 잘라요", "음식물로 버려요"],
      myth: "단단한 씨(복숭아·자두·감 씨)와 파인애플 껍질처럼 딱딱한 건 일반쓰레기예요." },
    { id: "chicken-bone", name: "닭뼈", aliases: ["뼈", "생선뼈", "갈비뼈", "족발뼈"], cat: "general",
      steps: ["살코기를 떼어내요", "뼈는 일반쓰레기로 버려요"],
      myth: "뼈는 동물 사료로 쓸 수 없어서 음식물이 아니에요." },
    { id: "egg-shell", name: "달걀 껍데기", aliases: ["계란껍질", "달걀껍질", "메추리알 껍데기"], cat: "general",
      steps: ["일반쓰레기로 버려요"] },
    { id: "shell", name: "조개·게 껍데기", aliases: ["조개껍질", "게껍질", "굴껍데기", "소라"], cat: "general",
      steps: ["일반쓰레기로 버려요"] },
    { id: "onion", name: "양파·마늘 껍질", aliases: ["양파껍질", "마늘껍질", "옥수수 껍질", "대파 뿌리"], cat: "general",
      steps: ["일반쓰레기로 버려요"],
      myth: "채소 껍질이라도 질기고 마른 껍질과 뿌리는 음식물이 아니에요." },
    { id: "coffee", name: "커피 찌꺼기", aliases: ["원두 찌꺼기", "커피박", "티백", "녹차 티백"], cat: "general",
      steps: ["물기를 빼요", "일반쓰레기로 버려요"] },
    { id: "battery", name: "건전지", aliases: ["배터리", "폐건전지", "AA 건전지"], cat: "special",
      steps: ["주민센터·아파트·마트의 폐건전지 수거함에 넣어요", "리튬 배터리는 양극에 테이프를 붙여요"],
      myth: "건전지를 종량제 봉투에 넣으면 화재 위험이 있어요." },
    { id: "fluorescent", name: "형광등", aliases: ["전구", "형광램프"], cat: "special",
      steps: ["깨지지 않게 그대로 둬요", "주민센터·아파트의 폐형광등 수거함에 넣어요"],
      myth: "형광등엔 수은이 있어서 깨뜨려 버리면 안 돼요." },
    { id: "medicine", name: "폐의약품", aliases: ["약", "알약", "물약", "유통기한 지난 약"], cat: "special",
      steps: ["알약은 포장을 벗겨 한 봉투에 모아요", "물약은 한 병에 모아요", "약국·보건소·주민센터 폐의약품 수거함에 넣어요"] },
    { id: "clothes", name: "헌 옷", aliases: ["옷", "의류", "신발", "가방", "이불"], cat: "special",
      steps: ["입을 수 있는 옷·신발·가방은 의류수거함에 넣어요", "찢어지거나 오염된 옷, 속옷은 종량제 봉투에 버려요"],
      myth: "이불·베개는 의류수거함에 안 받는 곳이 많아요. 크면 대형폐기물로 신고해요." },
    { id: "small-appliance", name: "소형 가전", aliases: ["드라이기", "전기밥솥", "선풍기", "휴대폰", "충전기"], cat: "special",
      steps: ["주민센터 등의 소형 폐가전 수거함에 넣어요", "5개 이상 모이면 폐가전 무상방문수거 서비스로 신청할 수 있어요"] },
    { id: "big-appliance", name: "대형 가전", aliases: ["냉장고", "세탁기", "에어컨", "TV", "텔레비전"], cat: "special",
      steps: ["폐가전제품 무상방문수거 서비스(전화 1599-0903 또는 홈페이지)로 예약해요", "수거일에 집 앞에서 가져가요"],
      myth: "대형 가전은 대형폐기물 스티커 없이 무료로 수거돼요." },
    { id: "furniture", name: "가구", aliases: ["의자", "책상", "침대", "소파", "매트리스", "옷장"], cat: "bulky",
      steps: ["구청 홈페이지나 주민센터에서 대형폐기물 배출 신고를 해요", "수수료를 내고 신고필증(스티커)을 받아요", "필증을 붙여 정해진 날 지정 장소에 내놔요"] }
  ];

  // 전국 공통 혜택 (실제 운영 중인 제도. 금액·한도는 바뀔 수 있어 화면엔 적지 않음)
  var BENEFITS = [
    { id: "cpoint", title: "탄소중립포인트 녹색생활 실천", give: "회수기로 투명페트병·캔 배출, 다회용기·텀블러 이용 등", get: "포인트 적립 후 현금 등으로 지급 (연간 한도 있음)",
      where: "전국 · 홈페이지에서 회원가입 후 참여", items: ["pet-clear", "can", "plastic-delivery", "papercup"], link: "https://www.cpoint.or.kr", linkLabel: "탄소중립포인트 홈페이지" },
    { id: "robot", title: "재활용품 회수기 (네프론 등)", give: "투명페트병, 음료 캔", get: "1개마다 포인트 적립, 모이면 현금 전환",
      where: "주민센터·공원·마트 앞 등에 설치된 회수기 · 위치는 수퍼빈 앱에서 확인", items: ["pet-clear", "can"], link: "https://www.superbin.co.kr", linkLabel: "수퍼빈 홈페이지" },
    { id: "deposit", title: "빈용기 보증금 돌려받기", give: "소주병·맥주병 등 보증금 표시가 있는 유리병", get: "병마다 보증금 현금 환급",
      where: "그 병을 파는 마트·편의점", items: ["glass"], link: "https://www.cosmo.or.kr", linkLabel: "순환자원유통지원센터" },
    { id: "appliance", title: "폐가전 무상방문수거", give: "냉장고·세탁기 등 대형 가전, 소형 가전 5개 이상", get: "수거 무료 (대형폐기물 수수료가 안 들어요)",
      where: "전국 · 전화 1599-0903 또는 홈페이지 예약", items: ["big-appliance", "small-appliance"], link: "https://www.15990903.or.kr", linkLabel: "폐가전 무상방문수거" }
  ];
  // 구청 보도자료로 확인한 구별 혜택 (키: 시도 구)
  var GU_BENEFITS = {
    "서울특별시 서대문구": [
      { id: "sdm-can", title: "알루미늄 캔 무인회수기", give: "빈 알루미늄 캔", get: "포인트 적립 또는 교통카드 충전",
        where: "서대문문화체육회관 인조잔디구장 입구, 안산 초입 오름카페 앞 · 코다(CODA) 앱 가입 후 이용 (2026년 5월부터 시범 운영)",
        items: ["can"], local: true, real: true, link: "https://biz.heraldcorp.com/article/10734910", linkLabel: "서대문구 보도 기사" }
    ]
  };
  // 우리 동네 혜택: 시연용 예시. 실제로는 구청·주민센터 공지를 모아서 지역별로 입력
  function localBenefits(r) {
    return (GU_BENEFITS[r.sido + " " + r.gu] || []).concat(commonLocal(r));
  }
  function commonLocal(r) {
    // 공공데이터로 고른 실제 지역: 동네마다 운영 여부가 달라서 지어낸 조건 없이 "확인 필요"로 안내
    if (r.source === "public") return [
      { id: "local-milk", title: "우유팩 → 화장지 교환", give: "씻어서 펼쳐 말린 우유팩", get: "화장지 (운영하는 곳만)", where: "가까운 행정복지센터에 전화로 확인", items: ["milk", "papercup"], local: true, check: true },
      { id: "local-battery", title: "폐건전지 수거·교환", give: "다 쓴 건전지", get: "안전한 처리 (일부 센터는 새 건전지로 교환)", where: "주민센터·아파트·대형마트 수거함", items: ["battery", "fluorescent"], local: true, check: true },
      { id: "local-icepack", title: "아이스팩 수거", give: "깨끗한 아이스팩", get: "동네 가게에서 재사용 (운영하는 곳만)", where: "일부 주민센터 수거함", items: ["icepack"], local: true, check: true }
    ];
    var place = r.dong ? r.dong + " 주민센터" : r.gu + " 각 동 주민센터";
    return [
      { id: "local-milk", title: "우유팩 → 화장지 교환", give: "씻어서 펼쳐 말린 우유팩 (정해진 무게 이상)", get: "화장지", where: place, items: ["milk", "papercup"], local: true },
      { id: "local-battery", title: "폐건전지 → 새 건전지 교환", give: "다 쓴 건전지 (정해진 개수 이상)", get: "새 건전지", where: place, items: ["battery"], local: true },
      { id: "local-icepack", title: "아이스팩 수거함", give: "깨끗한 아이스팩", get: "동네 가게에서 재사용 (보상 없음)", where: place + " 수거함", items: ["icepack"], local: true }
    ];
  }

  function daysText(days) {
    if (!days || !days.length) return "-";
    if (days.length === 7) return "매일";
    var s = days.slice().sort().join(",");
    if (s === "0,1,2,3,4") return "일~목";
    if (s === "1,2,3,4,5") return "월~금";
    return days.slice().sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); }).map(function (d) { return DAYS[d]; }).join("·");
  }
  // 목록에서 고른 동네의 기본 모양. 배출 요일(rules)은 공공데이터를 받아 오면 채움
  function blankRegion(sido, gu, dong) {
    var name = gu.split(" ").pop();
    return {
      id: "kr:" + sido + ":" + gu + ":" + dong, source: "public", noRules: true,
      sido: sido, gu: gu, sgg: gu.split(" ")[0] === "세종시" ? "세종" : gu.split(" ")[0], dong: dong, level: "동", zone: "", areas: [],
      site: "https://search.naver.com/search.naver?query=" + encodeURIComponent(sido + " " + gu + "청 대형폐기물 신고"),
      siteLabel: name + "청", siteKind: "search", dept: name + "청 청소 담당 부서", phone: "120", phoneNote: "지역 콜센터에서 담당 부서로 연결",
      updated: "", offDays: "구청 안내 확인", rules: {}
    };
  }
  function regionLabel(r, short) {
    if (short) return r.dong ? r.gu.split(" ").pop() + " " + r.dong : r.gu;
    return r.sido + " " + r.gu + (r.dong ? " " + r.dong : "");
  }

  var data = {
    DAYS: DAYS, GROUPS: GROUPS, ORDER: ORDER, REGIONS: REGIONS, CATS: CATS, ITEMS: ITEMS, BENEFITS: BENEFITS,
    localBenefits: localBenefits, daysText: daysText, regionLabel: regionLabel, blankRegion: blankRegion
  };
  if (typeof module !== "undefined" && module.exports) module.exports = data;
  else root.BinRightData = data;
})(this);
