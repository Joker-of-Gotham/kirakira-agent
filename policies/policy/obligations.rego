package kirakira.authz.obligations

import rego.v1

result contains obligation if {
	obligation := {"type": "sandbox", "profile": data.kirakira.authz.sandbox.profile}
}

result contains obligation if {
	obligation := {"type": "audit_append", "required": true}
}

result contains obligation if {
	input.action.normalized.destructive
	obligation := {"type": "trace_redaction", "policy": "full_content"}
}

result contains obligation if {
	not input.action.normalized.destructive
	obligation := {"type": "trace_redaction", "policy": "default_metadata_only"}
}

result contains obligation if {
	input.action.normalized.network.required
	obligation := {"type": "network_allowlist", "domains": input.action.normalized.network.domains}
}

result contains obligation if {
	secret_path_involved
	obligation := {"type": "secret_projection", "required": true}
}

result contains obligation if {
	input.action.normalized.destructive
	obligation := {"type": "reason_required", "min_length": 10}
}

result contains obligation if {
	data.kirakira.authz.sandbox.profile == "microvm-highrisk"
	obligation := {"type": "copyout_review", "required": true}
}

secret_path_involved if {
	some path in input.action.normalized.write_paths
	some pattern in data.kirakira.config.secret_patterns
	glob.match(pattern, ["/"], path)
}

secret_path_involved if {
	some path in input.action.normalized.read_paths
	some pattern in data.kirakira.config.secret_patterns
	glob.match(pattern, ["/"], path)
}
