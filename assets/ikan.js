/* 아이칸 매뉴얼 사이트 공통 스크립트. 없어도 모든 내용은 읽힙니다. */
(function () {
  'use strict';
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* 저장 불가 환경 */ } }
  };
  var norm = function (s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
  var index = window.IKAN_INDEX || { programs: [], entries: [], synonyms: [] };

  /* 검색어 → 단어 목록(동의어 포함). 각 단어는 [원래 말, 같은 뜻...] */
  function terms(q) {
    return norm(q).split(' ').filter(Boolean).map(function (w) {
      var alts = [w];
      (index.synonyms || []).forEach(function (pair) {
        var a = pair[0].toLowerCase(), b = pair[1].toLowerCase();
        if (w.indexOf(a) >= 0) alts.push(w.replace(a, b));
        if (w.indexOf(b) >= 0) alts.push(w.replace(b, a));
      });
      return alts;
    });
  }
  function hits(text, ts) {
    var t = norm(text);
    return ts.every(function (alts) { return alts.some(function (a) { return t.indexOf(a) >= 0; }); });
  }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function markText(s, ts) {
    var out = esc(s);
    ts.forEach(function (alts) {
      alts.forEach(function (a) {
        if (!a) return;
        var re = new RegExp('(' + esc(a).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        out = out.replace(re, '<mark>$1</mark>');
      });
    });
    return out.replace(/<mark>(<mark>)+/g, '<mark>').replace(/(<\/mark>)+/g, '</mark>');
  }
  function snippet(text, ts) {
    var t = text.replace(/\s+/g, ' ');
    var low = t.toLowerCase(), at = -1;
    ts.some(function (alts) { return alts.some(function (a) { at = low.indexOf(a); return at >= 0; }); });
    var start = Math.max(0, at - 36);
    var s = (start > 0 ? '… ' : '') + t.slice(start, start + 150) + (t.length > start + 150 ? ' …' : '');
    return markText(s, ts);
  }

  /* '/' 키로 검색칸 */
  function slashFocus(input) {
    document.addEventListener('keydown', function (e) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || (document.activeElement && document.activeElement.isContentEditable)) return;
      e.preventDefault(); input.focus(); input.select();
    });
  }

  /* 다른 매뉴얼 메뉴: 바깥을 누르거나 Esc면 닫기 */
  document.querySelectorAll('.ik-apps').forEach(function (d) {
    document.addEventListener('click', function (e) { if (d.open && !d.contains(e.target)) d.open = false; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && d.open) { d.open = false; d.querySelector('summary').focus(); } });
  });

  /* ── 홈: 매뉴얼 전체 검색 ── */
  var q = document.getElementById('hub-q');
  if (q) {
    var box = document.getElementById('hub-results');
    var progs = {};
    index.programs.forEach(function (p) { progs[p.id] = p; });
    var run = function () {
      var ts = terms(q.value);
      if (!ts.length) { box.hidden = true; box.innerHTML = ''; return; }
      var found = [];
      index.entries.forEach(function (e) {
        var title = e[1] + ' ' + (e[2] || '');
        if (!hits(title + ' ' + e[4], ts)) return;
        var score = (hits(title, ts) ? 10 : 0) + (e[2] ? 0 : 1);
        found.push({ e: e, score: score });
      });
      found.sort(function (a, b) { return b.score - a.score; });
      var html = '<div class="hub-results-head"><span>' + (found.length ? '찾은 곳 ' + found.length + '개' + (found.length > 40 ? ' · 앞 40개 표시' : '') : '찾은 곳 없음') + '</span><span>Enter: 첫 결과 열기</span></div>';
      if (!found.length) {
        html += '<div class="none">일치하는 내용이 없습니다. 더 짧은 단어나 다른 표현으로 찾아보세요. 예: 싱크볼 → 씽크볼, 뒤턱 → 뒷턱</div>';
      } else {
        html += '<ol>' + found.slice(0, 40).map(function (f) {
          var e = f.e, p = progs[e[0]];
          var title = e[2] || e[1];
          return '<li><a href="' + esc(e[3]) + '"><img src="' + esc(p.icon) + '" alt=""><span><b>' + markText(title, ts) + '</b>' +
            '<span class="where">' + esc(p.name) + (e[2] ? ' · ' + esc(e[1]) : '') + '</span>' +
            '<span class="snip">' + snippet(e[4], ts) + '</span></span></a></li>';
        }).join('') + '</ol>';
      }
      box.innerHTML = html; box.hidden = false;
    };
    q.addEventListener('input', run);
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var a = box.querySelector('a'); if (a) { e.preventDefault(); window.location.href = a.getAttribute('href'); } }
      if (e.key === 'Escape') { q.value = ''; run(); }
    });
    document.querySelectorAll('[data-hint]').forEach(function (b) {
      b.addEventListener('click', function () { q.value = b.getAttribute('data-hint'); run(); q.focus(); });
    });
    slashFocus(q);
  }

  /* ── 매뉴얼 페이지 ── */
  var sheet = document.querySelector('.ik-sheet[data-manual]');
  if (!sheet) return;
  var key = 'ikan.manual.fs';

  /* 글자 크기 */
  var sizes = [14.5, 15.5, 16.5, 18, 19.5];
  var cur = Math.max(0, sizes.indexOf(parseFloat(store.get(key)) || 15.5));
  var apply = function () { document.documentElement.style.setProperty('--ik-fs', sizes[cur] + 'px'); };
  apply();
  document.querySelectorAll('[data-font]').forEach(function (b) {
    b.addEventListener('click', function () {
      cur = Math.min(sizes.length - 1, Math.max(0, cur + parseInt(b.getAttribute('data-font'), 10)));
      apply(); store.set(key, String(sizes[cur]));
    });
  });
  document.querySelectorAll('[data-print]').forEach(function (b) {
    b.addEventListener('click', function () { document.querySelectorAll('.ik-qa').forEach(function (d) { d.open = true; }); window.print(); });
  });
  window.addEventListener('beforeprint', function () { document.querySelectorAll('.ik-qa').forEach(function (d) { d.open = true; }); });

  /* 목차 현재 위치 */
  var links = [].slice.call(document.querySelectorAll('.ik-toc a[href^="#"]'));
  var map = {};
  links.forEach(function (a) { var t = document.getElementById(a.getAttribute('href').slice(1)); if (t) map[t.id] = a; });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && map[e.target.id]) {
          links.forEach(function (a) { a.removeAttribute('aria-current'); });
          map[e.target.id].setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-90px 0px -65% 0px' });
    Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
  }
  var tocBox = document.getElementById('toc-box');
  var narrow = window.matchMedia('(max-width:900px)');
  if (tocBox && narrow.matches) tocBox.removeAttribute('open');
  links.forEach(function (a) { a.addEventListener('click', function () { if (tocBox && narrow.matches) tocBox.removeAttribute('open'); }); });

  /* 이 매뉴얼에서 찾기: 일치하지 않는 장은 접고, 찾은 말은 표시 */
  var find = document.getElementById('find');
  if (!find) return;
  var state = document.getElementById('find-state');
  var empty = document.getElementById('find-empty');
  var chapters = [].slice.call(sheet.querySelectorAll('section.ik-chapter[data-chapter]'));
  var hideable = [].slice.call(sheet.querySelectorAll('.ik-div-chap, .ik-chapnav'));
  var clearMarks = function () {
    sheet.querySelectorAll('mark[data-find]').forEach(function (m) {
      var p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize();
    });
  };
  var markIn = function (root, ts) {
    var words = [];
    ts.forEach(function (alts) { alts.forEach(function (a) { if (a) words.push(a); }); });
    if (!words.length) return;
    var re = new RegExp('(' + words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode.closest('script,style,svg,mark');
        return p ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      if (!re.test(n.nodeValue)) { re.lastIndex = 0; return; }
      re.lastIndex = 0;
      var frag = document.createDocumentFragment(), last = 0, s = n.nodeValue, m;
      while ((m = re.exec(s))) {
        frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        var mk = document.createElement('mark'); mk.setAttribute('data-find', ''); mk.textContent = m[0]; frag.appendChild(mk);
        last = m.index + m[0].length;
      }
      frag.appendChild(document.createTextNode(s.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
  };
  var timer = null;
  var runFind = function () {
    clearMarks();
    var ts = terms(find.value);
    if (!ts.length) {
      chapters.forEach(function (c) { c.hidden = false; });
      hideable.forEach(function (h) { h.hidden = false; });
      links.forEach(function (a) { a.classList.remove('is-miss'); });
      state.textContent = ''; empty.hidden = true; return;
    }
    var n = 0;
    chapters.forEach(function (c) {
      var ok = hits(c.textContent, ts);
      c.hidden = !ok;
      var a = map[c.id]; if (a) a.classList.toggle('is-miss', !ok);
      if (ok) { n++; markIn(c, ts); c.querySelectorAll('.ik-qa').forEach(function (d) { if (hits(d.textContent, ts)) d.open = true; }); }
    });
    hideable.forEach(function (h) { h.hidden = true; });
    state.textContent = n ? n + '개 장에서 찾았습니다 · Esc로 지우기' : '';
    empty.hidden = n > 0;
  };
  find.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(runFind, 140); });
  find.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { find.value = ''; runFind(); }
    if (e.key === 'Enter') { var m = sheet.querySelector('mark[data-find]'); if (m) { e.preventDefault(); m.scrollIntoView({ block: 'center' }); } }
  });
  slashFocus(find);
  var params = new URLSearchParams(window.location.search);
  if (params.get('q')) { find.value = params.get('q'); runFind(); }
})();
