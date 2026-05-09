# Merge Semantics

## Rules

| Rule | Behavior |
|------|----------|
| **Scalar override** | Later layer value replaces earlier |
| **Object merge** | Deep recursive merge at leaf level |
| **Array replace** | Later array fully replaces earlier (no append) |
| **Null clear** | Explicit `null` removes the key from parent |
| **Undefined skip** | Missing/undefined keys have no effect |
| **Immutability** | Base object is never mutated (deep clone) |

## Examples

```typescript
// Scalar override
deepMerge({ model: { default: "gpt-4o" } }, { model: { default: "claude" } })
// → { model: { default: "claude" } }

// Array replace
deepMerge({ tags: ["a", "b"] }, { tags: ["c"] })
// → { tags: ["c"] }

// Null clear
deepMerge({ model: { fallback: "backup" } }, { model: { fallback: null } })
// → { model: {} }  // fallback removed
```
