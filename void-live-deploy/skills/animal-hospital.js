/**
 * animal-hospital skill — a name Wikipedia has no article for, but people ask about: "Animal Hospital (video game)".
 * The wanted-page sweep found the red link and handed it over as a gap. This card answers the title as data:
 * two real veterinary games have carried the name, and the BBC show is a different thing. Facts are paraphrased
 * from Nintendo's own product pages and Wikipedia's Animal Hospital article; no outside code is used.
 * Contract: { name, examples, nearMisses, match(lower, text), run(text, api) }
 */
export const about = 'A card for the Animal Hospital video-game title: the 3DS game also called Pet Hospital, the 2023 Switch game, and the BBC show they are not.';

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[?!.]+$/, '').replace(/\s+/g, ' ').trim();
/** true only for asks that name the game, not the bare title or the television show. Pure. */
export function gameAsk(text) {
  const t = norm(text);
  if (!/\b(?:animal hospital|pet hospital)\b/.test(t)) return false;
  return /\b(?:video game|videogame)\b|\(video game\)|\b(?:2013|2023)\b|\bpet hospital\b/.test(t);
}

export const CARD = {
  title: 'Animal Hospital (video game)',
  sub: 'Two veterinary games share the name · not the BBC television show',
  intro: 'Wikipedia has no article under this exact title. The name points to vet games, not to the 1994–2004 BBC series.',
  games: [
    {
      title: 'Animal Hospital / Pet Hospital (2013)',
      body: 'A veterinary simulation for the Nintendo 3DS, developed by Neopica and published by BigBen Interactive (Nacon). The player runs a clinic, examines sick animals and expands the surgery. Nintendo’s European listing gives dogs, cats, horses and birds as patients, a 13 September 2013 physical release and a 24 October 2013 download. In North America it was sold as Pet Hospital.',
    },
    {
      title: 'Animal Hospital (2023)',
      body: 'A veterinary management game developed by Tivola and published by Nacon, released for Nintendo Switch on 19 October 2023. The player decorates a clinic, examines animals from cats and dogs to pandas, foxes, koalas and unicorns, plays diagnosis mini-games, then feeds and cares for patients while they recover and unlocks new equipment.',
    },
  ],
  sources: [
    { label: 'Wikipedia — Animal Hospital (the television show)', href: 'https://en.wikipedia.org/wiki/Animal_Hospital' },
    { label: 'Nintendo UK — Animal Hospital for Nintendo 3DS', href: 'https://www.nintendo.com/en-gb/Games/Nintendo-3DS-games/Animal-Hospital-805906.html' },
    { label: 'Nintendo — Animal Hospital for Nintendo Switch', href: 'https://www.nintendo.com/us/store/products/animal-hospital-switch' },
  ],
  asOf: '2026-11',
  say: 'Two veterinary games share the name Animal Hospital: the 3DS game sold as Pet Hospital in North America, and the 2023 Switch game by Tivola. Neither is the BBC show.',
};

/** the card's markup, built from the static facts above and escaped by the caller's esc. Pure. */
export function cardHtml(c, esc) {
  const games = c.games.map((g) => '<section class="ah-game"><h3>' + esc(g.title) + '</h3><p>' + esc(g.body) + '</p></section>').join('');
  const src = c.sources.map((s) => '<a href="' + esc(s.href) + '" target="_blank" rel="noopener">' + esc(s.label) + '</a>').join(' · ');
  return '<style>.ah-game{border-left:2px solid rgba(255,210,122,.55);padding:2px 0 2px 12px;margin:10px 0}.ah-game h3{font-size:15px;margin:0 0 4px}.ah-game p{margin:0;font-size:14px;line-height:1.5}.ah-note{font-size:13px;color:var(--muted);margin-top:10px}</style>'
    + '<h2>' + esc(c.title) + '</h2><div class="sub">' + esc(c.sub) + '</div>'
    + '<p>' + esc(c.intro) + '</p>' + games
    + '<div class="ah-note">The television show is Rolf Harris’s BBC One programme; it is not either game.</div>'
    + '<div class="src">Sources: ' + src + ' · as of ' + esc(c.asOf) + '</div>';
}

function run(text, api) {
  const { showPage, esc } = api;
  showPage((el) => {
    el.className = 'animal-hospital';
    el.dataset.cardDesc = 'Video game — veterinary simulation';
    el.dataset.cardAlso = 'video game,veterinary simulation';
    el.innerHTML = cardHtml(CARD, esc);
  });
  api.say(CARD.say);
  return 'animal-hospital';
}

export default {
  name: 'animal-hospital',
  examples: ['Animal Hospital (video game)', 'Animal Hospital video game', 'what is Animal Hospital the video game', 'Pet Hospital (2013 video game)'],
  nearMisses: ['Animal Hospital', 'Animal Hospital TV show', 'tell me about the Animal Hospital skill'],
  match(lower, text) { return gameAsk(text || lower); },
  run,
  suite() { return { ok: gameAsk('Animal Hospital (video game)') && !gameAsk('Animal Hospital') && !gameAsk('Animal Hospital TV show'), got: 'the game title routes, the bare name and the show do not' }; },
};
