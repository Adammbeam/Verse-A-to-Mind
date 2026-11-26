/**
 * stage-pdf skill — save the stage, or the picked card or note, as a PDF made on this device with the bundled pdf-lib
 * (the same library /pdf/ uses). The file carries the actual words on the stage, not a blank template.
 * "save the stage as a pdf", "this note as a pdf", "download this card as a pdf".
 */
import { printCards } from '../lib/stage-port.js';
import { fromText, loadLib } from '../lib/pdf-tools.js';

const TIDY = (s) => String(s || '').trim().toLowerCase().replace(/[?!.]+$/, '');

/** what the ask wants, or null. Pure. 'stage' is everything; 'picked' is the selected thing, or the first note, card or table. */
export function stagePdfIntent(text) {
  const t = TIDY(text);
  if (/^(?:please\s+)?(?:save|download|export|make|give\s+me)\s+(?:(?:the|my|this)\s+)?stage\s+(?:as|to|into)\s+(?:a\s+)?pdf$/.test(t)) return { scope: 'stage' };
  if (/^(?:please\s+)?(?:make|create|build)\s+(?:a\s+)?pdf\s+(?:of|from)\s+(?:(?:the|my|this)\s+)?stage$/.test(t)) return { scope: 'stage' };
  if (/^(?:please\s+)?(?:the\s+|my\s+)?stage\s+as\s+(?:a\s+)?pdf$/.test(t)) return { scope: 'stage' };
  if (/^(?:please\s+)?(?:save|download|export|make)\s+(?:(?:the|my|this)\s+)?(?:card|note|notes|notepad|list|table|book(?:\s+page)?)\s+(?:as|to|into)\s+(?:a\s+)?pdf$/.test(t)) return { scope: 'picked' };
  if (/^(?:please\s+)?(?:this|the picked|the selected)\s+(?:card|note|notepad|list|table|book(?:\s+page)?)\s+as\s+(?:a\s+)?pdf$/.test(t)) return { scope: 'picked' };
  if (/^(?:please\s+)?(?:save|download|export)\s+(?:this|it)\s+as\s+(?:a\s+)?pdf$/.test(t)) return { scope: 'picked' };
  if (/^(?:please\s+)?(?:make|create|build)\s+(?:a\s+)?pdf\s+(?:of|from)\s+(?:(?:the|my|this|the picked)\s+)?(?:card|note|notes|notepad)$/.test(t)) return { scope: 'picked' };
  return null;
}

/** rows of a table as tab-separated lines (original cell text, not the lowercased search dump). Pure. */
export function tableLines(t) {
  if (!t || !Array.isArray(t.rows)) return [];
  return t.rows.slice(0, 80).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')).join('\t') : String(r)));
}

/** title and paragraphs from stage things, in print order. Notes keep their words; tables keep their cell text. Pure. */
export function pdfDocOf(things, { scope = 'stage', pickedId = null } = {}) {
  let list = Object.values(things || {}).filter((t) => t && t.kind);
  if (scope === 'picked') {
    const one = (pickedId && things && things[pickedId]) || list.find((t) => ['notepad', 'sticky', 'csv-table', 'list', 'book'].includes(t.kind)) || list[0];
    list = one ? [one] : [];
  }
  list.sort((a, b) => (+a.y || 0) - (+b.y || 0) || (+a.x || 0) - (+b.x || 0));
  const paras = [];
  let first = '';
  for (const t of list) {
    const c = printCards({ x: t })[0];
    if (!first) first = c.title || c.kind;
    paras.push(c.title && c.title.toLowerCase() !== c.kind ? c.kind + ': ' + c.title : (c.title || c.kind));
    for (const line of t.kind === 'csv-table' && Array.isArray(t.rows) ? tableLines(t) : c.lines) if (line) paras.push(line);
  }
  return { title: scope === 'picked' && first ? first : 'Verse stage', paras: paras.length ? paras : ['Nothing on the stage.'] };
}

function savePdf(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function run(text, api) {
  const hit = stagePdfIntent(text);
  if (!hit) return 'none';
  const { showPage, esc } = api;
  const el = showPage((p) => { p.innerHTML = '<h2>Saving a PDF…</h2>'; });
  const things = (api.stage && typeof api.stage.things === 'function') ? api.stage.things() : {};
  const pickedId = api.stage && typeof api.stage.selected === 'function' ? api.stage.selected() : null;
  const doc = pdfDocOf(things, { scope: hit.scope, pickedId });
  try {
    const bytes = await fromText(await loadLib(), doc);
    savePdf((doc.title || 'verse-stage').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) + '.pdf', bytes);
    el.innerHTML = '<h2>' + esc(doc.title || 'PDF') + '</h2><p>A PDF of ' + (hit.scope === 'picked' ? 'the picked item' : 'the stage') + ' was saved on this device. It carries the words that were here.</p>'
      + '<div class="src">Made on this device with pdf-lib (MIT). Nothing was uploaded.</div>';
  } catch (e) {
    el.innerHTML = '<h2>The PDF did not save</h2><p>' + esc((e && e.message) || 'The file could not be made.') + '</p>';
  }
  return 'stage-pdf';
}

export default {
  name: 'stage-pdf',
  examples: ['save the stage as a pdf', 'download the stage as a pdf', 'this note as a pdf', 'download this card as a pdf', 'make a pdf of the stage', 'save this as a pdf'],
  nearMisses: ['merge pdf', 'split a pdf', 'jpg to pdf', 'export my stage as json', 'print view of the stage', 'export a print file', 'pdf tools'],
  stagePdfIntent,
  pdfDocOf,
  match(lower, text) { return !!stagePdfIntent(text || lower); },
  run,
};
