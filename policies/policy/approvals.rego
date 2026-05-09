package kirakira.authz.approvals

import rego.v1

default result := {"required": false, "mode": "none"}

result := {"required": true, "mode": "human"} if {
	input.action.tool_type == "mcp"
	input.action.normalized.destructive
}

result := {"required": true, "mode": "human"} if {
	input.action.kind == "shell.exec"
	input.action.normalized.interpreter_handoff
}

result := {"required": true, "mode": "human"} if {
	input.action.kind == "file.write"
	some path in input.action.normalized.write_paths
	not path_in_workspace(path)
}

result := {"required": true, "mode": "human"} if {
	input.action.kind == "shell.exec"
	input.action.normalized.destructive
	input.principal.interactive
}

result := {"required": true, "mode": "auto"} if {
	input.context.prior_decisions.approval_template_hit
	not input.action.normalized.destructive
}

path_in_workspace(path) if {
	startswith(path, input.workspace.root)
}
