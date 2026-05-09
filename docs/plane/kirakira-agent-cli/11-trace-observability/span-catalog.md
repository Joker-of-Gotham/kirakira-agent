# Span catalog

Standard span names are typed as **`SpanName`** in `packages/core/src/types/trace.ts` and duplicated in **`SPAN_NAMES`** (`packages/core/src/constants.ts`) for tooling.

## Names (10)

1. `session.start`
2. `prompt.submit`
3. `attachment.resolve`
4. `skill.select`
5. `mcp.connect`
6. `mcp.invoke`
7. `shell.exec`
8. `approval.wait`
9. `approval.decision`
10. `output.emit`

## Usage

`packages/cli/src/trace/spans.ts` currently wraps convenience functions for `session.start` and `prompt.submit`; other spans should be emitted around their respective subsystems (MCP client, shell exec, renderer).

## Attributes

`withSpan` sets `kirakira.span.name` to the span’s logical name—keep additional attributes small and PII-free unless redaction pipeline is engaged.

## Trace IDs

`generateTraceId` / `generateSpanId` live in `packages/core/src/utils/id.ts`, aligning with exec output (`commands/exec.ts`).
