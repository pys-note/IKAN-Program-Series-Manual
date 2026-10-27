"""아이칸 프로그램 매뉴얼 사이트 만들기.

    python build.py            → docs/ 에 사이트 생성 (GitHub Pages: main 브랜치 /docs)
    python build.py --check    → 생성 후 링크·앵커 검사만 (오류면 종료 코드 1)

원본: src/programs.json (프로그램 목록) + src/manuals/ (매뉴얼 원본 .md 또는 .html)
필요: pip install -r requirements.txt  (markdown, beautifulsoup4)
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import re
import shutil
import sys
from pathlib import Path

import markdown
from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'src'
OUT = ROOT / 'docs'
ASSETS = ROOT / 'assets'
PRETENDARD = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css'
TODAY = dt.date.today().isoformat()

# ── 아이콘 (선 굵기 2, 24칸) ─────────────────────────────────────────────────
ICON = {
    'info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    'tip': '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3z"/>',
    'caution': '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
    'danger': '<path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z"/><path d="M12 8v5M12 16h.01"/>',
    'home': '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
    'grid': '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>',
    'print': '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    'search': '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    'arrow': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'version': '<path d="M4 7h16M4 12h10M4 17h7"/>',
    'chat': '<path d="M4 5h16v11H9l-5 4z"/>',
}
def svg(name, cls=''):
    c = f' class="{cls}"' if cls else ''
    return (f'<svg{c} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
            f'stroke-linejoin="round" aria-hidden="true">{ICON[name]}</svg>')

NOTE_KIND = {'info': ('', '참고'), 'tip': (' is-tip', '팁'), 'caution': (' is-caution', '주의'), 'danger': (' is-danger', '위험')}

DIV_DIM = ('<div class="ik-div ik-div-dim" role="separator" aria-label="아이칸 주식회사"><i class="ik-div-tick"></i>'
           '<svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true"><path d="M0 5 L12 0.8 V9.2 Z"/></svg><i class="ik-div-line"></i>'
           '<span class="ik-div-label"><span class="ik-div-ko">아이칸 주식회사</span><span class="ik-div-en">IKAN CO., LTD.</span></span>'
           '<i class="ik-div-line"></i><svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true"><path d="M12 5 L0 0.8 V9.2 Z"/></svg><i class="ik-div-tick"></i></div>')
DIV_EDGE = ('<div class="ik-div ik-div-edge ik-div-chap" role="separator">'
            '<svg viewBox="0 0 16 16" fill="none" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M1 15 V9 A8 8 0 0 1 9 1 H15"/></svg>'
            '<i class="ik-div-line"></i><i class="ik-div-bar"></i><span class="ik-div-mark">IKAN</span><i class="ik-div-bar"></i><i class="ik-div-line"></i>'
            '<svg viewBox="0 0 16 16" fill="none" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M15 15 V9 A8 8 0 0 0 7 1 H1"/></svg></div>')
DIV_STAMP = ('<div class="ik-div ik-div-stamp" role="separator" aria-label="검수 완료"><span class="ik-div-layers is-left"><i></i><i></i><i></i></span>'
             '<span class="ik-stamp"><span><b>검수</b><small>IKAN</small></span></span><span class="ik-div-layers is-right"><i></i><i></i><i></i></span></div>')

def e(s):
    return html.escape(str(s), quote=True)


def slug(text):
    """GitHub와 같은 제목 앵커: 소문자, 글자·숫자·공백·-·_만 남기고 공백은 -."""
    t = text.strip().lower()
    t = re.sub(r'[^\w\- ]', '', t)
    return t.replace(' ', '-')


# ── 글 안의 화면 이름·단축키 표기 ─────────────────────────────────────────────
NAMED = r'(?:Ctrl|Shift|Alt|Win|Enter|Tab|Esc|Space|Delete|Del|Backspace|Home|End|PgUp|PgDn|Insert|F(?:1[0-2]|[1-9]))'
KEY = rf'(?:{NAMED}|[A-Z0-9]|↑|↓|←|→|,|\.|/|\[|\])'
COMBO = rf'{KEY}(?:\s?\+\s?{KEY})*'
COMBOS = re.compile(rf'^\s*{COMBO}(?:\s*/\s*{COMBO})*\s*$')
HAS_NAMED = re.compile(rf'\b{NAMED}\b')


def is_keys(text, mode):
    if not COMBOS.match(text):
        return False
    if mode == 'all':
        return True
    return bool(HAS_NAMED.search(text)) or text.strip() in ('↑ / ↓', '↑', '↓')


def keys_html(text):
    parts = re.split(r'(\s*/\s*)', text.strip())
    out = []
    for p in parts:
        if re.fullmatch(r'\s*/\s*', p):
            out.append(' / ')
            continue
        tokens = re.split(r'\s?\+\s?', p) if not p.endswith('+') else [p]
        out.append('+'.join(f'<kbd>{e(t)}</kbd>' for t in tokens if t))
    return ''.join(out)


def replace_with(soup, node, markup):
    frag = BeautifulSoup(markup, 'html.parser')
    node.replace_with(*list(frag.contents))


def inline_marks(soup, root, code_keys, brackets=True):
    # **[버튼]** / [버튼] → 화면 이름 칩 (링크가 아닌 대괄호)
    for st in list(root.find_all(['strong', 'b'])):
        t = st.get_text()
        if re.fullmatch(r'\s*\[[^\[\]\n]{1,30}\]\s*', t) and not st.find('a'):
            replace_with(soup, st, f'<span class="ik-ui">{e(t.strip()[1:-1])}</span>')
        elif is_keys(t, 'combo') and not st.find(True):
            replace_with(soup, st, keys_html(t))
    for code in list(root.find_all('code')):
        if code.parent and code.parent.name == 'pre':
            continue
        t = code.get_text()
        if is_keys(t, code_keys):
            replace_with(soup, code, keys_html(t))
    for td in root.find_all(['td']):
        if not td.find(True) and is_keys(td.get_text(), 'combo'):
            inner = keys_html(td.get_text())
            td.clear()
            for n in list(BeautifulSoup(inner, 'html.parser').contents):
                td.append(n)
    for text in list(root.find_all(string=True)):
        if text.parent.name in ('code', 'pre', 'a', 'kbd', 'script', 'style') or text.find_parent(['pre', 'a', 'kbd', 'code']):
            continue
        s = str(text)
        if not brackets or '[' not in s:
            continue
        new = re.sub(r'\[([^\[\]\n]{1,30})\](?!\()', lambda m: f'<span class="ik-ui">{e(m.group(1))}</span>', e(s))
        if new != e(s):
            replace_with(soup, text, new)


def note_html(kind, title, body_nodes):
    cls, word = NOTE_KIND[kind]
    label = f'{word} · {e(title)}' if title and title != word else word
    inner = ''.join(str(n) for n in body_nodes)
    return f'<div class="ik-note{cls}"><p class="ik-note-tag">{svg(kind)}{label}</p>{inner}</div>'


def steps_html(ol):
    items = []
    for li in ol.find_all('li', recursive=False):
        inner = ''.join(str(c) for c in li.contents).strip()
        if not inner.startswith('<p'):
            inner = f'<p>{inner}</p>' if not re.search(r'<(ul|ol|div|table|pre)', inner) else inner
        items.append(f'<li><div>{inner}</div></li>')
    start = ol.get('start')
    st = f' start="{e(start)}" style="counter-reset:ik-step {int(start) - 1}"' if start and str(start).isdigit() and int(start) > 1 else ''
    return f'<ol class="ik-steps is-plain"{st}>{"".join(items)}</ol>'


# ── Markdown 매뉴얼 ──────────────────────────────────────────────────────────
def prepare_md(text):
    """목록이 문단 바로 아래에 붙어 있어도 목록으로 읽히게 빈 줄을 넣는다(코드 블록 제외)."""
    out, fence, prev = [], False, ''
    for line in text.replace('\r\n', '\n').split('\n'):
        if line.strip().startswith('```'):
            fence = not fence
        is_item = re.match(r'^(\s*)([-*]|\d+\.)\s+', line)
        prev_item = re.match(r'^(\s*)([-*]|\d+\.)\s+', prev)
        if not fence and is_item and prev.strip() and not prev_item and not prev.startswith((' ', '\t', '|', '>')) and not is_item.group(1):
            out.append('')
        # 인용문 안에서도: > **제목** 바로 아래 > - 목록
        q_item = re.match(r'^>\s*([-*]|\d+\.)\s+', line)
        q_prev = re.match(r'^>\s*(\S.*)$', prev)
        if not fence and q_item and q_prev and not re.match(r'^([-*]|\d+\.)\s+', q_prev.group(1)):
            out.append('>')
        # 1840*660*0*700 같은 치수의 * 가 기울임으로 바뀌지 않게 (`코드` 안은 그대로)
        if not fence and re.search(r'\d\*\d', line):
            segs = line.split('`')
            for i in range(0, len(segs), 2):
                segs[i] = re.sub(r'(?<=\d)\*(?=\d)', r'\\*', segs[i])
            line = '`'.join(segs)
        # 목록 안에 3칸 들여 쓴 표·코드를 4칸으로 (python-markdown 규칙)
        if not fence and re.match(r'^ {3}(\||```)', line):
            line = ' ' + line
        out.append(line)
        prev = line
    return '\n'.join(out)


def read_figure(name):
    return (SRC / 'figures' / name).read_text(encoding='utf-8-sig')


def figure_rules(prog):
    """programs.json의 figures → (코드 블록 교체 규칙, 장 앞머리에 넣을 그림).
    ["코드 블록 속 말", "파일.html"]       코드 블록(글자 그림)을 그림으로 교체
    {"find": "코드 블록 속 말", "file": …}  위와 같음
    {"start": "장 id", "file": …}           그 장 본문 맨 앞에 그림 삽입"""
    finds, starts = [], {}
    for f in prog.get('figures', []):
        if isinstance(f, dict):
            if f.get('start'):
                starts.setdefault(f['start'], []).append(f['file'])
            elif f.get('find'):
                finds.append((f['find'], f['file']))
        else:
            finds.append((f[0], f[1]))
    return finds, starts


def figure_for(code_text, finds):
    for needle, name in finds:
        if needle in code_text:
            return read_figure(name)
    return None


def info_from_bold(p):
    """**기준 버전: 0.1.11** 처럼 굵은 '이름: 값' 줄만으로 된 문단 → [(이름, 값)]"""
    strongs = p.find_all('strong', recursive=False)
    if not strongs:
        return None
    rest = ''.join(str(c) for c in p.contents if not (isinstance(c, Tag) and c.name in ('strong', 'br')))
    if rest.strip():
        return None
    out = []
    for st in strongs:
        t = st.get_text(' ', strip=True)
        if ':' not in t:
            return None
        k, v = t.split(':', 1)
        out.append((k.strip(), v.strip()))
    return out


def lone_anchor(n):
    """<a id="setup"></a> 만 있는 문단이면 그 id"""
    if not (isinstance(n, Tag) and n.name == 'p' and not n.get_text(strip=True)):
        return None
    a = n.find('a', id=True)
    return a['id'] if a and len(n.find_all(True)) == 1 else None


def blockquote_title(bq):
    """> **주의:** 본문  또는  > **제목**(줄바꿈) 본문  → 제목을 떼어 돌려준다."""
    first = bq.find(['p', 'ol', 'ul'])
    if not (first and first.name == 'p' and first.contents and getattr(first.contents[0], 'name', None) == 'strong'):
        return ''
    st = first.contents[0]
    lead = st.get_text().strip()
    nxt = st.next_sibling
    while isinstance(nxt, NavigableString) and not nxt.strip():
        nxt = nxt.next_sibling
    if lead.endswith((':', '：')):
        title = lead.rstrip(':：').strip()
    elif nxt is None or (isinstance(nxt, Tag) and nxt.name == 'br'):
        title = lead
        if isinstance(nxt, Tag):
            nxt.extract()
    else:
        return ''
    st.extract()
    if first.contents and isinstance(first.contents[0], NavigableString):
        first.contents[0].replace_with(first.contents[0].lstrip())
    if not first.get_text(strip=True) and not first.find(True):
        first.extract()
    return title


def checklists(box):
    """- [ ] 항목 목록 → 체크 상자 목록"""
    for ul in box.find_all('ul'):
        lis = ul.find_all('li', recursive=False)
        if lis and all(re.match(r'^\s*\[[ xX]\]', li.get_text()) for li in lis):
            ul['class'] = ['ik-check']
            for li in lis:
                for t in li.find_all(string=True):
                    if re.match(r'^\s*\[[ xX]\]\s*', t):
                        t.replace_with(re.sub(r'^\s*\[[ xX]\]\s*', '', t))
                        break
                wrap = BeautifulSoup('<span></span>', 'html.parser').span
                for c in list(li.contents):
                    wrap.append(c.extract())
                li.append(wrap)


def is_question(text):
    t = text.strip()
    return t.endswith(('?', '요', '요.', '다', '다.', '니까'))


def faq_headings(soup, box):
    """문제 해결 장의 '### 질문 제목' + 아래 내용 → 질문 상자 (질문이 아닌 제목은 그대로)"""
    for h in list(box.find_all('h2')):
        if not is_question(h.get_text()):
            continue
        parts = []
        sib = h.next_sibling
        while sib is not None and not (isinstance(sib, Tag) and sib.name in ('h2', 'h3')):
            nx = sib.next_sibling
            parts.append(sib.extract())
            sib = nx
        body = ''.join(str(x) for x in parts if not (isinstance(x, NavigableString) and not x.strip()))
        replace_with(soup, h, f'<details class="ik-qa" id="{e(h.get("id", ""))}"><summary>{h.decode_contents()}</summary>'
                              f'<div class="ik-qa-a"><div>{body}</div></div></details>')


def md_manual(prog):
    text = (SRC / prog['source']).read_text(encoding='utf-8-sig')
    body = markdown.markdown(prepare_md(text), extensions=['tables', 'fenced_code', 'sane_lists'], output_format='html')
    soup = BeautifulSoup(body, 'html.parser')
    nodes = [n for n in soup.contents if not (isinstance(n, NavigableString) and not n.strip())]
    finds, starts = figure_rules(prog)
    info, intro, chapters, cur = [], [], [], None
    skipping, anchor = False, None
    for n in nodes:
        if isinstance(n, Tag) and n.name in ('h1', 'hr'):
            continue
        aid = lone_anchor(n)
        if aid:
            anchor = aid
            continue
        if not chapters and isinstance(n, Tag):
            if n.name == 'blockquote' and not info and n.find('li') and all(':' in li.get_text() for li in n.find_all('li')):
                for li in n.find_all('li'):
                    k, v = li.get_text(' ', strip=True).split(':', 1)
                    info.append((k.strip(), v.strip()))
                continue
            if n.name == 'p' and not intro and info_from_bold(n):
                info.extend(info_from_bold(n))
                continue
        if isinstance(n, Tag) and n.name == 'h2':
            title = n.get_text(' ', strip=True)
            if title.replace(' ', '') == '목차':
                skipping, cur, anchor = True, None, None
                continue
            skipping = False
            m = re.match(r'^(\d+)\.\s*(.+)$', title)
            cur = {'id': anchor or slug(n.get_text()), 'num': m.group(1) if m else str(len(chapters) + 1),
                   'title': m.group(2) if m else title, 'lead': '', 'nodes': []}
            anchor = None
            chapters.append(cur)
            continue
        if skipping:
            continue
        (intro if cur is None else cur['nodes']).append(n)

    used = set()

    def uniq(i):
        base, k = i, 0
        while i in used:
            k += 1
            i = f'{base}-{k}'
        used.add(i)
        return i

    for ch in chapters:
        ch['id'] = uniq(ch['id'])

    def render(nodes, faq=False, start_figs=()):
        frag = BeautifulSoup('<div id="__c"></div>', 'html.parser')
        box = frag.find(id='__c')
        for name in start_figs:
            for x in list(BeautifulSoup(read_figure(name), 'html.parser').contents):
                box.append(x)
        for n in nodes:
            box.append(n)
        for h in box.find_all(['h3', 'h4']):
            h['id'] = uniq(slug(h.get_text()))
            h.name = 'h2' if h.name == 'h3' else 'h3'
        checklists(box)
        for bq in list(box.find_all('blockquote')):
            prev = bq.find_previous(['h2', 'h3'])
            last_heading = prev.get_text() if prev else ''
            title = blockquote_title(bq)
            t = (title + ' ' + bq.get_text()).strip()
            if '사용 예' in last_heading or t.startswith('예'):
                replace_with(frag, bq, f'<div class="ik-example"><span class="ik-example-tag">예시</span>{"".join(str(c) for c in bq.contents)}</div>')
                continue
            kind = 'caution' if re.search(r'주의|경고|중요', title) else 'tip' if re.search(r'활용|팁|권장', title) else 'info'
            replace_with(frag, bq, note_html(kind, title, bq.contents))
        for pre in list(box.find_all('pre')):
            fig = figure_for(pre.get_text(), finds)
            if fig:
                replace_with(frag, pre, fig)
            else:
                pre['class'] = pre.get('class', []) + ['ik-pre']
        for tbl in list(box.find_all('table')):
            if tbl.parent.name == 'div' and 'ik-table' in tbl.parent.get('class', []):
                continue
            tbl.wrap(frag.new_tag('div', attrs={'class': 'ik-table'}))
        for ol in list(box.find_all('ol')):
            if ol.find_parent(['li', 'td', 'blockquote', 'figure']) or ol.find_parent('div', class_='ik-note') or ol.find_parent('div', class_='ik-example'):
                continue
            replace_with(frag, ol, steps_html(ol))
        if faq:
            faq_groups(frag, box)
            faq_headings(frag, box)
        inline_marks(frag, box, prog.get('code_keys', 'combo'), prog.get('ui_brackets', True))
        return box.decode_contents()

    out = []
    for ch in chapters:
        low = ch['title'].lower()
        faq = 'faq' in low or '문제 해결' in low or '자주 묻는' in low
        out.append({'id': ch['id'], 'eyebrow': f'CHAPTER {int(ch["num"]):02d}', 'num': f'{int(ch["num"]):02d}',
                    'title': ch['title'], 'lead': ch['lead'], 'html': render(ch['nodes'], faq, starts.get(ch['id'], ()))})
    return {'info': info, 'intro': render(intro) if intro else '', 'chapters': out}


def faq_groups(soup, box):
    """**Q. …** 문단부터 다음 질문 전까지를 질문·답 상자로 묶는다."""
    children = [c for c in box.contents if not (isinstance(c, NavigableString) and not c.strip())]
    groups, cur = [], None
    for c in children:
        strong = c.find('strong') if isinstance(c, Tag) and c.name == 'p' else None
        if strong and c.contents and c.contents[0] is strong and strong.get_text().strip().startswith('Q.'):
            q = strong.get_text().strip()[2:].strip()
            strong.extract()
            rest = c.decode_contents().strip()
            rest = re.sub(r'^(<br\s*/?>|\s)+', '', rest)
            rest = re.sub(r'^A\.\s*', '', rest)
            cur = {'q': q, 'a': [f'<p>{rest}</p>'] if rest else [], 'node': c}
            groups.append(cur)
        elif cur is not None and isinstance(c, Tag) and c.name not in ('h2', 'h3'):
            cur['a'].append(str(c))
            c.extract()
        else:
            cur = None
    for g in groups:
        replace_with(soup, g['node'], f'<details class="ik-qa"><summary>{e(g["q"])}</summary><div class="ik-qa-a"><div>{"".join(g["a"])}</div></div></details>')


# ── HTML 매뉴얼 (작업지시서 관리자) ───────────────────────────────────────────
def html_manual(prog):
    src = BeautifulSoup((SRC / prog['source']).read_text(encoding='utf-8-sig'), 'html.parser')
    main = src.find('main')
    out = []
    for sec in main.find_all('section', class_='chapter'):
        head = sec.find('header', class_='chapter-head')
        no = head.find(class_='chapter-no').get_text(strip=True)
        title = head.find(['h2', 'h1']).get_text(' ', strip=True)
        desc = head.find(class_='chapter-desc')
        lead = desc.get_text(' ', strip=True) if desc else ''
        head.decompose()
        for nav in sec.find_all('nav', class_='chapter-nav'):
            nav.decompose()
        n = 0
        for h in sec.find_all(['h3', 'h4']):
            if h.find_parent(class_='lead-card'):
                continue
            n += 1
            h['id'] = h.get('id') or f'{sec["id"]}-{n}'
            h.name = 'h2' if h.name == 'h3' else 'h3'
        for card in list(sec.find_all('div', class_='lead-card')):
            eb = card.find(class_='eyebrow')
            ht = card.find(['h3', 'h2'])
            body = ''.join(str(p) for p in card.find_all('p'))
            replace_with(src, card, f'<div class="ik-intro"><small>{e(eb.get_text(strip=True)) if eb else ""}</small><b>{e(ht.get_text(" ", strip=True)) if ht else ""}</b>{body}</div>')
        for tw in sec.find_all('div', class_='table-wrap'):
            tw['class'] = ['ik-table']
        for co in list(sec.find_all('aside', class_='callout')):
            kind = 'caution' if 'important' in co.get('class', []) else 'info'
            st = co.find('strong', recursive=False)
            note_title = st.get_text(' ', strip=True) if st else ''
            if st:
                st.extract()
            replace_with(src, co, note_html(kind, note_title, co.contents))
        for ex in list(sec.find_all('div', class_='example')):
            b = ex.find('b', recursive=False)
            tag = b.get_text(strip=True) if b else '예시'
            if b:
                b.extract()
            inner = ex.decode_contents().strip()
            inner = re.sub(r'^(<br\s*/?>)+', '', inner)
            replace_with(src, ex, f'<div class="ik-example"><span class="ik-example-tag">{e(tag)}</span>{inner}</div>')
        for lg in list(sec.find_all('div', class_='legend')):
            items = ''.join(f'<li><i style="{e(s.find("i").get("style", ""))}"></i>{e(s.get_text(" ", strip=True))}</li>' for s in lg.find_all('span', recursive=False))
            replace_with(src, lg, f'<ul class="ik-swatch">{items}</ul>')
        for fm in list(sec.find_all('figure', class_='workspace-map')):
            top = fm.find(class_='map-top')
            right = top.find('span')
            r = right.get_text(' ', strip=True) if right else ''
            if right:
                right.extract()
            cols = ''
            for d in fm.find(class_='map-columns').find_all('div', recursive=False):
                b, s, sm = d.find('b'), d.find('strong'), d.find('small')
                cols += (f'<div><em>{e(b.get_text(strip=True)) if b else ""}</em><b>{e(s.get_text(" ", strip=True)) if s else ""}</b>'
                         f'<small>{sm.decode_contents() if sm else ""}</small></div>')
            bottom = fm.find(class_='map-bottom')
            cap = fm.find('figcaption')
            replace_with(src, fm, f'<figure class="ik-map"><div class="ik-map-win"><div class="ik-map-row is-top">{e(top.get_text(" ", strip=True))}<span class="r">{e(r)}</span></div>'
                                  f'<div class="ik-map-cols" style="grid-template-columns:1fr 1.4fr 1fr">{cols}</div>'
                                  f'<div class="ik-map-row is-bottom">{e(bottom.get_text(" ", strip=True)) if bottom else ""}</div></div>'
                                  f'{"<figcaption>" + e(cap.get_text(" ", strip=True)) + "</figcaption>" if cap else ""}</figure>')
        for ol in list(sec.find_all('ol')):
            if ol.find_parent(['li', 'td']) or ol.find_parent('div', class_=['ik-note', 'ik-example']):
                continue
            replace_with(src, ol, steps_html(ol))
        for ul in sec.find_all('ul', class_='checklist'):
            ul['class'] = ['ik-check']
        for t in sec.find_all('span', class_='tag'):
            t['class'] = ['ik-new']
        for p in sec.find_all(class_='muted'):
            p['class'] = ['ik-small']
        for tag in sec.find_all(True):
            if tag.has_attr('aria-labelledby'):
                del tag['aria-labelledby']
        num = re.search(r'\d+', no).group(0)
        out.append({'id': sec['id'], 'eyebrow': no, 'num': f'{int(num):02d}', 'title': title, 'lead': lead, 'html': sec.decode_contents()})
    return {'info': [], 'chapters': out}


# ── 페이지 틀 ────────────────────────────────────────────────────────────────
def head(title, desc, rel, icon, css_v):
    return (f'<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
            f'<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            f'<title>{e(title)}</title>\n<meta name="description" content="{e(desc)}">\n'
            f'<link rel="icon" href="{rel}assets/icons/{icon}">\n'
            f'<link rel="stylesheet" href="{PRETENDARD}">\n'
            f'<link rel="stylesheet" href="{rel}assets/ikan.css?v={css_v}">\n</head>\n')


def apps_menu(programs, current, rel):
    items = []
    for p in programs:
        href = f'{rel}{p["id"]}/index.html'
        cur = ' aria-current="page"' if p['id'] == current else ''
        draft = ' class="is-draft"' if p['status'] != 'ready' else ''
        sub = '매뉴얼 준비 중' if p['status'] != 'ready' else p['version']
        items.append(f'<a href="{href}"{cur}{draft}><img src="{rel}assets/icons/{p["icon"]}" alt=""><span><b>{e(p["name"])}</b><span>{e(sub)}</span></span></a>')
    return (f'<details class="ik-apps"><summary class="ik-bar-btn" aria-label="다른 프로그램 매뉴얼">{svg("grid")}<span class="ik-bar-hide-s">다른 매뉴얼</span></summary>'
            f'<div class="ik-apps-menu"><a href="{rel}index.html"><span style="display:grid;place-items:center;width:34px;height:34px;border-radius:8px;background:var(--ik-navy);color:#fff">{svg("home")}</span>'
            f'<span><b>매뉴얼 홈</b><span>모든 프로그램 · 전체 검색</span></span></a><hr>{"".join(items)}</div></details>')


def manual_page(prog, data, programs, css_v):
    rel = '../'
    chapters = data['chapters']
    toc = ''.join(f'<li><a href="#{e(c["id"])}"><span class="n">{e(c["num"])}</span><span>{e(c["title"])}</span></a></li>' for c in chapters)
    keep = ('기준 버전', '문서 기준 버전', '기준일', '문서 기준일', '운영체제', '필요', '사용 라벨지', '성격', '대체하는 기존 방식')
    info = prog.get('info') or [(k, v) for k, v in data.get('info', []) if k in keep]
    info_html = ''.join(f'<li><b>{e(k)}</b>{e(re.sub(r"[*`]", "", v))}</li>' for k, v in info)
    quick = ''.join(f'<a href="{e(q["h"])}"><b>{e(q["t"])}</b><small>{e(q["s"])}</small></a>' for q in prog.get('quick', []))
    body = []
    for i, c in enumerate(chapters):
        prev = chapters[i - 1] if i else None
        nxt = chapters[i + 1] if i + 1 < len(chapters) else None
        nav = '<nav class="ik-chapnav" aria-label="앞뒤 장">'
        if prev:
            nav += f'<a class="is-prev" href="#{e(prev["id"])}"><small>← 앞 장 {e(prev["num"])}</small><b>{e(prev["title"])}</b></a>'
        if nxt:
            nav += f'<a class="is-next" href="#{e(nxt["id"])}"><small>다음 장 {e(nxt["num"])} →</small><b>{e(nxt["title"])}</b></a>'
        nav += '</nav>'
        lead = f'<p class="ik-lead">{e(c["lead"])}</p>' if c['lead'] else ''
        body.append(f'<section class="ik-chapter" id="{e(c["id"])}" data-chapter>'
                    f'<header class="ik-chapter-head"><p class="ik-eyebrow">{e(c["eyebrow"])}</p><h1>{e(c["title"])}</h1>{lead}</header>'
                    f'{c["html"]}{nav}</section>')
        if nxt:
            body.append(DIV_EDGE)
    upd = f' · 정리 {e(prog["updated"])}' if prog.get('updated') else ''
    page = head(f'{prog["name"]} 사용 설명서 {prog["version"]}', prog['summary'], rel, prog['icon'], css_v)
    page += f'<body class="{prog["app"]}">\n<a class="ik-skip" href="#main">본문 바로가기</a>\n'
    page += (f'<header class="ik-bar"><div class="ik-bar-in">'
             f'<a class="ik-bar-home" href="{rel}index.html">{svg("home")}<span>매뉴얼 홈</span></a><i class="ik-bar-sep"></i>'
             f'<div class="ik-bar-title"><img class="ik-bar-icon" src="{rel}assets/icons/{prog["icon"]}" alt=""><span><small>{e(prog["en"])} · USER MANUAL</small><b>{e(prog["name"])}</b></span></div>'
             f'<div class="ik-bar-tools"><span class="ik-bar-ver ik-bar-hide-s">{e(prog["version"])}</span>'
             f'<button class="ik-bar-btn ik-bar-hide-s" type="button" data-font="-1" aria-label="본문 글자 작게">가−</button>'
             f'<button class="ik-bar-btn ik-bar-hide-s" type="button" data-font="1" aria-label="본문 글자 크게">가+</button>'
             f'<button class="ik-bar-btn ik-bar-hide-s" type="button" data-print>{svg("print")}인쇄</button>'
             f'{apps_menu(programs, prog["id"], rel)}</div></div></header>\n')
    page += (f'<div class="ik-shell">\n<nav class="ik-toc" aria-label="목차"><details open id="toc-box"><summary>목차 · 이 매뉴얼에서 찾기</summary>'
             f'<div class="ik-find">{svg("search")}<label class="sr" for="find">이 매뉴얼에서 찾기</label>'
             f'<input id="find" type="search" placeholder="이 매뉴얼에서 찾기  /" autocomplete="off"></div>'
             f'<div class="ik-find-state" id="find-state" role="status" aria-live="polite"></div>'
             f'<div class="ik-toc-label">Contents · {len(chapters)}장</div><ol>{toc}</ol>'
             f'<div class="ik-toc-foot">기준 버전 <b>{e(prog["version"])}</b>{upd}<br>인터넷 없이도 이 페이지를 저장해 볼 수 있습니다.</div></details></nav>\n')
    page += (f'<main class="ik-sheet" id="main" data-manual="{e(prog["id"])}">\n'
             f'<section class="ik-chapter is-first" id="cover"><div class="ik-cover"><img class="ik-cover-icon" src="{rel}assets/icons/{prog["icon"]}" alt="{e(prog["name"])} 아이콘">'
             f'<div><p class="ik-cover-kind">USER MANUAL · {e(prog["version"])}</p><h1 class="ik-cover-title">{e(prog["name"])}</h1>'
             f'<p class="ik-cover-meta"><span>{e(prog["summary"])}</span></p></div></div>'
             f'{"<ul class=ik-docinfo>" + info_html + "</ul>" if info_html else ""}'
             f'{"<div class=ik-cover-intro>" + data["intro"] + "</div>" if data.get("intro") else ""}'
             f'{"<div class=ik-quick>" + quick + "</div>" if quick else ""}{DIV_DIM}</section>\n'
             f'<div id="find-empty" class="ik-empty" hidden><b>일치하는 장이 없습니다.</b>더 짧은 단어나 다른 표현으로 찾아보세요. 예: 싱크볼 → 씽크볼, 뒤턱 → 뒷턱</div>\n'
             f'{"".join(body)}\n{DIV_STAMP}'
             f'<p class="ik-small" style="text-align:center;max-width:none">{e(prog["name"])} 사용 설명서 · 기준 버전 {e(prog["version"])}{upd} · (주) 아이칸 사내용</p>\n'
             f'</main>\n</div>\n<script src="{rel}assets/search-index.js?v={css_v}"></script><script src="{rel}assets/ikan.js?v={css_v}"></script>\n</body>\n</html>\n')
    return page


def draft_page(prog, programs, css_v):
    rel = '../'
    page = head(f'{prog["name"]} 사용 설명서 (준비 중)', prog['summary'], rel, prog['icon'], css_v)
    page += f'<body class="{prog["app"]}">\n<a class="ik-skip" href="#main">본문 바로가기</a>\n'
    page += (f'<header class="ik-bar"><div class="ik-bar-in"><a class="ik-bar-home" href="{rel}index.html">{svg("home")}<span>매뉴얼 홈</span></a><i class="ik-bar-sep"></i>'
             f'<div class="ik-bar-title"><img class="ik-bar-icon" src="{rel}assets/icons/{prog["icon"]}" alt=""><span><small>{e(prog["en"])} · USER MANUAL</small><b>{e(prog["name"])}</b></span></div>'
             f'<div class="ik-bar-tools"><span class="ik-bar-ver ik-bar-hide-s">{e(prog["version"])}</span>{apps_menu(programs, prog["id"], rel)}</div></div></header>\n')
    chips = ''.join(f'<li><b>환경</b>{e(c)}</li>' if i == 0 else f'<li>{e(c)}</li>' for i, c in enumerate(prog.get('chips', [])))
    page += (f'<div class="ik-shell" style="grid-template-columns:minmax(0,1fr)"><main class="ik-sheet" id="main" style="max-width:900px;margin:0 auto;width:100%">'
             f'<section class="ik-chapter is-first"><div class="ik-cover"><img class="ik-cover-icon" src="{rel}assets/icons/{prog["icon"]}" alt="{e(prog["name"])} 아이콘">'
             f'<div><p class="ik-cover-kind">USER MANUAL · {e(prog["version"])}</p><h1 class="ik-cover-title">{e(prog["name"])}</h1>'
             f'<p class="ik-cover-meta"><span>{e(prog["summary"])}</span></p></div></div><ul class="ik-docinfo">{chips}</ul>{DIV_DIM}'
             f'<div class="ik-note is-caution"><p class="ik-note-tag">{svg("caution")}매뉴얼 준비 중</p>'
             f'<p>이 프로그램의 사용 설명서를 작성하고 있습니다. 완성되면 이 주소에 바로 올라옵니다. 그 전에는 프로그램을 만든 담당자에게 사용법을 물어 주세요.</p></div>'
             f'<p><a href="{rel}index.html">← 매뉴얼 홈으로</a></p></section>{DIV_STAMP}</main></div>\n'
             f'<script src="{rel}assets/ikan.js?v={css_v}"></script>\n</body>\n</html>\n')
    return page


def home_page(site, programs, css_v):
    rel = ''
    cards, tasks, rows = [], [], []
    for p in programs:
        ready = p['status'] == 'ready'
        chips = ''.join(f'<li>{e(c)}</li>' for c in p.get('chips', []))
        links = ''.join(f'<a href="{p["id"]}/index.html{e(q["h"])}"><b>{e(q["t"])}</b><span>{e(q.get("s", ""))}</span><i aria-hidden="true">→</i></a>' for q in p.get('quick', []))
        badge = '' if ready else '<span class="hub-badge">매뉴얼 준비 중</span>'
        if not ready:
            links = ''
            draft_note = ('<div class="hub-card-draft"><b>매뉴얼 작성 중</b>프로그램은 이미 쓰고 있습니다. 설명서가 완성되면 '
                          '이 카드와 검색에서 바로 열립니다.</div>')
        else:
            draft_note = ''
        foot = (f'<span>기준 버전 <b>{e(p["version"])}</b></span><span class="hub-open">매뉴얼 열기 {svg("arrow")}</span>' if ready
                else f'<span>프로그램 <b>{e(p["version"])}</b></span><span class="hub-open">작성 중</span>')
        cards.append(f'<article class="hub-card {p["app"]}{"" if ready else " is-draft"}"><div class="hub-card-top"><img src="assets/icons/{p["icon"]}" alt="">'
                     f'<div><span class="hub-card-en">{e(p["en"])}</span><h3><a href="{p["id"]}/index.html">{e(p["name"])}</a>{badge}</h3></div></div>'
                     f'<p>{e(p["summary"])}</p><div class="hub-card-bottom"><ul class="hub-chips" aria-label="사용 환경">{chips}</ul>'
                     f'{"<nav class=hub-links aria-label=바로가기>" + links + "</nav>" if links else draft_note}<div class="hub-card-foot">{foot}</div></div></article>')
        items = ''.join(f'<li><a href="{p["id"]}/index.html{e(t["h"])}"><span>{e(t["t"])}</span><i aria-hidden="true">→</i></a></li>' for t in p.get('tasks', []))
        if items:
            note = '' if ready else '<p class="hub-taskcol-note">매뉴얼을 작성하고 있습니다. 완성되면 이 목록에서 바로 열립니다.</p>'
            tasks.append(f'<section class="hub-taskcol {p["app"]}{"" if ready else " is-draft"}" aria-label="{e(p["name"])}">'
                         f'<h3><img src="assets/icons/{p["icon"]}" alt=""><span>{e(p["name"])}</span><small>{len(p.get("tasks", []))}</small></h3>'
                         f'<ol>{items}</ol>{note}</section>')
        rows.append(f'<li class="{p["app"]}{"" if ready else " is-draft"}"><a href="{p["id"]}/index.html"><span class="no">{len(rows) + 1:02d}</span>'
                    f'<span class="nm">{e(p["name"])}</span><span class="vr">{e(p["version"])}</span>'
                    f'<span class="st">{"공개" if ready else "준비 중"}</span></a></li>')
    hints = ''.join(f'<button type="button" data-hint="{e(h)}">{e(h)}</button>' for h in site.get('hints', []))
    ready_n = sum(p['status'] == 'ready' for p in programs)
    page = head(site['title'], '(주) 아이칸 사내 프로그램 사용 설명서 모음', rel, 'workorders.svg', css_v)
    page += '<body class="hub">\n<a class="ik-skip" href="#main">본문 바로가기</a>\n'
    page += (f'<header class="hub-hero"><div class="hub-hero-grid" aria-hidden="true"></div><div class="hub-wrap hub-hero-in"><div class="hub-hero-main">'
             f'<p class="hub-kicker">IKAN CO., LTD. · PROGRAM MANUALS</p><h1 class="hub-title">{e(site["title"])}</h1>'
             f'<p class="hub-sub">(주) 아이칸에서 쓰는 사내 프로그램 사용 설명서를 한곳에 모았습니다. 프로그램을 고르거나, 하려는 일을 검색하세요.</p>'
             f'<div class="hub-search" role="search">{svg("search")}<label class="sr" for="hub-q">모든 매뉴얼에서 찾기</label>'
             f'<input id="hub-q" type="search" placeholder="모든 매뉴얼에서 찾기 · 예: 라벨 이어 쓰기, 부분엣지" autocomplete="off"><kbd aria-hidden="true">/</kbd></div>'
             f'<p class="hub-hint">자주 찾는 말 {hints}</p><div class="hub-results" id="hub-results" role="region" aria-live="polite" aria-label="검색 결과" hidden></div></div>'
             f'<aside class="hub-register" aria-label="매뉴얼 목록"><div class="hub-register-head"><span>DRAWING REGISTER</span><span>매뉴얼 목록</span></div>'
             f'<div class="hub-register-cols" aria-hidden="true"><span>No.</span><span>프로그램</span><span>버전</span><span>상태</span></div>'
             f'<ol>{"".join(rows)}</ol><div class="hub-register-foot"><span>{e(site["company"])}</span><span>갱신 {TODAY}</span></div></aside>'
             f'</div></header>\n')
    page += (f'<main class="hub-wrap hub-main" id="main">'
             f'<section aria-labelledby="h-programs"><div class="hub-sec-head"><div><p class="ik-eyebrow">PROGRAMS</p><h2 id="h-programs">프로그램 고르기</h2></div>'
             f'<p>프로그램 {len(programs)}개 · 매뉴얼 {ready_n}권. 카드를 누르면 매뉴얼이 열립니다.</p></div><div class="hub-cards">{"".join(cards)}</div></section>'
             f'<section aria-labelledby="h-tasks"><div class="hub-sec-head"><div><p class="ik-eyebrow">FIND BY TASK</p><h2 id="h-tasks">하려는 일로 찾기</h2></div>'
             f'<p>프로그램별로 모았습니다. 누르면 그 일을 설명한 장으로 바로 갑니다.</p></div><div class="hub-tasks">{"".join(tasks)}</div></section>'
             f'<section aria-labelledby="h-common"><div class="hub-sec-head"><div><p class="ik-eyebrow">ALL PROGRAMS</p><h2 id="h-common">모든 프로그램 공통</h2></div></div>'
             f'<div class="hub-common">'
             f'<div><h3>{svg("version")}버전부터 확인하기</h3><p>매뉴얼은 표지에 적힌 <b>기준 버전</b>으로 쓰였습니다. 쓰고 있는 프로그램의 버전이 다르면 화면이나 버튼 이름이 조금 다를 수 있습니다.</p></div>'
             f'<div><h3>{svg("print")}종이로 보기</h3><p>매뉴얼을 연 뒤 <kbd>Ctrl</kbd>+<kbd>P</kbd>를 누르거나 위쪽 <span class="ik-ui">인쇄</span>를 누르면 장마다 새 쪽에서 시작하도록 A4로 뽑힙니다.</p></div>'
             f'<div><h3>{svg("chat")}문의할 때 함께 알려 주세요</h3><ul><li>프로그램 이름과 버전</li><li>어느 화면에서 무엇을 눌렀는지</li><li>오류 문구 전체(가능하면 화면 캡처)</li><li>사용한 파일 이름</li></ul></div>'
             f'</div></section></main>\n')
    page += (f'<footer class="hub-foot"><div class="hub-wrap" style="padding-top:28px">{DIV_STAMP}</div><div class="hub-wrap hub-foot-in"><span><b>{e(site["company"])}</b> 사내 프로그램 매뉴얼 · 사내 공유용</span>'
             f'<span>마지막 갱신 {TODAY}</span></div></footer>\n'
             f'<script src="assets/search-index.js?v={css_v}"></script><script src="assets/ikan.js?v={css_v}"></script>\n</body>\n</html>\n')
    return page


def search_entries(prog, data):
    entries = []
    for c in data['chapters']:
        soup = BeautifulSoup(c['html'], 'html.parser')
        for bad in soup.find_all(['svg', 'nav']):
            bad.decompose()
        cur_title, cur_id, buf = None, c['id'], [c['lead']]
        def flush():
            text = re.sub(r'\s+', ' ', ' '.join(buf)).strip()
            if text or cur_title:
                entries.append([prog['id'], c['title'], cur_title or '', f'{prog["id"]}/index.html#{cur_id}', text])
        for n in soup.contents:
            if isinstance(n, Tag) and n.name == 'h2':
                flush()
                cur_title, cur_id, buf = n.get_text(' ', strip=True), n.get('id') or c['id'], []
            else:
                buf.append(n.get_text(' ', strip=True) if isinstance(n, Tag) else str(n))
        flush()
    return entries


def check_links(pages):
    """사이트 안 링크(#앵커, 다른 매뉴얼#앵커)가 모두 있는지 확인."""
    import posixpath
    ids = {path: set(re.findall(r'\bid="([^"]+)"', page)) for path, page in pages.items()}
    problems = []
    for path, page in pages.items():
        for href in re.findall(r'href="([^"]+)"', html.unescape(page) and page):
            href = html.unescape(href)
            if re.match(r'^[a-z]+:', href) or '/assets/' in '/' + href:
                continue
            target, _, frag = href.partition('#')
            tp = posixpath.normpath(posixpath.join(posixpath.dirname(path), target)) if target else path
            if tp not in pages:
                problems.append(f'{path}: 없는 페이지 → {href}')
            elif frag and frag not in ids[tp]:
                problems.append(f'{path}: 없는 앵커 → {href}')
    return problems


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')  # Windows 콘솔에서 한글 출력 오류 방지
        except (AttributeError, ValueError):
            pass
    conf = json.loads((SRC / 'programs.json').read_text(encoding='utf-8-sig'))  # 메모장 BOM 저장도 허용
    site, programs = conf['site'], conf['programs']
    css = (ASSETS / '_base.css').read_text(encoding='utf-8') + '\n[hidden]{display:none!important}\n' + (ASSETS / '_site.css').read_text(encoding='utf-8-sig')
    css_v = hashlib.sha1((css + (ASSETS / 'ikan.js').read_text(encoding='utf-8')).encode()).hexdigest()[:8]
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / 'assets' / 'icons').mkdir(parents=True)
    (OUT / 'assets' / 'ikan.css').write_text(css, encoding='utf-8')
    shutil.copy(ASSETS / 'ikan.js', OUT / 'assets' / 'ikan.js')
    for f in (ASSETS / 'icons').iterdir():
        shutil.copy(f, OUT / 'assets' / 'icons' / f.name)
    (OUT / '.nojekyll').write_text('', encoding='utf-8')
    pages, entries = {}, []
    for p in programs:
        if p['status'] == 'ready':
            data = md_manual(p) if p['format'] == 'md' else html_manual(p)
            pages[f'{p["id"]}/index.html'] = manual_page(p, data, programs, css_v)
            entries += search_entries(p, data)
            print(f'  {p["name"]}: {len(data["chapters"])}장')
        else:
            pages[f'{p["id"]}/index.html'] = draft_page(p, programs, css_v)
            print(f'  {p["name"]}: 준비 중 페이지')
    pages['index.html'] = home_page(site, programs, css_v)
    index = {'programs': [{'id': p['id'], 'name': p['name'], 'icon': f'assets/icons/{p["icon"]}'} for p in programs],
             'synonyms': site.get('synonyms', []), 'entries': entries}
    js = 'window.IKAN_INDEX=' + json.dumps(index, ensure_ascii=False, separators=(',', ':')) + ';\n'
    (OUT / 'assets' / 'search-index.js').write_text(js, encoding='utf-8')
    for path, page in pages.items():
        target = OUT / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(page, encoding='utf-8')
    problems = check_links(pages)
    for msg in problems:
        print('  [링크 확인] ' + msg)
    print(f'완료: {OUT} · 페이지 {len(pages)}개 · 검색 항목 {len(entries)}개 · 링크 문제 {len(problems)}개')
    return 1 if problems and '--check' in sys.argv else 0


if __name__ == '__main__':
    sys.exit(main())
