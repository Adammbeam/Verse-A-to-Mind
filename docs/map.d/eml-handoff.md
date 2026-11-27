# Direct mail handoff (.eml & mailto)

- `eml-handoff` (`void-live-deploy/skills/eml-handoff.js`, test `tools/eml-handoff.test.mjs`): bypasses the disabled `env.EMAIL` / `EMAIL_LIVE` dry-run gate (`BASE.md`) by building an RFC 5322 `.eml` download and `mailto:` link in the browser, reusing `lib/proposal.js` and `skills/providers.js`.
