// Verse's clock, off GitHub.
//
// Pages Functions cannot have a cron trigger: void-live-deploy/functions/api/catalog.js says so in its own header, and
// functions/api/automations/tick.js already says "a Cloudflare cron Worker can call the same route later". This is that Worker.
//
// It does one thing: POST /api/automations/tick on a schedule, with the owner token the workflows already use. Nothing else.
// The route runs the due automations, then the crew and its wants, so moving the trigger off Actions moves no logic.
//
//   npx wrangler secret put VOID_OWNER_TOKEN --config void-cron/wrangler.toml
//   npx wrangler deploy --config void-cron/wrangler.toml
//
// The old workflow (.github/workflows/void-tick.yml) can stay as a second knock: the tick is idempotent per rule and per window, so
// two callers make a missed one less likely, not a double run.

const TICK = 'https://a-to-mind.com/api/automations/tick';

async function knock(env) {
  const token = env.VOID_OWNER_TOKEN;
  if (!token) return { ok: false, why: 'VOID_OWNER_TOKEN is not set on this Worker' };
  try {
    const r = await fetch(TICK, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: '{}',
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, body: text.slice(0, 400) };
  } catch (e) {
    return { ok: false, why: String(e && e.message ? e.message : e) };
  }
}

export default {
  /** The cron trigger. waitUntil keeps the knock alive after the event returns. */
  async scheduled(event, env, ctx) {
    const run = knock(env);
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(run);
    const r = await run;
    // a failed knock is worth seeing in the Worker's logs; it is not worth failing the schedule over
    console.log('verse-cron ' + new Date(event?.scheduledTime || Date.now()).toISOString() + ': ' + JSON.stringify(r));
  },

  /** A manual knock, for proving the token works without waiting for the clock. Owner token only. */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/tick') return new Response('POST /tick', { status: 405 });
    const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!env.VOID_OWNER_TOKEN || got !== env.VOID_OWNER_TOKEN) return new Response('no', { status: 401 });
    const r = await knock(env);
    return Response.json(r, { status: r.ok ? 200 : 502 });
  },
};
