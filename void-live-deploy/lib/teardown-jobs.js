// Teardown jobs (VR2.3): each gap becomes a house-template micro-job. Held files are skipped.
// Markdown and JSON both come back. Tests: tools/teardown-jobs.test.mjs.
export const JOB_HEADS = Object.freeze(['Goal', 'Files', 'Change', 'Test', 'Done proof', 'Depends on']);

/** a file-safe slug. Pure. */
export function slugOf(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'gap';
}

/** the new lib and its test for one gap. `n` keeps two similar names apart. Pure. */
export function filesFor(prefix, feature, n = 1) {
  const slug = slugOf(prefix) + '-' + n + '-' + slugOf(feature);
  return ['void-live-deploy/lib/' + slug + '.js', 'tools/' + slug + '.test.mjs'];
}

function heldHit(files, held) {
  const list = (held || []).map((h) => String(h).replace(/\\/g, '/').replace(/^\.\//, ''));
  return files.filter((f) => list.some((h) => h === f || f.endsWith('/' + h)));
}

function render(jobs, skipped) {
  const lines = [];
  for (const j of jobs) lines.push('## ' + j.id, '', '- Goal: ' + j.goal, '- Files: ' + j.files.join(', '), '- Change: ' + j.change, '- Test: ' + j.test, '- Done proof: ' + j.done_proof, '- Depends on: ' + j.depends_on, '');
  if (skipped.length) {
    lines.push('## Skipped', '');
    for (const s of skipped) lines.push('- ' + s.id + ': ' + s.reason);
    lines.push('');
  }
  return lines.join('\n');
}

/** jobsOf(rows, { prefix, held, depends }) -> { markdown, json, jobs, skipped }. Only a gap (or a row with no verdict) becomes a job. Pure. */
export function jobsOf(rows, opts = {}) {
  const prefix = String(opts.prefix || 'TD'), held = opts.held || [];
  const src = Array.isArray(rows) ? rows : ((rows && rows.features) || []);
  const list = src.filter((r) => { const v = r && r.verdict; return !v || v === 'gap'; });
  const jobs = [], skipped = [];
  let prev = String(opts.depends == null || opts.depends === '' ? 'none' : opts.depends);
  list.forEach((row, i) => {
    const n = i + 1, id = prefix + n;
    const feature = String((row && (row.feature || row.name)) || 'missing piece').replace(/\s+/g, ' ').trim().slice(0, 80);
    const files = filesFor(prefix, feature, n), hit = heldHit(files, held);
    if (hit.length) { skipped.push({ id, feature, files, reason: 'skipped because a file is held: ' + hit.join(', ') }); return; }
    jobs.push({
      id, files, depends_on: prev,
      goal: 'Add ' + feature + ' as a Verse helper, in its own words.',
      change: 'New pure helper plus its test. No held file is edited.',
      test: 'node --test ' + files[1],
      done_proof: 'The named test passes and the pull request is labelled automerge.',
    });
    prev = id;
  });
  const json = { jobs, skipped };
  return { markdown: render(jobs, skipped), json, jobs, skipped };
}
