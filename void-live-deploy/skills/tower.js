/**
 * tower skill — Versus: "versus", "verse versus", "the tower", "verse tower", "elevator" open it. A visitor sees the taped Out of Order sign and nothing
 * else. The owner, once /api/versus-floor accepts the owner session (versus/open.js ownerModel, which also opens the owner-only files), gets the real
 * card, loaded from versus/card.js (the card; THE RULES ARE docs/TOWER-RULES.md) and lib/versus-floor.js (the elevator). This file names no site and
 * imports no file that does, so nothing about the sites Versus is measured against reaches a visitor (lib/owner-gate.js).
 */
import { visitorHtml } from '../lib/versus-sign.js';
import { ownerModel } from '../versus/open.js';

// Versus (owner, 2026-10-25: "the tower rename is easy its versus"): "versus", "verse versus", "the versus", "show me versus" open it, and every
// ask that said "tower" still does
const ASK_RE = /^(?:(?:show|open)(?:\s+me)?\s+)?(?:the\s+|your\s+)?(?:verse(?:'s)?\s+)?(?:tower|versus)$|^(?:which|what)\s+sites\s+have\s+you\s+(?:beaten|surpassed|passed)$|^(?:the\s+)?surpassed(?:\s+sites)?$|^(?:the\s+)?conquered(?:\s+sites)?$|^who\s+(?:have\s+we|has\s+verse|did\s+(?:we|verse))\s+(?:beaten|beat|conquered|run\s+through)$/;
export const towerOf = (text) => ASK_RE.test(String(text || '').trim().toLowerCase().replace(/[?!.]+$/, '').replace(/\s+/g, ' '));
export const elevatorOf = (text) => /^(?:(?:show|open)(?:\s+me)?\s+)?(?:the\s+|your\s+|verse(?:'s)?\s+)?(?:elevator|tower)$/.test(String(text || '').trim().toLowerCase().replace(/[?!.]+$/, '').replace(/\s+/g, ' '));

async function run(text, api) {
  const sign = (el) => { el.classList.add('tower-card'); el.innerHTML = visitorHtml() + '<p class="tw-head" hidden>Versus</p>'; }; // void-review: ok (visitorHtml is fixed markup from this repo, and the hidden heading is a fixed string)
  if (elevatorOf(text)) {
    api.showPage((el) => {
      sign(el);
      ownerModel().then(async (m) => { if (!m || !el.isConnected) return; const { ownerHtml } = await import('../lib/versus-floor.js'); const { elevatorHtml } = await import('../lib/ability-floors.js'); if (el.isConnected) el.innerHTML = elevatorHtml(m, ownerHtml(m), api.esc); }).catch(() => {}); // void-review: ok (ownerHtml and elevatorHtml run every value through esc)
    });
    return 'tower';
  }
  if (!towerOf(text)) return 'none';
  const { showPage, esc, say } = api;
  showPage((el) => {
    sign(el);
    ownerModel().then(async (m) => {
      if (!m || !el.isConnected) return;
      const { abilityLine, cardWithAbilities } = await import('../lib/ability-floors.js');
      const line = abilityLine(m.abilities);
      await (await import('../versus/card.js')).ownerCard(el, { esc, say: line && say ? () => say(line) : say });
      if (el.isConnected && m.abilities) el.innerHTML = cardWithAbilities(el.innerHTML, m.abilities, esc); // void-review: ok (cardWithAbilities escapes the ability text; the card html was already escaped)
    }).catch(() => {});
  });
  return 'tower';
}

export default {
  name: 'tower',
  about: 'Versus: real sites as floors, and how many aspects of each Verse has verified it beats.',
  examples: ['versus', 'verse versus', 'the versus', 'show me versus', 'the tower', 'verse tower', 'elevator', 'the elevator', 'which sites have you surpassed', 'show the tower', 'open your tower'],
  nearMisses: ['eiffel tower', 'tower of hanoi', 'how tall is the tower', 'tower defense game', 'cell tower near me', 'cats versus dogs', 'verse versus google'],
  match(lower, text) { const t = text || lower; return towerOf(t) || elevatorOf(t); },
  run, towerOf,
};
