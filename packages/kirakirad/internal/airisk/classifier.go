package airisk

import (
	"path/filepath"
	"slices"
	"strings"
)

// ClassificationRule binds a named profile to matching logic and deltas.
type ClassificationRule struct {
	ActionFamily        string
	MatchFunc           func(ActionInput) bool
	SideEffect          string
	Destructive         bool
	NetworkRequired     bool
	ExternalContentDep  bool
	SecretExposureRisk  string // empty skips merge
	WorkspaceEscapeRisk string
	SupplyChainRisk     string
}

// ActionInput captures the PDP-facing AIRISK normalization.
type ActionInput struct {
	ToolType           string
	CommandBase        string
	RawCommandLine     string
	Flags              []string
	NetworkDomains     []string
	WritePaths         []string
	ReadPaths          []string
	Destructive        bool
	InterpreterHandoff bool
	SkillTrustTier     string
	ModelProvider      string
	MCPWrite           bool
	MCPToolCategory    string
}

type airRule struct {
	ClassificationRule
	ClaimCode       string
	ClaimSeverity   string
	ClaimConfidence float64
	Obligations     []string
	evidenceKind    string
}

// defaultRules documents the thirteen ordered AIRISK classification rules.
var defaultRules = []airRule{
	ruleInterpreterHandoff(),
	ruleSecretTouch(),
	ruleFileDelete(),
	ruleWorkspaceEscapeSurface(),
	ruleVCSPush(),
	rulePackageInstall(),
	ruleNetworkFetch(),
	ruleSkillScript(),
	ruleModelInvoke(),
	ruleConfigModify(),
	ruleMCPWrite(),
	ruleMCPRead(),
	ruleShellWorkspaceWrite(),
	ruleShellReadonly(),
}

func commandBase(ai ActionInput) string {
	return strings.ToLower(filepath.Base(strings.TrimSpace(ai.CommandBase)))
}

func normalizedTool(ai ActionInput) string {
	return strings.ToLower(strings.TrimSpace(ai.ToolType))
}

func joinCommand(ai ActionInput) string {
	if line := strings.TrimSpace(ai.RawCommandLine); line != "" {
		return line
	}
	parts := []string{strings.TrimSpace(ai.CommandBase)}
	parts = append(parts, slices.Clone(ai.Flags)...)
	return strings.TrimSpace(strings.Join(parts, " "))
}

func loweredFlags(ai ActionInput) []string {
	out := slices.Clone(ai.Flags)
	for i := range out {
		out[i] = strings.TrimSpace(strings.ToLower(out[i]))
	}
	return out
}

func flagText(ai ActionInput) string {
	return strings.Join(loweredFlags(ai), " ")
}

func gitSub(ai ActionInput) string {
	ff := loweredFlags(ai)
	if len(ff) == 0 {
		return ""
	}
	fields := strings.Fields(strings.TrimLeft(ff[0], "-"))
	if len(fields) == 0 {
		return ""
	}
	return strings.ToLower(fields[0])
}

func hasFlag(ai ActionInput, needle string) bool {
	return strings.Contains(flagText(ai)+" "+strings.ToLower(joinCommand(ai)), needle)
}

func interpreterTriggered(ai ActionInput) bool {
	if ai.InterpreterHandoff {
		return true
	}
	line := strings.ToLower(joinCommand(ai))
	return strings.Contains(line, "| bash") ||
		strings.Contains(line, "|bash") ||
		strings.Contains(line, "| sh") ||
		strings.Contains(line, "| zsh") ||
		(strings.Contains(line, "curl") && strings.Contains(line, "|")) ||
		(strings.Contains(line, "wget") && strings.Contains(line, "|")) ||
		(strings.Contains(line, "python ") && strings.Contains(line, "<<"))
}

func secretTouch(ai ActionInput) bool {
	line := strings.ToLower(joinCommand(ai))
	if strings.Contains(line, "kubectl") && strings.Contains(line, "secret") {
		return true
	}
	for _, needle := range []string{
		"id_rsa", ".pem", ".env", "begin rsa private", "aws_secret_access_key",
		"oauth_token", "github_pat", "--password", "credential",
	} {
		if strings.Contains(line, needle) {
			return true
		}
	}
	for _, p := range append(append([]string{}, ai.ReadPaths...), ai.WritePaths...) {
		lp := strings.ToLower(p)
		for _, frag := range []string{".env", "credentials", ".ssh", "kube/config", "token.json"} {
			if strings.Contains(lp, frag) {
				return true
			}
		}
	}
	return false
}

func fileDelete(ai ActionInput) bool {
	switch commandBase(ai) {
	case "rm", "unlink", "shred":
		return true
	case "truncate":
		return true
	default:
		txt := strings.ToLower(joinCommand(ai))
		return strings.Contains(txt, "aws s3 rm") || ai.Destructive
	}
}

func workspaceEscape(ai ActionInput) bool {
	for _, bucket := range [][]string{ai.ReadPaths, ai.WritePaths, {filepath.Base(ai.CommandBase)}} {
		for _, raw := range bucket {
			p := strings.ToLower(raw)
			switch {
			case strings.Contains(p, ".."):
				return true
			case strings.Contains(p, "/etc/passwd"):
				return true
			case strings.Contains(p, "/proc/"):
				return true
			case strings.Contains(p, "/sys/"):
				return true
			default:
				if strings.Contains(strings.ToLower(joinCommand(ai)), "sudo ") {
					return true
				}
			}
		}
	}
	return false
}

func vcsPush(ai ActionInput) bool {
	return commandBase(ai) == "git" && gitSub(ai) == "push"
}

func vcsPushForce(ai ActionInput) bool {
	return vcsPush(ai) && strings.Contains(strings.ToLower(flagText(ai)+" "+joinCommand(ai)), "--force")
}

func packageInstall(ai ActionInput) bool {
	txt := strings.ToLower(joinCommand(ai))
	ft := strings.ToLower(flagText(ai))
	switch commandBase(ai) {
	case "npm", "pnpm", "yarn", "bun":
		return strings.Contains(ft, "install") || strings.Contains(ft, "add") || strings.Contains(txt, " run ")
	case "pip", "pip3", "pipx", "uv":
		return strings.Contains(txt, " install") || strings.Contains(ft, "install")
	case "conda", "mamba":
		return strings.Contains(txt, "install")
	case "apk", "apt-get", "apt", "dnf", "yum", "zypper":
		return strings.Contains(txt+" "+ft, "install") || strings.Contains(txt, "upgrade")
	case "cargo", "gem", "composer", "helm":
		return strings.Contains(txt+" "+ft, "install") || strings.Contains(ft, "add")
	case "go":
		return strings.Contains(txt, "go get ") || strings.Contains(txt, "go install ") ||
			strings.Contains(txt, "go mod tidy") || strings.Contains(txt, "go mod download")
	case "pulumi", "terraform", "tofu":
		return strings.Contains(txt, "apply") || strings.Contains(txt, "deploy")
	default:
		return strings.Contains(ft, "brew install") || strings.Contains(ft, "choco install")
	}
}

func networkFetch(ai ActionInput) bool {
	switch commandBase(ai) {
	case "curl", "wget", "httpie", "http", "scp", "sftp", "rsync", "aria2c":
		return true
	default:
		return len(ai.NetworkDomains) > 0
	}
}

func workspaceWrite(ai ActionInput) bool {
	cb := commandBase(ai)
	switch cb {
	case "touch", "mkdir", "mv", "cp", "tee", "install", "dd":
		return true
	case "chmod", "chown":
		return true
	case "git":
		sub := gitSub(ai)
		switch sub {
		case "add", "stash", "commit", "checkout", "reset", "rebase":
			return true
		default:
			return false
		}
	default:
		return normalizedTool(ai) == "" && len(ai.WritePaths) > 0
	}
}

func shellReadonly(ai ActionInput) bool {
	cb := commandBase(ai)
	txt := normalizedTool(ai)
	if txt != "shell" && cb != "git" && txt != "" && txt != "pwsh" && txt != "powershell" {
		return false
	}
	if packageInstall(ai) || fileDelete(ai) || vcsPush(ai) || interpreterTriggered(ai) || workspaceWrite(ai) || networkFetch(ai) {
		return false
	}
	readonly := func() bool {
		switch cb {
		case "ls", "pwd", "id", "whoami", "stat", "file", "printenv":
			return true
		case "cat", "head", "tail", "less", "more", "wc", "sort", "uniq":
			return true
		case "grep", "egrep", "fgrep", "rg", "ripgrep", "awk":
			return true
		case "sed":
			for _, flag := range loweredFlags(ai) {
				if strings.HasPrefix(flag, "-") && strings.Contains(flag, "i") {
					return false
				}
			}
			return true
		case "jq", "yq", "find", "du", "df", "hostnamectl":
			return true
		default:
			return cb == ""
		}
	}()
	if cb == "git" {
		switch gitSub(ai) {
		case "status", "diff", "log", "show", "branch":
			readonly = true
		default:
			readonly = false
		}
	}
	return readonly
}

func skillTool(ai ActionInput) bool {
	t := normalizedTool(ai)
	return t == "skill" || t == "agent_skill"
}

func modelTool(ai ActionInput) bool {
	t := normalizedTool(ai)
	switch t {
	case "model", "llm":
		return true
	default:
		return strings.HasPrefix(t, "openai.") || strings.HasPrefix(t, "anthropic.") || strings.HasPrefix(t, "google.")
	}
}

func configModify(ai ActionInput) bool {
	line := strings.ToLower(joinCommand(ai))
	if strings.Contains(line, "kubectl apply") ||
		strings.Contains(line, "helm upgrade") ||
		strings.Contains(line, "terraform apply") ||
		strings.Contains(line, "pulumi up") ||
		strings.Contains(line, "pulumi stack") ||
		(commandBase(ai) == "chmod" && strings.Contains(strings.ToLower(joinCommand(ai)), "/etc")) {
		return true
	}
	for _, raw := range append(append([]string{}, ai.ReadPaths...), ai.WritePaths...) {
		p := strings.ToLower(raw)
		for _, suf := range []string{".yaml", ".yml", "values.yaml", ".helm", ".tf", ".hcl"} {
			if strings.Contains(p, suf) || strings.Contains(p, "kubeconfig") {
				return true
			}
		}
	}
	return strings.Contains(line, "git config ")
}

func mcpWrite(ai ActionInput) bool {
	return normalizedTool(ai) == "mcp" && ai.MCPWrite
}

func mcpRead(ai ActionInput) bool {
	if normalizedTool(ai) != "mcp" || ai.MCPWrite {
		return false
	}
	txt := strings.ToLower(ai.MCPToolCategory + " " + commandBase(ai))
	for _, bad := range []string{"mutate", "write", "delete"} {
		if strings.Contains(txt, bad) {
			return false
		}
	}
	return true
}

func applyRules(ai ActionInput) (Classification, []Claim, []string) {
	cl := Classification{
		ActionFamily:              "unset",
		SideEffectLevel:           "none",
		Destructive:               false,
		NetworkRequired:           false,
		ExternalContentDependency: false,
		SecretExposureRisk:        "none",
		WorkspaceEscapeRisk:       "none",
		SupplyChainRisk:           "none",
	}
	var claims []Claim
	seenClaims := map[string]struct{}{}
	var obligations []string

	for _, ar := range defaultRules {
		if !ar.MatchFunc(ai) {
			continue
		}
		r := ar.ClassificationRule
		se := deriveSideEffect(ar, ai)
		cl.ActionFamily = pickFamilyPriority(cl.ActionFamily, r.ActionFamily)
		cl.SideEffectLevel = tierMax(cl.SideEffectLevel, se)
		cl.Destructive = cl.Destructive || r.Destructive || (r.ActionFamily == "vcs_push" && vcsPushForce(ai))
		cl.NetworkRequired = cl.NetworkRequired || r.NetworkRequired
		cl.ExternalContentDependency = cl.ExternalContentDependency || r.ExternalContentDep
		cl.SecretExposureRisk = tierSkipEmpty(cl.SecretExposureRisk, r.SecretExposureRisk)
		cl.WorkspaceEscapeRisk = tierSkipEmpty(cl.WorkspaceEscapeRisk, r.WorkspaceEscapeRisk)
		cl.SupplyChainRisk = tierSkipEmpty(cl.SupplyChainRisk, r.SupplyChainRisk)

		if ar.ClaimCode != "" {
			key := ar.ClaimCode + "|" + ar.ClaimSeverity
			if _, ok := seenClaims[key]; !ok {
				seenClaims[key] = struct{}{}
				claims = append(claims, Claim{
					Code:       ar.ClaimCode,
					Severity:   ar.ClaimSeverity,
					Confidence: ar.ClaimConfidence,
					Evidence:   buildEvidence(ar.evidenceKind, ai),
				})
			}
		}

	outer:
		for _, o := range ar.Obligations {
			o = strings.TrimSpace(o)
			if o == "" {
				continue
			}
			for _, exists := range obligations {
				if exists == o {
					continue outer
				}
			}
			obligations = append(obligations, o)
		}
	}

	if skillTool(ai) {
		switch strings.ToLower(strings.TrimSpace(ai.SkillTrustTier)) {
		case "privileged", "root":
			cl.SupplyChainRisk = tierMax(cl.SupplyChainRisk, "critical")
			cl.SecretExposureRisk = tierMax(cl.SecretExposureRisk, "high")
		case "trusted", "high":
			cl.SupplyChainRisk = tierMax(cl.SupplyChainRisk, "high")
		}
	}

	if modelTool(ai) {
		mp := strings.ToLower(strings.TrimSpace(ai.ModelProvider))
		if mp == "" || mp == "local" || strings.Contains(mp, "ollama") || strings.Contains(mp, "llama.cpp") || strings.Contains(mp, "mlx") {
			cl.NetworkRequired = false
		}
	}

	if cl.ActionFamily == "unset" {
		cl.ActionFamily = "general_unclassified"
	}
	return cl, claims, obligations
}

func classify(input ActionInput) Classification {
	cl, _, _ := applyRules(input)
	return cl
}

func deriveSideEffect(ar airRule, ai ActionInput) string {
	switch ar.ActionFamily {
	case "skill_script":
		switch strings.ToLower(strings.TrimSpace(ai.SkillTrustTier)) {
		case "privileged", "root":
			return tierMax("", "critical")
		case "trusted", "high":
			return tierMax("", "medium")
		default:
			return tierMax("", "low")
		}
	case "model_invoke":
		mp := strings.ToLower(strings.TrimSpace(ai.ModelProvider))
		if mp == "" || mp == "local" || strings.Contains(mp, "ollama") || strings.Contains(mp, "llama") {
			return tierMax("", "low")
		}
		return tierMax("", "medium")
	default:
		if ar.ActionFamily == "vcs_push" && vcsPushForce(ai) {
			return tierMax(ar.SideEffect, "critical")
		}
		return ar.SideEffect
	}
}

func pickFamilyPriority(current string, cand string) string {
	priority := func(name string) int {
		table := map[string]int{
			"unset":                 1,
			"general_unclassified":  2,
			"shell_readonly":        5,
			"mcp_read":              14,
			"shell_workspace_write": 35,
			"network_fetch":         41,
			"package_install":       54,
			"model_invoke":          53,
			"skill_script":          53,
			"config_modify":         54,
			"vcs_push":              72,
			"file_delete":           73,
			"mcp_write":             77,
			"secret_touch":          82,
			"interpreter_handoff":   90,
			"workspace_escape":      93,
			"path_escape":           93,
		}
		if v, ok := table[name]; ok {
			return v
		}
		return 10
	}
	if priority(cand) >= priority(current) {
		return cand
	}
	return current
}

func tierMax(current, cand string) string {
	return mergeTier(strings.ToLower(strings.TrimSpace(current)), strings.ToLower(strings.TrimSpace(cand)))
}

func mergeTier(current, cand string) string {
	steps := map[string]int{
		"":              0,
		"none":          1,
		"unknown":       2,
		"informational": 3,
		"low":           4,
		"medium":        5,
		"high":          6,
		"critical":      7,
	}
	if cand == "" {
		return current
	}
	cv := strings.ToLower(strings.TrimSpace(current))
	nv := strings.ToLower(strings.TrimSpace(cand))
	if steps[nv] > steps[cv] {
		return cand
	}
	return current
}

func tierSkipEmpty(cur, cand string) string {
	if strings.TrimSpace(cand) == "" {
		return cur
	}
	return mergeTier(cur, cand)
}

func buildEvidence(kind string, ai ActionInput) []string {
	switch kind {
	case "network_domains":
		return slices.Clone(ai.NetworkDomains)
	case "paths":
		return appendSlices(ai.ReadPaths, ai.WritePaths)
	case "destructive_targets":
		return appendSlices([]string{joinCommand(ai)}, ai.WritePaths)
	default:
		if line := joinCommand(ai); strings.TrimSpace(line) != "" {
			return []string{line}
		}
	}
	return nil
}

func appendSlices(a, b []string) []string {
	out := slices.Clone(a)
	out = append(out, b...)
	return out
}

// --- thirteen rule constructors ---------------------------------------------

func ruleInterpreterHandoff() airRule {
	return airRule{
		ClassificationRule: ClassificationRule{
			ActionFamily:        "interpreter_handoff",
			MatchFunc:           interpreterTriggered,
			SideEffect:          "high",
			NetworkRequired:     true,
			ExternalContentDep:  true,
			SupplyChainRisk:     "high",
			WorkspaceEscapeRisk: "high",
			SecretExposureRisk:  "medium",
		},
		ClaimCode:       "AIRISK-REMOTE-PIPE",
		ClaimSeverity:   "critical",
		ClaimConfidence: 0.95,
		Obligations:     []string{"require_dual_control_pipeline", "block_arbitrary_execute"},
		evidenceKind:    "cmd",
	}
}

func ruleSecretTouch() airRule {
	return airRule{
		ClassificationRule: ClassificationRule{
			ActionFamily:        "secret_touch",
			SideEffect:          "critical",
			Destructive:         false,
			SecretExposureRisk:  "high",
			SupplyChainRisk:     "medium",
			WorkspaceEscapeRisk: "high",
			MatchFunc:           secretTouch,
		},
		ClaimCode:       "AIRISK-SECRET-TOUCH",
		ClaimSeverity:   "critical",
		ClaimConfidence: 0.9,
		Obligations:     []string{"mask_logs_tokens", "use_ephemeral_secrets_store"},
		evidenceKind:    "paths",
	}
}

func ruleFileDelete() airRule {
	return airRule{
		ClassificationRule: ClassificationRule{
			ActionFamily:        "file_delete",
			SideEffect:          "critical",
			Destructive:         true,
			WorkspaceEscapeRisk: "medium",
			MatchFunc:           fileDelete,
		},
		ClaimCode:       "AIRISK-DESTROY-FILES",
		ClaimSeverity:   "critical",
		ClaimConfidence: 0.93,
		Obligations:     []string{"confirm_path_boundary"},
		evidenceKind:    "destructive_targets",
	}
}

func ruleWorkspaceEscapeSurface() airRule {
	return airRule{
		ClassificationRule: ClassificationRule{
			ActionFamily:        "workspace_escape",
			SideEffect:          "high",
			Destructive:         false,
			WorkspaceEscapeRisk: "high",
			MatchFunc:           workspaceEscape,
		},
		ClaimCode:       "AIRISK-WORKSPACE-ESCAPE",
		ClaimSeverity:   "high",
		ClaimConfidence: 0.91,
		Obligations:     []string{"enforce_chroot_workspace"},
		evidenceKind:    "paths",
	}
}

func ruleVCSPush() airRule {
	return airRule{
		ClassificationRule: ClassificationRule{
			ActionFamily:        "vcs_push",
			SideEffect:          "high",
			NetworkRequired:     true,
			ExternalContentDep:  true,
			SupplyChainRisk:     "medium",
			Destructive:         false,
			WorkspaceEscapeRisk: "",
			MatchFunc:           vcsPush,
		},
		ClaimCode:       "AIRISK-VCS-PUSH",
		ClaimSeverity:   "high",
		ClaimConfidence: 0.82,
		Obligations:     []string{"require_branch_protections_ci"},
		evidenceKind:    "cmd",
	}
}

func rulePackageInstall() airRule {
	return airRule{
		ClassificationRule: ClassificationRule{
			ActionFamily:        "package_install",
			NetworkRequired:     true,
			ExternalContentDep:  true,
			SupplyChainRisk:     "high",
			SideEffect:          "medium",
			Destructive:         false,
			WorkspaceEscapeRisk: "",
			MatchFunc:           packageInstall,
		},
		ClaimCode:       "AIRISK-PACKAGE-FETCH",
		ClaimSeverity:   "medium",
		ClaimConfidence: 0.88,
		Obligations:     []string{"verify_lockfiles"},
		evidenceKind:    "cmd",
	}
}

func ruleNetworkFetch() airRule {
	return airRule{
		ClassificationRule: ClassificationRule{
			ActionFamily:        "network_fetch",
			NetworkRequired:     true,
			ExternalContentDep:  true,
			SideEffect:          "medium",
			SupplyChainRisk:     "medium",
			Destructive:         false,
			WorkspaceEscapeRisk: "",
			MatchFunc:           networkFetch,
		},
		ClaimCode:       "AIRISK-NETWORK",
		ClaimSeverity:   "medium",
		ClaimConfidence: 0.78,
		Obligations:     []string{"apply_egress_allowlist"},
		evidenceKind:    "network_domains",
	}
}

func ruleSkillScript() airRule {
	return airRule{
		ClassificationRule: ClassificationRule{
			ActionFamily:        "skill_script",
			MatchFunc:           skillTool,
			SideEffect:          "",
			NetworkRequired:     false,
			ExternalContentDep:  true,
			SupplyChainRisk:     "medium",
			WorkspaceEscapeRisk: "",
		},
		ClaimCode:       "AIRISK-SKILL",
		ClaimSeverity:   "medium",
		ClaimConfidence: 0.74,
		Obligations:     []string{"sandbox_skill_runtime"},
		evidenceKind:    "cmd",
	}
}

func ruleModelInvoke() airRule {
	return airRule{
		ClassificationRule: ClassificationRule{
			ActionFamily:       "model_invoke",
			MatchFunc:          modelTool,
			SideEffect:         "",
			NetworkRequired:    true,
			ExternalContentDep: true,
			SecretExposureRisk: "medium",
			SupplyChainRisk:    "medium",
		},
		ClaimCode:       "AIRISK-MODEL",
		ClaimSeverity:   "medium",
		ClaimConfidence: 0.8,
		Obligations:     []string{"apply_inference_controls"},
		evidenceKind:    "cmd",
	}
}

func ruleConfigModify() airRule {
	return airRule{
		ClassificationRule: ClassificationRule{
			ActionFamily:        "config_modify",
			SideEffect:          "medium",
			Destructive:         false,
			NetworkRequired:     false,
			SupplyChainRisk:     "low",
			WorkspaceEscapeRisk: "medium",
			MatchFunc:           configModify,
		},
		ClaimCode:       "AIRISK-CONFIG",
		ClaimSeverity:   "medium",
		ClaimConfidence: 0.77,
		Obligations:     []string{"require_infra_review"},
		evidenceKind:    "paths",
	}
}

func ruleMCPWrite() airRule {
	return airRule{
		ClassificationRule: ClassificationRule{
			ActionFamily:        "mcp_write",
			SideEffect:          "high",
			NetworkRequired:     true,
			ExternalContentDep:  true,
			SupplyChainRisk:     "medium",
			WorkspaceEscapeRisk: "medium",
			MatchFunc:           mcpWrite,
		},
		ClaimCode:       "AIRISK-MCP-WRITE",
		ClaimSeverity:   "high",
		ClaimConfidence: 0.92,
		Obligations:     []string{"record_mcp_payloads"},
		evidenceKind:    "cmd",
	}
}

func ruleMCPRead() airRule {
	return airRule{
		ClassificationRule: ClassificationRule{
			ActionFamily:       "mcp_read",
			SideEffect:         "none",
			NetworkRequired:    false,
			ExternalContentDep: false,
			SupplyChainRisk:    "low",
			MatchFunc:          mcpRead,
		},
		ClaimCode:       "AIRISK-MCP-READ",
		ClaimSeverity:   "low",
		ClaimConfidence: 0.66,
		evidenceKind:    "cmd",
	}
}

func ruleShellWorkspaceWrite() airRule {
	return airRule{
		ClassificationRule: ClassificationRule{
			ActionFamily:        "shell_workspace_write",
			SideEffect:          "low",
			Destructive:         false,
			NetworkRequired:     false,
			WorkspaceEscapeRisk: "low",
			MatchFunc:           workspaceWrite,
		},
		ClaimCode:       "AIRISK-SHELL-WRITE",
		ClaimSeverity:   "low",
		ClaimConfidence: 0.7,
		Obligations:     []string{"collect_diffs"},
		evidenceKind:    "cmd",
	}
}

func ruleShellReadonly() airRule {
	return airRule{
		ClassificationRule: ClassificationRule{
			ActionFamily:       "shell_readonly",
			SideEffect:         "none",
			NetworkRequired:    false,
			ExternalContentDep: false,
			MatchFunc:          shellReadonly,
		},
		ClaimCode:       "AIRISK-SHELL-READONLY",
		ClaimSeverity:   "informational",
		ClaimConfidence: 0.63,
		evidenceKind:    "cmd",
	}
}
