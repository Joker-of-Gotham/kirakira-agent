package kirakira.tests.approval_destructive_mcp_test

import rego.v1

import data.kirakira.authz.approvals

workspace_root := "/home/dev/monorepo"

destructive_mcp_input := {
	"principal": {"interactive": true, "roles": ["developer"], "authn_method": "sso"},
	"workspace": {"root": workspace_root, "labels": {"repo_trust": "trusted"}},
	"action": {
		"kind": "mcp.invoke",
		"tool_type": "mcp",
		"normalized": {
			"destructive": true,
			"write_paths": [sprintf("%s/out.txt", [workspace_root])],
			"read_paths": [],
			"interpreter_handoff": false,
			"network": {"required": false, "domains": []},
		},
		"raw": {"command": ""},
	},
	"context": {
		"prior_decisions": {"approval_template_hit": false},
		"mcp_server": {"trust_tier": "verified"},
		"model": {},
	},
}

test_destructive_mcp_requires_human_approval if {
	want := approvals.result with input as destructive_mcp_input
	want == {"required": true, "mode": "human"}
}
