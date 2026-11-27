# Missions

**Starts when:** a visitor should get a short next step that uses a tool Verse already has, and the page should change for someone who has been here before.

**Where it lives.** `/missions/` only. The home stage is not part of it. Progress is `a2m.void.missions.v1`, written by `lib/missions.js`. A step they just left is remembered in session storage until they come back (`a2m.void.missions.leave.v1`). Nothing is sent.

**What a step can tick from.** The ask log and the last-used skill map (the words of the ask are not copied), a finished arcade or ladder record, the calculator's own history list (the sum is not copied), or a return from `/calculator/`, `/arcade/`, `/games/` or `/under-the-hood/`.

**How to tell it worked.** `node --test tools/missions.test.mjs`. A stored sentence from the ask log is not in the saved track. The page's links point at `index.html` files that exist. The first open says to start; the next open says welcome back.

**What it will not do.** No account, no server copy, no name, and no change to the home stage.
