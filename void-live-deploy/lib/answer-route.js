// Which model answers a visitor's open ask right now, from /api/free's own rows (lib/free-router.js status). Workers AI (binding AI,
// no key) is answer.js's direct call and needs nothing anyone pastes; the keyed free tiers (lib/answer-free.js LLM_ENDPOINTS) are the
// failover once their one key is set. Gemini's free tier may train on prompts, so it is never a route for visitor asks. Pure.
export const FAILOVER = ['groq-free', 'cerebras-free', 'openrouter-free', 'mistral-free', 'github-models'];

export function answerRoute(rows = []) {
  const by = Object.fromEntries((rows || []).map((r) => [r.id, r]));
  const up = (id) => !!(by[id] && by[id].available);
  const failover = FAILOVER.filter(up);
  return { model: up('workers-ai-chat') ? 'workers-ai-chat' : failover[0] || null, keyless: up('workers-ai-chat'), failover };
}
