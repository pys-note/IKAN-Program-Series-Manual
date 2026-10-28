/* 아이칸 매뉴얼 · 직접 해 보기(시뮬레이터)
   각 체험은 해당 프로그램과 같은 규칙으로 계산합니다. 화면 안에서만 동작하며 실제 파일에는 영향이 없습니다.
   <figure class="ik-sim" data-sim="이름"> 안의 .ik-sim-body 를 채웁니다. */
(function () {
  'use strict';
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function prevBiz(d) { var x = new Date(d); do { x.setDate(x.getDate() - 1); } while (x.getDay() === 0 || x.getDay() === 6); return x; }
  function nextBiz(d) { var x = new Date(d); do { x.setDate(x.getDate() + 1); } while (x.getDay() === 0 || x.getDay() === 6); return x; }
  function kday(d) { return iso(d) + ' (' + WD[d.getDay()] + ')'; }
  function ymd(d) { return iso(d).replace(/-/g, ''); }
  function num(v, lo, hi, dflt) { var n = parseFloat(String(v).replace(',', '.')); if (!isFinite(n)) n = dflt; return Math.min(hi, Math.max(lo, n)); }
  function chips(list, cls) { return list.map(function (x, i) { return '<button type="button" class="ik-sim-chip ' + (cls || '') + '" data-i="' + i + '">' + esc(x.label) + '</button>'; }).join(''); }

  /* ── 포장 카운트: 출력 날짜 ─────────────────────────────── */
  function pkDates(body) {
    body.innerHTML = '<div class="sim-row"><label class="sim-field"><span>원본 시공일(공장출고일)</span><input type="date" value="2026-10-22" data-in></label>' +
      '<div class="sim-presets">' + chips([{ label: '목요일 시공 예' }, { label: '월요일 시공 예' }, { label: '화요일 시공 예' }]) + '</div></div>' +
      '<ol class="sim-chain" data-out></ol><p class="sim-note" data-note></p>';
    var input = body.querySelector('[data-in]'), out = body.querySelector('[data-out]'), note = body.querySelector('[data-note]');
    var presets = ['2026-10-22', '2026-10-19', '2026-10-20'];
    body.querySelectorAll('.ik-sim-chip').forEach(function (b) { b.addEventListener('click', function () { input.value = presets[+b.dataset.i]; run(); }); });
    function run() {
      var c = parse(input.value);
      if (!c) { out.innerHTML = ''; note.textContent = '날짜를 YYYY-MM-DD 형식으로 고르세요.'; return; }
      var g = prevBiz(c), p = prevBiz(g);
      out.innerHTML = [['포장일', p, '포장'], ['그레이박스 출고일 · 입고', g, '입고'], ['시공일 · 고객', c, '고객']].map(function (r, i) {
        return (i ? '<li class="sim-arrow" aria-hidden="true">← 1영업일 전</li>' : '') +
          '<li class="sim-card is-' + ['pack', 'in', 'cust'][i] + '"><small>' + r[0] + '</small><b>' + r[1].getDate() + '일 ' + r[2] + '</b><span>' + kday(r[1]) + '</span></li>';
      }).join('');
      var skipped = [];
      [[g, c], [p, g]].forEach(function (pair) { var x = new Date(pair[0]); x.setDate(x.getDate() + 1); while (x < pair[1]) { skipped.push(WD[x.getDay()]); x.setDate(x.getDate() + 1); } });
      note.innerHTML = (c.getDay() === 0 || c.getDay() === 6 ? '<b class="sim-warn">시공일이 주말입니다.</b> ' : '') +
        (skipped.length ? '사이의 ' + skipped.join('·') + '요일은 건너뛰었습니다. ' : '') +
        '저장 파일 이름: <code>포장카운트_' + ymd(p) + '.xlsx</code> · 공휴일·회사 휴무는 자동으로 빼지 않으니 직접 확인하세요.';
    }
    input.addEventListener('input', run); run();
  }

  /* ── 포장 카운트: 상판·뒷턱 계산 (packing_count.core.analyze 와 같은 규칙) ── */
  var CODE = /\b([A-Z]+)\s*(?:대표)?\s*\(/;
  var DIMS = /\(\s*(\d+(?:\.\d+)?)\s*[*xX×]\s*(\d+(?:\.\d+)?)\s*[*xX×]\s*(\d+(?:\.\d+)?)\s*[*xX×]\s*(\d+(?:\.\d+)?)\s+[A-Z]+\s*\)/;
  function packCount(product, qty) {
    var m = CODE.exec(product), d = DIMS.exec(product);
    if (!m || !d || Math.min(+d[1], +d[2]) <= 0) return { error: '제품코드와 양수 가로·세로 치수를 확인하세요. 예: 15 샌드크림 TWDN (2000*650*0*0 X)' };
    var code = m[1], w = d[1], ht = d[2], why = [];
    var separate = code.indexOf('TB') === 0, mult = code.indexOf('Z') >= 0 ? 2 : 1;
    var attached = code.charAt(0) === 'T' && code.indexOf('N') < 0 && code.indexOf('TB') !== 0 && code.indexOf('TPUB') !== 0;
    var corner = code.indexOf('C') >= 0, sizes = [];
    if (separate) why.push('TB로 시작 → 자체 뒷턱 파츠. 상판 0, 별도 뒷턱 = 수량');
    else if (mult === 2) why.push('코드에 Z → 분할 상판. 상판 = 수량 × 2');
    else why.push('일반 품목 → 상판 = 수량');
    if (attached) {
      sizes.push(w + '×50');
      if (corner) sizes.push(ht + '×50');
      why.push('T로 시작 · N 없음 · TB/TPUB 아님 → 부착 뒷턱 대상' + (corner ? ' (코드에 C → 코너: 가로 + 두 번째 치수)' : ' (가로 한 개)'));
      if (corner && +d[4] > 0) why.push('네 번째 치수 ' + d[4] + '은 뒷턱 길이로 읽지 않습니다');
    } else if (!separate) {
      why.push(code.charAt(0) !== 'T' ? 'T로 시작하지 않음 → 부착 뒷턱 없음' : code.indexOf('TPUB') === 0 ? 'TPUB 계열 → 부착 뒷턱 예외' : '코드에 N → 부착 뒷턱 없음');
    }
    return { code: code, tops: separate ? 0 : qty * mult, sep: separate ? qty : 0, att: sizes.length * qty, sizes: sizes, why: why, w: w, h: ht };
  }
  function pkCount(body) {
    var P = [
      { label: 'TCDUW 코너', p: '15 캄브리아 TCDUW (1840*660*0*700 R)', q: 1 },
      { label: 'TWDW 일반', p: '15 샌드크림 TWDW (1470*700*0*0 X)', q: 1 },
      { label: 'TBW 자체 뒷턱', p: '15 샌드크림 TBW (875*50*0*0 X)', q: 2 },
      { label: 'TWDN (N 있음)', p: '15 샌드크림 TWDN (2000*650*0*0 X)', q: 2 },
      { label: 'TPUBW', p: '15 캄브리아 TPUBW (1610*710*0*650 X)', q: 1 },
      { label: 'PPS 벽체', p: '15 샌드크림 PPS (2400*600*0*0 X)', q: 3 },
      { label: 'SBZU 분할', p: 'HE12 에덴[MATT] SBZU (2485*150*0*0 X)', q: 2 }
    ];
    body.innerHTML = '<div class="sim-row"><label class="sim-field is-grow"><span>제작사이즈(원본 제품명)</span><input type="text" data-p spellcheck="false"></label>' +
      '<label class="sim-field is-num"><span>수량</span><input type="number" min="1" max="999" value="1" data-q></label></div>' +
      '<div class="sim-presets"><span>예시</span>' + chips(P) + '</div><div class="sim-result" data-out aria-live="polite"></div>' +
      '<div class="sim-actions"><button type="button" class="sim-btn" data-add>집계 목록에 담기</button><button type="button" class="sim-btn is-ghost" data-clear>목록 비우기</button></div>' +
      '<div class="sim-tablewrap"><table class="sim-table"><thead><tr><th>품목</th><th>수량</th><th>상판</th><th>별도 뒷턱</th><th>부착 뒷턱</th></tr></thead><tbody data-rows><tr class="is-empty"><td colspan="5">위 품목을 담으면 8.5 합산 예시처럼 합계가 계산됩니다.</td></tr></tbody><tfoot data-foot></tfoot></table></div>';
    var p = body.querySelector('[data-p]'), q = body.querySelector('[data-q]'), out = body.querySelector('[data-out]');
    var rows = body.querySelector('[data-rows]'), foot = body.querySelector('[data-foot]'), list = [];
    p.value = P[0].p;
    body.querySelectorAll('.ik-sim-chip').forEach(function (b) { b.addEventListener('click', function () { p.value = P[+b.dataset.i].p; q.value = P[+b.dataset.i].q; run(); }); });
    function cur() { return packCount(p.value, Math.max(1, Math.round(num(q.value, 1, 999, 1)))); }
    function run() {
      var r = cur();
      if (r.error) { out.innerHTML = '<p class="sim-err">' + esc(r.error) + '</p>'; return; }
      out.innerHTML = '<div class="sim-stats"><span><small>제품코드</small><b>' + esc(r.code) + '</b></span><span><small>상판</small><b>' + r.tops + '</b></span>' +
        '<span><small>별도 뒷턱</small><b>' + r.sep + '</b></span><span><small>부착 뒷턱</small><b>' + r.att + '</b></span>' +
        '<span class="is-sum"><small>뒷턱 칸에 더해지는 수</small><b>' + (r.sep + r.att) + '</b></span></div>' +
        (r.sizes.length ? '<p class="sim-sizes">부착 뒷턱 ' + r.sizes.map(function (s) { return '<span>' + s + '</span>'; }).join('') + (+q.value > 1 ? ' × 수량 ' + Math.round(+q.value) : '') + '</p>' : '') +
        '<ul class="sim-why">' + r.why.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    }
    function draw() {
      if (!list.length) { rows.innerHTML = '<tr class="is-empty"><td colspan="5">위 품목을 담으면 8.5 합산 예시처럼 합계가 계산됩니다.</td></tr>'; foot.innerHTML = ''; return; }
      var t = [0, 0, 0];
      rows.innerHTML = list.map(function (x) { t[0] += x.r.tops; t[1] += x.r.sep; t[2] += x.r.att;
        return '<tr><td>' + esc(x.p) + '</td><td>' + x.q + '</td><td>' + x.r.tops + '</td><td>' + x.r.sep + '</td><td>' + x.r.att + '</td></tr>'; }).join('');
      foot.innerHTML = '<tr><th>합계</th><td></td><td>' + t[0] + '</td><td>' + t[1] + '</td><td>' + t[2] + '</td></tr>' +
        '<tr class="is-total"><th colspan="2">집계표에 들어가는 값</th><td>상판 ' + t[0] + '</td><td colspan="2">뒷턱 ' + t[1] + '+' + t[2] + ' = ' + (t[1] + t[2]) + '</td></tr>';
    }
    body.querySelector('[data-add]').addEventListener('click', function () { var r = cur(); if (r.error) return run(); list.push({ p: p.value, q: Math.round(num(q.value, 1, 999, 1)), r: r }); draw(); });
    body.querySelector('[data-clear]').addEventListener('click', function () { list = []; draw(); });
    p.addEventListener('input', run); q.addEventListener('input', run); run();
  }

  /* ── 작업지시서 관리자: 출고일과 저장 파일 이름 ───────────── */
  function woDates(body) {
    body.innerHTML = '<div class="sim-row"><label class="sim-field"><span>원본 공장출고일</span><input type="date" value="2026-10-19" data-in></label>' +
      '<div class="sim-presets">' + chips([{ label: '월요일 출고 예' }, { label: '수요일 출고 예' }]) + '</div></div><div class="sim-result" data-out aria-live="polite"></div>';
    var input = body.querySelector('[data-in]'), out = body.querySelector('[data-out]'), pre = ['2026-10-19', '2026-10-21'];
    body.querySelectorAll('.ik-sim-chip').forEach(function (b) { b.addEventListener('click', function () { input.value = pre[+b.dataset.i]; run(); }); });
    function run() {
      var f = parse(input.value); if (!f) { out.innerHTML = '<p class="sim-err">날짜를 고르세요.</p>'; return; }
      var g = prevBiz(f), n = nextBiz(g);
      out.innerHTML = '<div class="sim-stats"><span><small>원본 공장출고일</small><b>' + kday(f) + '</b></span><span><small>그레이박스 출고일 기본값</small><b>' + kday(g) + '</b></span>' +
        '<span class="is-sum"><small>저장 파일 이름</small><b class="is-mono">작업지시서_' + ymd(n) + '.xlsx</b></span></div>' +
        '<ul class="sim-why"><li>그레이박스 출고일 = 공장출고일 −1영업일 (토·일 제외)</li><li>파일 이름 날짜 = 그레이박스 출고일 +1영업일</li><li>공휴일은 자동으로 빼지 않습니다. 화면의 ‹ › 로 옮긴 뒤 [날짜 확인]을 체크하세요.</li></ul>';
    }
    input.addEventListener('input', run); run();
  }

  /* ── 작업지시서 관리자: 부분엣지 해석 ───────────────────── */
  function woPartial(body) {
    var P = [
      { label: '700 R', p: '15 샌드크림 TWDW (2000*740*0*700 R)' },
      { label: '700 L', p: '15 샌드크림 TWDW (2000*740*0*700 L)' },
      { label: '끝 X + 접합', p: '15 샌드크림 TWDW (2000*740*0*700 X)' },
      { label: '네 번째 0', p: '15 샌드크림 TWDW (2000*740*0*0 X)' }
    ];
    body.innerHTML = '<div class="sim-row"><label class="sim-field is-grow"><span>제작사이즈</span><input type="text" data-p spellcheck="false"></label>' +
      '<label class="sim-field"><span>표의 접합</span><select data-j><option value="">공백</option><option>L</option><option selected>R</option><option>B</option></select></label></div>' +
      '<div class="sim-presets"><span>예시</span>' + chips(P) + '</div><div class="sim-edge" data-out aria-live="polite"></div>';
    var p = body.querySelector('[data-p]'), j = body.querySelector('[data-j]'), out = body.querySelector('[data-out]');
    p.value = P[0].p;
    body.querySelectorAll('.ik-sim-chip').forEach(function (b) { b.addEventListener('click', function () { p.value = P[+b.dataset.i].p; run(); }); });
    var RE = /\(\s*(\d+(?:\.\d+)?)\s*\*\s*(\d+(?:\.\d+)?)\s*\*\s*(\d+(?:\.\d+)?)\s*\*\s*(\d+(?:\.\d+)?)\s+([A-Z]+)\s*\)/;
    function run() {
      var m = RE.exec(p.value);
      if (!m) { out.innerHTML = '<p class="sim-err">(가로*세로*0*길이 방향) 모양의 제작사이즈를 넣으세요. 예: (2000*740*0*700 R)</p>'; return; }
      var w = +m[1], d = +m[2], gap = +m[4], dir = m[5], why = [];
      if (dir === 'X') {
        if (gap > 0 && (j.value === 'L' || j.value === 'R')) { why.push('끝이 X이고 네 번째 수치가 있어 표의 접합 ' + j.value + '를 빈 구간 방향으로 읽습니다.'); dir = j.value; }
        else if (gap > 0) { why.push('끝이 X인데 표의 접합이 ' + (j.value || '공백') + '이라 방향을 정할 수 없습니다. 에디터에서 직접 확인하세요.'); dir = ''; }
      }
      if (!(gap > 0)) { why.push('네 번째 수치가 0 → 부분엣지 없음. 전면 전체에 엣지가 붙습니다.'); gap = 0; }
      if (gap >= w) { out.innerHTML = '<p class="sim-err">빈 길이(' + gap + ')가 가로(' + w + ') 이상입니다.</p>'; return; }
      if (gap && (dir === 'L' || dir === 'R')) why.unshift('전면 ' + (dir === 'R' ? '오른쪽' : '왼쪽') + ' ' + gap + 'mm를 비우고 나머지 ' + (w - gap) + 'mm에 엣지를 붙입니다.');
      var W = 520, H = Math.max(90, Math.min(220, W * d / w)), s = W / w, g = (dir === 'L' || dir === 'R') ? gap * s : 0;
      var ex = dir === 'L' ? g : 0, ew = W - g, gx = dir === 'R' ? W - g : 0;
      out.innerHTML = '<svg viewBox="-40 -34 ' + (W + 80) + ' ' + (H + 96) + '" role="img" aria-label="상판 평면도: 전면 엣지 ' + (w - gap) + 'mm' + (g ? ', 빈 구간 ' + gap + 'mm ' + (dir === 'R' ? '오른쪽' : '왼쪽') : '') + '">' +
        '<text x="' + W / 2 + '" y="-14" class="t-dim">' + w + '</text><text x="' + (W + 14) + '" y="' + H / 2 + '" class="t-dim" text-anchor="start">' + d + '</text>' +
        '<rect x="0" y="0" width="' + W + '" height="' + H + '" class="r-top"/>' +
        '<rect x="' + ex + '" y="' + (H - 9) + '" width="' + ew + '" height="9" class="r-edge"/>' +
        (g ? '<rect x="' + gx + '" y="' + (H - 9) + '" width="' + g + '" height="9" class="r-gap"/><text x="' + (gx + g / 2) + '" y="' + (H - 18) + '" class="t-gap">접합 ' + gap + ' ' + dir + '</text>' : '') +
        '<text x="' + W / 2 + '" y="' + (H + 30) + '" class="t-front">전면 (아랫변)</text></svg>' +
        '<ul class="sim-why">' + why.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '<li>다른 변의 엣지(엣지마감 위치 L·R 등)는 따로 판단합니다. 그림은 전면 엣지만 보여 줍니다.</li></ul>' +
        '<p class="sim-legend"><i class="lg-edge"></i>하늘색 엣지 <i class="lg-gap"></i>엣지 없는 구간</p>';
    }
    p.addEventListener('input', run); j.addEventListener('change', run); run();
  }

  /* ── 라벨 출력기: 장별 시작 칸 ─────────────────────────── */
  function lbStart(body) {
    body.innerHTML = '<div class="sim-row"><label class="sim-field is-num"><span>블루 라벨</span><input type="number" min="0" max="120" value="23" data-b></label>' +
      '<label class="sim-field is-num"><span>레드 라벨</span><input type="number" min="0" max="120" value="6" data-r></label>' +
      '<label class="sim-check"><input type="checkbox" checked data-split> 색상별 시트 나누기</label>' +
      '<button type="button" class="sim-btn is-ghost" data-reset>모두 처음 칸부터</button></div>' +
      '<p class="sim-hint">각 장에서 <b>시작할 칸을 클릭</b>하세요. 앞 칸은 "사용됨" 빗금이 되고, 밀려난 라벨은 다음 장으로 넘어갑니다.</p>' +
      '<div class="sim-sheets" data-out></div><p class="sim-note" data-note aria-live="polite"></p>';
    var bi = body.querySelector('[data-b]'), ri = body.querySelector('[data-r]'), sp = body.querySelector('[data-split]');
    var out = body.querySelector('[data-out]'), note = body.querySelector('[data-note]'), start = {};
    body.querySelector('[data-reset]').addEventListener('click', function () { start = {}; run(); });
    function run() {
      var b = Math.round(num(bi.value, 0, 120, 0)), r = Math.round(num(ri.value, 0, 120, 0));
      var groups = sp.checked ? [[b, 'b'], [r, 'r']] : [[b + r, 'm']], sheets = [];
      groups.forEach(function (g) {
        var left = g[0], made = 0, bn = 0, rn = 0;
        while (left > 0) {
          var idx = sheets.length, s0 = start[idx] || 1, cells = [];
          for (var c = 1; c <= 20; c++) {
            if (c < s0) cells.push({ used: true });
            else if (left > 0) {
              var color = g[1] === 'm' ? (made < b ? 'b' : 'r') : g[1];
              cells.push({ color: color, n: color === 'b' ? ++bn : ++rn }); left--; made++;
            } else cells.push({});
          }
          sheets.push({ start: s0, cells: cells });
        }
      });
      out.innerHTML = sheets.length ? sheets.map(function (s, i) {
        return '<div class="sim-sheet"><div class="sim-sheet-head"><b>' + (i + 1) + '매째</b>' +
          (s.start > 1 ? '<span>' + s.start + '번 칸부터</span><button type="button" data-clear="' + i + '">처음부터</button>' : '<span class="is-faint">1번 칸부터</span>') + '</div>' +
          '<div class="sim-grid">' + s.cells.map(function (c, k) {
            var cls = c.used ? 'is-used' : c.color ? 'is-' + c.color : 'is-free';
            return '<button type="button" class="sim-cell ' + cls + '" data-sheet="' + i + '" data-cell="' + (k + 1) + '" aria-label="' + (i + 1) + '매째 ' + (k + 1) + '번 칸' + (c.used ? ' 사용됨' : '') + '">' +
              '<small>' + (k + 1) + '</small>' + (c.used ? '<em>사용됨</em>' : c.color ? '<b>' + (c.color === 'b' ? '블루' : '레드') + ' ' + c.n + '</b>' : '') + '</button>';
          }).join('') + '</div></div>';
      }).join('') : '<p class="sim-note">라벨 수를 넣으면 라벨지 배치가 나옵니다.</p>';
      out.querySelectorAll('.sim-cell').forEach(function (el) { el.addEventListener('click', function () { var i = +el.dataset.sheet, c = +el.dataset.cell; if (c === 1) delete start[i]; else start[i] = c; run(); }); });
      out.querySelectorAll('[data-clear]').forEach(function (el) { el.addEventListener('click', function () { delete start[+el.dataset.clear]; run(); }); });
      var order = sheets.map(function (s) { return s.start > 1 ? s.start + '번부터 쓸 장' : '새 라벨지'; });
      var packed = []; order.forEach(function (o) { var last = packed[packed.length - 1]; if (last && last.o === o && o === '새 라벨지') last.n++; else packed.push({ o: o, n: 1 }); });
      note.innerHTML = sheets.length ? '라벨지 <b>' + sheets.length + '장</b>. 프린터에 넣는 순서: ' + packed.map(function (x) { return x.o + (x.n > 1 ? ' ' + x.n + '장' : ''); }).join(' → ') +
        (sp.checked && b && r ? '. 색상별로 나누면 레드는 새 장에서 시작합니다.' : '') : '';
    }
    [bi, ri].forEach(function (x) { x.addEventListener('input', run); }); sp.addEventListener('change', function () { start = {}; run(); }); run();
  }

  /* ── 라벨 출력기: 위치 보정 연습 ───────────────────────── */
  function lbOffset(body) {
    var CASES = [[-1.2, 0], [0.8, -0.6], [0, 1.5], [-0.5, -1.0], [1.4, 0.7]];
    body.innerHTML = '<div class="sim-row"><label class="sim-field is-num"><span>보정 X (mm)</span><input type="number" step="0.1" min="-10" max="10" value="0" data-x></label>' +
      '<label class="sim-field is-num"><span>보정 Y (mm)</span><input type="number" step="0.1" min="-10" max="10" value="0" data-y></label>' +
      '<button type="button" class="sim-btn is-ghost" data-next>다른 프린터로 해 보기</button><label class="sim-check"><input type="checkbox" data-hint> 힌트 보기</label></div>' +
      '<div class="sim-align" data-out></div><p class="sim-note" data-note aria-live="polite"></p>';
    var xi = body.querySelector('[data-x]'), yi = body.querySelector('[data-y]'), hint = body.querySelector('[data-hint]');
    var out = body.querySelector('[data-out]'), note = body.querySelector('[data-note]'), k = 0;
    body.querySelector('[data-next]').addEventListener('click', function () { k = (k + 1) % CASES.length; xi.value = 0; yi.value = 0; run(); });
    function dirText(v, pos, neg) { return Math.abs(v) < 0.05 ? '' : (v > 0 ? pos : neg) + ' ' + Math.abs(v).toFixed(1) + 'mm'; }
    function run() {
      var mis = CASES[k], cx = Math.round(num(xi.value, -10, 10, 0) * 10) / 10, cy = Math.round(num(yi.value, -10, 10, 0) * 10) / 10;
      var dx = Math.round((mis[0] + cx) * 10) / 10, dy = Math.round((mis[1] + cy) * 10) / 10, S = 7;
      var box = function (x, y, cls, txt) { return '<g class="' + cls + '" transform="translate(' + x + ',' + y + ')"><rect width="' + 50 * S + '" height="' + 38 * S + '" rx="' + 2 * S + '"/>' + (txt || '') + '</g>'; };
      var cross = '<path d="M' + 25 * S + ' ' + 9 * S + 'V' + 29 * S + 'M' + 15 * S + ' ' + 19 * S + 'H' + 35 * S + '"/><text x="' + 3 * S + '" y="' + 6 * S + '">1</text>';
      out.innerHTML = '<svg viewBox="-30 -30 ' + (50 * S + 60) + ' ' + (38 * S + 60) + '" role="img" aria-label="라벨 칼선과 테스트 인쇄 칸 비교">' +
        box(0, 0, 'g-cut') + box(dx * S, dy * S, 'g-print', cross) + '</svg>' +
        '<p class="sim-legend"><i class="lg-cut"></i>라벨 칼선 <i class="lg-print"></i>정렬 테스트로 찍힌 칸</p>';
      var ok = Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05;
      var state = [dirText(dx, '오른쪽으로', '왼쪽으로'), dirText(dy, '아래로', '위로')].filter(Boolean).join(', ');
      note.innerHTML = ok ? '<b class="sim-ok">칸에 딱 맞습니다.</b> 이 값(X ' + cx.toFixed(1) + ' · Y ' + cy.toFixed(1) + ')을 라벨 출력기 [보정 X] · [보정 Y]에 넣으면 됩니다.' :
        '지금 찍힌 칸이 칼선보다 <b>' + state + '</b> 밀려 있습니다.' +
        (hint.checked ? ' 힌트: 왼쪽으로 밀렸으면 X에 +, 오른쪽이면 −, 위로 밀렸으면 Y에 +, 아래면 −.' : '');
    }
    [xi, yi].forEach(function (x) { x.addEventListener('input', run); }); hint.addEventListener('change', run); run();
  }

  /* ── 라벨 출력기: 라벨 미리보기 ─────────────────────────── */
  function lbPreview(body) {
    var F = [['site', '現場名', '田畑邸(堺)'], ['item', 'ITEM', 'V'], ['color', '色', 'RU657'], ['size', 'SIZE', '1810*600'], ['room', '號室', '403'], ['no', 'No.', '2097-1']];
    body.innerHTML = '<div class="sim-form">' + F.map(function (f) { return '<label class="sim-field"><span>' + f[1] + '</span><input type="text" value="' + esc(f[2]) + '" data-f="' + f[0] + '" spellcheck="false"></label>'; }).join('') +
      '<label class="sim-field"><span>라벨 색</span><select data-c><option value="#00B0F0">블루</option><option value="#FF7C80">레드</option></select></label></div>' +
      '<div class="sim-label-stage" data-out></div><p class="sim-note">길게 쓰면 칸에 맞게 글자가 자동으로 작아집니다(4-3). 화면 설명용 미리보기이며 실제 인쇄 크기는 4-2와 같습니다.</p>';
    var out = body.querySelector('[data-out]'), col = body.querySelector('[data-c]');
    function v(k) { return esc(body.querySelector('[data-f="' + k + '"]').value); }
    function fit(el) { el.style.fontSize = ''; var size = parseFloat(getComputedStyle(el).fontSize); while (el.scrollWidth > el.clientWidth + 1 && size > 7) { size -= 0.5; el.style.fontSize = size + 'px'; } }
    function run() {
      out.innerHTML = '<div class="lb" style="--lb:' + col.value + '"><div class="lb-site"><span class="k">現場名</span><span class="v">' + v('site') + '</span></div>' +
        '<div class="lb-grid"><span class="k">ITEM</span><span class="k">色</span><span class="k">SIZE</span><span class="k">號室</span>' +
        '<span class="v">' + v('item') + '</span><span class="v">' + v('color') + '</span><span class="v">' + v('size') + '</span><span class="v">' + v('room') + '</span></div>' +
        '<div class="lb-foot"><span class="co">(주) 아이칸</span><span class="no">' + v('no') + '</span></div></div>';
      out.querySelectorAll('.v, .no').forEach(fit);
    }
    body.querySelectorAll('input, select').forEach(function (x) { x.addEventListener('input', run); x.addEventListener('change', run); }); run();
  }

  /* ── 도면 확대 인쇄: 배율과 용지 ───────────────────────── */
  function plScale(body) {
    var PAPER = { 'A4 가로': [297, 210], 'A4 세로': [210, 297], 'A3 가로': [420, 297], 'A3 세로': [297, 420] }, M = 6.35;
    body.innerHTML = '<div class="sim-row"><label class="sim-field is-num"><span>영역 가로 (mm)</span><input type="number" min="1" max="2000" value="113" data-w></label>' +
      '<label class="sim-field is-num"><span>영역 세로 (mm)</span><input type="number" min="1" max="2000" value="60" data-h></label>' +
      '<label class="sim-field is-num"><span>배율 (%)</span><input type="number" min="10" max="500" step="5" value="160" data-s></label>' +
      '<label class="sim-field"><span>용지</span><select data-p>' + Object.keys(PAPER).map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="sim-presets"><span>배율</span>' + chips([{ label: '100' }, { label: '130' }, { label: '160' }, { label: '200' }]) +
      '<label class="sim-check"><input type="checkbox" checked data-fit> 용지를 넘칠 때만 자동 축소</label></div>' +
      '<div class="sim-paper" data-out></div><p class="sim-note" data-note aria-live="polite"></p>';
    var wi = body.querySelector('[data-w]'), hi = body.querySelector('[data-h]'), si = body.querySelector('[data-s]'), pi = body.querySelector('[data-p]'), fi = body.querySelector('[data-fit]');
    var out = body.querySelector('[data-out]'), note = body.querySelector('[data-note]');
    body.querySelectorAll('.ik-sim-chip').forEach(function (b) { b.addEventListener('click', function () { si.value = b.textContent; run(); }); });
    function run() {
      var w = num(wi.value, 1, 2000, 113), h = num(hi.value, 1, 2000, 60), s = num(si.value, 10, 500, 160), pp = PAPER[pi.value];
      var aw = pp[0] - 2 * M, ah = pp[1] - 2 * M, pw = w * s / 100, ph = h * s / 100, over = pw > aw + 1e-9 || ph > ah + 1e-9;
      var eff = s;
      if (over && fi.checked) eff = Math.min(aw / w, ah / h) * 100;  /* 프로그램과 같이 내림 없이 계산, 이름표는 반올림 */
      var fw = w * eff / 100, fh = h * eff / 100, K = 300 / Math.max(pp[0], pp[1]);
      var rw = (over && !fi.checked ? pw : fw) * K, rh = (over && !fi.checked ? ph : fh) * K;
      out.innerHTML = '<svg viewBox="-20 -20 ' + (pp[0] * K + 40) + ' ' + (pp[1] * K + 40) + '" role="img" aria-label="용지 위 인쇄 영역 크기">' +
        '<rect class="p-sheet" width="' + pp[0] * K + '" height="' + pp[1] * K + '"/><rect class="p-safe" x="' + M * K + '" y="' + M * K + '" width="' + aw * K + '" height="' + ah * K + '"/>' +
        '<rect class="p-region' + (over && !fi.checked ? ' is-over' : over ? ' is-fit' : '') + '" x="' + (pp[0] * K - rw) / 2 + '" y="' + (pp[1] * K - rh) / 2 + '" width="' + rw + '" height="' + rh + '"/>' +
        '<text class="p-label" x="' + pp[0] * K / 2 + '" y="' + pp[1] * K / 2 + '">' + (over && fi.checked ? s + '→' + Math.round(eff) + '%' : over ? '용지 초과' : s + '%') + '</text></svg>' +
        '<p class="sim-legend"><i class="lg-safe"></i>인쇄 가능 범위(여백 6.35mm) <i class="lg-region"></i>인쇄 영역</p>';
      note.innerHTML = '원본 ' + Math.round(w) + '×' + Math.round(h) + 'mm → 인쇄 <b>' + Math.round(over && fi.checked ? fw : pw) + '×' + Math.round(over && fi.checked ? fh : ph) + 'mm</b> · ' + pi.value + ' 인쇄 가능 ' + aw.toFixed(1) + '×' + ah.toFixed(1) + 'mm. ' +
        (!over ? '<b class="sim-ok">용지 안에 들어갑니다.</b>' : fi.checked ? '<b class="sim-warn">넘쳐서 실제 약 ' + eff.toFixed(1) + '%로 자동 축소</b> (이름표에는 주황으로 ' + s + '→' + Math.round(eff) + '%).' :
          '<b class="sim-err-inline">용지 초과</b> — 자동 축소가 꺼져 있어 인쇄를 막습니다. 배율을 낮추거나 더 큰 용지를 고르세요.');
    }
    [wi, hi, si].forEach(function (x) { x.addEventListener('input', run); }); [pi, fi].forEach(function (x) { x.addEventListener('change', run); }); run();
  }

  /* ── 도면 확대 인쇄: 놓을 때마다 번호 +1 (프로그램 bump_number와 같은 규칙) ── */
  function bump(t) {
    var m = /(\d+)(?!.*\d)/.exec(t);
    if (!m) return t;
    var d = m[1], n;
    try { n = (BigInt(d) + BigInt(1)).toString(); } catch (e) { n = String(+d + 1); }
    while (n.length < d.length) n = '0' + n;
    return t.slice(0, m.index) + n + t.slice(m.index + d.length);
  }
  function plBump(body) {
    var P = ['24117', 'No. 009', 'A12-B03', 'No. 99', '메모'];
    body.innerHTML = '<div class="sim-row"><label class="sim-field is-grow"><span>작업번호 · 문구 입력칸</span><input type="text" value="24117" maxlength="40" data-t></label>' +
      '<label class="sim-field is-num"><span>놓는 횟수</span><input type="number" min="1" max="12" value="5" data-n></label>' +
      '<label class="sim-check"><input type="checkbox" checked data-on> 놓을 때마다 번호 +1</label></div>' +
      '<div class="sim-presets"><span>예시</span>' + chips(P.map(function (x) { return { label: x }; })) + '</div>' +
      '<ol class="sim-drops" data-out></ol><p class="sim-note" data-note aria-live="polite"></p>';
    var ti = body.querySelector('[data-t]'), ni = body.querySelector('[data-n]'), on = body.querySelector('[data-on]');
    var out = body.querySelector('[data-out]'), note = body.querySelector('[data-note]');
    body.querySelectorAll('.ik-sim-chip').forEach(function (b) { b.addEventListener('click', function () { ti.value = P[+b.dataset.i]; run(); }); });
    function run() {
      var t = ti.value, n = Math.round(num(ni.value, 1, 12, 5)), list = [];
      for (var i = 0; i < n; i++) { list.push(t); if (on.checked) t = bump(t); }
      out.innerHTML = list.map(function (x, i) { return '<li><small>' + (i + 1) + '번째 클릭</small><b>' + (esc(x) || '&nbsp;') + '</b></li>'; }).join('');
      var m = /(\d+)(?!.*\d)/.exec(ti.value);
      note.innerHTML = !on.checked ? '체크를 끄면 같은 문구가 계속 놓입니다.' :
        !m ? '<b class="sim-warn">숫자가 없는 문구</b>는 그대로 반복됩니다.' :
        '바뀌는 부분: 마지막 숫자 묶음 <code>' + esc(m[1]) + '</code>' + (m[1].length > 1 && m[1][0] === '0' ? ' · 앞자리 0을 살려 자리 수를 유지합니다.' : '') +
        ' 입력칸에는 다음에 놓일 <b>' + esc(t) + '</b>이(가) 남습니다.';
    }
    [ti, ni].forEach(function (x) { x.addEventListener('input', run); }); on.addEventListener('change', run); run();
  }

  /* ── 도면 확대 인쇄: 숫자키로 동그라미 번호 고르기 (1 다음 0.9초 안에 0~5 → ⑩~⑮) ── */
  function plNum(body) {
    var WAIT = 900, cur = 1, pend = 0, timer = null, raf = null;
    body.innerHTML = '<div class="sim-numpick" tabindex="0" aria-label="숫자키를 눌러 보세요" data-box>' +
      '<div class="sim-numnow"><span class="sim-circ is-big" data-now>1</span><div><small>지금 고른 번호</small><b data-what>①</b><i class="sim-numbar" aria-hidden="true"><i data-bar></i></i></div></div>' +
      '<div class="sim-numrow" data-row>' + Array.apply(null, Array(15)).map(function (_, i) { return '<span class="sim-circ" data-k="' + (i + 1) + '">' + (i + 1) + '</span>'; }).join('') + '</div>' +
      '<div class="sim-keys" role="group" aria-label="숫자키">' + '1234567890'.split('').map(function (k) { return '<button type="button" class="sim-key" data-key="' + k + '">' + k + '</button>'; }).join('') + '</div></div>' +
      '<p class="sim-note" data-note aria-live="polite">위 버튼을 누르거나, 상자를 클릭한 뒤 키보드 숫자키를 눌러 보세요. 예: <b>1</b> 다음 바로 <b>2</b> → ⑫</p>';
    var box = body.querySelector('[data-box]'), now = body.querySelector('[data-now]'), what = body.querySelector('[data-what]');
    var bar = body.querySelector('[data-bar]'), note = body.querySelector('[data-note]');
    var C = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮';
    function show(msg) {
      now.textContent = cur; what.textContent = C[cur - 1];
      body.querySelectorAll('[data-k]').forEach(function (x) { x.classList.toggle('is-on', +x.dataset.k === cur); });
      if (msg) note.innerHTML = msg;
    }
    function startWait() {
      pend = Date.now(); clearTimeout(timer); cancelAnimationFrame(raf);
      (function tick() { var r = Math.max(0, 1 - (Date.now() - pend) / WAIT); bar.style.width = (r * 100) + '%'; if (r > 0) raf = requestAnimationFrame(tick); })();
      timer = setTimeout(function () { pend = 0; bar.style.width = '0'; }, WAIT);
    }
    function press(k) {
      var d = +k, waiting = pend && Date.now() - pend <= WAIT;
      clearTimeout(timer); cancelAnimationFrame(raf); bar.style.width = '0';
      if (waiting && d <= 5) { pend = 0; cur = 10 + d; show('<b>1</b> → <b>' + k + '</b> (0.9초 안) = <b>' + C[cur - 1] + '</b>'); return; }
      pend = 0;
      if (d === 0) { show('단독 <b>0</b>은 번호를 바꾸지 않습니다. ⑩은 <b>1</b> → <b>0</b>.'); return; }
      cur = d;
      if (d === 1) { show('<b>①</b> 선택 · 0.9초 안에 <b>0~5</b>를 누르면 ⑩~⑮로 바뀝니다.'); startWait(); return; }
      show('<b>' + C[cur - 1] + '</b> 선택' + (waiting ? ' (6~9는 새 번호로 처리)' : '') + '.');
    }
    body.querySelectorAll('[data-key]').forEach(function (b) { b.addEventListener('click', function () { press(b.dataset.key); }); });
    box.addEventListener('keydown', function (e) { if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); } });
    show();
  }

  var SIMS = { 'pk-dates': pkDates, 'pk-count': pkCount, 'wo-dates': woDates, 'wo-partial': woPartial, 'lb-start': lbStart, 'lb-offset': lbOffset, 'lb-preview': lbPreview, 'pl-scale': plScale, 'pl-bump': plBump, 'pl-num': plNum };
  document.querySelectorAll('.ik-sim[data-sim]').forEach(function (fig) {
    var fn = SIMS[fig.getAttribute('data-sim')], body = fig.querySelector('.ik-sim-body');
    if (!fn || !body) return;
    try { fn(body); fig.classList.add('is-ready'); } catch (err) { body.innerHTML = '<p class="sim-err">체험 화면을 불러오지 못했습니다.</p>'; }
  });
  window.IKAN_SIM = { packCount: packCount, prevBiz: prevBiz, nextBiz: nextBiz };
})();
