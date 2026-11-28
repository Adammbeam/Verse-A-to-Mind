import { gamesHubRedirect } from '../lib/games-hub.js';

export function onRequest(ctx) {
  return gamesHubRedirect(ctx.request) || ctx.next();
}
