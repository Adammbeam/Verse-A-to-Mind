// Phase over any page (the bookmarklet on /phase/ loads this). A glass bar laid over the page you are on: it reads the colour
// under the bar, tints itself to that page, and feathers out to nothing instead of sitting in a hard panel. It reads the
// page's words here in your browser and acts when you ask: find and highlight, list the numbers, fill a box, press a
// button, or take the words to Verse. Nothing is sent anywhere unless you press "take to Verse", which opens
// a-to-mind.com/phase/ with the words in the address's #fragment (a browser never sends that part to a server). It never
// submits a form, and it refuses buttons that pay, buy, delete or send. Lives in a closed shadow root so the page cannot
// read or restyle it. The blend math matches lib/phase.js (the markers). Tested by tools/phase.test.mjs and tools/phase-live.mjs.
(function () {
  if (window.__versePhase) { window.__versePhase.toggle(); return; }
  var ORIGIN = 'https://a-to-mind.com';
  var RISKY = /\b(pay|payment|purchase|buy|checkout|check out|place order|order now|submit|send|delete|remove|transfer|confirm|sign out|log out|unsubscribe|cancel subscription)\b/i;
  /*blend*/
  function clamp255(n) { return Math.max(0, Math.min(255, Math.round(Number(n) || 0))); }
  function parseCssColor(s) {
    const t = String(s == null ? '' : s).trim();
    if (/^transparent$/i.test(t)) return [0, 0, 0, 0];
    const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(t);
    if (hex) {
      let x = hex[1];
      if (x.length === 3) x = x[0] + x[0] + x[1] + x[1] + x[2] + x[2];
      return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16), 1];
    }
    const m = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(t);
    if (!m) return null;
    let a = 1;
    if (m[4] != null) a = /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [clamp255(m[1]), clamp255(m[2]), clamp255(m[3]), Math.max(0, Math.min(1, a))];
  }
  function firstCssColor(text) {
    const m = /rgba?\([^)]+\)|#(?:[\da-fA-F]{6}|[\da-fA-F]{3})\b/.exec(String(text || ''));
    return m ? parseCssColor(m[0]) : null;
  }
  function relLuminance(rgb) {
    const f = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  }
  function contrastRatio(a, b) {
    const L1 = relLuminance(a), L2 = relLuminance(b);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  }
  function mix(a, b, t) { return [0, 1, 2].map((i) => clamp255(a[i] + (b[i] - a[i]) * t)); }
  function phaseBlend(sample) {
    const raw = sample && sample.bg;
    const bg = raw && raw.length >= 3 && !(raw[3] <= 0.35) ? [clamp255(raw[0]), clamp255(raw[1]), clamp255(raw[2])] : [255, 255, 255];
    const lum = relLuminance(bg), light = lum >= 0.42, shade = light ? [0, 0, 0] : [255, 255, 255];
    let wash = mix(bg, shade, light ? 0.14 : 0.12), field = mix(bg, shade, light ? 0.05 : 0.06);
    const dark = [17, 18, 22], pale = [246, 247, 250];
    const worse = (ink) => Math.min(contrastRatio(ink, field), contrastRatio(ink, wash));
    let ink = worse(dark) >= worse(pale) ? dark.slice() : pale.slice();
    const far = relLuminance(ink) < 0.5 ? [255, 255, 255] : [0, 0, 0];
    for (let i = 0; i < 8 && worse(ink) < 4.5; i++) { field = mix(field, far, 0.24); wash = mix(wash, far, 0.24); }
    let accent = sample && sample.accent;
    accent = accent && accent.length >= 3 && !(accent[3] <= 0.4) ? [clamp255(accent[0]), clamp255(accent[1]), clamp255(accent[2])] : null;
    if (!accent || contrastRatio(accent, bg) < 2) accent = mix(ink, bg, 0.48);
    else accent = mix(accent, bg, 0.22);
    return {
      lum: Math.round(lum * 1000) / 1000, contrast: Math.round(worse(ink) * 100) / 100, tint: wash, field, ink, accent,
      veil: [[wash[0], wash[1], wash[2], 0.8], [wash[0], wash[1], wash[2], 0.38], [wash[0], wash[1], wash[2], 0]],
      mark: [accent[0], accent[1], accent[2], 0.48],
    };
  }
  /*/blend*/
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function rgba(c) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (c.length > 3 ? c[3] : 1) + ')'; }
  var host = document.createElement('div'); host.setAttribute('data-verse-phase', '');
  host.style.cssText = 'position:fixed;left:0;right:0;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483647;display:flex;justify-content:center;pointer-events:none';
  var root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = '<style>'
    + '.bar{pointer-events:none;position:relative;width:min(640px,calc(100vw - 24px));box-sizing:border-box;background:transparent;border:0;box-shadow:none;color:var(--phase-ink,#1a1c22);font:15px/1.4 system-ui,sans-serif}'
    + '.veil{position:absolute;inset:-36px -52px;pointer-events:none;border:0;background:var(--phase-veil,transparent);-webkit-backdrop-filter:blur(14px) saturate(1.12);backdrop-filter:blur(14px) saturate(1.12);-webkit-mask-image:radial-gradient(72% 80% at 50% 46%,#000 26%,transparent 74%);mask-image:radial-gradient(72% 80% at 50% 46%,#000 26%,transparent 74%)}'
    + '.ask{position:relative;pointer-events:auto;padding:2px 4px 0}'
    + 'input{width:100%;box-sizing:border-box;font:16px/1.35 system-ui,sans-serif;padding:8px 12px;border-radius:999px;border:0;background:var(--phase-field,#fff);color:var(--phase-ink,#1a1c22);box-shadow:0 0 0 1px var(--phase-ring,#1a1c2238)}'
    + 'input::placeholder{color:var(--phase-ink,#1a1c22);opacity:.62}'
    + '.o{white-space:pre-wrap;max-height:30vh;overflow:auto;margin-top:6px;color:var(--phase-ink,#1a1c22)}'
    + 'button{font:inherit;padding:2px 0;margin:8px 16px 0 0;border:0;border-radius:0;background:transparent;color:var(--phase-ink,#1a1c22);cursor:pointer;box-shadow:inset 0 -0.12em 0 var(--phase-accent,#1d4e89)}'
    + 'input:focus-visible,button:focus-visible{outline:2px solid var(--phase-accent,#1d4e89);outline-offset:3px}'
    + '@media (prefers-reduced-motion: no-preference){.veil{animation:phaseveil .22s ease-out both}@keyframes phaseveil{from{opacity:0}to{opacity:1}}}'
    + '@media (prefers-reduced-motion: reduce){.veil,.bar,.ask{animation:none}}'
    + '</style>'
    + '<div class="bar"><div class="veil" aria-hidden="true"></div><div class="ask"><input placeholder="Phase: find …, numbers, fill … with …, click …, take to Verse" aria-label="Phase"><div class="o" role="status"></div>'
    + '<button data-q="numbers">numbers</button><button data-q="take to Verse">take to Verse</button><button data-q="close">close</button></div></div>';
  function paintOf(el) {
    if (!el || el === host || el.nodeType !== 1) return null;
    var c = parseCssColor(getComputedStyle(el).backgroundColor);
    if (c && c[3] > 0.35) return c;
    return firstCssColor(getComputedStyle(el).backgroundImage);
  }
  function samplePage() {
    var bg = null, x, y, stack, i, nodes, j, col;
    if (document.elementsFromPoint) {
      x = Math.round((window.innerWidth || 800) / 2);
      y = Math.max(8, (window.innerHeight || 600) - 28);
      stack = document.elementsFromPoint(x, y) || [];
      for (i = 0; i < stack.length && i < 8; i++) { bg = paintOf(stack[i]); if (bg) break; }
    }
    if (!bg) bg = paintOf(document.body) || paintOf(document.documentElement);
    if (!bg) {
      var theme = document.querySelector('meta[name="theme-color"]');
      var tc = theme && parseCssColor(theme.getAttribute('content'));
      if (tc && tc[3] > 0.35) bg = tc;
    }
    var accent = null;
    nodes = document.querySelectorAll('a[href], button');
    for (j = 0; j < nodes.length && j < 4; j++) {
      if (host.contains(nodes[j])) continue;
      col = parseCssColor(getComputedStyle(nodes[j]).color);
      if (col && col[3] > 0.4 && (!bg || contrastRatio(col, bg) >= 2)) { accent = col; break; }
    }
    return phaseBlend({ bg: bg, accent: accent });
  }
  function veilCss(b) {
    var v = b.veil;
    return 'radial-gradient(125% 160% at 50% 42%, ' + rgba(v[0]) + ' 0%, ' + rgba(v[1]) + ' 58%, ' + rgba(v[2]) + ' 100%)';
  }
  function apply(b) {
    host.style.setProperty('--phase-ink', rgb(b.ink));
    host.style.setProperty('--phase-field', rgb(b.field));
    host.style.setProperty('--phase-accent', rgb(b.accent));
    host.style.setProperty('--phase-ring', rgba([b.ink[0], b.ink[1], b.ink[2], 0.22]));
    host.style.setProperty('--phase-veil', veilCss(b));
    host.style.setProperty('--phase-mark', rgba(b.mark));
    host.style.colorScheme = relLuminance(b.ink) < 0.5 ? 'light' : 'dark';
    host.dataset.phaseContrast = String(b.contrast);
    host.dataset.phaseLum = String(b.lum);
    return b;
  }
  var blend = apply(samplePage());
  document.documentElement.appendChild(host);
  var input = root.querySelector('input'), out = root.querySelector('.o');
  var words = function () { return (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim(); };
  var shown = function (e) { return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); };
  var nameOf = function (e) {
    var l = e.labels && e.labels[0] ? e.labels[0].innerText : '';
    return [e.getAttribute('aria-label'), l, e.getAttribute('placeholder'), e.getAttribute('name'), e.id, e.innerText, e.value, e.title].filter(Boolean).map(function (s) { return String(s).trim().toLowerCase(); });
  };
  var findOne = function (sel, label) {
    var want = label.trim().toLowerCase(), hits = [].filter.call(document.querySelectorAll(sel), function (e) { return shown(e) && !host.contains(e) && nameOf(e).indexOf(want) >= 0; });
    if (!hits.length) hits = [].filter.call(document.querySelectorAll(sel), function (e) { return shown(e) && nameOf(e).some(function (n) { return n.indexOf(want) >= 0; }); });
    return hits.length === 1 ? hits[0] : hits.length ? 'many' : null;
  };
  var marks = [];
  function highlight(q) {
    marks.forEach(function (m) { var t = document.createTextNode(m.textContent); m.replaceWith(t); }); marks = [];
    var re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), nodes = [], n;
    while ((n = w.nextNode())) if (n.nodeValue && re.test(n.nodeValue) && !/^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName)) nodes.push(n);
    nodes.slice(0, 200).forEach(function (node) {
      var f = document.createDocumentFragment(), s = node.nodeValue, last = 0; re.lastIndex = 0; var m;
      while ((m = re.exec(s))) {
        f.append(s.slice(last, m.index));
        var k = document.createElement('mark'); k.setAttribute('data-verse-phase-mark', ''); k.textContent = m[0];
        k.style.setProperty('background', 'transparent', 'important');
        k.style.setProperty('color', 'inherit', 'important');
        k.style.setProperty('border-radius', '0', 'important');
        k.style.setProperty('padding', '0', 'important');
        k.style.setProperty('box-shadow', 'inset 0 -0.32em 0 ' + rgba(blend.mark), 'important');
        f.append(k); marks.push(k); last = m.index + m[0].length;
      }
      f.append(s.slice(last)); node.replaceWith(f);
    });
    if (marks[0]) marks[0].scrollIntoView({ block: 'center', behavior: 'auto' });
    return marks.length + (marks.length === 1 ? ' match' : ' matches') + ' highlighted.';
  }
  function run(q) {
    var t = String(q || '').trim(), m;
    if (!t) return '';
    if (/^close$/i.test(t)) { api.toggle(); return ''; }
    if ((m = /^(?:find|highlight|show)\s+(.+)$/i.exec(t))) return highlight(m[1]);
    if (/^numbers?$/i.test(t)) { var re = /([A-Za-z][A-Za-z ]{0,24}?)?\s*([-+]?[$€£]?\d[\d,]*(?:\.\d+)?%?)/g, r = [], x, s = words(); while ((x = re.exec(s)) && r.length < 40) r.push((x[1] ? x[1].trim() + ': ' : '') + x[2]); return r.join('\n') || 'No numbers on this page.'; }
    if ((m = /^fill\s+(.+?)\s+with\s+([\s\S]+)$/i.exec(t))) {
      var f = findOne('input:not([type=password]):not([type=hidden]),textarea,[contenteditable=""],[contenteditable=true]', m[1]);
      if (!f) return 'No box called "' + m[1] + '" here.'; if (f === 'many') return 'More than one box is called "' + m[1] + '"; say which.';
      f.focus(); if (f.isContentEditable) f.textContent = m[2]; else { var proto = f.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(f, m[2]); }
      f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true }));
      return 'Filled "' + m[1] + '". Nothing was sent; you press send yourself.';
    }
    if ((m = /^(?:click|press|tap)\s+(.+)$/i.exec(t))) {
      var b = findOne('button,a[href],[role=button],input[type=button],input[type=checkbox],input[type=radio]', m[1]);
      if (!b) return 'No button called "' + m[1] + '" here.'; if (b === 'many') return 'More than one thing is called "' + m[1] + '"; say which.';
      if (nameOf(b).concat(m[1]).some(function (n) { return RISKY.test(n); })) return 'I don\u2019t press buttons that pay, buy, delete or send. Press it yourself.';
      if ((b.tagName === 'BUTTON' && (b.type || 'submit') === 'submit' && b.form) || (b.type === 'submit')) return 'That button sends its form; press it yourself.';
      b.click(); return 'Pressed "' + m[1] + '".';
    }
    if (/^(?:take|send|bring)\s+(?:it\s+|this\s+)?to\s+verse$/i.test(t)) {
      var v = { t: document.title.slice(0, 200), u: location.href.slice(0, 500), x: words().slice(0, 6000) };
      window.open(ORIGIN + '/phase/#page=' + encodeURIComponent(JSON.stringify(v)), '_blank', 'noopener'); return 'Opened in Verse (the words went in the link\u2019s #fragment, not to a server).';
    }
    return 'Try: find <words>, numbers, fill <box> with <text>, click <button>, take to Verse.';
  }
  input.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { out.textContent = run(input.value); input.value = ''; } });
  [].forEach.call(root.querySelectorAll('button[data-q]'), function (b) { b.addEventListener('click', function () { out.textContent = run(b.getAttribute('data-q')); }); });
  function shownPaint() {
    var veil = root.querySelector('.veil'), bar = root.querySelector('.bar');
    var vs = getComputedStyle(veil), bs = getComputedStyle(bar);
    return {
      contrast: blend.contrast, lum: blend.lum, tint: blend.tint.join(','), ink: blend.ink.join(','), veilEnd: blend.veil[2][3],
      border: bs.borderTopWidth, mask: vs.getPropertyValue('mask-image') || vs.getPropertyValue('-webkit-mask-image'),
      animation: vs.animationName, opacity: vs.opacity, background: vs.backgroundImage
    };
  }
  var api = window.__versePhase = {
    run: run, blend: blend, paint: shownPaint,
    toggle: function () {
      var open = host.style.display === 'none';
      host.style.display = open ? 'flex' : 'none';
      if (open) { blend = apply(samplePage()); api.blend = blend; }
    }
  };
  out.textContent = 'Phase is over this page: ' + words().split(' ').filter(Boolean).length + ' words read, here in your browser.';
  input.focus();
})();
