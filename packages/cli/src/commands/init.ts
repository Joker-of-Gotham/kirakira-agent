import { Command, Flags } from "@oclif/core";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { stringify as stringifyToml } from "smol-toml";
import { stringify as stringifyYaml } from "yaml";
import { SCHEMA_VERSIONS } from "@kirakira/core";
import { defaultAgentToml, defaultPolicyYaml } from "../config/defaults.js";

export default class Init extends Command {
  static override description = "Initialize a new kirakira-agent workspace";

  static override flags = {
    template: Flags.string({
      char: "t",
      description: "Project template",
      options: ["default", "fin-graph", "minimal"],
      default: "default",
    }),
    force: Flags.boolean({
      char: "f",
      description: "Overwrite existing config files",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Init);
    const cwd = process.cwd();

    if (existsSync(join(cwd, "agent.toml")) && !flags.force) {
      this.log("agent.toml already exists. Use --force to overwrite.");
      return;
    }

    await mkdir(join(cwd, ".kirakira", "skills"), { recursive: true });

    const agentToml = defaultAgentToml();
    agentToml.workspace_name = cwd.split("/").pop() ?? "default";

    if (flags.template === "fin-graph") {
      agentToml.workspace_name = agentToml.workspace_name || "fin-graph";
      agentToml.model = {
        ...(agentToml.model ?? { default: "" }),
        default: agentToml.model?.default ?? "",
      };
      agentToml.skills = {
        ...(agentToml.skills ?? {}),
        discover: [".kirakira/skills", "skills"],
      };
    } else if (flags.template === "minimal") {
      agentToml.skills = undefined as unknown as typeof agentToml.skills;
      agentToml.mcp = undefined as unknown as typeof agentToml.mcp;
    }

    const tomlContent = stringifyToml(agentToml as Record<string, unknown>);
    await writeFile(join(cwd, "agent.toml"), tomlContent, "utf-8");
    this.log(`Created agent.toml (template: ${flags.template})`);

    const policyYaml = defaultPolicyYaml();
    const yamlContent = stringifyYaml(policyYaml, { indent: 2 });
    await writeFile(join(cwd, "policy.yaml"), yamlContent, "utf-8");
    this.log("Created policy.yaml");

    const mcpConfig = { mcpServers: {} };
    await writeFile(
      join(cwd, ".mcp.json"),
      JSON.stringify(mcpConfig, null, 2) + "\n",
      "utf-8",
    );
    this.log("Created .mcp.json");

    const skillMdContent = [
      "---",
      "name: example-skill",
      "description: An example skill template. Replace with your own skill definition.",
      `version: \"${SCHEMA_VERSIONS.skillManifest}.0.0\"`,
      "---",
      "",
      "# Goal",
      "",
      "Describe the goal of this skill.",
      "",
      "# Steps",
      "",
      "1. Step one",
      "2. Step two",
      "",
    ].join("\n");
    await writeFile(
      join(cwd, ".kirakira", "skills", "SKILL.md"),
      skillMdContent,
      "utf-8",
    );
    this.log("Created .kirakira/skills/SKILL.md template");

    const detectedCompat: string[] = [];
    if (existsSync(join(cwd, ".cursor", "mcp.json")))
      detectedCompat.push(".cursor/mcp.json");
    if (existsSync(join(cwd, ".claude", "skills")))
      detectedCompat.push(".claude/skills/");
    if (existsSync(join(cwd, ".agents", "skills")))
      detectedCompat.push(".agents/skills/ (Codex)");

    if (detectedCompat.length > 0) {
      this.log(
        `\nDetected external configs: ${detectedCompat.join(", ")}`,
      );
      this.log(
        "Run 'kirakira-agent mcp import' or 'kirakira-agent skill import' to import them.",
      );
    }

    this.log("\nWorkspace initialized. Run 'kirakira-agent doctor' to check setup.");
  }
}
