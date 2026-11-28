// /games opens the arcade. /tower.ideas.json stays the owner's board and redirects a visitor to the public card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gamesHubRedirect } from '../void-live-deploy/lib/games-hub.js';
import { publicStandIn, ownerOnlyPath } from '../void-live-deploy/lib/owner-gate.js';

test('games hub redirect and the ideas stand-in', () => {
  const hop = gamesHubRedirect(new Request('https://a-to-mind.com/games/?q=snake'));
  assert.equal(hop.status, 301);
  assert.equal(hop.headers.get('location'), 'https://a-to-mind.com/arcade/?q=snake');
  assert.equal(gamesHubRedirect(new Request('https://a-to-mind.com/games/snake/')), null);
  assert.equal(publicStandIn('/tower.ideas.json'), '/growth/latest.json');
  assert.equal(publicStandIn('/tower.evidence.json'), '');
  assert.equal(ownerOnlyPath('/tower.ideas.json'), true);
});
