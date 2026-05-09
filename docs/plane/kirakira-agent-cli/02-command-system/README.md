# Command system

The CLI is built on **oclif** with a **pattern-based** command loader: `packages/cli/package.json` points `"oclif.commands"` at `./dist/commands`, so each file under `packages/cli/src/commands/` becomes a subcommand tree after build.

## Fourteen top-level topics

Completion generation lists the same canonical set (`packages/cli/src/commands/completion.ts`):

1. **init** — `commands/init.ts`
2. **exec** — `commands/exec.ts` (non-interactive run)
3. **login** / **logout** — `commands/login.ts`, `commands/logout.ts`
4. **config** — `commands/config/` (`get`, `set`, index)
5. **session** — `commands/session/` (`list`, `resume`, `export`, `prune`)
6. **skill** — `commands/skill/` (`list`, `search`, `install`, `import`, `export`, `validate`, `link`)
7. **mcp** — `commands/mcp/` (`list`, `add`, `link`, `login`, `test`, `import`, `search`)
8. **plugin** — `commands/plugin/` (`list`, `install`, `enable`, `disable`, `update`)
9. **registry** — `commands/registry/` (`login`, `whoami`, `search`, `publish`, `yank`)
10. **trace** — `commands/trace/` (`show`, `tail`, `export`)
11. **eval** — `commands/eval/` (`run`, `list`, `report`)
12. **doctor** — `commands/doctor.ts`
13. **completion** — `commands/completion.ts`
14. **self-update** — `commands/self-update.ts`

Shared oclif patterns (flags, args) live alongside **`packages/cli/src/base-command.ts`** when commands need common behavior.

## Related docs

- [Command reference](./command-reference.md)
- [Exec mode](./exec-mode.md)
- [Shell completion](./shell-completion.md)
