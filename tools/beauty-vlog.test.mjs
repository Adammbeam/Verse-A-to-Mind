// Stars are the tease. The side-by-side names the real fix. Run: node --test tools/beauty-vlog.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SIGNATURE, parseScript, scriptIssues, isTease, planEpisode, captionsFor } from './beauty-vlog.mjs';
import { captionCheck } from './video-gate.mjs';

const SCRIPT = `# hook
Okay. Glow-up. Do not blink.

# before
Before. A dark sky, a button, and no scores on the page.

# change
Verse put the live scores card on the page, so the standings are what you see.

# stars
Signature move. Just more stars in the sky.

# after
Stars were the tease. The real change is the live scores card.

# highlight
live scores card

# box
0.08 0.28 0.84 0.36
`;

test('the script keeps the tease and the real fix apart', () => {
  const s = parseScript(SCRIPT);
  assert.equal(s.highlight, 'live scores card');
  assert.deepEqual(s.box, [0.08, 0.28, 0.84, 0.36]);
  assert.equal(scriptIssues(s).length, 0);
  assert.equal(isTease(s.stars), true);
  assert.equal(isTease(s.after), false);
  assert.equal(parseScript('# hook\nHi.\n# before\nOld page.\n# change\nThe card is readable now.\n# after\nThe real change is the readable card.\n# highlight\nreadable card').stars, SIGNATURE);
});

test('a reveal that is only stars is refused', () => {
  const tease = parseScript('# hook\nLook.\n# before\nOld.\n# change\nJust more stars.\n# after\nJust more stars in the sky.\n# highlight\njust more stars');
  const bad = scriptIssues(tease);
  assert.ok(bad.includes('change') && bad.includes('after') && bad.includes('highlight'));
  const claim = parseScript(SCRIPT.replace('Signature move. Just more stars in the sky.', 'The live scores card is the change, plus stars.'));
  assert.ok(scriptIssues(claim).includes('stars beat claims the fix'));
});

test('the cut is 30 to 45s and the stars beat sits just before the side-by-side', () => {
  const s = parseScript(SCRIPT);
  const plan = planEpisode(s, [2.4, 4.8, 5.5, 3.8, 5.2]);
  assert.ok(!plan.error, plan.error);
  assert.ok(plan.total >= 30 && plan.total <= 45);
  const ids = plan.beats.map((b) => b.id);
  assert.deepEqual(ids, ['hook', 'before', 'change', 'stars', 'reveal', 'end']);
  const stars = plan.beats[3], reveal = plan.beats[4];
  assert.ok(stars.to <= reveal.from + 0.001);
  assert.equal(reveal.id, 'reveal');
  const huge = planEpisode(s, [12, 12, 12, 12, 12]);
  assert.match(huge.error, /cut is/);
});

test('captions stay in the safe zone, and the reveal names the fix rather than the stars', () => {
  const s = parseScript(SCRIPT);
  const plan = planEpisode(s, [2.4, 4.8, 5.5, 3.8, 5.2]);
  const caps = captionsFor(s, plan.beats);
  const check = captionCheck(caps);
  assert.equal(check.ok, true, check.detail);
  const reveal = plan.beats.find((b) => b.id === 'reveal');
  const onReveal = caps.filter((c) => c.from >= reveal.from - 0.01 && c.to <= reveal.to + 0.01);
  assert.ok(onReveal.some((c) => c.text === 'BEFORE') && onReveal.some((c) => c.text === 'AFTER'));
  assert.ok(onReveal.some((c) => /live scores card/i.test(c.text)));
  assert.ok(onReveal.every((c) => !/just more stars/i.test(c.text)));
  const onStars = caps.filter((c) => c.from >= plan.beats[3].from - 0.01 && c.to <= plan.beats[3].to + 0.01);
  assert.ok(onStars.every((c) => /stars/i.test(c.text)));
});
