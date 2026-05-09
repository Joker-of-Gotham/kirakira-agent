function globPatternToRegExp(pattern: string): RegExp {
  let out = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*") {
      out += ".*";
    } else if ("\\.^$+?()[]{}|".includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  out += "$";
  return new RegExp(out);
}

function anyMatch(command: string, patterns: string[] | undefined): boolean {
  if (!patterns?.length) return false;
  return patterns.some((p) => globPatternToRegExp(p).test(command));
}

export function isShellAllowed(
  command: string,
  allowlist: string[] | undefined,
  denylist: string[] | undefined,
): { allowed: boolean; denyHit: boolean; allowHit: boolean } {
  const denyHit = anyMatch(command, denylist);
  if (denyHit) return { allowed: false, denyHit: true, allowHit: false };

  if (!allowlist?.length) {
    return { allowed: true, denyHit: false, allowHit: false };
  }

  const allowHit = anyMatch(command, allowlist);
  return { allowed: allowHit, denyHit: false, allowHit };
}
