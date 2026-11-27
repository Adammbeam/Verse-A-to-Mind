// The 1000 things Verse cannot do yet, and exactly how to install each one. Generated from the repo's own records:
// the ranked build list (docs/capability-gaps.md), asks seen failing and still open (docs/GAPS.md), page pairs whose
// result does not open the next page (docs/HANDOFF-GAPS.md), permissively licensed outside work (AutoSalvage data),
// archived work on the salvage shelf (void-live-deploy/salvage.json), and lab tools no normal ask can reach
// (void-live-deploy/lab/catalog.json against skills/index.json). A row is a plan, not a promise.
//   node tools/cannot-plan.mjs          print the plan
//   node tools/cannot-plan.mjs --write write docs/CANNOT-1000.md
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WANT = 1000, OUT = 'docs/CANNOT-1000.md';
const read = (f) => { try { return readFileSync(resolve(root, f), 'utf8'); } catch (_) { return ''; } };
const json = (f, d) => { try { return JSON.parse(read(f)); } catch (_) { return d; } };
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'gap';
const row = (kind, cost, value, thing, why, where, install, test, source) => ({ kind, cost, value, thing, why, where, install, test, source });

/** the official ranked build list: a card or page a stranger still cannot use. */
export function capabilityGaps(md) {
  const out = [];
  for (const line of md.split('\n')) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const c = cells(line); if (c.length < 6) continue;
    const rank = Number(c[0]); if (!Number.isFinite(rank)) continue;
    out.push(row('capability', 1, 1000 - rank, c[1], c[2].slice(0, 180), c[3],
      'Fold into ' + c[3] + (/^(none|none found)$/i.test(c[4]) ? '' : '; salvage ' + c[4]) + '; wire the Ask card in void-live-deploy/skills/open-tool.js; add tools/' + slug(c[1]) + '.test.mjs; verify the ask live at /?q=' + encodeURIComponent(c[1].toLowerCase()),
      'tools/' + slug(c[1]) + '.test.mjs', 'docs/capability-gaps.md#' + rank));
  }
  return out;
}

/** an ask a person actually typed and saw fail, still open. */
export function openGaps(md) {
  const out = [];
  for (const line of md.split('\n')) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const c = cells(line); if (c.length < 5 || !/^open\b/i.test(c[4])) continue;
    out.push(row('gap', 2, 500 - Number(c[0]), c[1], c[2].slice(0, 180), 'the existing card or page for this ask',
      'Build the "Done when" in place: ' + c[3].slice(0, 140) + '; add a case to tools/gaps-batch*.test.mjs; retype the ask at /?q=' + encodeURIComponent(c[1].toLowerCase()) + ' and move the row to verified live',
      'tools/gaps-batch*.test.mjs', 'docs/GAPS.md#' + c[0]));
  }
  return out;
}

/** a page pair whose result does not yet open the next page filled in. */
export function handoffGaps(md) {
  const out = [];
  for (const line of md.split('\n')) {
    const m = /^\|\s*(\/[^|]+?\/)\s*\|\s*(\/[^|]+?\/)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|/.exec(line); if (!m) continue;
    const types = m[3].split(/,\s*/).map((t) => t.trim()).filter(Boolean).join(',');
    out.push(row('handoff', 3, Number(m[4]), 'carry ' + types + ' from ' + m[1] + ' into ' + m[2], 'a result on ' + m[1] + ' has no quiet way to open ' + m[2] + ' filled in', m[2],
      'Declare content="out: ' + types + '" on ' + m[1] + ' and content="in: ' + types + '" on ' + m[2] + ' (meta name="verse-handoff"); add a ' + slug(types) + 'Link builder in void-live-deploy/lib/handoff.js; call mountStrip/mountPill on ' + m[2] + '; add a case to tools/handoff.test.mjs; run node tools/handoff-scan.mjs --write until the pair leaves the gap table',
      'tools/handoff.test.mjs', 'docs/HANDOFF-GAPS.md ' + m[1] + ' -> ' + m[2]));
  }
  return out;
}

/** permissively licensed outside work that was found for a named gap, but never installed. */
export function outsideFinds(outside = [], finds = []) {
  const out = [];
  for (const s of outside) out.push(row('outside', 4, 40, 'bring ' + s.id + ' into Verse for ' + s.gap, s.what + ' (' + s.license + ')', s.target || 'a card or a library',
    'Follow docs/playbooks/salvage-bots.md: keep the ' + s.license + ' notice in a versioned vendor folder, rewrite the useful part in Verse\'s own code, add ' + slug(s.id) + '.test.mjs, and add the source and license to domains/autosalvage.outside.json + domains/autosalvage.unified.json so /credits/ names it',
    'tools/' + slug(s.id) + '.test.mjs', 'domains/autosalvage.outside.json ' + s.id));
  for (const f of finds) out.push(row('outside', 4, Number(f.stars) || 0, 'bring ' + f.name + ' into Verse for ' + f.gap, f.license + ', ' + (f.stars || 0) + ' stars; proposed on the #ideas board', f.where || 'the named page',
    'Verify the ' + f.license + ' licence and keep its notice; rewrite the useful piece into ' + (f.where || 'the named page') + ' with a test at tools/' + slug(f.name) + '.test.mjs; add the source, license and use to the AutoSalvage data so /credits/ names it; verify live',
    'tools/' + slug(f.name) + '.test.mjs', 'resources/salvage-github.json ' + f.name));
  return out;
}

/** archived work already judged salvageable but not yet brought into a live page. */
export function salvageable(salvage) {
  return (salvage.pieces || []).filter((p) => p.status === 'salvageable').map((p) =>
    row('salvage', 5, Number(p.value) || 0, 'salvage ' + p.id + ' into a live Verse ' + (p.target || 'tool'), (p.why || 'archived work with a reusable piece').slice(0, 180), p.target || 'the matching family',
      'Follow docs/playbooks/salvage-bots.md: search the live pages and open pull requests first, then rewrite the reusable piece into Verse\'s own code on a branch from main, add tools/' + slug(p.id) + '.test.mjs, open an automerge pull request, and verify the job live. Keep this row on docs/SALVAGE.md until it lands',
      'tools/' + slug(p.id) + '.test.mjs', 'void-live-deploy/salvage.json ' + p.id));
}

/** a lab tool that works but no normal ask can reach: it is in catalog.json, not in skills/index.json. */
export function labTools(catalog, skills) {
  const indexed = new Set((skills || []).map((s) => String(s).toLowerCase()));
  return (catalog || []).filter((x) => !indexed.has(String(x.slug).toLowerCase()) && !indexed.has(String(x.slug).replace(/^f\d+-/, '').toLowerCase()))
    .map((x) => row('lab', 6, (x.grade === 'tool' ? 100 : 0) + (x.status === 'works' ? 50 : 0) + (x.num ? 1000 - x.num : 0),
      'make ' + (x.title || x.slug) + ' reachable from a normal ask', (x.blurb || '').slice(0, 180), '/lab/' + x.slug + '/',
      'Promote /lab/' + x.slug + '/ into a card in its family (or a tab on the family page), add the ask words to void-live-deploy/skills/open-tool.js and an order file under void-live-deploy/skills/order/, add tools/' + slug(x.slug) + '.test.mjs, then verify the ask live and redirect the lab address if the card replaces it',
      'tools/' + slug(x.slug) + '.test.mjs', 'void-live-deploy/lab/catalog.json ' + x.slug));
}

/** harvest, dedupe, rank by installation cost then value, emit exactly WANT rows. */
export function plan(sources = {}, want = WANT) {
  const pool = [
    ...capabilityGaps(sources.capability || ''), ...openGaps(sources.gaps || ''), ...handoffGaps(sources.handoffs || ''),
    ...outsideFinds(json('domains/autosalvage.outside.json', {}).sources || [], json('resources/salvage-github.json', {}).finds || []),
    ...salvageable(json('void-live-deploy/salvage.json', {})),
    ...labTools(json('void-live-deploy/lab/catalog.json', []), json('void-live-deploy/skills/index.json', [])),
  ];
  pool.sort((a, b) => a.cost - b.cost || b.value - a.value || a.thing.localeCompare(b.thing));
  const seen = new Set(), rows = [];
  for (const p of pool) {
    const key = p.thing.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key); rows.push(p);
    if (rows.length === want) break;
  }
  return rows;
}

const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
function document(rows, counts) {
  const mix = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => n + ' ' + k).join(', ');
  return `# ${rows.length} things Verse cannot do yet, and how to install each one

Generated by \`node tools/cannot-plan.mjs --write\`. Do not edit by hand. Every row comes from a record in this repo:
the official ranked build list, an ask a person typed and saw fail, a page pair whose result does not open the next page,
a permissively licensed outside find, archived work on the salvage shelf, or a lab tool that no normal ask can reach.
Nothing is guessed, and nothing that already works on the site is on this list.

**${rows.length} items** (${mix}). Install in the order shown: smallest first, then highest value. A row is done only
when a stranger can type the ask or press the pill and get the thing, not an article.

## How any row is installed

1. Claim the row as a job. Write the brief: for whom, the problem, what the first version does, and what it will not build.
2. Search existing pages, skills, lab tools, salvage rows and open pull requests first. Fold the work into the page that already owns the job and make old addresses redirect. Never start a second home for a job Verse already has.
3. Build the smallest useful piece on a branch from the newest main. Reuse the library the row names.
4. Add the test the row names. Run \`node --test <that test>\` and \`VOID_SKIP_BENCH=1 node tools/checks.mjs --changed\`, then \`node tools/pre-pr.mjs\`.
5. Open a pull request labelled \`automerge\`. Verse reviews it and main deploys on green.
6. Verify the exact ask or page pair live, then close the job with the pull request link. Full pages stay behind Uni; the free card still has to be useful.

### Per kind

- **capability** — fold into the named super page, wire the Ask card in \`skills/open-tool.js\`, salvage what the row names, test and verify live.
- **gap** — finish the "Done when" on the existing card, add a case to \`tools/gaps-batch*.test.mjs\`, retype the ask at \`/?q=...\`, move the row to \`verified live\` in \`docs/GAPS.md\`.
- **handoff** — \`<meta name="verse-handoff" content="in: ...;out: ...">\` on each page, one \`*Link\` builder in \`lib/handoff.js\`, \`mountStrip\`/\`mountPill\` on the receiving page, one case in \`tools/handoff.test.mjs\`, then \`node tools/handoff-scan.mjs --write\`.
- **outside** — a permissively licensed find: keep its notice in a versioned vendor folder, rewrite the useful part in Verse's own code, and add source + license to the AutoSalvage data so \`/credits/\` names it.
- **salvage** — archived work already judged useful: follow \`docs/playbooks/salvage-bots.md\`, rewrite it into a live family, test, and keep the \`docs/SALVAGE.md\` row until it lands.
- **lab** — a tool that works in \`/lab/\` but has no ask card: promote it into its family, add the ask words to \`skills/open-tool.js\` and an order file, test, and redirect the old lab address if replaced.
- **Private by rule:** every row runs on the visitor's device or uses an already-approved free source. Nothing here invents a medical claim, a test score, a fake card number, or a paid key.

## The plan

| # | What Verse cannot do yet | Kind | How to install it | Where it lands | Test | Evidence |
| ---: | --- | --- | --- | --- | --- | --- |
` + rows.map((r, i) => '| ' + (i + 1) + ' | ' + esc(r.thing) + ' | ' + r.kind + ' | ' + esc(r.install) + ' | ' + esc(r.where) + ' | ' + esc(r.test) + ' | ' + esc(r.source) + ' |').join('\n') + '\n';
}

function main() {
  const args = process.argv.slice(2);
  const sources = { capability: read('docs/capability-gaps.md'), gaps: read('docs/GAPS.md'), handoffs: read('docs/HANDOFF-GAPS.md') };
  const rows = plan(sources);
  const counts = rows.reduce((o, r) => (o[r.kind] = (o[r.kind] || 0) + 1, o), {});
  const out = document(rows, counts);
  if (args.includes('--write')) writeFileSync(resolve(root, OUT), out); else process.stdout.write(out);
  console.error('cannot-plan: ' + rows.length + ' items (' + Object.entries(counts).map(([k, n]) => k + ' ' + n).join(', ') + ')');
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) main();
