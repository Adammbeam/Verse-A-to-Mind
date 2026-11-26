// An ask about Verse's own frontier or open asks is answered from its own facts, not the web.
// The case: "what is still open on your frontier?" came back "nothing on the web" (2026-11-25).
// Run: node --test tools/self-frontier-ask.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSelfAsk } from '../void-live-deploy/lib/self-context.js';

test('asks about your frontier or your open asks are self asks', () => {
  for (const a of ['what is still open on your frontier?', 'what is still open on your frontier', "what's on your frontier", 'list your open asks', 'what are your open items?', 'show me your to-do list', 'what asks do you have? show your asks']) assert.ok(isSelfAsk(a), a);
});

test('the frontier as a word, an airline or a place stays a question', () => {
  for (const a of ['frontier airlines baggage fees', 'space the final frontier', 'what was the american frontier', 'frontier communications outage', 'what is the frontier thesis']) assert.equal(isSelfAsk(a), false, a);
});
