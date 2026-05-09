package kirakira.tests.allow_shell_test

import rego.v1

import data.kirakira.authz.main

workspace_root := "/home/dev/monorepo"

shell_ctx := {
	"principal": {"interactive": true, "roles": ["developer"], "authn_method": "sso"},
	"workspace": {"root": workspace_root, "labels": {"repo_trust": "trusted"}},
	"action": {
		"kind": "shell.exec",
		"tool_type": "",
		"normalized": {
			"destructive": false,
			"write_paths": [],
			"read_paths": [],
			"interpreter_handoff": false,
			"network": {"required": false, "domains": []},
		},
		"raw": {"command": ""},
	},
	"context": {
		"prior_decisions": {"approval_template_hit": false},
		"mcp_server": {"trust_tier": "trusted"},
		"model": {},
	},
}

with_cmd(cmd, base) := object.union(base, {"action": object.union(base.action, {"raw": {"command": cmd}})})

test_shell_ls_permitted if {
	main.permit with input as with_cmd("ls -la src/", shell_ctx)
}

test_shell_cat_permitted if {
	main.permit with input as with_cmd("cat README.md", shell_ctx)
}

test_shell_grep_permitted if {
	main.permit with input as with_cmd("grep -R \"TODO\" ./src", shell_ctx)
}
