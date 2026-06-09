import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface DesktopPackageJson {
  main: string;
  scripts: Record<string, string>;
}

function desktopPackage(): DesktopPackageJson {
  return JSON.parse(
    readFileSync(resolve("apps/desktop/package.json"), "utf8"),
  ) as DesktopPackageJson;
}

describe("desktop package scripts", () => {
  it("keeps the Electron shell script pointed at main process startup", () => {
    const pkg = desktopPackage();
    const electronScript = pkg.scripts["dev:electron"];

    expect(pkg.main).toBe("./dist/main/main.js");
    expect(electronScript).toContain("pnpm run build:main");
    expect(electronScript).toContain("pnpm run build:preload");
    expect(electronScript).toContain("electron .");
    expect(electronScript).not.toContain("vite --config vite.renderer.config.ts");
    expect(pkg.scripts["dev:renderer"]).toBe("vite --config vite.renderer.config.ts");
    expect(JSON.stringify(pkg.scripts)).not.toContain("5173");
  });
});
