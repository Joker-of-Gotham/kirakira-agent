export type SecuritySeverity = "info" | "low" | "medium" | "high";

export interface SecurityFinding {
  readonly id: string;
  readonly severity: SecuritySeverity;
  readonly message: string;
  readonly path?: string;
}

const remoteUrl = /\bhttps?:\/\/[^\s"'<>]+/i;
const envInterp = /\$\{[A-Z_][A-Z0-9_]*\}/;
const shellHook =
  /\b(preInstall|postInstall|eval\s*\(|`[^`]*\$\(|;\s*curl|wget\s|chmod\s\+x)/i;

export function scanManifestText(
  label: string,
  text: string,
  path?: string,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  if (remoteUrl.test(text)) {
    findings.push({
      id: "remote-url",
      severity: "low",
      message: `${label}: references remote URLs (verify trust).`,
      path,
    });
  }
  if (envInterp.test(text)) {
    findings.push({
      id: "env-interpolation",
      severity: "medium",
      message: `${label}: environment variable interpolation detected.`,
      path,
    });
  }
  if (shellHook.test(text)) {
    findings.push({
      id: "shell-pattern",
      severity: "high",
      message: `${label}: possible shell hook or script execution pattern.`,
      path,
    });
  }
  return findings;
}

/** Scan normalized import artifacts for risky patterns. */
export function scanImportedConfig(
  rawFiles: readonly { path: string; text: string }[],
): SecurityFinding[] {
  const out: SecurityFinding[] = [];
  for (const f of rawFiles) {
    out.push(...scanManifestText(f.path, f.text, f.path));
  }
  return out;
}
