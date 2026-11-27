// A code-search query, split into words, "exact phrases", path/lang/sym qualifiers,
// words to leave out, and at most one /pattern/. A pattern longer than 100 characters,
// or one that puts a quantifier on a piece that already has a quantifier, is refused
// with a plain sentence. Pure: no network, no clock, no store. The pattern is kept as
// text and is never compiled.
// Tests: tools/code-query.test.mjs

/** Caps and the qualifier names this parser understands. An unknown name:value stays a word. */
export const CODE_QUERY = Object.freeze({
  maxPattern: 100,
  qualifiers: Object.freeze(['path', 'lang', 'sym']),
});

const QUALIFIER = new Set(CODE_QUERY.qualifiers);

function refuse(sentence) {
  throw new Error(sentence);
}

/** How many characters a {n}, {n,} or {n,m} quantifier occupies, plus a lazy or possessive mark. 0 when it is not one. */
function braceQuantifier(s, i) {
  if (s[i] !== '{') return 0;
  let j = i + 1;
  const start = j;
  while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
  if (j === start) return 0;
  if (s[j] === ',') {
    j++;
    while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
  }
  if (s[j] !== '}') return 0;
  j++;
  if (s[j] === '?' || s[j] === '+') j++;
  return j - i;
}

/** Length of one quantifier at i, or 0. A following ? or + is the lazy or possessive mark, not a second quantifier. */
function quantifierLen(s, i) {
  const c = s[i];
  if (c === '*' || c === '+' || c === '?') return (s[i + 1] === '?' || s[i + 1] === '+') ? 2 : 1;
  return braceQuantifier(s, i);
}

/** Index just after a character class that starts at i. An unclosed class ends at the string. */
function afterClass(s, i) {
  let j = i + 1;
  if (s[j] === '^') j++;
  if (s[j] === ']') j++;
  while (j < s.length) {
    if (s[j] === '\\') { j += 2; continue; }
    if (s[j] === ']') return j + 1;
    j++;
  }
  return j;
}

/** Index just after '(' or after a (?: (?= (?! (?<= (?<! (?<name> opener. */
function afterGroupOpen(s, i) {
  const q = i + 1;
  if (s[q] !== '?') return q;
  const k = s[q + 1];
  if (k === ':' || k === '=' || k === '!') return q + 2;
  if (k === '<') {
    let p = q + 2;
    if (s[p] === '=' || s[p] === '!') return p + 1;
    const start = p;
    while (p < s.length && ((s[p] >= 'A' && s[p] <= 'Z') || (s[p] >= 'a' && s[p] <= 'z') || (s[p] >= '0' && s[p] <= '9') || s[p] === '_')) p++;
    if (p > start && s[p] === '>') return p + 1;
  }
  return q;
}

/**
 * True when a quantifier applies to a group that already contains one, or sits on another quantifier.
 * *, +, ?, {n,m} and their lazy or possessive forms count. A quantifier inside [] does not.
 * Pure.
 */
export function nestsQuantifiers(pattern) {
  const s = String(pattern ?? '');
  const stack = [];
  let i = 0;
  let prev = 'none';
  let groupHas = false;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') { i += 2; prev = 'atom'; continue; }
    if (c === '[') { i = afterClass(s, i); prev = 'atom'; continue; }
    if (c === '(') { i = afterGroupOpen(s, i); stack.push(false); prev = 'none'; continue; }
    if (c === ')') { groupHas = stack.length ? stack.pop() : false; prev = 'group'; i++; continue; }
    if (c === '|') { prev = 'none'; i++; continue; }
    const qn = quantifierLen(s, i);
    if (qn && (prev === 'atom' || prev === 'group' || prev === 'quant')) {
      if (prev === 'quant' || (prev === 'group' && groupHas)) return true;
      for (let g = 0; g < stack.length; g++) stack[g] = true;
      prev = 'quant';
      i += qn;
      continue;
    }
    prev = 'atom';
    i++;
  }
  return false;
}

/** A plain sentence when the pattern is empty, too long, or nests quantifiers; '' when it may be kept. Pure. */
export function patternProblem(pattern) {
  const text = String(pattern ?? '');
  if (!text) return 'A pattern needs characters between the slashes.';
  if (text.length > CODE_QUERY.maxPattern) return 'A pattern can be at most ' + CODE_QUERY.maxPattern + ' characters.';
  if (nestsQuantifiers(text)) return 'That pattern nests one quantifier inside another, so it was refused.';
  return '';
}

function readQuoted(src, at) {
  const n = src.length;
  let i = at + 1;
  let out = '';
  while (i < n) {
    if (src[i] === '\\' && i + 1 < n) { out += src[i + 1]; i += 2; continue; }
    if (src[i] === '"') {
      const text = out.trim();
      if (!text) return { error: 'A quoted phrase needs at least one word.' };
      return { text, i: i + 1 };
    }
    out += src[i];
    i++;
  }
  return { error: 'A quoted phrase was left open.' };
}

function readPattern(src, at) {
  const n = src.length;
  let i = at + 1;
  let out = '';
  while (i < n) {
    if (src[i] === '\\' && i + 1 < n) { out += src[i] + src[i + 1]; i += 2; continue; }
    if (src[i] === '/') return { text: out, i: i + 1 };
    out += src[i];
    i++;
  }
  return { error: 'A pattern was left open.' };
}

function readWord(src, at) {
  let i = at;
  while (i < src.length && !/\s/.test(src[i])) i++;
  return { text: src.slice(at, i), i };
}

function qualifierOf(word) {
  const cut = word.indexOf(':');
  if (cut <= 0) return null;
  const name = word.slice(0, cut).toLowerCase();
  if (!QUALIFIER.has(name)) return null;
  let value = word.slice(cut + 1).trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).trim();
  return { name, value };
}

/**
 * Parse one code-search query into { terms, phrases, path, lang, sym, not, regex }.
 * path, lang, sym and regex are null when absent. A repeated qualifier keeps the last value.
 * Throws an Error whose message is one plain sentence.
 */
export function parseCodeQuery(raw) {
  const src = String(raw ?? '');
  if (!src.trim()) refuse('Type a word, a phrase or a pattern.');
  const terms = [];
  const phrases = [];
  const not = [];
  const slot = { path: null, lang: null, sym: null };
  let regex = null;
  let i = 0;
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) break;
    if (src[i] === '-' && (i + 1 >= src.length || /\s/.test(src[i + 1]))) refuse('A minus needs a word to leave out.');
    const neg = src[i] === '-';
    if (neg) i++;
    if (src[i] === '"') {
      const got = readQuoted(src, i);
      if (got.error) refuse(got.error);
      (neg ? not : phrases).push(got.text);
      i = got.i;
      continue;
    }
    if (src[i] === '/') {
      const got = readPattern(src, i);
      if (got.error) refuse(got.error);
      const problem = patternProblem(got.text);
      if (problem) refuse(problem);
      if (neg) refuse('A pattern cannot start with a minus.');
      if (regex !== null) refuse('Only one pattern is allowed in a query.');
      regex = got.text;
      i = got.i;
      continue;
    }
    const word = readWord(src, i);
    i = word.i;
    if (neg) { not.push(word.text); continue; }
    const q = qualifierOf(word.text);
    if (!q) { terms.push(word.text); continue; }
    if (!q.value) refuse('The ' + q.name + ' qualifier needs a value after the colon.');
    slot[q.name] = q.value;
  }
  return Object.freeze({
    terms: Object.freeze(terms),
    phrases: Object.freeze(phrases),
    path: slot.path,
    lang: slot.lang,
    sym: slot.sym,
    not: Object.freeze(not),
    regex,
  });
}
