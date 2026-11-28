// GET /api/cost-usage: the owner's ranked, rough cost by loop, read from the one D1 table the loops write each day
// (lib/cost-log.js). Anyone else gets the same answer as a missing page. Read only, no input, no billing setting changed.
import { ownerGate } from '../../lib/owner-gate.js';
import { COST_NOTE, costRows } from '../../lib/cost-log.js';

const NO = () => new Response('no', { status: 404, headers: { 'cache-control': 'no-store' } });

export async function onRequestGet({ request, env }, gate = ownerGate, read = costRows) {
  if (!(await gate(request, env))) return NO();
  const rows = await read(env && env.DB, 30);
  return Response.json({ note: COST_NOTE, rows, at: new Date().toISOString() }, { headers: { 'cache-control': 'private, max-age=60' } });
}
