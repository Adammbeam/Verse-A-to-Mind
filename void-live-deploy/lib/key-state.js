// Whether a secret reached this deployment, never what it holds: 'set' (a non-empty string), 'empty' (bound with no value)
// or 'absent' (not bound at all). Lets a status page tell "never added" from "added blank" from "added to another environment"
// without a value, a length or a prefix ever leaving the function. Pure.
export function keyState(env, name) {
  if (!env || typeof env !== 'object') return 'absent';
  const v = env[name];
  if (v === undefined || v === null) return 'absent';
  return typeof v === 'string' ? (v.length ? 'set' : 'empty') : 'set';
}

// the secrets the project's production environment lists (wrangler pages secret list); names are public in the repo already
export const WATCHED_KEYS = ['SALT', 'STORE_SIGNING_KEY', 'READ_TOKEN', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'GUMROAD_PING_KEY', 'GITHUB_WEBHOOK_SECRET'];

export const keyStates = (env, names = WATCHED_KEYS) => Object.fromEntries(names.map((n) => [n, keyState(env, n)]));
