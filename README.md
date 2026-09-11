# pi-config

Personal [Pi](https://pi.dev) configuration, kept in git.

## Layout

```
.pi/
├── agents/        # custom subagent definitions (see below)
└── extensions/    # custom pi extensions
```

## Making this repo's config load globally

Pi discovers user-scoped agents and extensions under `~/.pi/agent/`. Symlink
those directories here so this repo stays the source of truth:

```bash
ln -s ~/Projects/my-pi-config/.pi/extensions ~/.pi/agent/extensions
ln -s ~/Projects/my-pi-config/.pi/agents       ~/.pi/agent/agents
```

Detach with `unlink ~/.pi/agent/extensions ~/.pi/agent/agents`.

After linking, run `/reload` in a Pi session (or restart Pi). Extensions from
`~/.pi/agent/extensions/*.ts` load globally; agents from
`~/.pi/agent/agents/**/*.md` are user-scope subagents.

## Custom agents

Agent files are Markdown with YAML frontmatter. Discovery paths:

| Scope   | Path                          |
|---------|-------------------------------|
| Project | `.pi/agents/**/*.md` (in-repo) |
| User    | `~/.pi/agent/agents/**/*.md`   |

Example (`my-agent.md`):

```markdown
---
name: my-agent
description: What this agent does
tools: read, grep, find, bash
model: fireworks/accounts/fireworks/routers/deepseek-flash-latest
---

Instructions for the agent...
```

See the built-in agents for reference:
`~/.pi/agent/npm/node_modules/pi-subagents/agents/*.md`.

## Extensions

- `model-prices.ts` — `/prices` command and `model_prices` tool listing model
  prices (input / cache-read / output, context window, last-sync date) from the
  local `~/.pi/agent/models-store.json`, cheapest first.
