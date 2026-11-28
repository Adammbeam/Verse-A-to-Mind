# Pin an outside dataset

When a check or a page needs data from someone else, keep a copy in the tree and pin the exact bytes. A visitor's browser never waits on the source.

1. **Check the dataset's own licence, not the library's.** A loader such as `huggingface/datasets` being Apache-2.0 says nothing about the datasets in it. Read the dataset card (`https://huggingface.co/datasets/<id>/raw/main/README.md`) and record its SPDX id, author and card URL. If there is no clear licence, skip the dataset.
2. **Pin an immutable commit and a file hash.** Use the commit sha in the resolve URL, fetch it once, and write `fileSha256` beside the pin in `data/hf-pins.json`. Put the licence text and attribution in a `LICENSE-<name>.txt` next to the derived file, and add a row to `docs/licenses.md` plus the source/unified rows in `domains/autosalvage.*.json` so `/credits/` shows it.
3. **Vendor a small derived slice, not the whole file.** Keep only the rows the check and the page use, with `pin`, `pinFile`, `pinSha256`, `author`, `license` and `licenseSource` written into the JSON itself. That is what makes the licence sit *next to* the data.
4. **Add a fast check.** `tools/hf-pins.test.mjs` runs under `node tools/checks.mjs` through `tools/checks.d/hf-pins.chk` and verifies the pin, the hash, the licence text and the vendored rows offline. `node tools/hf-pins.mjs` does the same from the shell. A new tool file needs one line in `docs/map.d/`.
5. **Refresh only on purpose.** `node tools/hf-pins.mjs --refresh` is the one labelled command that contacts huggingface.co. It fetches only the pinned commit and refuses bytes that do not match `fileSha256`, so a silent upstream change cannot enter Verse. Update `derivedSha256` in the same change.
6. **Name it on the page.** Add one plain sentence to the page that uses the data (`tools/tool-site-pages.mjs` builds the flights footer), and extend the browser suite so the page is checked with the source blocked.

What worked: `AWeirdDev/airports`, MIT on its own card, 24 airport rows derived from the pinned `data.csv`. What would fail the gate: taking the library licence as the dataset licence, a `@main` URL with no sha, or a runtime fetch on the live site.
