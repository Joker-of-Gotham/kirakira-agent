export type ToolAliasRiskLevel = "low" | "medium" | "high";

export interface ToolAlias {
  alias: string;
  server: string;
  tool: string;
  description?: string;
  riskLevel: ToolAliasRiskLevel;
  readOnly: boolean;
}

export interface ToolAliasCatalog {
  aliases: readonly ToolAlias[];
}

export interface ToolAliasCatalogOptions {
  aliases?: readonly ToolAlias[];
  includeBuiltins?: boolean;
}

export type ToolAliasCatalogInput = readonly ToolAlias[] | ToolAliasCatalogOptions;

export const DEFAULT_TOOL_ALIASES: readonly ToolAlias[] = [
  // filesystem-core read-only
  { alias: "fs.read_text",     server: "filesystem-core", tool: "read_file",                description: "Read a text file",                    riskLevel: "low",    readOnly: true  },
  { alias: "fs.read_many",     server: "filesystem-core", tool: "read_multiple_files",       description: "Read multiple files at once",          riskLevel: "medium", readOnly: true  },
  { alias: "fs.list_dir",      server: "filesystem-core", tool: "list_directory",            description: "List directory contents",              riskLevel: "low",    readOnly: true  },
  { alias: "fs.tree",          server: "filesystem-core", tool: "directory_tree",            description: "Recursive directory tree",             riskLevel: "medium", readOnly: true  },
  { alias: "fs.info",          server: "filesystem-core", tool: "get_file_info",             description: "File metadata",                       riskLevel: "low",    readOnly: true  },
  { alias: "fs.search_name",   server: "filesystem-core", tool: "search_files",             description: "Search files by name pattern",         riskLevel: "low",    readOnly: true  },
  { alias: "fs.allowed_dirs",  server: "filesystem-core", tool: "list_allowed_directories", description: "List allowed directories",              riskLevel: "low",    readOnly: true  },
  // filesystem-core write
  { alias: "fs.write",         server: "filesystem-core", tool: "write_file",               description: "Create or overwrite a file",           riskLevel: "high",   readOnly: false },
  { alias: "fs.edit_preview",  server: "filesystem-core", tool: "edit_file",                description: "Preview file edit (dry-run)",           riskLevel: "medium", readOnly: true  },
  { alias: "fs.edit_apply",    server: "filesystem-core", tool: "edit_file",                description: "Apply file edit",                      riskLevel: "high",   readOnly: false },
  { alias: "fs.mkdir",         server: "filesystem-core", tool: "create_directory",         description: "Create a directory",                   riskLevel: "medium", readOnly: false },
  { alias: "fs.move",          server: "filesystem-core", tool: "move_file",                description: "Move or rename a file",                riskLevel: "high",   readOnly: false },

  // filesystem-search
  { alias: "fs.grep",          server: "filesystem-search", tool: "search",                 description: "Full-text search with ripgrep",        riskLevel: "low",    readOnly: true  },
  { alias: "fs.grep_count",    server: "filesystem-search", tool: "count_matches",          description: "Count matches",                        riskLevel: "low",    readOnly: true  },
  { alias: "fs.list_by_type",  server: "filesystem-search", tool: "list_files",             description: "List files by type",                   riskLevel: "low",    readOnly: true  },

  // filesystem-git
  { alias: "git.status",       server: "filesystem-git", tool: "git_status",                description: "Git status",                           riskLevel: "low",    readOnly: true  },
  { alias: "git.diff",         server: "filesystem-git", tool: "git_diff",                  description: "Git diff",                             riskLevel: "low",    readOnly: true  },
  { alias: "git.log",          server: "filesystem-git", tool: "git_log",                   description: "Git commit history",                   riskLevel: "low",    readOnly: true  },
  { alias: "git.show",         server: "filesystem-git", tool: "git_show",                  description: "Show Git object",                      riskLevel: "low",    readOnly: true  },

  // filesystem-patch
  { alias: "fs.snapshot",      server: "filesystem-patch", tool: "snapshot_create",         description: "Create file snapshot",                 riskLevel: "low",    readOnly: false },
  { alias: "fs.snapshot_list", server: "filesystem-patch", tool: "snapshot_list",           description: "List snapshots",                       riskLevel: "low",    readOnly: true  },
  { alias: "fs.patch_preview", server: "filesystem-patch", tool: "patch_preview",           description: "Preview patch application",             riskLevel: "medium", readOnly: true  },
  { alias: "fs.patch_apply",   server: "filesystem-patch", tool: "patch_apply",             description: "Apply patch",                          riskLevel: "high",   readOnly: false },
  { alias: "fs.rollback",      server: "filesystem-patch", tool: "rollback",                description: "Rollback to snapshot",                 riskLevel: "high",   readOnly: false },
  { alias: "fs.diff_files",    server: "filesystem-patch", tool: "diff_files",              description: "Diff two files",                       riskLevel: "low",    readOnly: true  },

  // filesystem-artifact
  { alias: "artifact.put",     server: "filesystem-artifact", tool: "artifact_put",         description: "Store artifact",                       riskLevel: "medium", readOnly: false },
  { alias: "artifact.summary", server: "filesystem-artifact", tool: "artifact_get_summary", description: "Get artifact summary",                 riskLevel: "low",    readOnly: true  },
  { alias: "artifact.list",    server: "filesystem-artifact", tool: "artifact_list",        description: "List artifacts",                       riskLevel: "low",    readOnly: true  },
  { alias: "artifact.hash",    server: "filesystem-artifact", tool: "content_hash",         description: "Hash file content",                    riskLevel: "low",    readOnly: true  },
  { alias: "artifact.inspect", server: "filesystem-artifact", tool: "inspect_binary",       description: "Inspect binary file type",              riskLevel: "low",    readOnly: true  },
  { alias: "artifact.preview", server: "filesystem-artifact", tool: "preview_structured",   description: "Preview CSV/JSON data",                riskLevel: "low",    readOnly: true  },
];

function isToolAliasArray(input: ToolAliasCatalogInput): input is readonly ToolAlias[] {
  return Array.isArray(input);
}

function aliasesFromInput(input: ToolAliasCatalogInput | undefined): readonly ToolAlias[] {
  if (input === undefined) return [];
  if (isToolAliasArray(input)) return input;
  return input.aliases ?? [];
}

function shouldIncludeBuiltins(input: ToolAliasCatalogInput | undefined): boolean {
  if (input === undefined || isToolAliasArray(input)) return true;
  return input.includeBuiltins !== false;
}

function cloneAlias(alias: ToolAlias): ToolAlias {
  return {
    alias: alias.alias,
    server: alias.server,
    tool: alias.tool,
    ...(alias.description !== undefined ? { description: alias.description } : {}),
    riskLevel: alias.riskLevel,
    readOnly: alias.readOnly,
  };
}

export function mergeToolAliases(...aliasSets: readonly (readonly ToolAlias[] | undefined)[]): ToolAliasCatalog {
  const aliases = new Map<string, ToolAlias>();
  for (const aliasSet of aliasSets) {
    for (const alias of aliasSet ?? []) {
      aliases.set(alias.alias, cloneAlias(alias));
    }
  }
  return { aliases: [...aliases.values()] };
}

export function createToolAliasCatalog(input?: ToolAliasCatalogInput): ToolAliasCatalog {
  return mergeToolAliases(
    shouldIncludeBuiltins(input) ? DEFAULT_TOOL_ALIASES : undefined,
    aliasesFromInput(input),
  );
}
