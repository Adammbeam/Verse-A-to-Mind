// Scene structure for Verse Shorts and the podcast.
// Four beats, in order: hook, turn, payoff, close.
// Critic stays named Critic. He is overconfident, then the fact beats him.
// A short is two to four tight scenes and its hook is at most 12 words.
// An episode uses the same beats and keeps Critic's running bit: he comes back sure, then loses.
// Pure. No network, no clock, no store. The input object is only read.

export const BEATS = Object.freeze(['hook', 'turn', 'payoff', 'close']);

const HOOK_WORDS = 12;
const SHORT_MIN = 2;
const SHORT_MAX = 4;
const PAYOFF_WORDS = 28;

const JARGON = /\b(?:queue job|depends_on|openids|lane_[a-z0-9_]+|void\.voice|helper\/[\w.-]+|(?:tools|void-live-deploy|functions)\/[\w./-]+)\b|\/[\w.-]+\.(?:mjs|js|yml|json|md)\b/i;
const CRUEL = /\b(?:idiot|stupid|moron|hate you|waste of|you are a mistake|shut up|dumb|worthless)\b/i;
const SURE = /\b(?:obviously|of course|everyone knows|impossible|guarantee|no way|too silly|i bet)\b/i;
const LOSES = /\b(?:i lose|i was wrong|you were right|you win|fair enough)\b|\bfine[.!]/i;
const ASK_VERSE = /\bask\b/i;
const VERSE_WORD = /\bverse\b/i;
const SITE = /a-to-mind\.com/i;
const INSIDE = /\b(?:ledger|workflow|deploy|commit|regex|endpoint|payload|schema|runtime)\b/i;

function linesOf(show) {
  return show && Array.isArray(show.lines) ? show.lines : [];
}

function textOf(line) {
  return line && line.text != null ? String(line.text) : '';
}

function words(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

function numbersIn(text) {
  return String(text || '').match(/\b\d[\d,]*\b/g) || [];
}

function isCloseLine(line) {
  const t = textOf(line);
  return SITE.test(t) && ASK_VERSE.test(t) && VERSE_WORD.test(t);
}

function range(lines, from, to) {
  const out = [];
  for (let i = from; i <= to && i < lines.length; i++) out.push(lines[i]);
  return out;
}

function scene(beat, lines, from, to) {
  const span = range(lines, from, to);
  let who = span[0] && span[0].who ? span[0].who : '';
  if (beat === 'turn') {
    const critic = span.find((l) => l && l.who === 'Critic');
    if (critic) who = 'Critic';
  }
  if (beat === 'payoff') {
    const fact = span.find((l) => numbersIn(textOf(l)).length > 0);
    if (fact && fact.who) who = fact.who;
  }
  return { beat, who, from, to };
}

/** Group dialogue lines into hook, turn, payoff, and close. from and to are inclusive line indexes. */
export function scenesOf(show) {
  const lines = linesOf(show);
  if (!lines.length) return [];

  let closeFrom = lines.length;
  while (closeFrom > 0 && isCloseLine(lines[closeFrom - 1])) closeFrom -= 1;
  const hasClose = closeFrom < lines.length;
  const bodyEnd = hasClose ? closeFrom : lines.length;
  if (bodyEnd <= 0 && hasClose) return [scene('close', lines, closeFrom, lines.length - 1)];

  let hookTo = 0;
  for (let i = 1; i < bodyEnd; i++) {
    const line = lines[i];
    if (!line || line.who === 'Critic' || numbersIn(textOf(line)).length > 0) break;
    hookTo = i;
  }

  let payoffAt = -1;
  for (let i = bodyEnd - 1; i > hookTo; i--) {
    if (numbersIn(textOf(lines[i])).length > 0) { payoffAt = i; break; }
  }

  const scenes = [scene('hook', lines, 0, Math.min(hookTo, bodyEnd - 1))];
  const turnEnd = payoffAt > hookTo ? payoffAt - 1 : bodyEnd - 1;
  if (turnEnd > hookTo) scenes.push(scene('turn', lines, hookTo + 1, turnEnd));
  if (payoffAt > hookTo) scenes.push(scene('payoff', lines, payoffAt, bodyEnd - 1));
  if (hasClose) scenes.push(scene('close', lines, closeFrom, lines.length - 1));
  return scenes;
}

function hasWho(lines, name) {
  return lines.some((l) => l && l.who === name);
}

function criticLoses(lines) {
  let sureAt = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] && lines[i].who === 'Critic' && SURE.test(textOf(lines[i]))) { sureAt = i; break; }
  }
  if (sureAt < 0) return false;
  for (let i = sureAt + 1; i < lines.length; i++) {
    if (LOSES.test(textOf(lines[i]))) return true;
    if (lines[i] && lines[i].who === 'Verse' && numbersIn(textOf(lines[i])).length === 1) return true;
  }
  return false;
}

function runningBit(lines) {
  const critic = lines.filter((l) => l && l.who === 'Critic' && !isCloseLine(l));
  return critic.length >= 2 && criticLoses(lines);
}

function payoffOk(lines, scenes) {
  const found = scenes.find((s) => s.beat === 'payoff');
  if (!found) return false;
  const span = range(lines, found.from, found.to);
  const joined = span.map(textOf).join(' ');
  if (numbersIn(joined).length !== 1) return false;
  const fact = span.find((l) => numbersIn(textOf(l)).length === 1);
  if (!fact) return false;
  const t = textOf(fact).trim();
  if (!/[.!?]$/.test(t)) return false;
  if (words(t).length > PAYOFF_WORDS) return false;
  if (JARGON.test(t) || CRUEL.test(t) || INSIDE.test(t)) return false;
  return true;
}

function add(out, code) {
  if (code && !out.includes(code)) out.push(code);
}

/** Problems that keep a short or an episode from airing. Empty when the beats hold. */
export function sceneIssues(show, opts) {
  const kind = String(opts && opts.kind || 'short').toLowerCase() === 'episode' ? 'episode' : 'short';
  const lines = linesOf(show);
  const scenes = scenesOf(show);
  const out = [];
  const blob = [show && show.title, show && show.summary, ...lines.map(textOf)].join('\n');

  if (!scenes.length || scenes[0].beat !== 'hook') add(out, 'hook');
  if (kind === 'short') {
    const first = textOf(lines[0]);
    if (words(first).length > HOOK_WORDS) add(out, 'hook over 12 words');
    if (scenes.length < SHORT_MIN || scenes.length > SHORT_MAX) add(out, 'scenes');
  }
  if (!hasWho(lines, 'Critic')) add(out, 'missing Critic');
  if (!hasWho(lines, 'Verse')) add(out, 'missing Verse');

  const turn = scenes.find((s) => s.beat === 'turn');
  const turnLines = turn ? range(lines, turn.from, turn.to) : [];
  if (!turn || !turnLines.some((l) => l && l.who === 'Critic') || !criticLoses(lines)) add(out, 'turn');
  if (!payoffOk(lines, scenes)) add(out, 'payoff');
  const close = scenes.find((s) => s.beat === 'close');
  if (!close || !range(lines, close.from, close.to).some(isCloseLine)) add(out, 'close');
  if (kind === 'episode' && !runningBit(lines)) add(out, 'running bit');
  if (JARGON.test(blob)) add(out, 'jargon');
  if (CRUEL.test(blob)) add(out, 'cruel');
  return out;
}
