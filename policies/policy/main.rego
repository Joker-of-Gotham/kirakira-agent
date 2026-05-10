package kirakira.authz.main

import rego.v1

import data.kirakira.authz.approvals
import data.kirakira.authz.sandbox
import data.kirakira.authz.obligations

default permit := false

permit if {
	count(deny) == 0
}

deny contains reason if {
	not input.principal.interactive
	input.action.normalized.destructive
	reason := "non_interactive_destructive_action"
}

deny contains reason if {
	input.action.kind == "shell.exec"
	input.workspace.labels.repo_trust == "untrusted"
	input.action.normalized.write_paths[_] != ""
	reason := "untrusted_repo_write"
}

deny contains reason if {
	input.action.kind == "network.request"
	domain := input.action.normalized.network.domains[_]
	not domain_allowed(domain)
	reason := "unauthorized_domain"
}

deny contains reason if {
	input.action.kind == "shell.exec"
	input.action.normalized.interpreter_handoff
	not input.principal.interactive
	reason := "interpreter_handoff_non_interactive"
}

deny contains reason if {
	input.action.tool_type == "mcp"
	input.context.mcp_server.trust_tier == "unknown"
	reason := "unknown_mcp_server"
}

deny contains reason if {
	input.action.kind == "model.invoke"
	input.context.model.provider
	not provider_allowed(input.context.model.provider)
	reason := "unauthorized_model_provider"
}

deny contains reason if {
	input.action.kind == "package.install"
	some path in input.action.normalized.write_paths
	not path_in_workspace(path)
	reason := "package_install_outside_workspace"
}

# Package install must use approved source domains
deny contains reason if {
	input.action.kind == "package.install"
	some domain in input.action.normalized.network.domains
	not package_source_allowed(domain)
	reason := "unapproved_package_source"
}

package_source_allowed(domain) if {
	some allowed in data.kirakira.config.package_sources.npm_allowlist
	allowed == domain
}

package_source_allowed(domain) if {
	some allowed in data.kirakira.config.package_sources.pypi_allowlist
	allowed == domain
}

package_source_allowed(domain) if {
	some allowed in data.kirakira.config.package_sources.cargo_allowlist
	allowed == domain
}

package_source_allowed(domain) if {
	some allowed in data.kirakira.config.package_sources.go_allowlist
	allowed == domain
}

deny contains reason if {
	secret_path(input.action.normalized.write_paths[_])
	reason := "secret_path_write"
}

deny contains reason if {
	secret_path(input.action.normalized.read_paths[_])
	not has_role("security_reviewer")
	reason := "secret_path_read_unauthorized"
}

domain_allowed(domain) if {
	some allowed in data.kirakira.config.network_allowlist
	glob.match(allowed, ["."], domain)
}

domain_allowed(domain) if {
	some allowed in data.kirakira.config.package_sources.npm_allowlist
	allowed == domain
}

domain_allowed(domain) if {
	some allowed in data.kirakira.config.package_sources.pypi_allowlist
	allowed == domain
}

domain_allowed(domain) if {
	some allowed in data.kirakira.config.package_sources.cargo_allowlist
	allowed == domain
}

domain_allowed(domain) if {
	some allowed in data.kirakira.config.package_sources.go_allowlist
	allowed == domain
}

provider_allowed(provider) if {
	some allowed in data.kirakira.config.model_policies.allowed_providers
	allowed == provider
}

path_in_workspace(path) if {
	startswith(path, input.workspace.root)
}

secret_path(path) if {
	some pattern in data.kirakira.config.secret_patterns
	glob.match(pattern, ["/"], path)
}

has_role(role) if {
	input.principal.roles[_] == role
}

decision := {
	"permit": permit,
	"deny_reasons": deny,
	"approval": approvals.result,
	"sandbox_profile": sandbox.profile,
	"obligations": obligations.result,
} if {
	true
}
