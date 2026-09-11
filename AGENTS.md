# AGENTS.md

Personal [Pi](https://pi.dev) coding-agent configuration. This repo is the
source of truth for this machine's custom Pi subagents and extensions; they are
symlinked into `~/.pi/agent/` so Pi loads them globally.

## Commands

- `bun install` — install dependencies (runtime typings for extensions)
- `bun run check` — type-check all TypeScript (`tsc --noEmit`, must pass)
- `bun run check:transpile` — transpile-only sanity check of every extension
- No test suite. Runtime verification happens in a live Pi session after
  `/reload`.

## Layout & conventions

- `.pi/extensions/*.ts` — Pi extensions. Each file exports a default
  `(pi: ExtensionAPI) => void`.
- `.pi/agents/**/*.md` — custom subagents (YAML frontmatter + instructions).
- Everything is user-global via symlinks created in the README:
  - `~/.pi/agent/extensions -> <repo>/.pi/extensions`
  - `~/.pi/agent/agents -> <repo>/.pi/agents`
- Never commit runtime state: `node_modules/` and `*.log` are gitignored.
- Commit signing is disabled locally (`commit.gpgsign false`) — keep it that way.

## Extensions

- `model-prices.ts` — `/prices` command + `model_prices` tool. Reads the local
  catalog cache `~/.pi/agent/models-store.json` only — never makes network
  calls. Import only the pi SDK (`@earendil-works/pi-*`, `typebox`) and Node
  built-ins (`node:fs`, `node:path`, `node:os`).

## Subagents

Frontmatter fields: `name`, `description`, `tools`, `model`, `thinking`,
`systemPromptMode`, `inheritProjectContext`, etc. For a new agent, copy
`scout.md` from the pi-subagents package as a starting shape:
`~/.pi/agent/npm/node_modules/pi-subagents/agents/scout.md`.

## Quality gates

- After editing an extension: run `bun run check` — it must pass.
- After adding an agent: reload Pi (`/reload`), then verify it's discovered:
  `subagent({ action: "list" })`.
- Keep the human-facing README in sync whenever an extension or agent is added.

## Constraints

- Runtime data lives outside this repo (`~/.pi/agent/models-store.json`,
  `auth.json`, `sessions/`). This repo contains configuration only.
