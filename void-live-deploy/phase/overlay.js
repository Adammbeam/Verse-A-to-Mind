// Phase over any page (the bookmarklet on /phase/ loads this). A see-through bar laid over the page you are on: it reads that page's words
// here in your browser and acts on the page when you ask: find and highlight, list the numbers, fill a box, press a button, or take the
// words to Verse. Nothing is sent anywhere unless you press "take to Verse", which opens a-to-mind.com/phase/ with the words in the
// address's #fragment (a browser never sends that part to a server). It never submits a form, and it refuses buttons that pay, buy,
// delete or send. Lives in a closed shadow root so the page cannot read or restyle it. Tested by tools/phase-live.mjs.
(function () {
  if (window.__versePhase) { window.__versePhase.toggle(); return; }
  var ORIGIN = 'https://a-to-mind.com';
  var RISKY = /\b(pay|payment|purchase|buy|checkout|check out|place order|order now|submit|send|delete|remove|transfer|confirm|sign out|log out|unsubscribe|cancel subscription)\b/i;
  var host = document.createElement('div'); host.setAttribute('data-verse-phase', '');
  host.style.cssText = 'position:fixed;left:0;right:0;bottom:12px;z-index:2147483647;display:flex;justify-content:center;pointer-events:none';
  var root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = '<style>.bar{pointer-events:auto;width:min(640px,calc(100vw - 20px));box-sizing:border-box;background:#10121ccc;backdrop-filter:blur(8px);color:#e8ecf4;border:1px solid #ffffff33;border-radius:14px;padding:8px 10px;font:14px/1.4 system-ui,sans-serif}'
    + 'input{width:100%;box-sizing:border-box;font:inherit;padding:7px 10px;border-radius:999px;border:1px solid #ffffff44;background:#ffffff14;color:inherit}.o{white-space:pre-wrap;max-height:30vh;overflow:auto;margin-top:6px;color:#c9d0e4}'
    + 'button{font:inherit;padding:3px 10px;margin:4px 4px 0 0;border-radius:999px;border:1px solid #ffffff44;background:#ffffff14;color:inherit;cursor:pointer}</style>'
    + '<div class="bar"><input placeholder="Phase: find …, numbers, fill … with …, click …, take to Verse" aria-label="Phase"><div class="o" role="status"></div>'
    + '<button data-q="numbers">numbers</button><button data-q="take to Verse">take to Verse</button><button data-q="close">close</button></div>';
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
      while ((m = re.exec(s))) { f.append(s.slice(last, m.index)); var k = document.createElement('mark'); k.setAttribute('data-verse-phase-mark', ''); k.textContent = m[0]; f.append(k); marks.push(k); last = m.index + m[0].length; }
      f.append(s.slice(last)); node.replaceWith(f);
    });
    if (marks[0]) marks[0].scrollIntoView({ block: 'center' });
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
  var api = window.__versePhase = { run: run, toggle: function () { host.style.display = host.style.display === 'none' ? 'flex' : 'none'; } };
  out.textContent = 'Phase is over this page: ' + words().split(' ').filter(Boolean).length + ' words read, here in your browser.';
  input.focus();
})();
