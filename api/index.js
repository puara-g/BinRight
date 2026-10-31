// Vercel 서버리스 함수: /api/* 요청을 server.js 핸들러로 넘겨요 (정적 파일은 public/에서 바로 제공)
module.exports = require("../server.js");
