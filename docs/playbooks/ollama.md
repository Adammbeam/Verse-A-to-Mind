# Local Ollama model for a team agent

Optional. The default cloud path keeps working when Ollama is off.

## What this is

[Ollama](https://github.com/ollama/ollama) (MIT) runs models locally. A team agent can point at a local Ollama server instead of a paid/cloud model key, for free local runs. Production a-to-mind.com does not depend on Ollama and must run unchanged when Ollama is absent.

## Set up

1. Install Ollama from https://ollama.com and start it.
2. Pull a model:

```bash
ollama pull llama3.2
```

3. Confirm the server is up (default `http://localhost:11434`):

```bash
curl http://localhost:11434/api/tags
```

## Point OpenCode at Ollama

OpenCode can use an Ollama provider. Configure it in your OpenCode config (see https://opencode.ai/docs/providers/#ollama). Example provider entry:

```json
{
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (local)",
      "options": { "baseURL": "http://localhost:11434/v1" },
      "models": { "llama3.2": { "name": "Llama 3.2 local" } }
    }
  }
}
```

Then run OpenCode with that model selected. No cloud API key is required for the local model.

## Team/crew use

- A crew agent running locally can use Ollama for free model calls while keeping the same jobs and repo workflow.
- Do not hardcode `localhost` into production code or Cloudflare Workers. Workers cannot reach a local Ollama server.
- If Ollama is not running, use the normal cloud/default path; do not fail the production path.

## Credit

Ollama is MIT licensed. Keep the MIT copyright and permission notice when redistributing Ollama code. Credit: ollama/ollama.
