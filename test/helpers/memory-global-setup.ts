import { runRuntimeDoctor } from "../../scripts/runtime-doctor.mjs";

/**
 * Vitest global setup: probes the profile-defined test-host memory stack so
 * synchronous `skipIfNoDocker()` can gate integration tests without per-file async init.
 */
export default async function memoryGlobalSetup(): Promise<void> {
  try {
    const report = await runRuntimeDoctor("test-host", {
      env: {},
      timeoutMs: 1_500,
    });
    process.env.__KIRAKIRA_MEMORY_STACK_UP__ = report.ok ? "1" : "0";
    process.env.__KIRAKIRA_MEMORY_PG_UP__ = report.ok ? "1" : "0";
  } catch {
    process.env.__KIRAKIRA_MEMORY_STACK_UP__ = "0";
    process.env.__KIRAKIRA_MEMORY_PG_UP__ = "0";
  }
}
