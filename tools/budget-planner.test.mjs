// budget-planner (skills/budget-planner.js): "make a budget" and "expense tracker" fell to how-to text; now they open the /budget/ planner
// on the right tab, and the card is a real door to that page. The page itself is tested in the browser suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import skill, { budgetAsk } from '../void-live-deploy/skills/budget-planner.js';

test('a budget, an expense tracker and tracking expenses land on their tabs', () => {
  assert.equal(budgetAsk('make a budget').tab, 'budget');
  assert.equal(budgetAsk('make a monthly budget').tab, 'budget');
  assert.equal(budgetAsk('plan my budget').tab, 'budget');
  assert.equal(budgetAsk('budget planner').tab, 'budget');
  assert.equal(budgetAsk('monthly budget').tab, 'budget');
  assert.equal(budgetAsk('household budget').tab, 'budget');
  assert.equal(budgetAsk('expense tracker').tab, 'expenses');
  assert.equal(budgetAsk('make an expense tracker').tab, 'expenses');
  assert.equal(budgetAsk('track my expenses').tab, 'expenses');
  assert.equal(budgetAsk('log my spending').tab, 'expenses');
  assert.equal(budgetAsk('spending tracker').tab, 'expenses');
  assert.equal(budgetAsk('expense tracker').href, '/budget/?tab=expenses');
  assert.equal(budgetAsk('make a budget').href, '/budget/');
});

test('not a budget ask: another budget, advice, or a template', () => {
  for (const a of ['certainty budget', 'budget for a project', 'what is a budget', 'budgeting tips', 'expense report template', 'how do i budget', '']) assert.equal(budgetAsk(a), null, a);
});

test('every example reaches this skill and no near miss does', () => {
  for (const e of skill.examples) assert.ok(skill.match(e.toLowerCase(), e), e);
  for (const n of skill.nearMisses) assert.ok(!skill.match(n.toLowerCase(), n), n);
});

test('the card opens the planner on the tab and links to the page', () => {
  const el = { innerHTML: '', dataset: {} };
  const out = skill.run('track my expenses', { esc: (s) => String(s), showPage: (fn) => { fn(el); return el; } });
  assert.equal(out, 'budget-planner');
  assert.equal(el.dataset.page, '/budget/?tab=expenses');
  assert.match(el.innerHTML, /<h2>Expense tracker<\/h2>/);
  assert.match(el.innerHTML, /<a href="\/budget\/\?tab=expenses">Open the expense tracker<\/a>/);
  assert.match(el.innerHTML, /nothing is uploaded/);
});
