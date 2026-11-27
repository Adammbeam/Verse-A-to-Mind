// Turn node --test TAP into file and line notes a job card can show.
// Pure: no network, no store, no clock. Pass `root` (the checkout path) so an
// absolute path is cut down to this repo; a path outside that root is left out.
// A note is { path, line, level: "failure"|"warning", message }.

export const LIMITS = Object.freeze({
  maxNotes: 50,
  maxMessage: 200,
  levels: Object.freeze(['failure', 'warning']),
  anchors: Object.freeze(['tools/', 'void-live-deploy/']),
});

const KEY_SOURCE = 'gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}|AKIA[A-Z0-9]{16}|AIza[0-9A-Za-z_-]{30,}|xox[abposr]-[A-Za-z0-9-]{10,}';

/** Replace a key-shaped token with [redacted]. Pure. */
export function maskSecrets(text) {
  return String(text || '').replace(new RegExp('\\b(?:' + KEY_SOURCE + ')', 'g'), '[redacted]');
}

function unquote(value) {
  const s = String(value || '').trim();
  if (s.length >= 2 && ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"')))) return s.slice(1, -1);
  return s;
}

function splitLoc(raw) {
  const s = unquote(raw);
  const both = s.match(/^(.*):(\d+):(\d+)$/);
  if (both) return { file: both[1], line: Number(both[2]) };
  const one = s.match(/^(.*):(\d+)$/);
  if (one) return { file: one[1], line: Number(one[2]) };
  return { file: s, line: 0 };
}

function localFile(file) {
  let p = String(file || '').replace(/\\/g, '/');
  if (!p.startsWith('file://')) return p;
  try {
    const u = new URL(p);
    p = decodeURIComponent(u.pathname);
    if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
    return p;
  } catch {
    return '';
  }
}

function safeRelative(p) {
  const rel = p.replace(/^\.\//, '');
  if (!rel || rel.startsWith('/') || /^[A-Za-z]:\//.test(rel) || rel.split('/').includes('..')) return null;
  return rel;
}

/** Absolute or file-URL path -> { path, line } inside the repo, or null. Pure. */
export function repoPath(raw, root) {
  const { file, line } = splitLoc(raw);
  let p = localFile(file);
  if (!p || !line || p.split('/').includes('..')) return null;
  if (root) {
    const base = String(root).replace(/\\/g, '/').replace(/\/+$/, '');
    if (p === base || p.startsWith(base + '/')) p = p.slice(base.length).replace(/^\//, '');
    else if (p.startsWith('/') || /^[A-Za-z]:\//.test(p)) return null;
  } else if (p.startsWith('/') || /^[A-Za-z]:\//.test(p)) {
    const hit = p.match(/(?:^|\/)((?:tools|void-live-deploy)\/.+)$/);
    if (!hit) return null;
    p = hit[1];
  }
  p = safeRelative(p);
  if (!p) return null;
  if (maskSecrets(p) !== p) return null;
  return { path: p, line };
}

function unindent(chunk) {
  const widths = [];
  for (const line of chunk) if (line.trim()) widths.push(line.match(/^\s*/)[0].length);
  const n = widths.length ? Math.min(...widths) : 0;
  return chunk.map((line) => line.slice(n)).join('\n').replace(/\n+$/, '').trim();
}

function fields(lines) {
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)([A-Za-z_][\w]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const indent = m[1].length;
    const raw = m[3].trim();
    if (raw === '|-' || raw === '|' || raw === '>' || raw === '>-') {
      const chunk = [];
      let j = i + 1;
      while (j < lines.length) {
        const line = lines[j];
        if (line.trim() === '') { chunk.push(''); j++; continue; }
        if (line.match(/^\s*/)[0].length <= indent) break;
        chunk.push(line);
        j++;
      }
      out[m[2]] = unindent(chunk);
      i = j - 1;
    } else out[m[2]] = unquote(raw);
  }
  return out;
}

function blocks(tap) {
  const lines = String(tap == null ? '' : tap).split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const head = lines[i].match(/^(\s*)not ok\s+\d+\s*(?:-\s*(.*))?$/);
    if (!head) { i++; continue; }
    const indent = head[1].length;
    const rawName = (head[2] || '').trim();
    const body = [];
    i++;
    while (i < lines.length) {
      const line = lines[i];
      const ind = line.match(/^\s*/)[0].length;
      if (line.trim() === '...') { i++; break; }
      if (/^(?:ok|not ok)\s+\d+\b/.test(line.trim()) && ind <= indent) break;
      if (/^\d+\.\.\d+\s*$/.test(line.trim()) && ind <= indent) break;
      body.push(line);
      i++;
    }
    out.push({ name: rawName.replace(/\s+#\s*TODO\b.*$/i, '').trim(), todo: /#\s*TODO\b/i.test(rawName), body });
  }
  return out;
}

function stackHit(stack, root) {
  const re = /\b((?:file:\/\/\S+?|(?:tools|void-live-deploy)\/\S+?|\/\S+?)):(\d+):(\d+)/g;
  for (let m = re.exec(String(stack || '')); m; m = re.exec(String(stack || ''))) {
    const hit = repoPath(m[1] + ':' + m[2] + ':' + m[3], root);
    if (hit && LIMITS.anchors.some((a) => hit.path.startsWith(a))) return hit;
  }
  return null;
}

function clip(text) {
  return maskSecrets(String(text || '').replace(/\s+/g, ' ').trim()).slice(0, LIMITS.maxMessage);
}

function place(block, root) {
  const found = fields(block.body);
  const fromLoc = found.location ? repoPath(found.location, root) : null;
  const loc = fromLoc || stackHit(found.stack, root);
  if (!loc) return null;
  const todo = block.todo || found.failureType === 'todo';
  return {
    path: loc.path,
    line: loc.line,
    level: todo ? 'warning' : 'failure',
    message: clip(found.error || block.name || 'check failed'),
  };
}

/** TAP text from node --test -> at most 50 notes. Passing output is []. Pure. */
export function annotate(tap, options = {}) {
  const root = options && options.root;
  const notes = [];
  for (const block of blocks(tap)) {
    const note = place(block, root);
    if (!note) continue;
    notes.push(note);
    if (notes.length >= LIMITS.maxNotes) break;
  }
  return notes;
}
