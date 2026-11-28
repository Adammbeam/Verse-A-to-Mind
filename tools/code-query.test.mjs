// Code-search query parser (void-live-deploy/lib/code-query.js).
// Run: node --test tools/code-query.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CODE_QUERY, parseCodeQuery, nestsQuantifiers, patternProblem } from '../void-live-deploy/lib/code-query.js';

const SAMPLE = {
  terms: ['foo'],
  phrases: ['exact bar'],
  path: 'lib/',
  lang: 'js',
  sym: null,
  not: ['test'],
  regex: null,
};

function sentence(fn) {
  assert.throws(fn, (err) => {
    assert.equal(err instanceof Error, true);
    assert.match(err.message, /^[A-Z][^.\n]*\.$/);
    assert.equal(err.message.includes('\n'), false);
    return true;
  });
}

test('words, an exact phrase, path, lang and a minus fill the fields', () => {
  assert.deepEqual(parseCodeQuery('foo "exact bar" path:lib/ lang:js -test'), SAMPLE);
  assert.deepEqual(parseCodeQuery('  foo\n"exact bar"\tpath:lib/  lang:js   -test  '), SAMPLE);
});

test('a safe pattern is kept, and a nested or oversized one is refused in a sentence', () => {
  const ok = parseCodeQuery('/a(b|c)+/');
  assert.equal(ok.regex, 'a(b|c)+');
  assert.deepEqual(ok.terms, []);
  assert.equal(nestsQuantifiers('a(b|c)+'), false);
  assert.equal(nestsQuantifiers('(a+)+'), true);
  sentence(() => parseCodeQuery('/(a+)+/'));
  assert.match(patternProblem('(a+)+'), /quantifier/);
  const over = 'a'.repeat(CODE_QUERY.maxPattern + 1);
  sentence(() => parseCodeQuery('/' + over + '/'));
  assert.match(patternProblem(over), /100/);
  assert.equal(parseCodeQuery('/' + 'a'.repeat(CODE_QUERY.maxPattern) + '/').regex.length, 100);
});

test('nested quantifiers are refused in each shape, and a quantifier in a class is not one', () => {
  for (const bad of ['(a+)+', '(a*)*', '(a+)*', '(a*)+', '(a+)?', '(a+){2}', '(?:a+)+', '(a{1,})+', '((a+))+', 'a**']) {
    assert.equal(nestsQuantifiers(bad), true, bad);
    sentence(() => parseCodeQuery('/' + bad + '/'));
  }
  for (const good of ['a(b|c)+', 'a+', '(a|b)+', '[a+]+', 'a++', '\\++', 'a{1,3}', '(ab)+', '(a+|b)']) {
    assert.equal(nestsQuantifiers(good), false, good);
    assert.equal(parseCodeQuery('/' + good + '/').regex, good);
  }
});

test('an unknown qualifier stays a term', () => {
  assert.deepEqual(parseCodeQuery('x:y').terms, ['x:y']);
  const q = parseCodeQuery('x:y foo path:lib/ repo:verse');
  assert.deepEqual(q.terms, ['x:y', 'foo', 'repo:verse']);
  assert.equal(q.path, 'lib/');
});

test('empty and whitespace-only input give the same plain sentence', () => {
  let first = '';
  for (const s of ['', '   ', '\n\t', '\n \n']) {
    sentence(() => parseCodeQuery(s));
    try { parseCodeQuery(s); } catch (err) {
      if (!first) first = err.message;
      assert.equal(err.message, first);
      assert.match(err.message, /word/);
    }
  }
});

test('sym, a second phrase, a negated phrase and the last qualifier are kept', () => {
  const q = parseCodeQuery('sym:parse "one two" "three" path:old path:lib/code-query.js LANG:JS -"drop me" -draft');
  assert.equal(q.sym, 'parse');
  assert.deepEqual(q.phrases, ['one two', 'three']);
  assert.equal(q.path, 'lib/code-query.js');
  assert.equal(q.lang, 'JS');
  assert.deepEqual(q.not, ['drop me', 'draft']);
  assert.equal(q.regex, null);
});

test('a pattern beside words, an open quote, an open pattern and a second pattern', () => {
  const q = parseCodeQuery('foo /a(b|c)+/ bar');
  assert.deepEqual(q.terms, ['foo', 'bar']);
  assert.equal(q.regex, 'a(b|c)+');
  sentence(() => parseCodeQuery('"exact bar'));
  sentence(() => parseCodeQuery('/abc'));
  sentence(() => parseCodeQuery('//'));
  sentence(() => parseCodeQuery('/a+/ /b+/'));
  sentence(() => parseCodeQuery('path:'));
  sentence(() => parseCodeQuery('-'));
  sentence(() => parseCodeQuery('-/a+/'));
});

test('the same text parses twice and the source never compiles a pattern', () => {
  const text = 'foo "exact bar" path:lib/ lang:js -test /a(b|c)+/';
  assert.deepEqual(parseCodeQuery(text), parseCodeQuery(text));
  const src = readFileSync(new URL('../void-live-deploy/lib/code-query.js', import.meta.url), 'utf8');
  assert.equal(/\bnew\s+RegExp\s*\(/.test(src), false);
  assert.equal(Object.isFrozen(CODE_QUERY), true);
  assert.equal(Object.isFrozen(CODE_QUERY.qualifiers), true);
  assert.deepEqual([...CODE_QUERY.qualifiers], ['path', 'lang', 'sym']);
});
