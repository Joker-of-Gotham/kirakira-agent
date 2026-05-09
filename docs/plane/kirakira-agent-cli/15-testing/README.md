# Testing strategy

The monorepo root `package.json` defines:

- `pnpm test` → `turbo run test`
- `pnpm test:unit` → `vitest run --project unit`
- `pnpm test:integration` → `vitest run --project integration`
- `pnpm lint` / `pnpm typecheck`

`turbo.json` ensures `test` depends on `build` so `dist/` outputs exist.

## Package-level scripts

Example `packages/cli/package.json`: `lint` targets `eslint src/`; `typecheck` runs `tsc --noEmit`.

## Gaps

No `*.test.ts` files were present under `packages/` at documentation time—add Vitest suites alongside parsers (`parser/*.ts`), approval evaluator, and registry client.

## Related docs

- [Test pyramid](./test-strategy.md)
- [Fixtures](./fixtures.md)
- [CI matrix](./ci-matrix.md)
