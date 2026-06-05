# Interaction-Audit Adjudication Log

Every audit-test failure gets a verdict here BEFORE any fix. Verdicts:
- **CODE-BUG** — the test encodes desired behavior; the code changes, the test stands.
- **TEST-BUG** — the test misencodes desired behavior; the test changes, with a spec citation.
- **SPEC-GAP** — genuinely ambiguous; escalated to the user before fixing.

Authoritative references: docs/superpowers/specs/*.md, design-system/HANDOFF_finish-ui-answers.md,
engine semantics (engine/), CLAUDE.md.

| Case | Cluster | Test | Observed | Expected | Verdict | Rationale | Fix |
|---|---|---|---|---|---|---|---|
| INFRA-1 | infra | e2e smoke | vite ignored KSS_DAEMON_URL | env-param proxy | CODE-BUG | stale tsc-emitted vite.config.js shadows vite.config.ts in Vite's config lookup; emitted on every `npm run build` since the react-ui round | tsconfig.node.json emitDeclarationOnly; artifacts deleted |
