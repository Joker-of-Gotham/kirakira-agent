import type { PiiLevel } from "@kirakira/memory-core";

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /\b(?:\+?\d{1,2}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const NAME_LIKE = /\b(?:Mr|Ms|Mrs|Dr)\.?\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/;

export class PiiClassifier {
  classify(text: string): PiiLevel {
    const t = text.trim();
    if (t.length === 0) return "none";
    let score = 0;
    if (EMAIL.test(t)) score += 2;
    if (SSN.test(t)) score += 3;
    if (PHONE.test(t)) score += 2;
    if (NAME_LIKE.test(t)) score += 1;
    if (score >= 3) return "high";
    if (score >= 1) return "low";
    return "none";
  }
}
