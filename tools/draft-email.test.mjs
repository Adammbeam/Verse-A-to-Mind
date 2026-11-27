import test from 'node:test';
import assert from 'node:assert/strict';
import { draftEmail, modelMessages, parseDraft } from '../void-live-deploy/lib/draft/email.js';
import { draftReply } from '../void-live-deploy/functions/api/draft-email.js';

const note = { to: 'Mr Hale', about: 'asking my landlord to fix the heater', from: 'Ada' };

test('a note becomes a subject and a letter, and nothing is sent', () => {
  const d = draftEmail(note);
  assert.equal(d.ok, true);
  assert.equal(d.sends, false);
  assert.match(d.subject, /heater/i);
  assert.match(d.body, /Dear Mr Hale,/);
  assert.match(d.body, /landlord/);
  assert.match(d.body, /heater/);
  assert.match(d.body, /Thanks,\nAda/);
  assert.equal(draftEmail({ about: 'fix it' }).ok, false);
  assert.equal(draftEmail({ ...note, tone: 'nope' }).tone, 'plain');
});

test('tone changes the greeting and the close, not the facts', () => {
  const warm = draftEmail({ ...note, tone: 'warm' });
  const firm = draftEmail({ ...note, tone: 'firm' });
  assert.match(warm.body, /^Hello Mr Hale,/);
  assert.match(warm.body, /Thank you,/);
  assert.match(firm.body, /^Mr Hale,/);
  assert.match(firm.body, /Regards,/);
  assert.match(firm.body, /heater/);
  assert.doesNotMatch(firm.body, /\$\d|tomorrow at|I have sent/i);
});

test('a model reply is JSON, and a bad reply is ignored', () => {
  const msgs = modelMessages(note);
  assert.match(msgs[0].content, /never send/i);
  assert.match(msgs[1].content, /landlord/);
  const ok = parseDraft('```json\n{"subject":"Heater","body":"Dear Mr Hale, the heater is out."}\n```');
  assert.equal(ok.subject, 'Heater');
  assert.equal(parseDraft('not json'), null);
  assert.equal(parseDraft('{"subject":"Hi","body":"x"}'), null);
});

test('Workers AI is used first, then Groq, and a miss stays a plain draft', async () => {
  const ai = { AI: { run: async () => ({ response: '{"subject":"The heater","body":"Dear Mr Hale, please fix the heater."}' }) } };
  const a = await draftReply(ai, note, async () => { throw new Error('groq should not be called'); });
  assert.equal(a.body.via, 'workers');
  assert.equal(a.body.sends, false);
  assert.match(a.body.subject, /heater/i);
  const groq = await draftReply({ AI: { run: async () => { throw new Error('down'); } }, GROQ_API_KEY: 'present' }, note, async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"subject":"Heater repair","body":"Dear Mr Hale, the heater needs a repair."}' } }] }),
  }));
  assert.equal(groq.body.via, 'groq');
  const plain = await draftReply({}, note, async () => ({ ok: false, json: async () => ({}) }));
  assert.equal(plain.body.via, 'plain');
  assert.match(plain.body.body, /landlord/);
});
