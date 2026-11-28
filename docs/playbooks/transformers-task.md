# One Transformers.js task on a Verse page

Start here when an outside-source find or a visitor asks for a small model task that should run in the
browser instead of on a Workers AI worker. The first version is one page with one task, loaded only
after someone presses a button.

## Build

1. Put the page in its own directory under `void-live-deploy/` with `index.html`, an external `app.js`
   and a pure `embed-core.js` (or the equivalent for the task). Pinned CDN import inside a function;
   no top-level import, no inline executable script. Keep a `verse-handoff` meta row.
2. Give that exact path its own rule in `void-live-deploy/_headers`: `! Content-Security-Policy`
   followed by a policy whose `script-src` adds `https://cdn.jsdelivr.net` and keeps
   `'wasm-unsafe-eval'`. Do not widen the root policy; a second generated CSP on a page with inline
   scripts would still block the module, so leave the CDN page without inline scripts.
3. Put the visible credit on the page (library, SPDX licence, model) with a link to `/credits/`. Mark
   the source as used in `void-live-deploy/salvage.json` and add its `outside:` key to
   `domains/autosalvage.unified.json`. Check the source record in
   `domains/autosalvage.outside.json` first: an AutoSalvage find may already be there, so update the
   existing row instead of adding a second copy.
4. Add `tools/<page>.test.mjs` for the pure maths, the lazy local call, the credit and the narrow CSP,
   and add a `SPECS` entry in `tools/real-pages.mjs` so the new route is not reported as untested.
   Add one line in `docs/map.d/` naming the live probe and its test.

## Tell it worked

```sh
node tools/embeddings.test.mjs
node tools/real-pages.mjs --list
node tools/real-pages.mjs --routes /embeddings/ --base local
node tools/embeddings-live.mjs
```

The live probe serves the worktree page at `https://a-to-mind.com/` with its own CSP, lets the real
CDN and model load, and fails if no score appears, the credit is absent, or a Verse `/api/answer` call
happens. After the deploy, `node tools/embeddings-live.mjs --shipped` checks the page people can
actually reach. Keep the JSON proof in the job thread.

## Mistakes worth remembering

- A global CSP change touches every page; a path rule is enough.
- An inline script on a CDN page gets a generated CSP hash rule at deploy, and two CSPs are both
  enforced. Use an external module script.
- The model file is fetched from the model host, not Verse; the worker is never called.
- Two credits for one source is worse than none: search all three credit files before adding one.
