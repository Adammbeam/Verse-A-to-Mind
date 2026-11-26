/**
 * phase skill: "phase", "phase in", "see through" opens Phase (/phase/, lib/phase.js), Verse's see-through layer: it lies over a tab,
 * screen or video you share, reads it, puts a character or you into it, records a clip, and keeps what it picked up in the Satchel.
 * The card only offers the door; nothing is shared until you choose it in the browser's own prompt there.
 * Contract: { name, examples, nearMisses, match(lower, text), run(text, api) }
 */
import { phaseAsk, phaseLink } from '../lib/phase.js';

function run(text, api) {
  const a = phaseAsk(text) || { in: false };
  api.showPage((el) => {
    const h = document.createElement('h2'); h.textContent = 'Phase';
    const p = document.createElement('p'); p.textContent = a.in
      ? 'Share a tab, a screen or a video, then put yourself (your camera, with the room cut away on this device) or a character into it, and record a clip.'
      : 'Verse as see-through glass over a tab, a screen or a video you share: read it, act on it, step into it, record it. It stays on this device.';
    const go = document.createElement('a'); go.href = phaseLink(a); go.className = 'btn'; go.setAttribute('data-phase-open', a.in ? 'in' : 'see');
    go.textContent = a.in ? 'Phase in' : 'Open Phase';
    const more = document.createElement('div'); more.className = 'sub';
    more.textContent = 'On any other page, the Phase bookmarklet (on the Phase page) lays the same glass over it.';
    el.append(h, p, go, more);
  });
  return 'phase';
}

export default {
  name: 'phase',
  examples: ['phase', 'phase in', 'see through', 'see-through mode', 'phase me in', 'put me in the video', 'satchel'],
  nearMisses: ['phases of the moon', 'what phase is the moon in', 'phase 2 of the plan', 'see through walls'],
  match(lower, text) { return !!phaseAsk(text || lower); },
  run,
};
