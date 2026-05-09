import type { MemoryRecord } from "@kirakira/memory-core";

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /\b(?:\+?\d{1,2}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;

export class RedactionEngine {
  redactPlainText(s: string): string {
    return s.replace(EMAIL, "[REDACTED]").replace(PHONE, "[REDACTED]").replace(SSN, "[REDACTED]");
  }

  redactRecord(record: MemoryRecord): MemoryRecord {
    const redact = (s: string | undefined): string | undefined => {
      if (!s) return s;
      return this.redactPlainText(s);
    };

    return {
      ...record,
      text: redact(record.text),
      summaryL0: redact(record.summaryL0),
      overviewL1: redact(record.overviewL1),
      redacted: true,
    };
  }
}
