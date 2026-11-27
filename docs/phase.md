# Phase

Phase is Verse's see-through layer. It is meant to sit over whatever is underneath it, first a web page and a shared window, and later the whole Windows desktop, and to add to that thing as if it belonged there.

This page is the map of the code, what a visitor can do today, how the pieces connect, what a live pass showed on 2026-11-27, and the next small builds. It is not a second product. The stage, the ask, and the skills stay Verse.

## The design rule

Phase adds to whatever is underneath it seamlessly.

A note takes the light, the colour and the type of the page or window it is on. Its edges are transparent and feathered, so they disappear into that surface. It is anchored to the words or the control it is about. It is not a box or a panel pasted on top.

The ask stays an ask: one clear line to type into, easy to see, never covered by the note.

Screen content is read only after an explicit action (a share, a command, a press). A visit, a focus, or the layer simply being open is not a read. What a visitor types or shares goes only to Workers AI or Groq, and only from a control that says it sends. Frames, camera and clips stay on the device unless that control is pressed. Nothing seen is logged.

The same rule covers the web overlay and the Windows shell below. A desktop window that is a dark panel floating on a light app fails it, the same way a dark bar on a paper page fails it.

## What it is, and what it is not

Phase is the page at `/phase/`, the bookmarklet that loads `/phase/overlay.js` on any other page, and the ask that opens the door (`phase`, `phase in`, `see through`, `satchel`, and the "put me in the video" wording). `lib/phase.js` holds the pure helpers. `skills/phase.js` only draws the card that links there. Nothing is shared until the visitor picks it in the browser's own prompt, or types a command on a page where they opened the overlay.

These are different things and are not Phase:

- `html[data-phase]` on the stage (`dawn`, `day`, `dusk`, `night`) is the time-of-day tint.
- Moon phase, stakes-phase, and the resonance "phase" variant are their own skills.

## What a visitor can do today

On `/phase/`:

- **Read and act.** Share a tab or a screen, or open a video or a picture from this device. "Read the words in this frame" and "Edit this frame" keep one picture in this browser and open `/translate/` or `/image/` with it. They do not upload it. If the overlay brought a page's words here, the page can list numbers, open translate with those words, summarize, or keep the words in the Satchel. Summarize is the one control that says it sends.
- **Step in.** Place Motelet (drawn here, the same figure as the figure skill) or one of four glyphs. Drag it, size it with the wheel. "Phase me in" opens the camera. "Learn the empty room" stores one frame and keys the room out on this device. Record writes a WebM or MP4 with `MediaRecorder` and offers it as a download. The file is not uploaded.
- **Play as P2.** Two links, to a Verse game and to the arcade. Over a game shared from another app, Phase can watch and place a character. It cannot press that app's keys.
- **Satchel.** Up to 24 things Phase picked up (words, a frame's name, a clip's name, numbers, a character), newest first, in `localStorage` under `verse_satchel`. It never leaves this browser.

On any other page, the bookmarklet (a `javascript:` link you drag to the bookmarks bar) injects `overlay.js`:

- **Find** underlines the words, in that element's own ink, and puts a short note on the first match.
- **Numbers** lists the figures. The distinctive ones (money, percents, longer numbers) get the same underline, and a one-line note sits on the first of those. The list itself stays in the ask line.
- **Fill** writes into the one box whose label matches, and does not send the form.
- **Click** presses a button, and refuses one that pays, buys, deletes, sends, or submits a form.
- **Take to Verse** opens `/phase/` with the words in the address's `#fragment`. A browser does not send that part to a server. The Phase page reads it and then drops it from the address.

The ask line takes the page's own background, ink and type, with a soft halo instead of a hard border. The page under it stays clickable. The line itself, and a note while it is open, take the clicks.

Closing the layer, or pressing Escape in the ask, clears the underlines and the note.

## How it is wired

| Piece | Role |
| --- | --- |
| `void-live-deploy/lib/phase.js` | Asks, the room key, placement, clip names, the `#page=` pack, numbers, the Satchel, and the note helpers (`findSpans`, `cssColor`, `phaseTone`, `placeNote`) |
| `void-live-deploy/phase/index.html` | The full-window page: video, canvas, glass, dock |
| `void-live-deploy/phase/app.js` | Modes, the compositor, camera key, recording |
| `void-live-deploy/phase/overlay.js` | The bookmarklet. A classic script, so it cannot import the module; it carries the same four helpers. `tools/phase.test.mjs` checks they still agree |
| `void-live-deploy/skills/phase.js` | The card. `phaseAsk` decides `/phase/` or `/phase/?in=1` |
| `void-live-deploy/skills/order/12020-phase` | Routing rank |
| `tools/phase.test.mjs` | Pure helpers, no browser |
| `tools/phase-live.mjs` | A real browser, fake screen and camera, then the overlay on a page from another origin |

The compositor in `app.js` draws every frame with `requestAnimationFrame`: the shared video or the opened picture, then each layer. The camera layer runs `getImageData` when a room plate exists. Summarize posts `{ ask, page }` to `/api/answer`. That body is handled by `pageAnswer`, which calls `runFree` on the free Workers AI model and writes nothing about the page to D1. `runFree` refuses anything that is not a free Workers AI model, so this path does not call Groq or a paid model.

`sendImage` (`lib/image-handoff.js`) keeps the picture in IndexedDB on this device and opens the next Verse page with `?img=handoff`.

## Scored against the rule

Checked live on 2026-11-27 with headless Chrome: `/phase/` at 1280×800 and at 390×844, and the overlay injected on a paper-coloured invoice page and the same page restyled dark. The overlay row is the production script as it was that day. The last column is what this change does.

| Surface | Light and type | Edges | Anchored | Ask stays clear | Read only after an action |
| --- | --- | --- | --- | --- | --- |
| Overlay bar, before | Failed. Same dark slab (`rgba(16, 18, 28, 0.73)`, 1px white border) on cream paper and on a dark page | Hard | Glued to the bottom, not to the words | The field was clear, and on a phone the placeholder was cut off | Failed. On open it read the whole page and said how many words it had |
| Yellow mark, before | Failed. A default `<mark>`, bright yellow on both pages | Hard | On the word, but it restyled the word and split its text. `find invoice` then `find invoice 42` returned 0 matches |  | Only after a find |
| `/phase/` dock | Matches Verse's own black stage. It will stay that dark slab over a light window you share | Radius, hard border | A bottom panel, 187px on the desktop pass, 314px on the phone | The controls are the page. They fit, and they cover a lot of a phone | Share, open, and Summarize are presses. The compositor draws continuously even when nothing is shared |
| Overlay after this change | The bar and the note take the page's computed background, ink and font. Cream page, cream bar. Dark page, dark bar. The underline is that ink at 70% | Halo and a feathered line, no border | The underline sits under the match. A one-line note sits on the first match. A second find still lands (2 matches, then 2 matches, on the invoice page) | The field keeps a visible well and a focus ring. The shorter placeholder fits a 390px phone | No read on open. No underline until a command. Marks and the greeting were checked before the first command |

Reduced motion: the new overlay sets no transition and no animation (`transition-duration: 0s` under `prefers-reduced-motion: reduce`). The `/phase/` glass still fades in 0.4s, and the page opts into a view transition, with no reduced-motion gate. That stays on the list below.

What is still weak, after this change:

- The note can sit on the line above a match when that line is close (on a phone, "1 match" overlaps the bottom of the heading). It does not yet hunt for a gap that is actually empty.
- Numbers are still a loose scan. On the invoice page the list included the day, the year, and a broken label ("nd line also says invoice"). Only the distinctive figures are underlined.
- `/phase/` itself is still a dock pasted on the bottom. Over a shared light window it will not take that window's light.
- The compositor keeps drawing, including a full `getImageData` pass while the camera is keyed, even when the tab is hidden or nothing is shared.
- Play as P2 does not play. The bookmarklet cannot be installed by dragging on a phone, so a phone visitor only has `/phase/` and screen share.
- Find matches inside one text node. A phrase split by a tag is missed. The underline does not follow a match into another origin's iframe.
- A browser cannot keep a page above other apps, cannot offer a global hotkey, and cannot click through the operating system's own windows. That is the shell, below.

## Where it is going

The web overlay stays the core. Everything the shell does should be the same Phase: the same ask, the same notes, the same refusal to read until asked. The shell is a window, not a second product.

A browser cannot float above the desktop. Two open options, and a heavier one that loses:

| | Transparent | Always on top | Click-through when idle | Global hotkey | Capture only on an explicit action | What it costs |
| --- | --- | --- | --- | --- | --- | --- |
| Installed PWA, `window-controls-overlay` | The title bar can be drawn by the page. The rest of the window is the page | No | Only inside the page (`pointer-events`) | No. A shortcut works only while the window is focused | Yes. Same rule as the site | No new runtime. The manifest and a thin title strip |
| A small Tauri window | A transparent window | Yes | Yes, while idle | Yes | Yes, if the shell does not capture until the hotkey or a press | A small native binary. Tauri is MIT or Apache-2.0. The pull request that vendors or binds it adds the credit on `/credits/` before it merges |
| Electron | Yes | Yes | Yes | Yes | Same discipline | A much larger runtime, MIT. Worse fit for a layer that should feel like part of the window under it |

The PWA step is worth doing because it removes the browser chrome from an installed Phase window, and because it teaches the title-bar layout. It does not satisfy the desktop aim. The shell that can is the Tauri window, loading this same `/phase/`, with no capture running at launch.

Distribution of that binary: signed, the package only opens `a-to-mind.com/phase/`, updates signed, and the installer says in one sentence that nothing is captured until you ask and that a sent page goes only to Workers AI or Groq. No silent capture, no second network stack.

None of that code is in the tree yet. No credit row is due until a pull request actually reuses it.

## Next builds

Each one is a single pull request, under about 400 lines, and each one should be obvious on the page or the window. Decoration does not count.

1. **Feather the `/phase/` dock into the shared picture, and tuck it.** After the visitor shares or opens a file, sample the bottom strip of that frame (the share is the action) and tint the dock with it, halo instead of a border. When idle, the dock becomes one ask line; Escape or a page-local key brings the controls back. The page under the line stays clickable. Stop the compositor while nothing is moving and while the tab is hidden. Gate the glass fade on reduced motion. This is the web stand-in for click-through and a summon key.
2. **Notes pick a real gap.** The underline stays. The note moves to a spot that does not cover the line above or the words beside the match, including on a phone. Still no animation.
3. **Numbers that belong to the line.** Drop the broken labels and the bare day-of-month. Each kept figure's note is that figure, on that figure, not a loose list.
4. **PWA window-controls-overlay.** An installed Phase window draws its own top edge and keeps the ask. The pull request says plainly what a browser still cannot do: always on top, a global hotkey, click-through of other apps.
5. **Tauri shell, window only.** A transparent always-on-top window that loads `/phase/`. Click-through while the ask is idle. No capture on launch. Credit Tauri on `/credits/` in this pull request (name, license, link). No new feature on the homepage.
6. **Tauri shell, summon.** A global hotkey shows the ask and does not capture. Capture stays a separate press. The same privacy line as the site.
7. **Plain sentences.** "Highlight the words I type" and "list the numbers" do what the command dialect does now, still entirely in the page, still no read until the sentence is entered. The dialect keeps working.
8. **A phone path that is not a bookmarklet.** The empty `/phase/` state says, in one sentence, that a phone shares the screen or opens a file, because a bookmark cannot be dragged there. The dock becomes a scroll region so a keyboard cannot trap the controls.
9. **Signed Windows package.** The installer, the signature, and the one-sentence privacy line. The binary still only opens Phase. No auto-capture.

This change ships the overlay row of the score: notes in the page's own ink, on the words, a second find that still lands, an ask line in the page's colours, and no read until you ask.
