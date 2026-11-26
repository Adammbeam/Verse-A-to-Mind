/**
 * acronym skill — make an acronym from a phrase or expand a simple one.
 * "acronym of as soon as possible", "make an acronym for", "expand lol".
 */
export function isAcronym(text) {
  const t = String(text || '').trim().replace(/[?!.]+$/, '');
  return /^(?:acronym|make an acronym|expand)\b/i.test(t);
}

function makeAcronym(phrase) {
  return String(phrase || '').split(/\s+/).map(w => w[0] || '').join('').toUpperCase();
}

function run(text, api) {
  const { showPage, esc } = api;
  const t = String(text || '');
  const m = t.match(/(?:acronym of|for|expand)\s+(.+)/i);
  const phrase = m ? m[1].trim() : 'as soon as possible';
  const ac = makeAcronym(phrase);
  showPage(el => {
    el.innerHTML = `<h2>Acronym</h2><p>${esc(phrase)} → <strong>${esc(ac)}</strong></p>`;
  });
  return 'acronym';
}

export default {
  name: 'acronym',
  examples: ['acronym of as soon as possible', 'make an acronym for to be announced', 'expand lol'],
  nearMisses: ['what is an acronym', 'acronym list'],
  match(lower, text) { return isAcronym(text || lower); },
  run,
  suite() { return { ok: isAcronym('acronym of as soon as possible') && isAcronym('make an acronym for test') && !isAcronym('what is an acronym') }; }
};
