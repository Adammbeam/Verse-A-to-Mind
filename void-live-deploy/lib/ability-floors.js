// Ability floors for the Versus Tower. A floor is a plain-word job. Status comes from the
// capability inventory (tools/capability-sweep): pass is has (a working tool), partial with a
// page is part, and anything else is missing. Old site-floor ids stay in alias. No site names.

const P = (name, alias = []) => Object.freeze([name, alias]);

/** Jobs a person asks for that the inventory does not name as their own row. covers: inventory ids. */
export const WANTS = Object.freeze([
  { id: 'edit-a-video', name: 'edit a video', ask: 'trim the first 3 seconds off this video and add the caption hello', why: 'People want a clip trimmed, captioned or saved as a file they can send.', covers: ['make-video', 'convert-video-file'], alias: ['video'] },
  { id: 'translate-a-live-conversation', name: 'translate a live conversation', ask: 'translate what I say into Spanish as I speak', why: 'People want speech in one language to come back in another while the talk is still going.', covers: ['translate', 'transcribe'], alias: ['translate'] },
  { id: 'plan-a-week-of-meals', name: 'plan a week of meals', ask: 'plan a week of meals for two people from eggs, rice and beans', why: 'People want seven dinners from the food they already have, not one recipe.', covers: ['recipes'], alias: ['recipes'] },
  { id: 'read-a-receipt-photo', name: 'read a receipt photo', ask: 'read this receipt photo and list each item and the total', why: 'People want a photo of a receipt turned into lines and a total they can keep.', covers: ['ocr'], alias: [] },
]);

/** Plain names for inventory rows that are not a working tool. The second item is old floor ids. */
export const PLAIN = Object.freeze({
  'convert-pdf': P('edit a pdf', ['pdf']),
  'convert-image': P('convert a picture', ['photo resizer']),
  'build-website': P('build a one-page website'),
  budget: P('plan a month of spending', ['finance']),
  'remove-bg': P('remove a photo background'),
  upscale: P('enlarge a photo'),
  meme: P('caption a picture'),
  'email-draft': P('draft an email', ['email']),
  news: P("read today's news", ['news']),
  quiz: P('quiz me on a subject', ['learning']),
  color: P('pick a colour', ['colour', 'colour codes']),
  'text-diff': P('compare two texts'),
  notes: P('take a note', ['docs and notes']),
  kanban: P('move cards on a board', ['kanban']),
  bmi: P('check body mass'),
  markdown: P('preview markdown'),
  'photo-edit': P('edit a photo', ['photos']),
  'wifi-qr': P('share a wifi password'),
  piano: P('play a piano', ['music']),
  metronome: P('keep a beat'),
  todo: P('keep a to-do list'),
  invoice: P('write an invoice'),
  'mind-map': P('map an idea'),
  draw: P('draw a picture', ['paint']),
  emoji: P('find an emoji', ['emojis', 'emoji combos']),
});

const ABOUT = 'Ability floors from the capability inventory. A floor is missing when no working tool does that job, and part when a tool does only some of it. Old site floor ids stay in alias.';

/** pass is a working tool. A partial with a page is part. Anything else is missing. Pure. */
export function rowStatus(item, overall) {
  if (overall === 'pass') return 'has';
  if (overall === 'partial' && item && item.page) return 'part';
  return 'missing';
}

const proveOf = (ask) => 'A stranger asks "' + ask + '". It counts when a tool does that job and hands back the result.';

function indexOf(list, results) {
  const overall = new Map(((results && results.items) || []).map((r) => [r.id, r.overall]));
  const by = new Map();
  for (const item of (list && list.items) || []) by.set(item.id, { item, overall: overall.get(item.id) || 'missing' });
  return by;
}

/** A want is part when a related inventory row is has or part, and missing when none is. Pure. */
export function wantStatus(want, by) {
  let part = false;
  for (const id of want.covers || []) {
    const row = by.get(id);
    if (!row) continue;
    const s = rowStatus(row.item, row.overall);
    if (s === 'has' || s === 'part') part = true;
  }
  return part ? 'part' : 'missing';
}

/** Floors a person could ask for that have no working tool, missing first inside the generated rows. Pure. */
export function floorsFrom(list, results) {
  const by = indexOf(list, results);
  const covered = new Set(WANTS.flatMap((w) => w.covers || []));
  const wants = WANTS.map((w) => ({ id: w.id, name: w.name, why: w.why, prove: proveOf(w.ask), ask: w.ask, status: wantStatus(w, by), alias: w.alias || [] }));
  const rest = [];
  for (const [id, row] of by) {
    if (covered.has(id)) continue;
    const status = rowStatus(row.item, row.overall);
    if (status === 'has') continue;
    const plain = PLAIN[id];
    const name = plain ? plain[0] : String((row.item && row.item.name) || id).toLowerCase();
    const ask = (row.item && row.item.ask) || name;
    rest.push({ id, name, why: 'People ask an AI site to ' + name + ' and take the result with them.', prove: proveOf(ask), ask, status, alias: plain ? plain[1] : [] });
  }
  rest.sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : (a.status === 'missing' ? -1 : 1)));
  const floors = [...wants, ...rest];
  let has = 0;
  for (const row of by.values()) if (rowStatus(row.item, row.overall) === 'has') has++;
  const pick = (floors.find((f) => f.status === 'missing') || floors[0] || {}).id || null;
  return { about: ABOUT, pick, has, floors };
}

/** The floor an old id or an ability id names. Pure. */
export function aliasFloor(id, floors) {
  const key = String(id || '').toLowerCase();
  return (floors || []).find((f) => f.id === key || (f.alias || []).some((a) => String(a).toLowerCase() === key)) || null;
}

/** Attach the pack the elevator and the card read. Pure. */
export function attachAbilities(model, pack) {
  if (!pack || !Array.isArray(pack.floors)) return model || {};
  const ability = aliasFloor(pack.pick, pack.floors) || pack.floors.find((f) => f.status === 'missing') || null;
  return { ...(model || {}), abilities: pack, ability };
}

export function packText(pack) {
  const floors = (pack.floors || []).map((f) => '  ' + JSON.stringify({ id: f.id, name: f.name, why: f.why, prove: f.prove, ask: f.ask, status: f.status, alias: f.alias || [] })).join(',\n');
  return '{\n "about": ' + JSON.stringify(pack.about) + ',\n "pick": ' + JSON.stringify(pack.pick) + ',\n "has": ' + pack.has + ',\n "floors": [\n' + floors + '\n ]\n}\n';
}

/** The ability the Tower is on, then the next few. Every value goes through esc. Pure. */
export function abilityHtml(pack, esc) {
  const floors = (pack && pack.floors) || [];
  const cur = aliasFloor(pack && pack.pick, floors) || floors[0];
  if (!cur) return '';
  const next = floors.filter((f) => f.id !== cur.id).slice(0, 5);
  const item = (f) => '<li data-status="' + esc(f.status) + '"><a href="/?q=' + esc(encodeURIComponent(f.ask || '')) + '">' + esc(f.name) + '</a> <span>(' + esc(f.status) + ')</span></li>';
  return '<div class="vp-box vp-ability" data-id="' + esc(cur.id) + '"><div class="vp-k">Working on now</div><div class="vp-site">' + esc(cur.name) + '</div>'
    + '<p class="vp-what">' + esc(cur.why) + '</p><p class="vp-what">' + esc(cur.prove) + '</p>'
    + '<p class="vp-more">' + esc(String(pack.has || 0) + ' abilities already have a working tool. This one is ' + cur.status + '.') + '</p></div>'
    + (next.length ? '<div class="vp-box"><div class="vp-k">Next abilities</div><ol>' + next.map(item).join('') + '</ol></div>' : '');
}

/** Every ability floor, for the owner elevator. Pure. */
export function abilityListHtml(floors, esc, current) {
  return '<ol class="elv-check">' + (floors || []).map((f) => '<li data-status="' + esc(f.status) + '"' + (f.id === current ? ' data-current="1"' : '') + '><a href="/?q=' + esc(encodeURIComponent(f.ask || '')) + '">' + esc(f.name) + '</a> — ' + esc(f.status) + '</li>').join('') + '</ol>';
}

const sayAbility = (pack) => { const f = aliasFloor(pack && pack.pick, (pack && pack.floors) || []); return f ? 'Verse is working on how to ' + f.name + '.' : ''; };
const escOf = (esc) => (typeof esc === 'function' ? esc : (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

/** The ability list in front of the old elevator markup. The old markup stays, under Earlier site floors. Pure. */
export function elevatorHtml(model, siteHtml, esc) {
  const ability = model && model.ability;
  if (!ability) return siteHtml || '';
  esc = escOf(esc);
  const list = (model.abilities && model.abilities.floors) || [];
  return '<div class="elv-ability" data-owner="1"><h1 class="elv-fight">' + esc(ability.name) + '</h1><p>' + esc(ability.why) + ' ' + esc(ability.prove) + '</p>'
    + abilityListHtml(list, esc, ability.id)
    + '<details class="elv-history"><summary>Earlier site floors</summary>' + (siteHtml || '') + '</details></div>';
}

/** The owner's card with the ability floor first and the site floor kept as history. Pure. */
export function cardWithAbilities(html, pack, esc) {
  if (!pack || !Array.isArray(pack.floors) || !pack.floors.length) return html || '';
  esc = escOf(esc);
  let out = String(html || '').replace('>Working on now<', '>Earlier site floor<');
  out = out.replace(/<p class="vp-sub">[^<]*<\/p>/, '<p class="vp-sub">' + esc('The ability Verse is learning, and the earlier site floors under it.') + '</p>');
  const lead = abilityHtml(pack, esc);
  return out.includes('class="tw-head"') ? out.replace(/(<h2 class="tw-head">[^<]*<\/h2>)/, '$1' + lead) : lead + out;
}

export { sayAbility as abilityLine };
