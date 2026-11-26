# Playbook: an unseen-question area fell short (held-out exam)

**Starts when:** a job says `build: Verse answers in "<area>" fell short on unseen questions` (from `jobsOf` in `tools/heldout-exam.mjs`), or a `heal:heldout-exam` job is handed over. The pool is `void-live-deploy/tower.heldout.json` (owner-only: read it, never edit it or the questions in it). Three times a day a fresh 20-question sample is put to the live agent; marks are pattern checks from `tools/assistant-exam.mjs`, not tuned examples.

## The run

1. **Read the area's gaps, not its questions.** `node -e "const j=require('./void-live-deploy/tower.heldout.json'); (j.last.rows||[]).filter(r=>r.area==='<area>').forEach(r=>console.log(r.id,r.right,r.useful,r.clear,r.gaps))"`. The gap labels (`the shape asked for (summary)`, `ends cut off`, `coffee wording`) say what the answers generally lacked. Read `formOk`, `correctness` and `clarity` in `tools/assistant-exam.mjs` to see what each label means.
2. **Find the page's lever.** The exam POSTs each ask to `/api/agent`; `void-live-deploy/functions/api/agent.js` (`replyFrom`) builds `messages` from `answerBrief(bot, ask)` in `void-live-deploy/lib/agent-answer.js` and asks the free models. A short answer brief is the lever for how a whole kind of ask is answered.
3. **Fix the kind, never the question.** Write a small pure predicate (as `isWritingAsk` does) that catches the kind of ask by what is asked for, then append one short rule for that kind. Keep the general brief under 360 words (`tools/agent-brief.test.mjs` checks it). Pass the ask into `answerBrief` at the call site. Add a unit test that asserts no words from any one question enter the rule.
4. **Test what you changed and nothing more.** `node --test tools/agent-brief.test.mjs tools/agent-answer.test.mjs`; `VOID_GATE=1 VOID_SKIP_BENCH=1 VOID_ALLOW_CHANGED=1 node tools/checks.mjs --changed --skip-browser`. Put one ask to the live page as a stranger with `node -e "import('./tools/assistant-exam.mjs').then(m=>m.askLive('https://a-to-mind.com','<a fresh ask of that kind>').then(console.log))"` and read the answer: it must now show the missing shape or detail. Do not run the whole 20-minute browser suite locally.
5. **Ship.** Add one line to `docs/map.d/tower-assistant.md`, open a PR from the newest main labelled `automerge`, and close the job with its link.

## How to tell it worked

The next held-out run's marks for that area rise above the bar and the gap labels stop appearing. A stranger's fresh ask of that kind answers in the shape asked for, keeps the subject's own words, and ends whole.

## Mistakes made

- Putting a sampled question's own words into the brief: that tunes to a question the pool will not ask again. The job exists precisely so Verse improves in general.
- Editing the pool, the reference answers or the pattern checks to make a number go up, or disabling the scheduled exam. The pool is held out.
- Reading the whole repo and re-probing old asks. Only this area's gaps and the answer path need reading.
- A brief that grows until the model ignores it: keep the base short and add a rule only for the kind of ask that needs it.
