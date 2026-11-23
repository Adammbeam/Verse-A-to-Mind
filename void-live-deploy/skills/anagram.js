/**
 * anagram skill — scramble a word or check if two words are anagrams.
 * "anagram of listen", "are silent and listen anagrams", "scramble the word".
 */
export function isAnagram(text) {
  const t = String(text || '').trim().replace(/[?!.]+$/, '');
  return /^(?:anagram|scramble)\b/i.test(t) || /\bare\s+\w+\s+and\s+\w+\s+anagrams\b/i.test(t);
}

function normalize(w) { return String(w || '').toLowerCase().replace(/[^a-z]/g, '').split('').sort().join(''); }

function run(text, api) {
  const { showPage, esc } = api;
  const t = String(text || '');
  const m = t.match(/anagrams?\s+(?:of\s+)?(\w+)\s+(?:and\s+)?(\w+)/i) || t.match(/are\s+(\w+)\s+and\s+(\w+)\s+anagrams/i);
  let html = '<h2>Anagram</h2>';
  if (m) {
    const a = normalize(m[1]), b = normalize(m[2]);
    const yes = a && a === b && a.length > 1;
    html += `<p>${esc(m[1])} and ${esc(m[2])} ${yes ? 'are' : 'are not'} anagrams.</p>`;
  } else {
    const w = (t.match(/\b(?:of|the word)\s+(\w+)/i) || [])[1] || 'listen';
    const scrambled = normalize(w).split('').sort(() => Math.random() - 0.5).join('');
    html += `<p>Anagram of ${esc(w)}: <strong>${esc(scrambled)}</strong></p>`;
  }
  showPage(el => { el.innerHTML = html; });
  return 'anagram';
}

export default {
  name: 'anagram',
  examples: ['anagram of listen', 'are silent and listen anagrams', 'scramble the word hello'],
  nearMisses: ['anagrams are fun', 'what is an anagram'],
  match(lower, text) { return isAnagram(text || lower); },
  run,
  suite() {
    return { ok: isAnagram('anagram of listen') && isAnagram('are silent and listen anagrams') && !isAnagram('what is an anagram') };
  }
};
