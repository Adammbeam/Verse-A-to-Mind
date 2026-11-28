/**
 * Verse Teardown: the shape of one public page, without its prose.
 * Paths, counts and labels of at most six words. No network. Pure.
 * Tests: tools/teardown-map.test.mjs.
 */
export const TEARDOWN_MAP = Object.freeze({ LABEL_WORDS: 6, MAX_STRING: 60 });

const fit = (s) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > TEARDOWN_MAP.MAX_STRING ? t.slice(0, TEARDOWN_MAP.MAX_STRING) : t;
};
const labelOf = (s) => fit(String(s ?? '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).slice(0, TEARDOWN_MAP.LABEL_WORDS).join(' '));
const strip = (html) => String(html ?? '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
const attr = (raw, name) => {
  const m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(raw || '');
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
};
const hrefs = (html) => [...String(html || '').matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
const required = (raw) => /(?:^|\s)required(?:\s|=|$|\/)/i.test(raw || '');

function pathOf(href, base) {
  const raw = String(href ?? '').trim();
  if (!raw || /^(?:javascript|data|mailto|tel):/i.test(raw)) return '';
  try {
    const u = new URL(raw, base || 'https://teardown.invalid/');
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const p = u.pathname || '/';
    return fit(p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);
  } catch { return ''; }
}

/** Structure only: nav paths, short heading labels, form fields, button count, api paths. */
export function mapPage(html, url) {
  const src = strip(html);
  let base = '';
  try { const u = new URL(String(url || '')); u.hash = ''; u.search = ''; base = u.href; } catch { base = fit(url); }
  const title = (src.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const nav = [];
  for (const block of src.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gi)) {
    for (const href of hrefs(block[1])) { const p = pathOf(href, base); if (p && !nav.includes(p)) nav.push(p); }
  }
  const headings = [...src.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: Number(m[1]), words: labelOf(m[2]) }));
  const forms = [];
  for (const m of src.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const fields = [];
    for (const im of m[2].matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
      const tag = im[1].toLowerCase();
      const type = tag === 'input' ? (attr(im[2], 'type') || 'text').toLowerCase() : tag;
      if (type === 'submit' || type === 'button' || type === 'image' || type === 'reset') continue;
      fields.push({ type: fit(type), required: required(im[2]) });
    }
    const method = (attr(m[1], 'method') || 'get').toLowerCase();
    forms.push({ action_path: pathOf(attr(m[1], 'action') || '/', base) || '/', method: method === 'post' ? 'post' : 'get', fields });
  }
  const buttons = (src.match(/<button\b/gi) || []).length + (src.match(/<input\b[^>]*\btype\s*=\s*["']?(?:submit|button)["']?/gi) || []).length;
  const api = [];
  const addApi = (p) => { if (p && /\/api(?:\/|$)/.test(p) && !api.includes(p)) api.push(p); };
  for (const href of hrefs(src)) addApi(pathOf(href, base));
  for (const f of forms) addApi(f.action_path);
  return { url: fit(base), title_len: title.length, nav, headings, forms, buttons, api_paths: api };
}
