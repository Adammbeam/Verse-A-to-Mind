// Deterministic tests for lib/stage-code.js and skills/share.js (simpler path bypassing unbound env.SHARE relay).
// Run: node --test tools/stage-code.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PREFIX, ALIAS_PREFIX, MAX_CODE_CHARS, stageCodeAsk, encodeStageCode, decodeStageCode, codeIn } from '../void-live-deploy/lib/stage-code.js';
import shareSkill, { shareLink } from '../void-live-deploy/skills/share.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function mockDoc() {
  const make = (tag) => ({
    tagName: tag.toUpperCase(),
    style: {},
    children: [],
    listeners: {},
    attrs: {},
    _text: '',
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); if (v === '') this.children = []; },
    append(...nodes) { this.children.push(...nodes); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
    select() {},
  });
  return { createElement: make, execCommand: () => false };
}

function walk(node, pred) {
  if (!node) return null;
  if (pred(node)) return node;
  for (const c of node.children || []) { const hit = walk(c, pred); if (hit) return hit; }
  return null;
}

test('stageCodeAsk matches stage-code asks and leaves JSON export, print and single-card share alone', () => {
  for (const ex of ['make a stage code', 'copy my stage as a code', 'share stage code', 'open stage code', 'import stage code', 'share my stage without share relay']) {
    assert.equal(stageCodeAsk(ex), true, ex);
  }
  for (const nm of ['export my stage as json', 'import a stage from json', 'share this card', 'share the whole stage', 'print the stage', 'what is a stage code', 'qr code for https://a-to-mind.com', 'morse code']) {
    assert.equal(stageCodeAsk(nm), false, nm);
  }
  assert.equal(stageCodeAsk('open stage code VERSE-STAGE:eyJhIjp0cnVlfQ'), true);
  assert.equal(stageCodeAsk('V01D-STAGE:eyJhIjp0cnVlfQ'), true);
  assert.equal(codeIn('load V01D-STAGE:eyJhIjp0cnVlfQ please'), 'V01D-STAGE:eyJhIjp0cnVlfQ');
  assert.equal(shareLink('share this card: hello'), 'https://a-to-mind.com/?share_text=hello');
});

test('encodeStageCode and decodeStageCode round-trip UTF-8 cards and refuse empty or oversized stages', () => {
  const empty = encodeStageCode({});
  assert.equal(empty.ok, false);
  assert.match(empty.why, /nothing on the stage/i);

  const things = {
    s1: { id: 's1', kind: 'sticky', x: 100, y: 120, text: 'Café notes ☕ — Tokyo' },
    l1: { id: 'l1', kind: 'list', x: 240, y: 80, items: [{ text: 'Pack adapters', done: false }] },
  };
  const enc = encodeStageCode(things, Date.parse('2026-11-27T12:00:00Z'));
  assert.equal(enc.ok, true);
  assert.ok(enc.code.startsWith(PREFIX));
  assert.equal(enc.count, 2);

  const dec = decodeStageCode(enc.code, ['sticky', 'list'], new Set(['s1']));
  assert.equal(dec.ok, true);
  assert.equal(dec.things.length, 2);
  assert.equal(dec.things[0].text, 'Café notes ☕ — Tokyo');
  assert.notEqual(dec.things[0].id, 's1', 'colliding id is reassigned');
  assert.equal(dec.things[1].id, 'l1');

  const alias = decodeStageCode(ALIAS_PREFIX + enc.code.slice(PREFIX.length), ['sticky', 'list'], new Set());
  assert.equal(alias.ok, true);
  assert.equal(alias.things.length, 2);

  const huge = encodeStageCode({ big: { id: 'big', kind: 'sticky', x: 0, y: 0, text: 'x'.repeat(MAX_CODE_CHARS) } });
  assert.equal(huge.ok, false);
  assert.match(huge.why, /export my stage as json/i);
});

test('decodeStageCode sanitizes unsafe links and kept HTML via lib/stage-port.js and rejects invalid codes', () => {
  const badPayload = Buffer.from(JSON.stringify({
    app: 'void',
    version: 1,
    things: [
      { id: 'k1', kind: 'kept', x: 20, y: 30, html: '<script>alert(1)</script><b>Safe note</b>', url: 'javascript:alert(1)' },
      { id: 'u1', kind: 'unknown-kind', x: 10, y: 10 },
    ],
  }), 'utf8').toString('base64url');
  const dec = decodeStageCode(PREFIX + badPayload, ['kept', 'sticky'], new Set());
  assert.equal(dec.ok, true);
  assert.equal(dec.skipped, 1);
  assert.equal(dec.things.length, 1);
  assert.ok(!dec.things[0].html.includes('<script>'));
  assert.ok(!('url' in dec.things[0]));

  assert.equal(decodeStageCode('', ['sticky']).ok, false);
  assert.equal(decodeStageCode('HELLO:abc', ['sticky']).ok, false);
  assert.equal(decodeStageCode(PREFIX + '!!!', ['sticky']).ok, false);
  assert.equal(decodeStageCode(PREFIX + Buffer.from('not json').toString('base64url'), ['sticky']).ok, false);
});

test('share skill run renders portable code card and loads pasted stage codes onto the stage', async () => {
  const realDoc = globalThis.document;
  globalThis.document = mockDoc();
  try {
    const things = { a: { id: 'a', kind: 'sticky', x: 40, y: 50, text: 'From device A' } };
    let saved = 0, rendered = 0, snapped = 0, said = '';
    const apiA = {
      say: (m) => { said = m; },
      showPage: (fn) => { const rootEl = globalThis.document.createElement('div'); fn(rootEl); apiA.el = rootEl; return rootEl; },
      stage: { things: () => things, kinds: () => ({ sticky: {}, list: {} }), snapshot: () => { snapped++; }, save: () => { saved++; }, render: () => { rendered++; } },
    };
    assert.equal(await shareSkill.run('make a stage code', apiA), 'share');
    const outTa = walk(apiA.el, (n) => n.className === 'sc-out');
    assert.ok(outTa && outTa.value.startsWith(PREFIX));

    const targetThings = {};
    const apiB = {
      say: (m) => { said = m; },
      showPage: (fn) => { const rootEl = globalThis.document.createElement('div'); fn(rootEl); apiB.el = rootEl; return rootEl; },
      stage: { things: () => targetThings, kinds: () => ({ sticky: {}, list: {} }), snapshot: () => { snapped++; }, save: () => { saved++; }, render: () => { rendered++; } },
    };
    assert.equal(await shareSkill.run('open stage code ' + outTa.value, apiB), 'share');
    assert.equal(snapped, 1);
    assert.equal(saved, 1);
    assert.equal(rendered, 1);
    assert.equal(said, 'loaded 1');
    assert.equal(Object.values(targetThings)[0].text, 'From device A');
  } finally {
    globalThis.document = realDoc;
  }
});

test('routing order reaches share for all examples and suite() passes', async () => {
  assert.deepEqual(shareSkill.suite(), { ok: true, got: '' });
  const dir = resolve(root, 'void-live-deploy', 'skills');
  const names = JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8'));
  const mods = {};
  for (const n of names) mods[n] = (await import(pathToFileURL(resolve(dir, n + '.js')).href)).default;
  const route = (ask) => {
    const k = names.find((n) => mods[n].match(ask.toLowerCase(), ask));
    return k ? (mods[k].part ? mods[k].part(ask.toLowerCase(), ask) : k) : null;
  };
  for (const ex of shareSkill.examples) assert.equal(route(ex), 'share', ex);
  for (const nm of shareSkill.nearMisses) assert.notEqual(route(nm), 'share', nm);
});
