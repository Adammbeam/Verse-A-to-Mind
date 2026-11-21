/**
 * budget-planner skill — "make a budget", "budget planner", "expense tracker", "track my expenses": the /budget/ super-page, which is
 * live but had no router skill, so these asks fell to plain how-to text (docs/capability-gaps.md rank 5-6, GAPS #47, #48).
 * The card is a real door to the page: it names the tab that answers the ask and opens /budget/ on it (data-page), so the
 * visitor lands in the planner, not on a description of one. The page plans a monthly budget by category, lists expenses
 * (or imports a Cash App CSV), tracks subscriptions, and exports the expenses as CSV; nothing is uploaded.
 * Contract: { name, examples, nearMisses, match(lower, text), run(text, api) }
 */

const MAKE = /^(?:please\s+)?(?:(?:can|could|will|would)\s+you\s+)?(?:make|create|build|plan|start|set\s+up|give\s+me)\s+(?:me\s+)?(?:a|an|my|our)\s+(?:monthly\s+|household\s+|personal\s+)?/;

/** the tab and page an ask wants, or null. Pure. */
export function budgetAsk(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
  if (!t || t.length > 120) return null;
  let rest = '';
  if (MAKE.test(t)) rest = t.replace(MAKE, '');
  else if (/^(?:budget|expense|spending)\s+(?:planner|tracker|maker)$/.test(t)) rest = t;
  else if (/^(?:track|log)\s+my\s+(?:expenses|spending)$/.test(t)) rest = 'expense tracker';
  else if (/^(?:monthly|household|personal)\s+budget$/.test(t)) rest = 'budget';
  else return null;
  rest = rest.replace(/\s+for\s+.{1,60}$/, '');
  if (/^(?:expense|spending)\s+(?:planner|tracker|maker)$/.test(rest)) return page('expenses');
  if (/^budget(?:\s+(?:planner|tracker|maker))?$/.test(rest)) return page('budget');
  return null;
}

function page(tab) {
  const href = '/budget/' + (tab === 'budget' ? '' : '?tab=' + tab);
  const title = tab === 'expenses' ? 'Expense tracker' : 'Budget planner';
  const blurb = tab === 'expenses'
    ? 'List expenses by hand or import a Cash App CSV, then export them as CSV. The same page plans a monthly budget and tracks subscriptions, and nothing is uploaded.'
    : 'Plan a monthly budget by category and see what is left. The same page lists expenses (or imports a Cash App CSV) and tracks subscriptions, and nothing is uploaded.';
  return { tab, href, title, blurb, label: tab === 'expenses' ? 'Open the expense tracker' : 'Open the budget planner' };
}

function run(text, api) {
  const to = budgetAsk(text);
  if (!to) return 'none';
  const { showPage, esc } = api;
  showPage((p) => {
    if (p.dataset) p.dataset.page = to.href; // the card's page link opens the planner on the right tab
    p.innerHTML = '<h2>' + esc(to.title) + '</h2><p>' + esc(to.blurb) + '</p>'
      + '<p><a href="' + esc(to.href) + '">' + esc(to.label) + '</a></p>'
      + '<div class="src">Verse\'s <a href="/budget/">budget, expenses and subscriptions page</a> · nothing is uploaded</div>';
  });
  return 'budget-planner';
}

export default {
  name: 'budget-planner',
  examples: ['budget planner', 'make a budget', 'expense tracker', 'track my expenses', 'monthly budget', 'make an expense tracker'],
  nearMisses: ['certainty budget', 'budget for a project', 'what is a budget', 'budgeting tips', 'expense report template'],
  budgetAsk,
  match(lower, text) { return !!budgetAsk(text || lower); },
  run
};
