// SCAFFOLD — NOT VERIFIED on Cloudflare. Container binding + @cloudflare/containers API must be checked against current docs.
// Scheduled knock every 10 minutes -> run one runner pass inside the container. No secret is read or printed here.
import { due, missingSecrets } from './scheduled-run.mjs';

let lastRunMs = 0; // in-memory; a restarted container just runs once more — harmless (idempotent gates + compare-and-swap)

export default {
  async scheduled(event, env, ctx) {
    const missing = missingSecrets(env); // names only, values never logged
    if (missing.length) { console.log('verse-computer: missing secret(s): ' + missing.join(', ')); return; }
    const now = event?.scheduledTime || Date.now();
    if (!due(lastRunMs, now)) return;
    lastRunMs = now;
    // UNVERIFIED Cloudflare Containers API. Intended: start container, which runs /entrypoint.sh once.
    // const id = env.VERSE_COMPUTER.idFromName('verse-computer');
    // ctx.waitUntil(env.VERSE_COMPUTER.get(id).start());
    console.log('verse-computer: tick at ' + new Date(now).toISOString() + ' (container start not wired/verified)');
  },
};
