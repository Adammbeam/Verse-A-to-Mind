/**
 * electrical-panel-id skill — the unanswered DIY question (Stack Exchange 328779): how to identify the maker and
 * model/date of an unlabeled electrical panel for an insurer's recall check. The card is a method, not a guess:
 * where the marking actually lives, what a photo can and cannot prove, how to run the check once you have the
 * make + model + date code, and why a missing label is not by itself a reason to replace the panel.
 * No outside code is used; the question is linked and credited CC BY-SA 4.0.
 * Contract: { name, examples, nearMisses, match(lower, text), run(text, api), panelAsk, PANEL_CLUES, evidence, cardHtml }
 */
export const about = 'How to identify an unlabeled electrical panel: look for the label inside the door or on the enclosure, treat breaker brands as clues, find the date code, then match the exact make/model/date against a recall list.';

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[?!.,]+$/, '').replace(/\s+/g, ' ').trim();

/** true for asks about identifying a panel's maker/model/date, usually for a recall or insurer check. Pure. */
export function panelAsk(text) {
  const t = norm(text);
  if (!t) return false;
  if (/\b(electrical|electric|service|load.center|fuse|breaker)\b.*\bpanel\b/.test(t) && /\b(identify|identification|make|maker|model|brand|date|manufacturer|label|recall|unlabeled|old)\b/.test(t)) return true;
  if (/\bpanel\b.*\b(manufacturer|make and model|model\/date|model and date|date code|recall(ed)?)\b/.test(t)) return true;
  if (/\b(who made|which (make|brand)|what brand is)\b.*\b(panel|breaker box|fuse box)\b/.test(t)) return true;
  if (/\b(breaker box|fuse box)\b/.test(t) && /\b(model|date|make|brand|identify|recall)\b/.test(t)) return true;
  return false;
}

/** Where to look, in order of how much it proves. Static, so the card and the test read the same list. */
export const PANEL_CLUES = [
  { id: 'door', where: 'Inside the panel door', proves: 'The manufacturer label and model number live on the inner face of the door, often beside the circuit directory. This is the marking the insurer wants photographed.' },
  { id: 'cabinet', where: 'On the metal enclosure', proves: 'A stamped rating plate or small label on the side or bottom of the cabinet can carry the make, model and a date or serial code.' },
  { id: 'breaker', where: 'On the breaker faces', proves: 'Breaker handles carry a brand and a type. Useful as a clue, but breakers are swapped between panels, so this does not identify the panel itself.' },
  { id: 'date', where: 'A date or serial code', proves: 'Sometimes a plain year, sometimes a week/year or lot code. The maker can date the unit from it; a recall is judged on model plus date range, not on looks.' },
  { id: 'upstream', where: 'The meter socket or main disconnect', proves: 'Service equipment ahead of the panel may have its own label, which can name the system even when the subpanel does not.' },
];

/**
 * What a visitor's checklist lets us conclude. Pure, no DOM.
 * found = { door, cabinet, breaker, date } booleans. A label is authoritative; a breaker brand is only a clue.
 */
export function evidence(found) {
  const f = found || {};
  const label = !!(f.door || f.cabinet);
  const date = !!f.date;
  const breaker = !!f.breaker;
  if (label && date) return {
    level: 'Enough to check',
    headline: 'Make/model label plus a date code: you can run the recall check now.',
    next: 'Photograph the label and the code, then compare that exact model and date against the manufacturer’s safety notices and the national recall database. Keep the result for the insurer.',
  };
  if (label) return {
    level: 'Almost there',
    headline: 'You have the make and model, but not the date code.',
    next: 'A recall applies to a range of dates, so a model alone cannot answer it. Look for a stamped code on the enclosure or ask the maker to date the serial; a photo of the label is still worth sending.',
  };
  if (breaker && date) return {
    level: 'Clue only',
    headline: 'A breaker brand and a code are not the panel’s make and model.',
    next: 'Breakers get moved between panels. Ask an electrician to read the panel label in person and put the identification in writing for the insurer.',
  };
  if (breaker) return {
    level: 'Clue only',
    headline: 'The breaker brand hints at the maker but does not identify the panel.',
    next: 'Do not name a manufacturer from breaker handles alone. Have the label read and photographed, or get a written identification from an electrician.',
  };
  return {
    level: 'No marking yet',
    headline: 'Nothing readable has been found so far.',
    next: 'Open the outer door and check the inside face and the enclosure. If there is still no label, an electrician can identify the panel from the bus and breaker type and document it — a missing label does not automatically mean replacement.',
  };
}

const fmt = (s) => String(s == null ? '' : s);

/** the card's markup from static content, escaped by the caller. Pure. */
export function cardHtml(esc) {
  const look = PANEL_CLUES.map((c) => '<li><b>' + esc(c.where) + '</b> — ' + esc(c.proves) + '</li>').join('');
  return '<h2>Identify an unlabeled electrical panel</h2>'
    + '<div class="sub">A recall check needs a make, a model and a date code — not a photo of a closed door</div>'
    + '<p><b>What the insurer is asking for.</b> A maker and a model number, plus the date or serial code, so the exact unit can be compared with a recall range. “It looks like an old one” and a breaker brand are not enough to answer whether a particular panel is affected.</p>'
    + '<p><b>Look in this order.</b> The label carries more weight the closer it is to the cabinet itself:</p>'
    + '<ol style="line-height:1.6">' + look + '</ol>'
    + '<p><b>What a photo can tell you.</b> Breaker brands, the number of spaces and the general style can suggest an age and a maker, but they cannot establish a model or a date. Ask for a picture of the label, not just the door. If the label is gone, an electrician can identify the panel in person and write it down — that is documentation, and a missing label is not by itself a reason to replace the panel.</p>'
    + '<p><b>Run the check.</b> With the exact make, model and date code, compare them with the manufacturer’s safety or recall notices and with the national product recall database. Save a photo of the label and a note of what the check said, so the insurer sees the same evidence you did.</p>'
    + '<div style="max-width:480px;margin:14px 0;padding:12px;border:1px solid var(--line);border-radius:8px">'
    + '<div style="font-size:15px;margin-bottom:8px">What have you actually found?</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px">'
    + '<label><input type="checkbox" id="pi-door"> label inside the door</label>'
    + '<label><input type="checkbox" id="pi-cabinet"> plate on the cabinet</label>'
    + '<label><input type="checkbox" id="pi-breaker"> breaker brand only</label>'
    + '<label><input type="checkbox" id="pi-date"> date or serial code</label></div>'
    + '<div style="margin-top:10px"><span style="color:var(--muted)">What this proves: </span><b id="pi-level"></b></div>'
    + '<div id="pi-headline" style="margin-top:6px"></div>'
    + '<div id="pi-next" style="color:var(--muted);font-size:14px;margin-top:4px"></div></div>'
    + '<p style="color:var(--muted)"><b>Safety.</b> Opening the outer door to look for a label is fine. Do not remove the deadfront or pull breakers out: those expose live parts. If anything buzzes, feels warm or looks damaged, stop and call an electrician.</p>'
    + '<div class="src">Question answered: <a href="https://diy.stackexchange.com/questions/328779/how-can-i-identify-the-manufacturer-and-model-date-of-this-electrical-panel" target="_blank" rel="noopener">DIY Stack Exchange 328779</a> (CC BY-SA 4.0) · method only, no panel brand is claimed from a photo · as of 2026-11</div>';
}

function run(text, api) {
  const { showPage, esc } = api;
  const el = showPage((p) => { p.innerHTML = cardHtml(esc); });
  const q = (id) => el.querySelector('#' + id);
  const ids = ['pi-door', 'pi-cabinet', 'pi-breaker', 'pi-date'];
  const upd = () => {
    const found = { door: q('pi-door').checked, cabinet: q('pi-cabinet').checked, breaker: q('pi-breaker').checked, date: q('pi-date').checked };
    const e = evidence(found);
    q('pi-level').textContent = e.level;
    q('pi-headline').textContent = e.headline;
    q('pi-next').textContent = e.next;
  };
  ids.forEach((id) => q(id).addEventListener('change', upd));
  upd();
  api.say('To identify an unlabeled electrical panel for a recall check, read the label on the inside of the door or the plate on the cabinet. Breaker brands are only clues. You need the exact make, model and date code to compare with a recall range; a missing label does not automatically mean replacement, and do not remove the deadfront yourself.');
  return 'electrical-panel-id';
}

export default {
  name: 'electrical-panel-id',
  examples: [
    'How can I identify the manufacturer and model/date of this electrical panel?',
    'how to tell what brand my electrical panel is with no label',
    'find the model and date code of an old breaker box for a recall check',
    'insurer wants the make and model of my electrical panel',
    'who made this electrical panel',
  ],
  nearMisses: [
    'how do i reset a tripped breaker',
    'how many circuits can my panel handle',
    'what is a gfci outlet',
    'replace a light switch',
    'cost to install a new electrical panel',
  ],
  panelAsk,
  PANEL_CLUES,
  evidence,
  match(lower, text) { return panelAsk(text || lower); },
  run,
  suite() {
    const full = evidence({ door: true, date: true });
    const none = evidence({});
    const clue = evidence({ breaker: true });
    return {
      ok: PANEL_CLUES.length === 5 && PANEL_CLUES[0].id === 'door'
        && full.level === 'Enough to check' && none.level === 'No marking yet' && clue.level === 'Clue only'
        && panelAsk('How can I identify the manufacturer and model/date of this electrical panel?')
        && !panelAsk('how do i reset a tripped breaker'),
      got: 'the clue order, the evidence levels and the routing',
    };
  },
};
