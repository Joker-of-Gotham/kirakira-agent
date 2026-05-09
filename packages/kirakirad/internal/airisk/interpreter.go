package airisk

import (
	"fmt"
	"strconv"
	"strings"
)

const airiskSemver = "1"

// AiriskOutput aggregates classification, claims, and obligations for PDP consumers.
type AiriskOutput struct {
	Version         string         `json:"version"`
	RequestID       string         `json:"request_id"`
	Classification  Classification `json:"classification"`
	Claims          []Claim        `json:"claims"`
	Obligations     []string       `json:"recommended_obligations"`
}

// Classification summarizes safety fields produced by AIRISK classification rules.
type Classification struct {
	ActionFamily               string `json:"action_family"`
	SideEffectLevel            string `json:"side_effect_level"`
	Destructive                bool   `json:"destructive"`
	NetworkRequired            bool   `json:"network_required"`
	ExternalContentDependency bool   `json:"external_content_dependency"`
	SecretExposureRisk         string `json:"secret_exposure_risk"`
	WorkspaceEscapeRisk        string `json:"workspace_escape_risk"`
	SupplyChainRisk            string `json:"supply_chain_risk"`
}

// Claim is a surfaced signal from a triggering rule bundle.
type Claim struct {
	Code       string   `json:"code"`
	Severity   string   `json:"severity"`
	Confidence float64  `json:"confidence"`
	Evidence   []string `json:"evidence"`
}

// Interpret ingests PDP-shaped payloads and aggregates AIRISK artefacts.
func Interpret(input map[string]interface{}) (*AiriskOutput, error) {
	if input == nil {
		return nil, fmt.Errorf("airisk: nil input map")
	}
	ai := parseActionInput(input)
	cl, claims, obligations := applyRules(ai)

	return &AiriskOutput{
		Version:        airiskSemver,
		RequestID:      firstKey(input,
			"request_id",
			"decision_id",
			"id",
			"trace_id",
			"correlation_id",
		),
		Classification: cl,
		Claims:         claims,
		Obligations:    obligations,
	}, nil
}

func parseActionInput(input map[string]interface{}) ActionInput {
	payload := unwrapNested(input, [][]string{{"action"}, {"intent"}, {"request"}})

	ai := ActionInput{}

	ai.ToolType = combine(
		firstKey(payload, "tool_type", "tool"),
	)
	ai.CommandBase = combine(
		firstKey(payload, "command_base", "executable"),
		firstKey(payload, "binary", "command", "program"),
	)
	ai.RawCommandLine = firstKey(payload,
		"raw_command_line",
		"command_line",
		"shell",
	)
	if ai.RawCommandLine == "" {
		ai.RawCommandLine = firstKey(input, "command")
	}

	ai.Flags = getStringSlicePreferred(payload,
		[]string{"flags"},
		[]string{"args", "arguments"},
	)
	if len(ai.Flags) == 0 {
		ai.Flags = getStringSlicePreferred(input, []string{"flags"}, []string{})
	}

	ai.NetworkDomains = pruneEmpty(coalesceSlices(
		getStringSlice(payload, "network_domains"),
		getStringSlice(payload, "urls"),
	))
	ai.WritePaths = getStringSlicePreferred(payload,
		[]string{"write_paths"},
		[]string{"writes", "write_targets"},
	)
	ai.ReadPaths = getStringSlicePreferred(payload,
		[]string{"read_paths"},
		[]string{"reads"},
	)

	ai.Destructive = getBoolFlexible(payload, "destructive", "is_destructive")
	ai.InterpreterHandoff = getBoolFlexible(payload, "interpreter_handoff", "pipes_to_shell")
	if remote, ok := optionalBoolFlexible(payload["remote_execution"]); ok && remote {
		ai.InterpreterHandoff = true
	}

	ai.SkillTrustTier = firstKey(payload, "skill_trust", "trust_tier", "trust", "skill_trust_level")
	if ai.SkillTrustTier == "" {
		ai.SkillTrustTier = firstKey(input, "skill_trust", "trust_tier")
	}

	ai.ModelProvider = combine(
		firstKey(payload, "model_provider"),
		firstKey(payload, "provider"),
	)

	if mc, ok := payload["mcp"].(map[string]interface{}); ok {
		ai.MCPToolCategory = firstKey(mc, "tool", "tool_name", "name")
		if getBoolFlexible(mc, "mutates_remote_state", "is_write") {
			ai.MCPWrite = true
		} else {
			switch strings.ToLower(firstKey(mc, "mode")) {
			case "write", "mutating", "danger":
				ai.MCPWrite = true
			default:
				ai.MCPWrite = false
			}
		}
	}

	lowerHints := strings.ToLower(ai.ToolType + " " + ai.CommandBase + " " + firstKey(payload, "mcp_capability"))
	if strings.Contains(lowerHints, "mcp") {
		if strings.TrimSpace(ai.ToolType) == "" {
			ai.ToolType = "mcp"
		}
		if strings.Contains(lowerHints, "write") || strings.Contains(lowerHints, "mutat") || strings.Contains(lowerHints, "delete") {
			ai.MCPWrite = true
		}
	}

	return ai
}

func unwrapNested(root map[string]interface{}, keys [][]string) map[string]interface{} {
	payload := root
Outer:
	for _, candidates := range keys {
		for _, candidate := range candidates {
			raw, ok := payload[candidate]
			if !ok {
				continue
			}
			nested, ok := raw.(map[string]interface{})
			if !ok {
				continue
			}
			payload = nested
			continue Outer
		}
		break
	}
	return payload
}

func combine(values ...string) string {
	var sb strings.Builder
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		if sb.Len() > 0 {
			sb.WriteByte(' ')
		}
		sb.WriteString(v)
	}
	return strings.TrimSpace(sb.String())
}

func coalesceSlices(groups ...[]string) []string {
	var out []string
	for _, g := range groups {
		out = append(out, g...)
	}
	return out
}

func getStringSlicePreferred(m map[string]interface{}, preferred []string, fallbacks []string) []string {
	for _, seq := range [][]string{preferred, fallbacks} {
		for _, k := range seq {
			raw, ok := m[k]
			if !ok {
				continue
			}
			if xs := coerceStringSlice(raw); len(xs) > 0 {
				return xs
			}
		}
	}
	return nil
}

func getStringSlice(m map[string]interface{}, key string) []string {
	if raw, ok := m[key]; ok {
		return coerceStringSlice(raw)
	}
	return nil
}

func coerceStringSlice(raw interface{}) []string {
	switch t := raw.(type) {
	case []interface{}:
		var out []string
		for _, item := range t {
			out = append(out, strings.TrimSpace(fmt.Sprint(item)))
		}
		return pruneEmpty(out)
	case []string:
		out := slicesCloneStrings(t)
		return pruneEmpty(out)
	case string:
		if strings.TrimSpace(t) == "" {
			return nil
		}
		return []string{t}
	case nil:
		return nil
	default:
		return []string{fmt.Sprint(raw)}
	}
}

func slicesCloneStrings(xs []string) []string {
	out := make([]string, len(xs))
	copy(out, xs)
	return out
}

func pruneEmpty(xs []string) []string {
	var out []string
	for _, s := range xs {
		s = strings.TrimSpace(s)
		if s == "" || strings.EqualFold(s, "<nil>") {
			continue
		}
		out = append(out, s)
	}
	return out
}

func firstKey(m map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		raw, ok := m[key]
		if !ok {
			continue
		}
		switch t := raw.(type) {
		case string:
			if strings.TrimSpace(t) != "" {
				return t
			}
		default:
			if s := strings.TrimSpace(fmt.Sprint(raw)); s != "" {
				return s
			}
		}
	}
	return ""
}

func getBoolFlexible(m map[string]interface{}, keys ...string) bool {
	for _, key := range keys {
		raw, ok := m[key]
		if !ok {
			continue
		}
		if val, ok := optionalBoolFlexible(raw); ok {
			return val
		}
	}
	return false
}

func optionalBoolFlexible(raw interface{}) (bool, bool) {
	switch t := raw.(type) {
	case bool:
		return t, true
	case string:
		if v, err := strconv.ParseBool(strings.TrimSpace(strings.ToLower(t))); err == nil {
			return v, true
		}
	case float64:
		return t != 0, true
	case int:
		return t != 0, true
	case int64:
		return t != 0, true
	}
	return false, false
}
