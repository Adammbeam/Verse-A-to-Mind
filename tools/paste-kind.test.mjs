// A paste is a report, an ask or unclear (owner, 2026-10-30, docs/RULES.md "A paste is a report, an ask or unclear; never a guess").
// Adam pasted a copied "What is really true now" card with his own long note under it. Verse reopened the frozen card, still at
// "checking GitHub…", and the note was lost; an earlier status note was answered with Verse's secret names. The two pastes are kept
// as they reached Verse in tools/fixtures/paste-report-2026-10-30.txt and paste-dull-2026-10-30.txt. Run: node --test tools/paste-kind.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pasteKind, isPasteText, answersAsPaste } from '../void-live-deploy/lib/paste-kind.js';
import { telemetryOf, reportCardOf } from '../void-live-deploy/lib/telemetry.js';
import telemetryRoute from '../void-live-deploy/skills/telemetry-route.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ADAM = read('./fixtures/paste-report-2026-10-30.txt');
const DULL = read('./fixtures/paste-dull-2026-10-30.txt');
const CODE = ADAM.match(/VERSE-CARD:[A-Za-z0-9_-]+/)[0];
// the ask box turns each line break into ⏎, so a paste reaches handle() on one line
const typed = (t) => t.trim().replace(/\n+/g, ' ⏎ ');

test("Adam's paste is a report, checked live with the PR that waits first, and the card does not open again", () => {
  for (const t of [ADAM, typed(ADAM)]) {
    assert.deepEqual(pasteKind(t), { kind: 'report' });
    const r = telemetryOf(t);
    assert.equal(r.kind, 'status');
    assert.equal(r.prs[0], '1993', 'the PR the report says waits on CI is checked first: ' + r.prs);
    assert.ok(r.prs.includes('1992'), 'the other open PR is checked too');
    assert.ok(r.read.waits.some((w) => /#1993/.test(w)), 'the waiting line is kept');
    assert.ok(r.read.changed.some((c) => /#1980, #1981, #1982 merged/.test(c)), 'the merged line is kept');
    assert.ok(telemetryRoute.match(t.toLowerCase(), t), 'the live GitHub card answers it');
  }
  // the page opens a pasted card again only when the paste is not a report (void.html: !(paste && paste.kind === 'report'))
  assert.ok(reportCardOf(ADAM).rest.includes('paste-classification rule'), "Adam's own note under the card is kept, not dropped");
});

test('the dull card text alone, and with its card code, is a report', () => {
  for (const t of [DULL, typed(DULL), DULL + '\n\nVerse card from a-to-mind.com\n' + CODE]) {
    assert.deepEqual(pasteKind(t), { kind: 'report' }, t.slice(0, 60));
    assert.equal(telemetryOf(t).prs[0], '1993');
  }
});

test('a pasted card with nothing else opens again as that card', () => {
  assert.deepEqual(pasteKind(CODE), { kind: 'card' });
  assert.deepEqual(pasteKind('Verse card from a-to-mind.com\n' + CODE), { kind: 'card' });
});

test('a pasted email with no ask in it is read, not handed back', () => {
  const mail = 'Hi Adam,\nThanks for the call on Tuesday. The venue is booked for the 14th and the caterer confirmed the menu.\n'
    + 'We still need the final head count by Friday, and the deposit invoice is attached.\nBest,\nJordan';
  assert.deepEqual(pasteKind(mail), { kind: 'read' });
  assert.deepEqual(pasteKind(typed(mail)), { kind: 'read' });
  assert.equal(answersAsPaste('read'), true);
});

test('a paste with the person\'s own ask around it is an ask, answered as any ask', () => {
  const body = 'The venue is booked for the 14th and the caterer confirmed the menu.\nWe still need the final head count by Friday.';
  assert.deepEqual(pasteKind(body + '\nwhat should I reply?'), { kind: 'ask' });
  assert.deepEqual(pasteKind('summarize this:\n' + body), { kind: 'ask' });
  assert.deepEqual(pasteKind('can you draft a reply\n' + body), { kind: 'ask' });
});

test('a note written to someone stays a note', () => {
  const note = "Good, Beam has it. I'm checking #1795 and will hand you the loop line for Beam once it's live.\n"
    + 'The Modal part was for you, not Beam: you make the account and add the two repo secrets, whenever you want real AI songs.';
  assert.equal(pasteKind(note).kind, 'note');
});

test('a typed ask is not a paste', () => {
  const ask = 'what is the tallest mountain in Europe and how long does it take to climb it in summer if you are fit';
  assert.equal(isPasteText(ask), false);
  assert.equal(pasteKind(ask), null);
  assert.equal(pasteKind('make a clock'), null);
});

test('a long paste that starts with a skill word is still an ask for the answer path', () => {
  const paste = 'clock\ntimer\n' + 'The harbour log records calm water and a steady wind. '.repeat(40)
    + '\n1. Does the clock stay visible after a reload?\n2. What happens when the timer reaches zero?';
  assert.equal(pasteKind(paste).kind, 'ask');
  assert.equal(answersAsPaste(pasteKind(paste).kind), true);
  assert.equal(answersAsPaste('report'), false);
  assert.equal(answersAsPaste('card'), false);
});

test('the API never answers a pasted status report with secret names', () => {
  const api = read('../void-live-deploy/functions/api/answer.js');
  assert.match(api, /noteFinish\(answer, ask, note \? noteFacts : telemetryOf\(ask\) \? \[\] : setupFacts\(ask\)\)/);
});

test('the three copies of the page are the same and send a long paste to the answer', () => {
  const page = read('../void.html');
  assert.equal(read('../void-live-deploy/void.html'), page);
  assert.equal(read('../void-live-deploy/index.html'), page);
  assert.match(page, /import\('\/lib\/paste-kind\.js'\)/);
  assert.match(page, /if \(sc && !\(paste && paste\.kind === 'report'\)\) \{ showSharedCard\(sc\)/);
  assert.match(page, /pk\.answersAsPaste\(paste\.kind\)/);
  assert.equal(page.includes('pasted text with no ask'), false);
  assert.equal(page.includes("paste.kind === 'unclear'"), false);
  const answerAt = page.indexOf('pk.answersAsPaste(paste.kind)');
  const skillsAt = page.indexOf('await runLearnedSkills(text, lower0');
  assert.ok(answerAt > 0 && skillsAt > answerAt, 'a long paste is answered before any skill can take its first word');
});

test('a long paste is named with a short heading, and the answer body is the reply', () => {
  const page = read('../void.html');
  const branch = page.split('\n').find((l) => l.includes('pk.answersAsPaste(paste.kind)'));
  assert.ok(branch, 'the paste branch is on the page');
  assert.match(page, /showAnswer\(text, null, head\)/);
  assert.match(page, /const head = String\(text\)\.replace/);
  assert.match(page, /class="vc-long"/);
  assert.match(page, /async function showAnswer\(text, page, heading\)/);
  assert.ok(!/<h2>' \+ esc\(text\)/.test(page.slice(page.indexOf('async function showAnswer'), page.indexOf('function whenSaid'))), 'showAnswer draws every heading from head');
  assert.equal(read('../void.html'), read('../void-live-deploy/index.html'));
});
