# Command reference

Commands are implemented as oclif `Command` subclasses under
`packages/cli/src/commands/`. Below is a concise map; run
`kirakira-agent <topic> --help` for the exact flags in your build.

## Workspace and health

| Command | Source | Purpose |
|---------|--------|---------|
| `init` | `commands/init.ts` | Scaffold workspace agent config |
| `doctor` | `commands/doctor.ts` | Environment / dependency health |
| `runtime doctor` | `commands/runtime/doctor.ts` | Runtime profile readiness via the shared repo doctor |
| `self-update` | `commands/self-update.ts` | Update CLI binary |

## Auth

| Command | Source |
|---------|--------|
| `login` | `commands/login.ts` |
| `logout` | `commands/logout.ts` |

## Non-interactive execution

| Command | Source | Notable flags |
|---------|--------|----------------|
| `exec` | `commands/exec.ts` | `-p` / positional prompt, `-m` model, `--json`, `--jsonl`, `-c` config path, `--timeout` seconds |

## Config

| Command | Source |
|---------|--------|
| `config get` | `commands/config/get.ts` |
| `config set` | `commands/config/set.ts` |

Resolution merges defaults and files via `packages/cli/src/config/loader.ts`.

## Session

| Command | Source |
|---------|--------|
| `session list` | `commands/session/list.ts` |
| `session resume` | `commands/session/resume.ts` |
| `session export` | `commands/session/export.ts` |
| `session prune` | `commands/session/prune.ts` |

Persistence format: JSONL via `packages/cli/src/session/store.ts`.

## Skills

| Command | Source |
|---------|--------|
| `skill list` | `commands/skill/list.ts` |
| `skill search` | `commands/skill/search.ts` |
| `skill install` | `commands/skill/install.ts` |
| `skill import` | `commands/skill/import.ts` |
| `skill export` | `commands/skill/export.ts` |
| `skill validate` | `commands/skill/validate.ts` |
| `skill link` | `commands/skill/link.ts` |

## MCP

| Command | Source |
|---------|--------|
| `mcp list` | `commands/mcp/list.ts` |
| `mcp add` | `commands/mcp/add.ts` |
| `mcp link` | `commands/mcp/link.ts` |
| `mcp login` | `commands/mcp/login.ts` |
| `mcp test` | `commands/mcp/test.ts` |
| `mcp import` | `commands/mcp/import.ts` |
| `mcp search` | `commands/mcp/search.ts` |

## Plugin

| Command | Source |
|---------|--------|
| `plugin list` | `commands/plugin/list.ts` |
| `plugin install` | `commands/plugin/install.ts` |
| `plugin enable` | `commands/plugin/enable.ts` |
| `plugin disable` | `commands/plugin/disable.ts` |
| `plugin update` | `commands/plugin/update.ts` |

Loader/registry: `packages/cli/src/plugin/loader.ts`, `registry.ts`,
`sandbox.ts`, `types.ts`.

## Registry (remote)

| Command | Source |
|---------|--------|
| `registry login` | `commands/registry/login.ts` |
| `registry whoami` | `commands/registry/whoami.ts` |
| `registry search` | `commands/registry/search.ts` |
| `registry publish` | `commands/registry/publish.ts` |
| `registry yank` | `commands/registry/yank.ts` |

HTTP client: `packages/cli/src/registry/client.ts`.

## Trace and eval

| Command | Source |
|---------|--------|
| `trace show` | `commands/trace/show.ts` |
| `trace tail` | `commands/trace/tail.ts` |
| `trace export` | `commands/trace/export.ts` |
| `eval run` | `commands/eval/run.ts` |
| `eval list` | `commands/eval/list.ts` |
| `eval report` | `commands/eval/report.ts` |

## Shell completion

| Command | Source |
|---------|--------|
| `completion` | `commands/completion.ts` - arg `bash` \| `zsh` \| `fish` \| `powershell` |

## Examples

```bash
kirakira-agent exec -p "Summarize README.md" --json
kirakira-agent runtime doctor workbench-host --json --no-probe
kirakira-agent skill list
kirakira-agent mcp test <server>
kirakira-agent completion zsh > ~/.zsh/completions/_kirakira-agent
```
