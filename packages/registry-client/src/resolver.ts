/**
 * Source type resolver — determines where a package comes from
 * based on the input specifier string.
 *
 * Formats:
 *   registry://name@version  — enterprise registry
 *   npm:name@version         — npm registry
 *   github:owner/repo        — git clone
 *   local:/path/to/dir       — local filesystem
 *   oci://host/repo:tag      — OCI artifact
 *   url:https://…/bundle.zip — HTTP/HTTPS archive download
 *   https://…/bundle.zip     — auto-detected URL source
 *   name@version             — falls back to default source
 */

import type { ResolvedSource, SourceType } from "./types.js";

const SOURCE_PATTERNS: Array<{
  prefix: string;
  type: SourceType;
  stripPrefix: boolean;
}> = [
  { prefix: "registry://", type: "registry", stripPrefix: true },
  { prefix: "npm:", type: "npm", stripPrefix: true },
  { prefix: "github:", type: "github", stripPrefix: true },
  { prefix: "local:", type: "local", stripPrefix: true },
  { prefix: "oci://", type: "oci", stripPrefix: true },
  { prefix: "url:", type: "url", stripPrefix: true },
];

export function resolveSource(
  specifier: string,
  defaultType: SourceType = "registry",
): ResolvedSource {
  const trimmed = specifier.trim();

  for (const { prefix, type, stripPrefix } of SOURCE_PATTERNS) {
    if (trimmed.startsWith(prefix)) {
      const rest = stripPrefix ? trimmed.slice(prefix.length) : trimmed;
      const { uri, ref } = parseRef(rest);
      return { type, uri, ref };
    }
  }

  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return { type: "local", uri: trimmed };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return { type: "url", uri: trimmed };
  }

  const { uri, ref } = parseRef(trimmed);
  return { type: defaultType, uri, ref };
}

function parseRef(input: string): { uri: string; ref?: string } {
  const atIdx = input.lastIndexOf("@");
  if (atIdx > 0) {
    return { uri: input.slice(0, atIdx), ref: input.slice(atIdx + 1) };
  }
  return { uri: input };
}
