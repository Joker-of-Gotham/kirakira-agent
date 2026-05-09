package kirakira.tests.fail_closed_test

import rego.v1

import data.kirakira.authz.main

missing_principal_secret_read := {
	"workspace": {"root": "/srv/app", "labels": {"repo_trust": "trusted"}},
	"action": {
		"kind": "file.read",
		"tool_type": "",
		"normalized": {
			"destructive": false,
			"write_paths": [],
			"read_paths": ["/srv/app/vendor/.ssh/known_hosts"],
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

test_secret_read_denied_when_principal_roles_missing if {
	not main.permit with input as missing_principal_secret_read
}

test_secret_read_raises_secret_read_unauthorized if {
	"secret_path_read_unauthorized" in main.deny with input as missing_principal_secret_read
}
