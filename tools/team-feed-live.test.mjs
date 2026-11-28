import test from 'node:test';
import assert from 'node:assert/strict';
import { routeOf, proved, withLive, proveFeed } from '../void-live-deploy/lib/team-feed-live.js';

const health = 'BigPickle2 has not put this on the site yet: register and prove the JSON /api/health answer.';

test('a named route is judged from the real JSON, and a line with no route is left alone', async () => {
  assert.equal(routeOf(health), '/api/health');
  assert.equal(routeOf('no path here'), '');
  assert.equal(proved('/api/health', 200, '{"ok":true,"db":"ok"}'), true);
  assert.equal(proved('/api/health', 404, ''), false);
  assert.equal(proved('/api/health', 200, '{"ok":false}'), false);
  assert.equal(proved('', 200, '{}'), null);
  const live = withLive(health, true);
  assert.match(live, /^BigPickle2 changed the site: register and prove the JSON \/api\/health answer\.$/);
  assert.match(withLive(live, false), /has not put this on the site yet/);

  const feed = [
    { name: 'BigPickle2', href: 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/212', live: false, text: health },
    { name: 'BigPickle2', href: 'https://github.com/Adammbeam/Verse-A-to-Mind/pull/204', live: false, text: 'BigPickle2 has not put this on the site yet: read the rendered offline cue without assuming a lens element.' },
  ];
  const res = Response.json({ ok: true, feed });
  const out = await proveFeed(new Request('https://a-to-mind.com/api/team'), res, async (u) => {
    assert.equal(String(u), 'https://a-to-mind.com/api/health');
    return new Response('{"ok":true}', { status: 200 });
  });
  const j = await out.json();
  assert.equal(j.feed[0].live, true);
  assert.match(j.feed[0].text, /changed the site/);
  assert.equal(j.feed[1].live, false);
});
