import { sha256Hex } from "@kirakira/core";

import type {
  ResearchEvidence,
  ResearchSourceAdapter,
  ResearchSourceRequest,
} from "./types.js";

export type WebSourceLocator =
  | string
  | URL
  | ((request: ResearchSourceRequest) =>
      | readonly (string | URL)[]
      | Promise<readonly (string | URL)[]>);

export interface WebSourceAdapterOptions {
  sources: readonly WebSourceLocator[];
  fetch?: typeof fetch;
  allowedProtocols?: readonly string[];
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxEvidence?: number;
  retrievedAt?: string | (() => string);
}

const DEFAULT_ALLOWED_PROTOCOLS = ["https:"] as const;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 128 * 1024;
const DEFAULT_MAX_EVIDENCE = 6;

interface WebDocument {
  url: string;
  status: number;
  contentType: string;
  title?: string;
  text: string;
}

interface WebMatch {
  document: WebDocument;
  score: number;
  matchedTokens: string[];
  snippets: string[];
}

export function webProviderFromSources(
  options: WebSourceAdapterOptions,
): ResearchSourceAdapter {
  const fetchImpl = options.fetch ?? fetch;
  return {
    kind: "web",
    async search(request) {
      const urls = await resolveWebSourceUrls(request, options);
      const matches: WebMatch[] = [];
      for (const url of urls) {
        const document = await fetchTextDocument(url, fetchImpl, options);
        const match = matchWebDocument(document, request);
        if (match) matches.push(match);
      }
      return matches
        .sort((left, right) =>
          right.score === left.score
            ? left.document.url.localeCompare(right.document.url)
            : right.score - left.score,
        )
        .slice(0, evidenceLimit(request, options))
        .map((match) => webEvidence(match, request, options));
    },
  };
}

async function resolveWebSourceUrls(
  request: ResearchSourceRequest,
  options: WebSourceAdapterOptions,
): Promise<string[]> {
  const allowedProtocols = new Set(
    options.allowedProtocols ?? DEFAULT_ALLOWED_PROTOCOLS,
  );
  const urls: string[] = [];
  for (const source of options.sources) {
    const values =
      typeof source === "function"
        ? await source(request)
        : [source];
    for (const value of values) {
      const url = new URL(value.toString());
      if (!allowedProtocols.has(url.protocol)) {
        throw new Error(`deep_research web source protocol is not allowed: ${url.protocol}`);
      }
      urls.push(url.toString());
    }
  }
  return [...new Set(urls)];
}

async function fetchTextDocument(
  url: string,
  fetchImpl: typeof fetch,
  options: WebSourceAdapterOptions,
): Promise<WebDocument> {
  const response = await fetchImpl(url, {
    headers: options.headers,
    signal: AbortSignal.timeout(positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS)),
  });
  if (!response.ok) {
    throw new Error(`deep_research web source fetch failed: ${response.status} ${url}`);
  }
  const contentType = response.headers.get("content-type") ?? "text/plain";
  if (!isTextContentType(contentType)) {
    throw new Error(`deep_research web source is not text-like: ${contentType}`);
  }
  const raw = (await response.text()).slice(
    0,
    positiveInteger(options.maxBytes, DEFAULT_MAX_BYTES),
  );
  return {
    url,
    status: response.status,
    contentType,
    title: htmlTitle(raw),
    text: normalizeDocumentText(raw, contentType),
  };
}

function matchWebDocument(
  document: WebDocument,
  request: ResearchSourceRequest,
): WebMatch | undefined {
  const tokens = tokenize(request.query);
  const haystack = `${document.url}\n${document.title ?? ""}\n${document.text}`.toLowerCase();
  const matchedTokens = tokens.filter((token) => haystack.includes(token));
  if (matchedTokens.length === 0) return undefined;
  const snippets = document.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      matchedTokens.some((token) => line.toLowerCase().includes(token)),
    )
    .slice(0, 4)
    .map((line) => line.slice(0, 320));
  return {
    document,
    matchedTokens,
    snippets,
    score: matchedTokens.length * 10 + snippets.length + (document.title ? 2 : 0),
  };
}

function webEvidence(
  match: WebMatch,
  request: ResearchSourceRequest,
  options: WebSourceAdapterOptions,
): ResearchEvidence {
  const evidenceId = `web-evidence:${sha256Hex(`${match.document.url}:${request.query}`).slice(0, 16)}`;
  const citationId = `web:${sha256Hex(match.document.url).slice(0, 16)}`;
  return {
    id: evidenceId,
    sourceKind: "web",
    query: request.query,
    title: match.document.title ?? match.document.url,
    summary: `Matched ${match.matchedTokens.length} query token(s) in ${match.document.url}.`,
    content: match.snippets.join("\n"),
    confidence: Math.min(0.99, match.score / 100),
    citations: [
      {
        id: citationId,
        sourceKind: "web",
        title: match.document.title,
        uri: match.document.url,
        retrievedAt: retrievedAt(options),
        sourceRecordId: match.document.url,
        evidenceIds: [evidenceId],
        score: match.score,
        metadata: {
          status: match.document.status,
          contentType: match.document.contentType,
          matchedTokens: match.matchedTokens,
        },
      },
    ],
    metadata: {
      url: match.document.url,
      status: match.document.status,
      contentType: match.document.contentType,
      matchedTokens: match.matchedTokens,
    },
  };
}

function isTextContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return normalized.startsWith("text/") ||
    normalized.includes("json") ||
    normalized.includes("xml");
}

function normalizeDocumentText(raw: string, contentType: string): string {
  if (!contentType.toLowerCase().includes("html")) {
    return raw.replace(/\s+\n/g, "\n").trim();
  }
  return raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function htmlTitle(raw: string): string | undefined {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(raw);
  return match?.[1]?.replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  const tokens = value
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
  return [...new Set(tokens)];
}

function evidenceLimit(
  request: ResearchSourceRequest,
  options: WebSourceAdapterOptions,
): number {
  return Math.max(
    1,
    Math.min(
      request.limits.maxBreadth,
      positiveInteger(options.maxEvidence, DEFAULT_MAX_EVIDENCE),
    ),
  );
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(1, Math.floor(value));
}

function retrievedAt(options: WebSourceAdapterOptions): string {
  if (typeof options.retrievedAt === "function") return options.retrievedAt();
  return options.retrievedAt ?? new Date().toISOString();
}
