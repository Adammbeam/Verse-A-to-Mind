# Lab-to-Verse System Design
Turn every `/lab/` experiment into a voice/ask command that runs everywhere.

## Goal
Every skill or action that exists in `/lab/` is reachable by name from any Verse surface (Ask, search, stage, void-loop tasks). No experimentation without context.
- Asks like *"run this lab experiment"* land on the right experiment
- Lab experiments automatically surface as available skills
- Void-loop tasks can call lab experiments as dependencies
- All ingest/feedback loops drive improvement

## Core Mechanism

### 1. Lab Catalog → Skill Mapping
Central mapping in `/void-live-deploy/lab/catalog.json`:
```json
{
  "id": "f860",
  "name": "Attention Sequence Domain Morph Mind",
  "type": "skill", // or "extract", "test"
  "tags": ["attention", "sequence", "mnemonic"],
  "recipe": {
    "type": "canvaskit-3d",
    "config": {
      "base": "lab/f860/...app.js"
    }
  },
  "skillCommands": [
    "imagine a sequence",
    "visualize sequential attention",
    "remember by order"
  ]
}
```

- **Skill commands** are mapped to Ask router patterns (regex)
- Commands are auto-generated from experiment name + tags via `tools/lab-use-it.mjs`
- Execution: **Client→Ask→Router→catalog→recipe→Canvaskit/Three.js/wasm**

### 2. Ask Routing: "Run this lab"
- **Trigger:** "run f860", "run impression-driven mnemonic", "dot mind attention"
- **Router lookup:** `recommendAskRoute("run f860")` → finds catalog entry
- **Client side:** Calls recipe, spawns Canvaskit render canvas on stage
- **Translation:** From natural ask → internal UUID → `open /lab/<id>` OR direct render

### 3. Void-Loop Integration
- Lab experiments can be **task dependencies**: `/void-loop` command → `lab/f860` → return rendered result as card on stage
- Tasks register `labDependencies: ["f860", "f872"]` in `void-live-deploy/taskPlan.json`
- Execution: Task runner spawns lab, awaits result, places physics card, consumes video/audio output

### 4. Cross-Stage Consistency
- **Stage:** Lab experiment renders as physics card when asked
- **Search:** Search index includes lab experiments in skill/tip results
- **Linkability:** Lab cards link to `/lab/<id>` for full version
- **Staging:** Export feature on lab card → `{ src: "lab/f860", type: "canvas" }` stored to cloud, referenced from Verse

## Operational Loop

### 1. Create Lab, Register It
```bash
# Create lab files
mkdir void-live-deploy/lab/f860-attention-sequence-mind
# Register in catalog.js
{
  "id": "f860",
  "name": "Attention Sequence Domain Morph Mind",
  "skillCommands": ["imagine a sequence", "visualize sequential attention"]
}
```

### 2. Ask Patch (auto)
- `tools/lab-catalog-check.mjs` scans `/lab/` dirs
- Generates `catalog.json` entries
- Generates `void-live-deploy/skills/` stubs called `{id}-{type}.js`
- Each stub registers ask patterns: `{ name.lower() } = function() { openLab('${id}'); }`

### 3. Natural-Language Commands
- **Regex routing:** `"runettermind"` → opens everettermind lab
- **Tag-based routing:**
  - `runarchitecture` → routes to f872... (architecture labs)
  - `runattention` → routes to f860, f877, f878...
- **Implicit routing:**
  - `"remember by visual order"` → matches `imagine a sequence`
  - `"visualize\"" → matches `visualize*` command patterns

### 4. Public Fallback
If lab is not applicable to user location/context:
- Show "Ask managing this lab (author + repo)"
- Offer record result (brief obs) → contributor attribution
- Observe result in `findings/lab/` for tuning

## How It Gets Better

### Community @mention
Every lab has [Ask] button on its page:
- User: `@ Verse, show me "imagine a sequence"`
- Verse routes → lab catalog → directs user
- Author gets alert for improvement suggestions

### Habituated Commands
- Users can ask for pattern:
  - `"make me run architecture visualization"`
  - `"run posture lab for 30 sec"`
- Habituation trains router to predict higher-value commands
- Poor patterns get deprecated (marked hidden)

### Classification Layer
On top of catalog is a **classify** layer:
- Classify pattern → lab type (attention, memory, navigation, physics, AI)
- Use for:
  - "what kind of lab should I run for X?"
  - "show me the best attention labs"
  - group results → dashboard
- Classifier uses semantic completion: `run *mnemonic*` → all labs tagged mnemonic

## Architecture Napkin

```
[User asks] "run impression-driven mnemonic"
      ↓
[Router] tools/lab-use-it.mjs:RecommendAskRoute
      ↓
[Catalog lookup] catalog.json mgmt
      ↓
[Command lookup] "imagine a sequence" → f860
      ↓
[Client render] CanvasKit app.js → Stage card
      ↓
[Void-loop] Task dependencies (f860) called by tasks
      ↓
[Feedback] User annotation → findngs/lab/
      ↓
[Model update] Tag & command patterns refined
```

## Layer 1 (Minimum)
1. Auto-generate catalog from `/lab/` dirs
2. Gen stub skill pages for each lab (openLab('${id}') routing)
3. Verb: `clear`, `reset`, `restart` on canvas controls
4. Add `[Ask]` button on each lab page pointing to natural ask

## Layer 2
1. Tag-based routing
2. Task-dependent lab execution
3. Public membership-granted access (if lab is reserved)
4. Pipelined lab exports (simulated model output)

## Layer 3
1. Community @mentions and contributions
2. Habituated command suggestions
3. Classification dashboard
4. Long-term memory: my preferred labs, my lab scripts, my output history