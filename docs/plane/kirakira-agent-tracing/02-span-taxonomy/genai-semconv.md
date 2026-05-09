# GenAI semantic conventions alignment

Spans covering LLM/tool orchestration SHOULD align with evolving **OpenTelemetry GenAI Semantic Conventions** (stable conventions for `gen_ai.*` namespaces—verify against pinned spec revision in consuming SDK).

Parent taxonomy: [`README.md`](./README.md).

---

## Core attribute mapping

| GenAI canonical attribute | Kirakira usage | Example values |
| ------------------------- | --------- | --------------- |
| `gen_ai.operation.name` | Classification of semantic operation | `chat`, `invoke_agent`, `embeddings` |
| `gen_ai.system` | Vendor logical system | `openai`, `anthropic`, `gcp.vertex`, `cursor` |
| `gen_ai.request.model` | Model id string | `claude-3-7-sonnet` |
| `gen_ai.usage.input_tokens` | After completion event | bigint |
| `gen_ai.usage.output_tokens` | idem | bigint |

Instrumentation MUST avoid duplicating **`kirakira.model.*`** verbatim—prefer referencing GenAI equivalents when stabilized in SDK version locked by monorepo.

---

## Instrumentation layering

Recommended pattern:

```
StartSpan("gen_ai.chat") // framework hook
 ├ Attributes from gateway response headers (rate limit ids not sensitive)
└ Child tool spans `gen_ai.invoke_tool.*` bridging MCP when upstream spec lands
```

If SDK lacks stable tool invoke fields, prepend experimental `otel.scope` attribute prefixing `instrumentation-scope` disclaimers (`alpha`).

---

## Cardinality safeguards

Truncate dynamic tool parameter listings—retain BLAKE3 digests referencing offline expansion.

---

## Version pinning process

Maintain `third_party_refs/gen_ai_semconv.version` (**path TBD**) recorded in changelog when bumping OTLP exporters.

---

## Cross-links

Custom extensions not yet standardized: [`./kirakira-custom-attributes.md`](./kirakira-custom-attributes.md)
