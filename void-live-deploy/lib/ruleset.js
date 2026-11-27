// Rules for a change onto main: required checks, held paths, a max file size, and whether those
// rules are enforced or only evaluated. The caller passes the rules and the change. This file
// does not read the network, the store or the clock, so the same inputs always give the same answer.
//
//   rules: { required_checks:[name], restrict_paths:[{ glob, reason, until_pr }], max_file_bytes, mode }
//   change: { files:[{ path, bytes }], runs:[{ name, state, conclusion }], pr? }
//   evaluate(rules, change) -> { ok, violations:[{ rule, path?, reason, mode }] }
//
// Enforce mode: ok is false when any violation is listed. Evaluate mode lists the same violations
// and ok stays true. A glob's * stays inside one path segment and ** crosses segments. Brackets in
// a glob are literal characters. A path or a glob with a .. segment or a leading / is refused.
// until_pr is the change request that already holds that glob; it may still touch those paths.
// A required check passes only when every run of its name is done (or has no state) and its
// conclusion is pass. Tests: tools/ruleset.test.mjs.

export const RULESET = Object.freeze({
  modes: Object.freeze(['enforce', 'evaluate']),
  pass: 'pass',
  done: 'done',
  rules: Object.freeze(['required_checks', 'restrict_paths', 'max_file_bytes', 'path']),
  maxReason: 300,
  maxSegments: 64,
});

const REFUSED = 'paths with .. or a leading / are refused';

/** '' when a repo-relative path is usable, otherwise a plain reason. Pure. */
export function pathRefused(p) {
  if (typeof p !== 'string' || p.length === 0 || p.startsWith('/')) return REFUSED;
  const parts = p.split('/');
  if (parts.some((seg) => seg === '..')) return REFUSED;
  if (parts.length > RULESET.maxSegments || parts.some((seg) => seg.length > 240)) return 'path is too long to check';
  return '';
}

function clip(reason) {
  const text = String(reason || '').replace(/\s+/g, ' ').trim();
  return text.length <= RULESET.maxReason ? text : text.slice(0, RULESET.maxReason);
}

function violation(rule, mode, reason, path) {
  const row = { rule, reason: clip(reason), mode };
  if (typeof path === 'string' && path) row.path = path;
  return row;
}

// One path segment. * matches any characters inside that segment, never a slash (the caller split those off).
function segmentMatch(pattern, text) {
  let pi = 0;
  let ti = 0;
  let star = -1;
  let mark = 0;
  while (ti < text.length) {
    if (pi < pattern.length && pattern[pi] === '*') {
      star = pi;
      pi += 1;
      mark = ti;
    } else if (pi < pattern.length && pattern[pi] === text[ti]) {
      pi += 1;
      ti += 1;
    } else if (star >= 0) {
      pi = star + 1;
      mark += 1;
      ti = mark;
    } else {
      return false;
    }
  }
  while (pi < pattern.length && pattern[pi] === '*') pi += 1;
  return pi === pattern.length;
}

// ** is its own segment. In the middle it may match zero segments (so **/name matches a root file).
// A trailing ** matches the files inside, at least one segment, and not the directory path itself.
function partsMatch(globParts, pathParts) {
  const memo = new Map();
  function go(gi, pi) {
    const key = gi + ':' + pi;
    if (memo.has(key)) return memo.get(key);
    let ok = false;
    if (gi === globParts.length) {
      ok = pi === pathParts.length;
    } else if (globParts[gi] === '**') {
      const trailing = gi + 1 === globParts.length;
      const start = trailing ? pi + 1 : pi;
      for (let k = start; k <= pathParts.length; k += 1) {
        if (go(gi + 1, k)) { ok = true; break; }
      }
    } else if (pi < pathParts.length && segmentMatch(globParts[gi], pathParts[pi])) {
      ok = go(gi + 1, pi + 1);
    }
    memo.set(key, ok);
    return ok;
  }
  return go(0, 0);
}

/** true when filePath matches glob. A refused path or glob never matches. Pure. */
export function matchGlob(glob, filePath) {
  if (pathRefused(glob) || pathRefused(filePath)) return false;
  return partsMatch(glob.split('/'), filePath.split('/'));
}

function runPassed(run) {
  if (!run || typeof run !== 'object') return false;
  if (run.state != null && run.state !== RULESET.done) return false;
  return run.conclusion === RULESET.pass;
}

function checkViolations(rules, runs, mode, out) {
  const names = Array.isArray(rules.required_checks) ? rules.required_checks : [];
  const list = Array.isArray(runs) ? runs : [];
  const seen = new Set();
  for (const name of names) {
    if (typeof name !== 'string' || !name || seen.has(name)) continue;
    seen.add(name);
    const mine = list.filter((run) => run && run.name === name);
    if (mine.length === 0) out.push(violation('required_checks', mode, 'required check ' + name + ' is missing'));
    else if (!mine.every(runPassed)) out.push(violation('required_checks', mode, 'required check ' + name + ' did not pass'));
  }
}

function samePr(until, pr) {
  return typeof until === 'number' && typeof pr === 'number' && until > 0 && until === pr;
}

function pathViolations(rules, change, mode, out) {
  const globs = [];
  const listed = Array.isArray(rules.restrict_paths) ? rules.restrict_paths : [];
  for (const entry of listed) {
    if (!entry || typeof entry !== 'object') continue;
    const glob = entry.glob;
    const why = typeof glob === 'string' ? pathRefused(glob) : 'a path restriction needs a glob';
    if (why) { out.push(violation('restrict_paths', mode, why)); continue; }
    globs.push(entry);
  }
  const max = rules.max_file_bytes;
  const files = Array.isArray(change.files) ? change.files : [];
  for (const file of files) {
    const filePath = file && file.path;
    const why = pathRefused(filePath);
    if (why) {
      out.push(violation('path', mode, why, typeof filePath === 'string' ? filePath : ''));
      continue;
    }
    if (Number.isFinite(max) && max >= 0 && Number.isFinite(file.bytes) && file.bytes > max) {
      out.push(violation('max_file_bytes', mode, 'file is over the ' + max + ' byte limit', filePath));
    }
    for (const entry of globs) {
      if (samePr(entry.until_pr, change.pr)) continue;
      if (matchGlob(entry.glob, filePath)) {
        out.push(violation('restrict_paths', mode, entry.reason || 'path matches a restricted glob', filePath));
      }
    }
  }
}

/** Apply rules to one change. Does not mutate rules or change. Pure. */
export function evaluate(rules, change) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) throw new Error('rules must be an object');
  if (!RULESET.modes.includes(rules.mode)) throw new Error('mode must be enforce or evaluate');
  const mode = rules.mode;
  const box = change && typeof change === 'object' ? change : {};
  const violations = [];
  pathViolations(rules, box, mode, violations);
  checkViolations(rules, box.runs, mode, violations);
  return { ok: mode === 'evaluate' ? true : violations.length === 0, violations };
}
