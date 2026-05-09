---
name: timeline-extraction
description: Extract financial event timelines from filings, news, and notes.
version: "1.0.0"
compatibility: "Requires Python 3.11+"
owner: fin-kg
activation:
  - "when the task involves temporal ordering"
  - "event normalization"
metadata:
  risk_level: medium
---

# Goal

Build a normalized event timeline for the target company.

# Steps

1. Read provided filings and notes.
2. Extract event candidates with date spans.
3. Normalize dates to ISO-8601.
4. Emit JSON with event_id, time, entity, type, evidence.

See [schema](references/schema.md).
