// Teardown repo mode. A public repository becomes counts and a license class.
import { parseRepo, get, clean } from './repo-look.js';
export const VERDICTS = Object.freeze({ CREDIT: 'ok-with-credit', STUDY: 'study-only' });
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
const OPENAPI = /(?:^|\/)(?:openapi|swagger)[^/]*\.json$/i;
const GRAPHQL = /(?:^|\/)[^/]+\.graphqls?$/i;
export function licenseVerdict(spdx) {
  const id = String(spdx || '').trim();
  if (!id || /^(?:NOASSERTION|NONE|UNLICENSED)$/i.test(id)) return VERDICTS.STUDY;
  const ok = id.split(/\s+(?:AND|OR|WITH)\s+/i).some((part) => /^(?:MIT|Apache|BSD|0BSD)\b/i.test(part.trim()));
  return ok ? VERDICTS.CREDIT : VERDICTS.STUDY;
}
function words6(text) {
  const plain = String(text || '').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, ' ').replace(/[`*_]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean(plain.split(' ').filter(Boolean).slice(0, 6).join(' '), 80);
}
export function readmeHeadings(md) {
  const out = [];
  let fence = false;
  for (const line of String(md || '').slice(0, 20000).split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('```')) { fence = !fence; continue; }
    if (fence) continue;
    const m = /^(#{1,6})\s+(.+)$/.exec(t);
    if (!m) continue;
    const words = words6(m[2]);
    if (words) out.push({ level: m[1].length, words });
    if (out.length >= 40) break;
  }
  return out;
}
export function openapiOps(doc) {
  const paths = doc && typeof doc.paths === 'object' && doc.paths ? doc.paths : {};
  const by_segment = {}, by_tag = {};
  let total = 0;
  for (const [path, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue;
    const area = clean((String(path).split('/').filter(Boolean)[0] || 'root').replace(/[{}]/g, ''), 40) || 'root';
    for (const [method, op] of Object.entries(item)) {
      if (!METHODS.has(String(method).toLowerCase())) continue;
      total += 1;
      by_segment[area] = (by_segment[area] || 0) + 1;
      for (const tag of (op && Array.isArray(op.tags) ? op.tags : []).slice(0, 4)) {
        const name = clean(tag, 40);
        if (name) by_tag[name] = (by_tag[name] || 0) + 1;
      }
    }
  }
  return { by_segment, by_tag, total };
}
export function graphqlCounts(sdl) {
  const text = String(sdl || '').replace(/"""[\s\S]*?"""/g, ' ').replace(/#[^\n]*/g, ' ').replace(/"(?:\\.|[^"\\\n])*"/g, ' ');
  return {
    types: (text.match(/(^|\n)\s*(?:type|interface|input|union|scalar)\s+[A-Za-z_]/g) || []).length,
    enums: (text.match(/(^|\n)\s*enum\s+[A-Za-z_]/g) || []).length,
  };
}
function safePath(p) {
  const s = String(p || '');
  return !s || s.startsWith('/') || s.includes('..') || s.includes('\\') || s.length > 180 ? '' : s;
}
async function rawFile(fetchFn, repo, path) {
  const enc = safePath(path).split('/').map((part) => encodeURIComponent(part)).join('/');
  const res = await get(fetchFn, '/repos/' + repo + '/contents/' + enc, 'application/vnd.github.raw');
  return String(res.text || '').slice(0, 180000);
}
export async function inventory(input, fetchFn) {
  const repo = parseRepo(input);
  if (!repo) return { ok: false, reason: 'That is not a public repository name. Give owner and name.' };
  if (typeof fetchFn !== 'function') return { ok: false, reason: 'The public repository could not be read.' };
  const meta = await get(fetchFn, '/repos/' + repo);
  if (meta.status === 404) return { ok: false, reason: 'That public repository was not found.' };
  if (meta.limited) return { ok: false, reason: 'The repository host is limiting requests. Try again later.' };
  if (meta.status !== 200 || !meta.json || meta.json.private) return { ok: false, reason: meta.json && meta.json.private ? 'Only a public repository can be measured.' : 'The public repository could not be read.' };
  const spdx = meta.json.license && meta.json.license.spdx_id;
  const license = spdx && !/^(?:NOASSERTION|NONE)$/i.test(String(spdx)) ? String(spdx).slice(0, 40) : '';
  const branch = String(meta.json.default_branch || 'main').replace(/[^A-Za-z0-9._/-]/g, '').slice(0, 80) || 'main';
  const readme = await get(fetchFn, '/repos/' + repo + '/readme', 'application/vnd.github.raw');
  const tree = await get(fetchFn, '/repos/' + repo + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1');
  const files = tree.json && Array.isArray(tree.json.tree) ? tree.json.tree : [];
  const listed = (re) => files.filter((f) => f && f.type === 'blob' && safePath(f.path) && re.test(f.path) && !(Number(f.size) > 500000)).slice(0, 3);
  const by_segment = {}, by_tag = {};
  let total = 0, types = 0, enums = 0;
  for (const file of listed(OPENAPI)) {
    let doc = null;
    try { doc = JSON.parse(await rawFile(fetchFn, repo, file.path)); } catch (_) { doc = null; }
    const ops = openapiOps(doc);
    total += ops.total;
    for (const [key, n] of Object.entries(ops.by_segment)) by_segment[key] = (by_segment[key] || 0) + n;
    for (const [key, n] of Object.entries(ops.by_tag)) by_tag[key] = (by_tag[key] || 0) + n;
  }
  for (const file of listed(GRAPHQL)) {
    const counts = graphqlCounts(await rawFile(fetchFn, repo, file.path));
    types += counts.types;
    enums += counts.enums;
  }
  return {
    ok: true, repo, license: license || null, verdict: licenseVerdict(license), headings: readmeHeadings(readme.text || ''),
    openapi: { by_segment, by_tag, total }, graphql: { types, enums },
  };
}
