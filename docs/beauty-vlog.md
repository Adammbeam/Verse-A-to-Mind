# The daily glow-up

The beauty routine leaves one folder a day. This tool films it as a dead-serious glow-up vlog, about 30 to 45 seconds, vertical. Near the end the signature move looks up: just more stars. That beat is a tease. The wipe after it opens a side-by-side, and the day's fix is framed on the after half. A prettier sky is not the progress.

## Folder

`/workspace/team/beauty-vlog/<date>/`

- `before/` — screenshots from before the change. The first sorted name is the left half of the reveal.
- `after/` — screenshots from after the change is on the page. The first sorted name is the right half.
- `script.md` — the words below.

The routine shoots before, makes the real change, shoots after, and writes `highlight` as that change.

## script.md

```
# hook
Okay. Glow-up. Do not blink.

# before
Before. A dark sky, a button, and no scores on the page.

# change
Verse put the live scores card on the page, so the standings are what you see.

# stars
Signature move. Just more stars in the sky.

# after
Stars were the tease. The real change is the live scores card.

# highlight
live scores card

# box
0.10 0.36 0.80 0.22
```

`highlight` is the fix, in words that also appear in the after line. `box` is optional: x, y, width, height as fractions of the after shot, for a gold frame on that detail. A missing stars section is still spoken: "Signature move. Just more stars in the sky." A change line, after line, or highlight that is only about stars is refused, and so is a stars line that calls the highlight the change.

## Render

`node tools/beauty-vlog.mjs render /workspace/team/beauty-vlog/<date> --out glow.mp4`

1080×1920. Slow push-ins on the before shots, a fade into the star field, a wipe into BEFORE / AFTER. Captions sit in the safe zone on a backing box, one group at a time. The voice is Piper when `PIPER_VOICE` is a model file, otherwise espeak-ng, otherwise the site's Workers AI voice, lowered and given a short echo, then set in Verse's room by `tools/show-pipe.mjs`. A quiet pad sits under it. `--no-voice` keeps the pad. The mp4 stays on the path you passed. The tool does not upload it or post it.
