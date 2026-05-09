package kirakira.tests.masking_test

import rego.v1

import data.system.log as syslog

log_input_env_present := {"input": {
	"principal": {},
	"action": {"raw": {"env": {"NPM_TOKEN": "abc"}, "command": "echo hello"}},
}}

log_input_sensitive_command := {"input": {"principal": {}, "action": {"raw": {"command": "export API_KEY=sk-123"}}}}

log_input_api_key_principal := {"input": {"principal": {"authn_method": "api_key"}, "action": {"raw": {"command": "ls"}}}}

test_mask_env_present if {
	masked := syslog.mask with input as log_input_env_present
	"/input/action/raw/env" in masked
}

test_mask_sensitive_command_contains_api_key_keyword if {
	masked := syslog.mask with input as log_input_sensitive_command
	"/input/action/raw/command" in masked
}

test_mask_principal_for_api_key_authn if {
	masked := syslog.mask with input as log_input_api_key_principal
	"/input/principal" in masked
}

test_mask_plain_command_not_masked_when_no_sensitive_substrings if {
	fixture := {"input": {"principal": {}, "action": {"raw": {"command": "ls"}}}}
	m := syslog.mask with input as fixture
	count(m) == 0
}
