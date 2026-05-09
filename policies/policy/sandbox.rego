package kirakira.authz.sandbox

import rego.v1

default profile := "read-only"

profile := "plan-only" if {
	not input.principal.interactive
	input.action.kind == "model.invoke"
	not input.action.normalized.network.required
}

profile := "workspace-write" if {
	input.action.kind == "file.write"
	every path in input.action.normalized.write_paths {
		path_in_workspace(path)
	}
	not input.action.normalized.network.required
}

profile := "workspace-write-net" if {
	input.action.kind == "package.install"
	every path in input.action.normalized.write_paths {
		path_in_workspace(path)
	}
	input.action.normalized.network.required
}

profile := "mcp-read" if {
	input.action.tool_type == "mcp"
	not input.action.normalized.destructive
}

profile := "mcp-write" if {
	input.action.tool_type == "mcp"
	input.action.normalized.destructive
}

profile := "microvm-highrisk" if {
	input.action.normalized.interpreter_handoff
}

profile := "microvm-highrisk" if {
	input.context.mcp_server.trust_tier == "unknown"
	input.action.normalized.destructive
}

path_in_workspace(path) if {
	startswith(path, input.workspace.root)
}
