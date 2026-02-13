---
marp: true
theme: default
paginate: false
style: |
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap');
  section {
    font-family: 'Noto Sans KR', sans-serif;
    background: #fdf6e3;
    color: #2d2d2d;
    padding: 40px 50px;
  }
  /* ─── 표지 ─── */
  section.cover {
    background: linear-gradient(160deg, #a8edea 0%, #fed6e3 100%);
    display: flex; flex-direction: column;
    justify-content: center; align-items: center; text-align: center;
  }
  section.cover .hero { font-size: 100px; margin-bottom: 8px; }
  section.cover h1 { font-size: 2.8em; color: #2d2d2d; margin: 0; }
  section.cover h2 { font-size: 1.3em; color: #555; font-weight: 400; margin-top: 4px; }

  /* ─── 엔딩 ─── */
  section.end {
    background: linear-gradient(160deg, #fed6e3 0%, #a8edea 100%);
    display: flex; flex-direction: column;
    justify-content: center; align-items: center; text-align: center;
  }
  section.end h1 { font-size: 2.6em; color: #2d2d2d; }
  section.end p { font-size: 1.2em; color: #555; }

  /* ─── 말풍선 ─── */
  .bubble {
    position: relative;
    background: #fff;
    border-radius: 20px;
    padding: 14px 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    margin: 6px 0;
    font-size: 0.88em;
    line-height: 1.5;
    max-width: 85%;
  }
  .bubble::after {
    content: '';
    position: absolute; bottom: -10px; left: 30px;
    border-width: 10px 10px 0;
    border-style: solid;
    border-color: #fff transparent transparent;
  }
  .bubble-blue {
    background: #dbeafe;
  }
  .bubble-blue::after { border-color: #dbeafe transparent transparent; }
  .bubble-pink {
    background: #fce7f3;
  }
  .bubble-pink::after { border-color: #fce7f3 transparent transparent; }
  .bubble-green {
    background: #d1fae5;
  }
  .bubble-green::after { border-color: #d1fae5 transparent transparent; }
  .bubble-yellow {
    background: #fef3c7;
  }
  .bubble-yellow::after { border-color: #fef3c7 transparent transparent; }
  .bubble-right::after { left: auto; right: 30px; }

  /* ─── 캐릭터 행 ─── */
  .scene { display: flex; gap: 20px; align-items: flex-start; margin: 10px 0; }
  .char { text-align: center; flex-shrink: 0; width: 70px; }
  .char .face { font-size: 48px; line-height: 1; }
  .char .name { font-size: 0.65em; color: #888; margin-top: 2px; }
  .dialog { flex: 1; }

  /* ─── 강조 ─── */
  strong { color: #e11d48; }
  em { color: #2563eb; font-style: normal; font-weight: 700; }
  h1 { color: #1e3a5f; font-size: 1.8em; margin-bottom: 12px; }

  /* ─── 카드 ─── */
  .cards { display: flex; gap: 16px; margin: 12px 0; }
  .card {
    flex: 1;
    background: #fff;
    border-radius: 16px;
    padding: 18px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    text-align: center;
  }
  .card .icon { font-size: 40px; margin-bottom: 6px; }
  .card .title { font-weight: 900; font-size: 0.95em; margin-bottom: 4px; }
  .card .desc { font-size: 0.75em; color: #666; line-height: 1.4; }

  /* ─── 숫자 강조 ─── */
  .num { font-size: 2.2em; font-weight: 900; color: #2563eb; line-height: 1; }
  .num-pink { font-size: 2.2em; font-weight: 900; color: #e11d48; line-height: 1; }
  .label { font-size: 0.8em; color: #888; }

  /* ─── 화살표 전환 ─── */
  .transform {
    display: flex; align-items: center; gap: 16px;
    margin: 12px 0;
  }
  .transform .arrow { font-size: 36px; flex-shrink: 0; }
---

<!-- _class: cover -->

<div class="hero">🤖✨</div>

# RTB AI Hub

## 우리 팀에 AI 비서가 생긴다면?

---

# 😩 흔한 월요일 아침...

<div class="scene">
  <div class="char"><div class="face">👨‍💼</div><div class="name">PM 김팀장</div></div>
  <div class="dialog">
    <div class="bubble bubble-blue">로그인 기능 이번 주까지 부탁합니다!</div>
  </div>
</div>

<div class="scene">
  <div class="char"><div class="face">👩‍🎨</div><div class="name">디자이너 이수진</div></div>
  <div class="dialog">
    <div class="bubble bubble-pink">화면은 만들었는데... 테이블명이 뭐였죠? 🤔</div>
  </div>
</div>

<div class="scene">
  <div class="char"><div class="face">👨‍💻</div><div class="name">개발자 박민수</div></div>
  <div class="dialog">
    <div class="bubble bubble-green">기획 의도가 뭔지 모르겠어서 Wiki 찾는 중... <strong>벌써 20분째</strong> 😵</div>
  </div>
</div>

<div class="scene">
  <div class="char"><div class="face">🧑‍🔬</div><div class="name">QA 최지우</div></div>
  <div class="dialog">
    <div class="bubble bubble-yellow">뭘 테스트해야 하는지 아무도 안 알려줬어요... 😢</div>
  </div>
</div>

---

# 🤖 AI Hub가 있는 월요일 아침!

<div class="scene">
  <div class="char"><div class="face">👨‍💼</div><div class="name">PM 김팀장</div></div>
  <div class="dialog">
    <div class="bubble bubble-blue">로그인 기능 이번 주까지 부탁합니다!</div>
  </div>
</div>

<div style="text-align:center; font-size:36px; margin:6px 0">⬇️ 🤖 AI Hub가 자동으로 ⬇️</div>

<div class="cards">
  <div class="card">
    <div class="icon">👩‍🎨</div>
    <div class="title">디자이너에게</div>
    <div class="desc">Figma 링크 ✅<br>참고 화면 3개 ✅<br><em>UX 가이드라인 자동 첨부</em></div>
  </div>
  <div class="card">
    <div class="icon">👨‍💻</div>
    <div class="title">개발자에게</div>
    <div class="desc">테이블: <em>usr_auth_mst</em> ✅<br>API 예제 코드 ✅<br><em>Wiki 문서 자동 연결</em></div>
  </div>
  <div class="card">
    <div class="icon">🧑‍🔬</div>
    <div class="title">QA에게</div>
    <div class="desc">테스트 시나리오 ✅<br>체크리스트 ✅<br><em>과거 유사 버그 참고</em></div>
  </div>
</div>

<div style="text-align:center; margin-top:6px; font-size:0.95em">
  🎉 <strong>모두가 맥락을 알고, 바로 일을 시작!</strong>
</div>

---

# 🛠️ AI Hub의 3가지 능력

<div class="cards">
  <div class="card" style="border-top:4px solid #3b82f6">
    <div class="icon">🗣️</div>
    <div class="title">통역사</div>
    <div class="desc" style="text-align:left">
      같은 말도 <strong>듣는 사람에 맞게</strong> 바꿔줌<br><br>
      👨‍💼 PM에겐 → 📊 비즈니스 언어<br>
      👨‍💻 Dev에겐 → 💻 테이블/API<br>
      🧑‍🔬 QA에겐 → ✅ 테스트 항목
    </div>
  </div>
  <div class="card" style="border-top:4px solid #e11d48">
    <div class="icon">🤖×7</div>
    <div class="title">7명의 AI 팀원</div>
    <div class="desc" style="text-align:left">
      명령 하나에 <strong>7개 에이전트가 동시 작업</strong><br><br>
      🤖 PM · 설계 · UX<br>
      🤖 프론트 · 백엔드<br>
      🤖 QA · 인프라
    </div>
  </div>
  <div class="card" style="border-top:4px solid #16a34a">
    <div class="icon">📚</div>
    <div class="title">지식 자동 제공</div>
    <div class="desc" style="text-align:left">
      Jira 키워드를 보고 <strong>Wiki를 알아서 찾아줌</strong><br><br>
      "빌딩" 감지 →<br>
      obj_bld_mst 문서 발견 →<br>
      개발 프롬프트에 자동 삽입
    </div>
  </div>
</div>

---

# 📊 도입하면 얼마나 달라질까?

<div class="cards" style="margin:18px 0">
  <div class="card">
    <div class="num-pink">80%↓</div>
    <div class="label">커뮤니케이션 시간</div>
    <div style="font-size:0.75em; color:#888; margin-top:4px">주 10h → 2h</div>
  </div>
  <div class="card">
    <div class="num-pink">81%↓</div>
    <div class="label">반복 작업 시간</div>
    <div style="font-size:0.75em; color:#888; margin-top:4px">주 8h → 1.5h</div>
  </div>
  <div class="card">
    <div class="num-pink">78%↓</div>
    <div class="label">신입 온보딩</div>
    <div style="font-size:0.75em; color:#888; margin-top:4px">2주 → 3일</div>
  </div>
  <div class="card">
    <div class="num">50%↑</div>
    <div class="label">스프린트 처리량</div>
    <div style="font-size:0.75em; color:#888; margin-top:4px">50 → 75 SP</div>
  </div>
</div>

<div class="card" style="text-align:center; background:linear-gradient(135deg,#dbeafe,#fce7f3); margin:0 60px">
  <div style="font-size:0.85em; color:#666">10인 팀 기준 연간</div>
  <div style="font-size:2em; font-weight:900; color:#1e3a5f">6,708시간 절감 = 3.4명분</div>
  <div style="font-size:0.85em; color:#666; margin-top:2px">💡 사람이 <strong>창의적인 일</strong>에 집중할 시간이 생깁니다</div>
</div>

---

<!-- _class: end -->

# 🤖 + 👨‍💼👩‍🎨👨‍💻🧑‍🔬 = ✨

반복은 AI에게, 창의는 사람에게

**RTB AI Hub**
