/**
 * share skill — a link to this card (?share_text=) or a portable VERSE-STAGE: code across devices (plan item 10, shared Verses).
 * Single-card asks use ?share_text=; multi-card stage asks reuse lib/stage-code.js + lib/stage-port.js to bypass the unbound env.SHARE relay (BASE.md).
 * "share this card", "share this card: rain in Lisbon", "make a stage code", "open stage code".
 */
import { stageCodeAsk, runStageCode, stageCodeSuite } from '../lib/stage-code.js';

export function shareOf(text) {
  const t = String(text || '').trim().replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
  const m = t.match(/^(?:please\s+)?(?:share|copy\s+a\s+link\s+(?:to|for))\s+(?:this|the\s+open)\s+card(?:\s*:\s*(.{1,240}))?$/i);
  if (!m) return null;
  return { words: (m[1] || '').trim() };
}

export function shareLink(text) {
  const hit = shareOf(text);
  if (!hit) return null;
  if (!hit.words) return 'https://a-to-mind.com/?share_text=';
  return 'https://a-to-mind.com/?share_text=' + encodeURIComponent(hit.words);
}

async function run(text, api) {
  if (stageCodeAsk(text)) return runStageCode(text, api);
  const { showPage, esc } = api;
  const hit = shareOf(text);
  if (!hit) return 'none';
  const href = shareLink(text);
  const el = showPage((p) => { p.innerHTML = '<h2>Share this card</h2>'; });
  const body = hit.words
    ? '<p>Anyone with this link opens the same words in Verse. Nothing is published and nothing is sent.</p><p><a href="' + esc(href) + '">' + esc(href) + '</a></p>' // void-review: ok (href is escaped with esc)
    : '<p>No words on this card yet. Say share this card: and the words, and the link carries only those.</p>';
  el.innerHTML = '<h2>Share this card</h2>' + body // void-review: ok (body is fixed text or escaped with esc)
    + '<div class="src">Uses the share target already on Verse. Not a published page.</div>';
  return 'share';
}

export default {
  name: 'share',
  examples: ['share this card', 'share this card: rain in Lisbon', 'copy a link to this card', 'share the open card', 'please share this card: a kept note', 'make a stage code', 'copy my stage as a code', 'share stage code', 'open stage code', 'import stage code', 'share my stage without share relay'],
  nearMisses: ['publish this card', 'rename this card', 'share the whole stage', 'what is a share', 'export my stage as json', 'import a stage from json', 'print the stage', 'what is a stage code', 'qr code for https://a-to-mind.com', 'morse code'],
  shareLink,
  stageCodeAsk,
  suite: stageCodeSuite,
  match(lower, text) { return !!shareOf(text) || stageCodeAsk(text || lower); },
  run
};
