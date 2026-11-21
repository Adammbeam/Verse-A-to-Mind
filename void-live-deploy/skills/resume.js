/**
 * resume skill — "make a resume", "write a cover letter", "write a professional email": the /resume/ super-page, which is
 * live but had no router skill, so these asks fell to plain how-to text (docs/capability-gaps.md rank 2-4, GAPS #51).
 * The card is a real door to the page: it names the tab that answers the ask and opens /resume/ on it (data-page), so the
 * visitor lands in the editor, not on a description of one. The page builds the resume, cover letter or email from their
 * own details, downloads it as .txt (or .eml for an email), and keeps the work in their browser; nothing is uploaded.
 * Contract: { name, examples, nearMisses, match(lower, text), run(text, api) }
 */

const MAKE = /^(?:please\s+)?(?:(?:can|could|will|would)\s+you\s+)?(?:make|write|build|create|draft|generate|give\s+me)\s+(?:me\s+)?(?:a|an|my|our)\s+(?:new\s+|professional\s+|good\s+)?/;

/** the tab and page an ask wants, or null. Pure. */
export function studioAsk(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
  if (!t || t.length > 120) return null;
  let rest = '';
  if (MAKE.test(t)) rest = t.replace(MAKE, '');
  else if (/^(?:resume|cv|cover\s+letter)\s+(?:builder|maker|template)$/.test(t)) rest = t.replace(/\s+(?:builder|maker|template)$/, '');
  else if (/^(?:professional\s+email|email\s+for\s+a\s+job(?:\s+application)?)$/.test(t)) rest = t;
  else return null;
  if (/^(?:resume|cv)(?:\s+for\s+.{1,60})?$/.test(rest)) return page('resume');
  if (/^cover\s+letter(?:\s+for\s+.{1,60})?$/.test(rest)) return page('cover');
  if (/^(?:professional\s+)?email(?:\s+(?:for|to)\s+(?:a\s+|an\s+|the\s+)?(?:job|employer|hiring\s+manager|recruiter).{0,40})?$/.test(rest)) return page('email');
  return null;
}

function page(tab) {
  const href = '/resume/' + (tab === 'resume' ? '' : '?tab=' + tab);
  const title = tab === 'cover' ? 'Cover letter studio' : tab === 'email' ? 'Professional email studio' : 'Resume studio';
  const blurb = tab === 'cover'
    ? 'Write a cover letter from your own details and download it as .txt. The same page keeps your resume and a professional email beside it, and your work stays in this browser.'
    : tab === 'email'
      ? 'Write a professional email and download it as .eml or .txt. The same page keeps your resume and cover letter beside it, and your work stays in this browser.'
      : 'Build a resume from your own details and download it as .txt. The same page makes a cover letter and a professional email, and your work stays in this browser.';
  return { tab, href, title, blurb, label: tab === 'cover' ? 'Open the cover letter studio' : tab === 'email' ? 'Open the professional email studio' : 'Open the resume studio' };
}

function run(text, api) {
  const to = studioAsk(text);
  if (!to) return 'none';
  const { showPage, esc } = api;
  showPage((p) => {
    if (p.dataset) p.dataset.page = to.href; // the card's page link opens the studio on the right tab
    p.innerHTML = '<h2>' + esc(to.title) + '</h2><p>' + esc(to.blurb) + '</p>'
      + '<p><a href="' + esc(to.href) + '">' + esc(to.label) + '</a></p>'
      + '<div class="src">Verse\'s <a href="/resume/">resume, cover letter and email page</a> · nothing is uploaded</div>';
  });
  return 'resume';
}

export default {
  name: 'resume',
  examples: ['make a resume', 'write a resume', 'resume builder', 'make a cover letter', 'write a cover letter', 'write a professional email'],
  nearMisses: ['resume tips', 'what should a resume include', 'draft of my resume', 'write a draft email to bob', 'cover letter examples'],
  studioAsk,
  match(lower, text) { return !!studioAsk(text || lower); },
  run
};
