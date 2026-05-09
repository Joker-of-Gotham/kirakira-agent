package kirakira.tests.deny_external_write_test

import rego.v1

import data.kirakira.authz.main

workspace_root := "/home/dev/monorepo"

base := {
	"principal": {"interactive": true, "roles": ["developer"], "authn_method": "sso"},
	"workspace": {"root": workspace_root, "labels": {"repo_trust": "trusted"}},
	"context": {
		"prior_decisions": {"approval_template_hit": false},
		"mcp_server": {"trust_tier": "trusted"},
		"model": {},
	},
}

test_package_install_outside_workspace_denied if {
	fixture := object.union(base, {"action": {
		"kind": "package.install",
		"tool_type": "",
		"normalized": {
			"destructive": true,
			"write_paths": ["/usr/local/lib/node_modules/my-pkg"],
			"read_paths": [],
			"interpreter_handoff": false,
			"network": {"required": true, "domains": ["registry.npmjs.org"]},
		},
		"raw": {"command": "npm install -g eslint"},
	}})
	"package_install_outside_workspace" in main.deny with input as fixture
	not main.permit with input as fixture
}
