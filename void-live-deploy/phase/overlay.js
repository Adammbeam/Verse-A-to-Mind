// Phase over any page (the bookmarklet on /phase/ loads this). A see-through ask line in the page's own ink, and notes that sit
// on the words they mean: a soft underline in that element's colour, a short note above it, edges feathered into the paper.
// It reads the page only after you ask (find, numbers, fill, click, take to Verse). Nothing is sent unless you press
// "take to Verse", which opens a-to-mind.com/phase/ with the words in the address's #fragment (a browser never sends that
// part to a server). It never submits a form, and it refuses buttons that pay, buy, delete or send. Lives in a closed
// shadow root so the page cannot read or restyle the ask. The four helpers match lib/phase.js (this file is a classic
// script, so it cannot import that module). Tested by tools/phase-live.mjs.
(function () {
  if (window.__versePhase) { window.__versePhase.toggle(); return; }
  var ORIGIN = 'https://a-to-mind.com';
  var RISKY = /\b(pay|payment|purchase|buy|checkout|check out|place order|order now|submit|send|delete|remove|transfer|confirm|sign out|log out|unsubscribe|cancel subscription)\b/i;

  function findSpans(text, query, max) {
    var hay = String(text || ''), needle = String(query || '').trim();
    if (!needle) return [];
    var h = hay.toLowerCase(), n = needle.toLowerCase(), out = [], i = 0, cap = max || 200;
    while (out.length < cap) {
      var at = h.indexOf(n, i);
      if (at < 0) break;
      out.push([at, at + n.length]);
      i = at + Math.max(1, n.length);
    }
    return out;
  }
  function cssColor(s) {
    var m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:(?:[,\s/]+)([\d.]+%?))?\s*\)$/.exec(String(s || '').trim());
    if (!m) return null;
    var a = m[4] == null ? 1 : /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (!(a >= 0)) a = 1;
    if (a > 1) a = 1;
    return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]), a: a };
  }
  function phaseTone(fg, bg) {
    var lum = function (c) { return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255; };
    var mix = function (a, b, t) { return { r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) }; };
    var rgba = function (c, a) { return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')'; };
    var ink = fg && fg.a > 0.2 ? fg : { r: 28, g: 26, b: 24, a: 1 };
    var paper = bg && bg.a > 0.45 ? bg : (lum(ink) > 0.55 ? { r: 22, g: 22, b: 28, a: 1 } : { r: 244, g: 240, b: 232, a: 1 });
    return { ink: rgba(ink, 1), field: rgba(mix(paper, ink, 0.16), 1), wash: rgba(mix(paper, ink, 0.1), 0.94), line: rgba(ink, 0.7), halo: rgba(paper, 0.72), scheme: lum(paper) > 0.62 ? 'light' : 'dark' };
  }
  function placeNote(anchor, note, view, barTop) {
    var gap = 8, edge = 8;
    var nw = Math.min(Math.max(40, note.w || 40), Math.max(40, view.w - edge * 2));
    var nh = Math.max(1, note.h || 1);
    var limit = barTop == null ? view.h : barTop;
    var left = anchor.x, top = anchor.y - nh - gap;
    if (top < edge) top = anchor.y + anchor.h + gap;
    if (top + nh > limit - gap) top = Math.max(edge, limit - nh - gap);
    if (top < edge) top = edge;
    if (left + nw > view.w - edge) left = view.w - edge - nw;
    if (left < edge) left = edge;
    return { left: Math.round(left), top: Math.round(top) };
  }

  var host = document.createElement('div'); host.setAttribute('data-verse-phase', '');
  host.style.cssText = 'position:fixed;left:0;right:0;bottom:12px;z-index:2147483647;display:flex;justify-content:center;pointer-events:none';
  var root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = '<style>'
    + '.bar{pointer-events:auto;width:min(640px,calc(100vw - 20px));box-sizing:border-box;background:var(--ph-wash,#10121ccc);color:var(--ph-ink,#e8ecf4);border:none;border-radius:18px;padding:8px 10px;font-size:14px;line-height:1.4;font-family:var(--ph-font,system-ui,sans-serif);box-shadow:0 0 28px 12px var(--ph-halo,transparent)}'
    + 'input{width:100%;box-sizing:border-box;font:inherit;padding:7px 10px;border-radius:999px;border:none;background:var(--ph-field);color:inherit}'
    + 'input::placeholder{color:var(--ph-ink);opacity:.6}input:focus{outline:2px solid var(--ph-ink);outline-offset:1px}'
    + '.o{white-space:pre-wrap;max-height:22vh;overflow:auto;margin-top:6px}'
    + 'button{font:inherit;padding:3px 10px;margin:4px 4px 0 0;border-radius:999px;border:none;background:var(--ph-field);color:inherit;cursor:pointer}'
    + '.note{position:fixed;z-index:2147483646;box-sizing:border-box;max-width:min(320px,calc(100vw - 16px));max-height:30vh;overflow:auto;padding:6px 10px;border-radius:12px;pointer-events:auto;white-space:pre-wrap;font-size:14px;line-height:1.4;font-family:var(--ph-font,system-ui,sans-serif);box-shadow:0 0 22px 8px var(--ph-halo)}'
    + '@media (prefers-reduced-motion: reduce){.bar,.note,.o,button,input{transition:none;animation:none}}'
    + '</style>'
    + '<div class="bar"><input placeholder="Find, numbers, fill … with …, click …, or take to Verse" aria-label="Phase"><div class="o" role="status"></div>'
    + '<button data-q="numbers">numbers</button><button data-q="take to Verse">take to Verse</button><button data-q="close">close</button></div>'
    + '<div class="note" hidden aria-hidden="true"></div>';
  document.documentElement.appendChild(host);
  var input = root.querySelector('input'), out = root.querySelector('.o'), note = root.querySelector('.note');
  var marks = [], anchors = [], noteRef = null;

  function toneOf(el) {
    var fg = null, bg = null, font = '', n = el && el.nodeType === 1 ? el : (el && el.parentElement), hops = 0;
    while (n && hops++ < 12) {
      var cs = getComputedStyle(n);
      if (!font && cs.fontFamily) font = cs.fontFamily;
      if (!fg) { var c = cssColor(cs.color); if (c && c.a > 0.2) fg = c; }
      if (!bg) { var b = cssColor(cs.backgroundColor); if (b && b.a > 0.5) bg = b; }
      if (fg && bg) break;
      n = n.parentElement;
    }
    var tone = phaseTone(fg, bg); tone.font = font || 'system-ui, sans-serif'; return tone;
  }
  function applyBar(tone) {
    host.style.setProperty('--ph-ink', tone.ink);
    host.style.setProperty('--ph-wash', tone.wash);
    host.style.setProperty('--ph-field', tone.field);
    host.style.setProperty('--ph-halo', tone.halo);
    host.style.setProperty('--ph-font', tone.font);
    host.style.colorScheme = tone.scheme;
  }
  function ours(node) {
    var e = node && node.parentElement;
    while (e) { if (e === host || e.hasAttribute('data-verse-phase-mark')) return true; e = e.parentElement; }
    return false;
  }
  function clearMarks() {
    marks.forEach(function (el) { el.remove(); });
    marks = []; anchors = []; noteRef = null; note.hidden = true; note.textContent = '';
  }
  function moveMark(el, rect, tone) {
    var h = 3;
    el.style.left = (rect.left - 2) + 'px';
    el.style.top = (rect.bottom - 2) + 'px';
    el.style.width = (rect.width + 4) + 'px';
    el.style.height = h + 'px';
    el.style.background = tone.line;
    el.style.boxShadow = '0 0 7px 1px ' + tone.line;
    el.style.webkitMaskImage = 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)';
    el.style.maskImage = 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)';
  }
  function layout() {
    marks.forEach(function (el) { el.remove(); }); marks = [];
    anchors.forEach(function (a) {
      var rects = a.range.getClientRects();
      for (var i = 0; i < rects.length && marks.length < 80; i++) {
        var r = rects[i]; if (r.width < 1 || r.height < 1) continue;
        var el = document.createElement('div');
        el.setAttribute('data-verse-phase-mark', '');
        el.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border-radius:999px';
        document.documentElement.appendChild(el);
        moveMark(el, r, a.tone); marks.push(el);
      }
    });
    if (!noteRef) return;
    var rect = noteRef.rect(); if (!rect || rect.width < 1) { note.hidden = true; return; }
    note.hidden = false; note.style.visibility = 'hidden'; note.style.left = '8px'; note.style.top = '8px';
    note.style.color = noteRef.tone.ink; note.style.background = noteRef.tone.wash; note.style.fontFamily = noteRef.tone.font;
    var pos = placeNote(
      { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
      { w: note.offsetWidth, h: note.offsetHeight },
      { w: innerWidth, h: innerHeight },
      host.getBoundingClientRect().top);
    note.style.left = pos.left + 'px'; note.style.top = pos.top + 'px'; note.style.visibility = 'visible';
  }
  function showNote(text, ref) {
    note.textContent = text; noteRef = ref; layout();
  }
  function firstRange() { return anchors.length ? anchors[0].range : null; }
  function underline(q) {
    clearMarks();
    if (!document.body || !String(q || '').trim()) return 0;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), nodes = [], n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue || !n.nodeValue.trim() || ours(n)) continue;
      var p = n.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/.test(p.nodeName)) continue;
      if (findSpans(n.nodeValue, q, 1).length) nodes.push(n);
    }
    nodes.slice(0, 80).forEach(function (node) {
      findSpans(node.nodeValue, q, 20).forEach(function (sp) {
        if (anchors.length >= 80) return;
        var range = document.createRange();
        try { range.setStart(node, sp[0]); range.setEnd(node, sp[1]); } catch (_) { return; }
        anchors.push({ range: range, tone: toneOf(node.parentElement) });
      });
    });
    var lead = firstRange();
    if (lead && lead.startContainer.parentElement) {
      var box = lead.getBoundingClientRect();
      if (box.bottom < 0 || box.top > innerHeight) {
        try { lead.startContainer.parentElement.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); }
        catch (_) { lead.startContainer.parentElement.scrollIntoView(false); }
      }
    }
    layout();
    return anchors.length;
  }

  var words = function () { return (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim(); };
  var shown = function (e) { return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); };
  var nameOf = function (e) {
    var l = e.labels && e.labels[0] ? e.labels[0].innerText : '';
    return [e.getAttribute('aria-label'), l, e.getAttribute('placeholder'), e.getAttribute('name'), e.id, e.innerText, e.value, e.title].filter(Boolean).map(function (s) { return String(s).trim().toLowerCase(); });
  };
  var findOne = function (sel, label) {
    var want = label.trim().toLowerCase(), hits = [].filter.call(document.querySelectorAll(sel), function (e) { return shown(e) && !host.contains(e) && nameOf(e).indexOf(want) >= 0; });
    if (!hits.length) hits = [].filter.call(document.querySelectorAll(sel), function (e) { return shown(e) && !host.contains(e) && nameOf(e).some(function (nm) { return nm.indexOf(want) >= 0; }); });
    return hits.length === 1 ? hits[0] : hits.length ? 'many' : null;
  };
  function beside(el, text) {
    var tone = toneOf(el);
    showNote(text, { tone: tone, rect: function () { return el.getBoundingClientRect(); } });
  }
  function run(q) {
    var t = String(q || '').trim(), m;
    applyBar(toneOf(document.body));
    if (!t) return '';
    if (/^close$/i.test(t)) { api.toggle(); return ''; }
    if ((m = /^(?:find|highlight|show)\s+(.+)$/i.exec(t))) {
      var n = underline(m[1]);
      var line = n + (n === 1 ? ' match' : ' matches') + ' on the page.';
      if (n && firstRange()) showNote(line, { tone: anchors[0].tone, rect: function () { var rs = anchors[0].range.getClientRects(); return rs[0]; } });
      else clearMarks();
      return n + (n === 1 ? ' match' : ' matches') + ' highlighted.';
    }
    if (/^numbers?$/i.test(t)) {
      clearMarks();
      var re = /([A-Za-z][A-Za-z ]{0,24}?)?\s*([-+]?[$€£]?\d[\d,]*(?:\.\d+)?%?)/g, r = [], x, s = words();
      while ((x = re.exec(s)) && r.length < 40) r.push((x[1] ? x[1].trim() + ': ' : '') + x[2]);
      var seen = {};
      r.forEach(function (row) {
        var v = row.split(': ').pop();
        if (!v || seen[v] || anchors.length >= 40) return;
        if (/^\d{1,2}$/.test(v)) return;
        seen[v] = 1; underlineAdd(v);
      });
      layout();
      var list = r.join('\n') || 'No numbers on this page.';
      if (anchors.length && firstRange()) showNote('Numbers on the page.', { tone: anchors[0].tone, rect: function () { var rs = anchors[0].range.getClientRects(); return rs[0]; } });
      return list;
    }
    if ((m = /^fill\s+(.+?)\s+with\s+([\s\S]+)$/i.exec(t))) {
      clearMarks();
      var f = findOne('input:not([type=password]):not([type=hidden]),textarea,[contenteditable=""],[contenteditable=true]', m[1]);
      if (!f) return 'No box called "' + m[1] + '" here.'; if (f === 'many') return 'More than one box is called "' + m[1] + '"; say which.';
      f.focus(); if (f.isContentEditable) f.textContent = m[2]; else { var proto = f.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(f, m[2]); }
      f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true }));
      var filled = 'Filled "' + m[1] + '". Nothing was sent; you press send yourself.';
      beside(f, filled); return filled;
    }
    if ((m = /^(?:click|press|tap)\s+(.+)$/i.exec(t))) {
      clearMarks();
      var b = findOne('button,a[href],[role=button],input[type=button],input[type=checkbox],input[type=radio]', m[1]);
      if (!b) return 'No button called "' + m[1] + '" here.'; if (b === 'many') return 'More than one thing is called "' + m[1] + '"; say which.';
      if (nameOf(b).concat(m[1]).some(function (nm) { return RISKY.test(nm); })) return 'I don\u2019t press buttons that pay, buy, delete or send. Press it yourself.';
      if ((b.tagName === 'BUTTON' && (b.type || 'submit') === 'submit' && b.form) || (b.type === 'submit')) return 'That button sends its form; press it yourself.';
      b.click(); var pressed = 'Pressed "' + m[1] + '".'; beside(b, pressed); return pressed;
    }
    if (/^(?:take|send|bring)\s+(?:it\s+|this\s+)?to\s+verse$/i.test(t)) {
      clearMarks();
      var v = { t: document.title.slice(0, 200), u: location.href.slice(0, 500), x: words().slice(0, 6000) };
      window.open(ORIGIN + '/phase/#page=' + encodeURIComponent(JSON.stringify(v)), '_blank', 'noopener'); return 'Opened in Verse (the words went in the link\u2019s #fragment, not to a server).';
    }
    return 'Try: find <words>, numbers, fill <box> with <text>, click <button>, take to Verse.';
  }
  // numbers underlines each value without wiping the ones already placed
  function underlineAdd(q) {
    if (!document.body) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue || ours(n)) continue;
      var p = n.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/.test(p.nodeName)) continue;
      var spans = findSpans(n.nodeValue, q, 4);
      for (var i = 0; i < spans.length && anchors.length < 40; i++) {
        var range = document.createRange();
        try { range.setStart(n, spans[i][0]); range.setEnd(n, spans[i][1]); } catch (_) { continue; }
        anchors.push({ range: range, tone: toneOf(n.parentElement) });
      }
      if (spans.length) return;
    }
  }

  addEventListener('scroll', function () { if (anchors.length || noteRef) layout(); }, true);
  addEventListener('resize', function () { if (anchors.length || noteRef) layout(); });
  input.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Escape') { clearMarks(); input.value = ''; out.textContent = ''; return; }
    if (e.key === 'Enter') { out.textContent = run(input.value); input.value = ''; }
  });
  [].forEach.call(root.querySelectorAll('button[data-q]'), function (b) { b.addEventListener('click', function () { out.textContent = run(b.getAttribute('data-q')); }); });
  var api = window.__versePhase = {
    run: run,
    toggle: function () {
      var hide = host.style.display !== 'none';
      host.style.display = hide ? 'none' : 'flex';
      if (hide) clearMarks();
      else input.focus();
    },
  };
  applyBar(toneOf(document.body));
  out.textContent = 'Phase is over this page. It reads the words only when you ask.';
  input.focus();
})();
