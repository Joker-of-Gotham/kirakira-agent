package system.log

import rego.v1

mask contains "/input/action/raw/env" if {
	input.input.action.raw.env
}

mask contains "/input/action/raw/command" if {
	contains(input.input.action.raw.command, "token")
}

mask contains "/input/action/raw/command" if {
	contains(input.input.action.raw.command, "secret")
}

mask contains "/input/action/raw/command" if {
	contains(input.input.action.raw.command, "password")
}

mask contains "/input/action/raw/command" if {
	contains(input.input.action.raw.command, "api_key")
}

mask contains "/input/action/raw/command" if {
	contains(input.input.action.raw.command, "API_KEY")
}

mask contains "/input/principal" if {
	input.input.principal.authn_method == "api_key"
}
