import { canonicalizePath, isDenyPath } from "./path-canonicalizer.js";

export interface ShellNormalizerResult {
  commandBase: string;
  flags: string[];
  subcommands: string[];
  writePaths: string[];
  readPaths: string[];
  networkDomains: string[];
  networkProtocol?: string;
  destructive: boolean;
  interpreterHandoff: boolean;
  pipelineDepth: number;
  redirectionTargets: string[];
}

function splitPipeline(command: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let inSq = false;
  let inDq = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (!inSq && ch === '"') {
      inDq = !inDq;
      buf += ch;
      continue;
    }
    if (!inDq && ch === "'") {
      inSq = !inSq;
      buf += ch;
      continue;
    }
    if (ch === "|" && !inSq && !inDq) {
      parts.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  parts.push(buf.trim());
  return parts.filter((x) => x.length > 0);
}

function stripOuterQuotes(token: string): string {
  if (token.startsWith('"') && token.endsWith('"')) return token.slice(1, -1);
  if (token.startsWith("'") && token.endsWith("'")) return token.slice(1, -1);
  return token;
}

function tokenizeSegment(segment: string): string[] {
  const tokens: string[] = [];
  let buf = "";
  let inSq = false;
  let inDq = false;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]!;
    const next = segment[i + 1];
    if (!inSq && ch === '"') {
      inDq = !inDq;
      buf += ch;
      continue;
    }
    if (!inDq && ch === "'") {
      inSq = !inSq;
      buf += ch;
      continue;
    }
    if (!inSq && !inDq && /\s/.test(ch)) {
      const t = buf.trim();
      if (t.length > 0) tokens.push(stripOuterQuotes(t));
      buf = "";
      continue;
    }
    if (!inSq && !inDq && ch === ">") {
      const t = buf.trim();
      if (t.length > 0) tokens.push(stripOuterQuotes(t));
      tokens.push(next === ">" ? ">>" : ">");
      if (next === ">") i++;
      buf = "";
      continue;
    }
    if (!inSq && !inDq && ch === "<") {
      if (next === "<") {
        const t = buf.trim();
        if (t.length > 0) tokens.push(stripOuterQuotes(t));
        const isDash = segment[i + 2] === "-";
        tokens.push(isDash ? "<<-" : "<<");
        i += 1 + (isDash ? 1 : 0);
        buf = "";
        continue;
      }
      const t = buf.trim();
      if (t.length > 0) tokens.push(stripOuterQuotes(t));
      tokens.push("<");
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = stripOuterQuotes(buf.trim());
  if (tail.length > 0) tokens.push(tail);
  return tokens.filter((x) => x.length > 0);
}

function isUrl(token: string): boolean {
  return /^([a-zA-Z][a-zA-Z+.-]*:\/\/.+)/.test(token) || /^[a-zA-Z0-9][a-zA-Z0-9.-]*:[0-9]+/.test(token);
}

function hostnameFromUrl(urlStr: string): string | undefined {
  try {
    let u = urlStr;
    if (!/^[a-zA-Z][a-zA-Z+.-]*:\/\//u.test(u)) {
      const m =
        /^((?:[^:]+@)?[^:]+)(?=:\d+)/.exec(u) ?? /^([^.]+(?:\.[^:]+)?)$/.exec(u);
      const hostOnly = (m ?? [])[1] ?? u.replace(/^@\s*/, "").split(":")[0];
      if (hostOnly) return hostOnly;
    }
    const parsed = new URL(u);
    return parsed.hostname || undefined;
  } catch {
    return undefined;
  }
}

const DESTRUCTIVE_BASES = new Set([
  "rm",
  "rmdir",
  "unlink",
  "shred",
  "kill",
  "pkill",
  "killall",
  "chmod",
  "chown",
]);

const INTERPRETER_SHELLS = new Set([
  "bash",
  "sh",
  "zsh",
  "fish",
  "dash",
  "python",
  "python3",
  "node",
  "ruby",
  "perl",
  "php",
]);

const KNOWN_NETWORK = new Set([
  "curl",
  "wget",
  "ssh",
  "scp",
  "rsync",
  "nc",
  "ncat",
  "telnet",
  "ftp",
  "sftp",
]);

function tokenLooksLikePath(tok: string): boolean {
  if (
    tok.length === 0 ||
    tok.startsWith("-") ||
    tok === ">" ||
    tok === ">>" ||
    tok === "<" ||
    tok === "<<" ||
    tok === "<<-"
  )
    return false;
  if (isUrl(tok)) return false;
  return /^\.{0,2}\//.test(tok) || tok.endsWith(".txt") || tok.includes("/") || /\.[a-zA-Z]{1,10}$/.test(tok);
}

function detectInterpreterHandoff(
  segments: string[],
  firstToks: string[],
  commandBase: string,
): boolean {
  const handoffKw = new Set(["eval", "exec", "source"]);
  if (handoffKw.has(commandBase)) return true;

  let idx = 0;
  while (idx < firstToks.length && firstToks[idx]!.startsWith("-")) idx++;
  const runTarget = firstToks[idx]?.toLowerCase() ?? "";

  if (runTarget === "python" || runTarget.startsWith("python")) {
    if (firstToks.includes("-c")) return true;
  }
  if (runTarget === "perl" || runTarget === "ruby") {
    if (firstToks.includes("-e")) return true;
  }

  for (let s = 1; s < segments.length; s++) {
    const fbToks = tokenizeSegment(segments[s]!);
    const rawBase = stripOuterQuotes(filterRedirTargets(fbToks)[0] ?? "");
    const fb =
      (rawBase.includes("/") ? rawBase.split("/").pop()! : rawBase).toLowerCase();
    if (INTERPRETER_SHELLS.has(fb)) return true;
  }

  return false;
}

function isDestructive(
  commandBase: string,
  toks: string[],
  pipelineAll: string,
): boolean {
  if (DESTRUCTIVE_BASES.has(commandBase)) return true;

  const lower = `${commandBase} ${toks.slice(1).join(" ")} ${pipelineAll}`.toLowerCase();

  if (commandBase === "git") {
    if (/\bgit\b.*\bpush\b.*(?:--force|-f\b)/u.test(lower)) return true;
    if (/\bgit\b.*\breset\b.*(?:--hard)/u.test(lower)) return true;
  }

  if (commandBase === "docker") {
    if (/\bdocker\s+(?:rm|rmi)/u.test(lower)) return true;
    if (/\bdocker\s+system\s+prune/u.test(lower)) return true;
  }

  return false;
}

function collectRedirects(toks: string[]): string[] {
  const targets: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] === ">" || toks[i] === ">>" || toks[i] === "<") {
      const tgt = toks[i + 1];
      if (tgt && tgt !== ">") targets.push(stripOuterQuotes(tgt));
    }
  }
  return targets;
}

function extractWritePathsFromCommand(
  commandBase: string,
  toks: string[],
  workspaceRoot: string,
): string[] {
  const outs: string[] = [];
  const nonRedir = filterRedirTargets(toks);
  const positional = nonRedir.filter((t, idx) => idx > 0 && !t.startsWith("-"));

  if (["touch", "mkdir", "mkdirs"].includes(commandBase) && positional[0])
    outs.push(...positional.slice(0, 10));
  if (commandBase === "tee") {
    const outPos = positional;
    outs.push(...outPos);
  }
  if (commandBase === "cp" || commandBase === "mv") {
    if (positional.length >= 2)
      outs.push(positional[positional.length - 1]!);
  }
  if (commandBase === "git" && toks.includes("add")) {
    outs.push(...positional.filter((x) => !KNOWN_NETWORK.has(x) && tokenLooksLikePath(x)));
  }

  const idxInst = nonRedir.findIndex((t) => t === "npm" || t === "pnpm" || t === "yarn");
  if (idxInst >= 0) {
    if (
      nonRedir[idxInst + 1] === "install" ||
      nonRedir[idxInst + 1] === "i" ||
      nonRedir[idxInst + 1] === "add"
    )
      outs.push(canonicalizePath(".", workspaceRoot));
  }
  return [...new Set(outs)];
}

function filterRedirTargets(toks: string[]): string[] {
  const out: string[] = [];
  let skipNext = false;
  for (let i = 0; i < toks.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    const t = toks[i];
    if (t === ">" || t === ">>" || t === "<") {
      skipNext = true;
      continue;
    }
    /* heredoc word follows << / <<- */
    if (t === "<<" || t === "<<-") {
      skipNext = true;
      continue;
    }
    out.push(toks[i]!);
  }
  return out;
}

function extractReadPathsFromCommand(commandBase: string, toks: string[]): string[] {
  const readCmds = new Set(["cat", "less", "head", "tail", "grep", "sed", "awk"]);
  const nonRedir = filterRedirTargets(toks);
  const outs: string[] = [];
  if (readCmds.has(commandBase) || commandBase.endsWith("grep")) {
    nonRedir
      .slice(1)
      .filter((x) => !x.startsWith("-") || x === "-")
      .forEach((x) => {
        if (
          tokenLooksLikePath(stripOuterQuotes(x)) ||
          (!isUrl(stripOuterQuotes(x)) &&
            /\.[a-zA-Z]+$/.test(x) &&
            !x.startsWith("-"))
        )
          outs.push(stripOuterQuotes(x));
      });
  }
  const idx = nonRedir.findIndex((_, j) =>
    /^file\.|\.(ts|tsx|js|json|yaml|md|txt)$/u.test(stripOuterQuotes(nonRedir[j] ?? "")),
  );
  if (idx >= 0) outs.push(stripOuterQuotes(nonRedir[idx]!));

  const distinct = [...new Set(outs.filter((x) => x.length > 0))];
  return distinct;
}

function extractNetworkDomains(
  commandBase: string,
  toks: string[],
): { domains: string[]; protocol?: string } {
  if (!KNOWN_NETWORK.has(commandBase)) return { domains: [] };

  const domains: Set<string> = new Set();
  let protocol: string | undefined;

  for (let i = 1; i < toks.length; i++) {
    const t = stripOuterQuotes(toks[i]!);
    if (commandBase === "scp" || commandBase === "rsync") {
      const colon = /^([^:]+):/.exec(t);
      if (colon?.[1] && colon[1] !== "~" && colon[1] !== ".") {
        const h =
          /^[^@]*@(.*)$/.exec(colon[1])?.[1] ?? /^[^:]+$/.exec(colon[1])?.[0] ?? colon[1];
        if (h.includes(".")) domains.add(h);
      }
      continue;
    }
    const uhost = /^([^\s@]+@[^\s:]+)/.exec(t);
    const hostPart = /^([^/:@]+(?:\.[^/:@]+)+)(?::|$)/.exec(uhost?.[1] ?? t)?.[1];
    const u = /^[a-zA-Z][a-zA-Z+\d.-]*:\/\/.+$/u.exec(t)?.[0] ?? t;

    try {
      if (/^[a-zA-Z+\d.-]+:\/\//u.test(u)) {
        const p = new URL(u);
        if (p.hostname) domains.add(p.hostname);
        if (!protocol && p.protocol) protocol = p.protocol.replace(":", "") || protocol;
      } else if (hostPart?.includes(".")) {
        domains.add(hostPart.replace(/^@\s*/, "").split(":")[0]!);
      } else if (hostnameFromUrl(t)?.includes(".")) {
        domains.add(hostnameFromUrl(t)!);
      }
    } catch {
      continue;
    }
  }

  return {
    domains: [...domains],
    ...(protocol !== undefined ? { protocol } : {}),
  };
}

function hasHeredocSyntax(s: string): boolean {
  if (!/<<-?/.test(s)) return false;
  return (
    /[^<]<<-?(?:\s|['"]|[A-Za-z0-9_])/.test(s) ||
    /^<<-?(?:\s|['"]|[A-Za-z0-9_])/m.test(s.trim())
  );
}

function arithmeticEndIndex(s: string, dollarIdx: number): number {
  if (s[dollarIdx] !== "$") return dollarIdx + 1;
  if (!(s[dollarIdx + 1] === "(" && s[dollarIdx + 2] === "(")) return dollarIdx + 1;
  let j = dollarIdx + 3;
  let bal = 2;
  let inSq = false;
  let inDq = false;
  for (; j < s.length; j++) {
    const ch = s[j]!;
    if (!inDq && ch === "'") {
      inSq = !inSq;
      continue;
    }
    if (!inSq && ch === '"') {
      inDq = !inDq;
      continue;
    }
    if (inSq || inDq) continue;
    if (ch === "(") bal++;
    else if (ch === ")") {
      bal--;
      if (bal === 0) return j + 1;
    }
  }
  return dollarIdx + 3;
}

/** Replace `$(( ... ))` spans with spaces so subshell parsing ignores arithmetic. */
function stripArithmeticSpans(raw: string): string {
  let out = "";
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "$") {
      const end = arithmeticEndIndex(raw, i);
      if (end > i + 3) {
        out += " ".repeat(end - i);
        i = end;
        continue;
      }
    }
    out += raw[i]!;
    i++;
  }
  return out;
}

function findClosingParen(s: string, openIdx: number): number {
  if (s[openIdx] !== "(") return -1;
  let depth = 1;
  let inSq = false;
  let inDq = false;
  for (let i = openIdx + 1; i < s.length; i++) {
    const ch = s[i]!;
    if (!inDq && ch === "'") {
      inSq = !inSq;
      continue;
    }
    if (!inSq && ch === '"') {
      inDq = !inDq;
      continue;
    }
    if (inSq || inDq) continue;
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function expandSubshellMetrics(
  raw: string,
  fragmentDestructive: (frag: string) => boolean,
): { subshellAdds: number; subshellDestructive: boolean } {
  const s = stripArithmeticSpans(raw);
  let subshellAdds = 0;
  let subshellDestructive = false;
  let i = 0;
  let inSq = false;
  let inDq = false;
  while (i < s.length) {
    const ch = s[i]!;
    if (!inDq && ch === "'") {
      inSq = !inSq;
      i++;
      continue;
    }
    if (!inSq && ch === '"') {
      inDq = !inDq;
      i++;
      continue;
    }
    if (inSq || inDq) {
      i++;
      continue;
    }

    if (ch === "$" && s[i + 1] === "(") {
      const close = findClosingParen(s, i + 1);
      if (close < 0) {
        i++;
        continue;
      }
      subshellAdds += 1;
      const inner = s.slice(i + 2, close);
      subshellDestructive ||= fragmentDestructive(inner);
      i = close + 1;
      continue;
    }

    if (ch === "(") {
      const close = findClosingParen(s, i);
      if (close > i) {
        const inner = s.slice(i + 1, close);
        if (inner.trim().length > 0) {
          subshellAdds += 1;
          subshellDestructive ||= fragmentDestructive(inner);
        }
        i = close + 1;
        continue;
      }
    }

    i++;
  }

  return { subshellAdds, subshellDestructive };
}

function interpreterLeadsHeredoc(segment: string): boolean {
  if (!hasHeredocSyntax(segment)) return false;
  const head = segment.split("|")[0] ?? segment;
  const rawToks = tokenizeSegment(head);
  if (!(rawToks.includes("<<") || rawToks.includes("<<-"))) return false;
  const toks = filterRedirTargets(rawToks);
  let idx = 0;
  while (idx < toks.length && toks[idx]!.startsWith("-")) idx++;
  const raw = stripOuterQuotes(toks[idx] ?? "");
  const base = (raw.includes("/") ? raw.split("/").pop()! : raw).toLowerCase();
  if (!INTERPRETER_SHELLS.has(base)) return false;
  return true;
}

function heredocPipedToInterpreter(segments: string[]): boolean {
  for (let s = 0; s < segments.length - 1; s++) {
    if (!hasHeredocSyntax(segments[s]!)) continue;
    const nextToks = filterRedirTargets(tokenizeSegment(segments[s + 1]!));
    let j = 0;
    while (j < nextToks.length && nextToks[j]!.startsWith("-")) j++;
    const raw = stripOuterQuotes(nextToks[j] ?? "");
    const nb = (raw.includes("/") ? raw.split("/").pop()! : raw).toLowerCase();
    if (INTERPRETER_SHELLS.has(nb)) return true;
  }
  return false;
}

export function normalizeShellCommand(command: string, workspaceRoot: string): ShellNormalizerResult {
  const trimmed = command.trim();
  const segments = splitPipeline(trimmed);
  const subshellProbe = expandSubshellMetrics(trimmed, (frag) =>
    normalizeShellCommand(frag.trim(), workspaceRoot).destructive,
  );
  const pipelineDepth = Math.max(segments.length - 1, 0) + subshellProbe.subshellAdds;
  const first = segments[0] ?? trimmed;
  const toks = tokenizeSegment(first);
  const firstRaw = stripOuterQuotes(
    filterRedirTargets(toks).filter((x) => !/^>\d+$/.test(x))[0] ?? "",
  );
  const commandBase =
    (firstRaw.includes("/") ? firstRaw.split("/").pop()! : firstRaw).toLowerCase() || "";

  const flagSet = new Set(toks.slice(1).filter((x) => x.startsWith("-") && x.length > 1));
  if (hasHeredocSyntax(trimmed)) flagSet.add("heredoc");
  const flags = [...flagSet];
  const nonFlags = filterRedirTargets(toks).slice(1).filter((x) => !x.startsWith("-"));
  const subcommands = [...new Set(nonFlags.filter((x) => !tokenLooksLikePath(x) && !isUrl(x)))];

  const redirectionTargets = collectRedirects(toks).map((p) =>
    canonicalizePath(p, workspaceRoot),
  );

  const writeFromCmd = extractWritePathsFromCommand(commandBase, toks, workspaceRoot).map((p) =>
    canonicalizePath(p, workspaceRoot),
  );

  let writePaths = [...new Set([...redirectionTargets, ...writeFromCmd])];

  let readPaths = extractReadPathsFromCommand(commandBase, toks).map((p) =>
    canonicalizePath(p, workspaceRoot),
  );

  const nw = extractNetworkDomains(commandBase, toks);
  let networkDomains = nw.domains;
  let networkProtocol = nw.protocol;
  /** ssh host without URL */
  if (commandBase === "ssh" || commandBase === "scp") {
    for (let i = 1; i < toks.length; i++) {
      const t = stripOuterQuotes(toks[i]!);
      const h = /^[^@]*@(.*)$/.exec(t)?.[1] ?? (/^([\w.-]+\.[\w.-]+)$/u.exec(t)?.[1] ?? t);
      if (/^[a-zA-Z0-9.-]+\.[a-zA-Z0-9.-]+$/.test(h) && networkDomains.every((x) => x !== h))
        networkDomains = [...networkDomains, h];
    }
  }

  let destructive =
    isDestructive(commandBase, filterRedirTargets(toks), trimmed) ||
    writePaths.some((p) => isDenyPath(p)) ||
    readPaths.some((p) => isDenyPath(p)) ||
    subshellProbe.subshellDestructive;

  readPaths = readPaths.filter((p) => !writePaths.includes(p));

  const heredocHandoff =
    heredocPipedToInterpreter(segments) || segments.some((seg) => interpreterLeadsHeredoc(seg));
  const interpreterHandoff =
    detectInterpreterHandoff(segments, filterRedirTargets(toks), commandBase) || heredocHandoff;

  return {
    commandBase,
    flags,
    subcommands,
    writePaths,
    readPaths,
    networkDomains,
    ...(networkProtocol !== undefined ? { networkProtocol } : {}),
    destructive,
    interpreterHandoff,
    pipelineDepth,
    redirectionTargets,
  };
}
