/**
 * pig-latin skill — convert text to pig latin.
 * "pig latin hello", "convert to pig latin", "piglatin the phrase".
 */
export function isPigLatin(text) {
  const t = String(text || '').trim().replace(/[?!.]+$/, '');
  return /^(?:pig\s*latin|piglatin)\b/i.test(t);
}

function toPig(word) {
  const w = String(word || '');
  if (!w) return w;
  const m = w.match(/^([^aeiou]*)(.*)$/i);
  if (!m || !m[2]) return w + 'ay';
  return m[2] + m[1] + 'ay';
}

function run(text, api) {
  const { showPage, esc } = api;
  const phrase = String(text || '').replace(/^(?:pig\s*latin|piglatin)\s*/i, '').trim() || 'hello world';
  const converted = phrase.split(/\s+/).map(toPig).join(' ');
  showPage(el => {
    el.innerHTML = `<h2>Pig Latin</h2><p>${esc(phrase)} → <strong>${esc(converted)}</strong></p>`;
  });
  return 'pig-latin';
}

export default {
  name: 'pig-latin',
  examples: ['pig latin hello', 'piglatin the phrase good morning', 'convert to pig latin'],
  nearMisses: ['pig latin is a game', 'what is pig latin'],
  match(lower, text) { return isPigLatin(text || lower); },
  run,
  suite() { return { ok: isPigLatin('pig latin hello') && isPigLatin('piglatin test') && !isPigLatin('what is pig latin') }; }
};
