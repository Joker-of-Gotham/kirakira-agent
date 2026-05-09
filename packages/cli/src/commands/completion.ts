import { Command, Args } from "@oclif/core";

export default class Completion extends Command {
  static override description = "Generate shell completion scripts";

  static override args = {
    shell: Args.string({
      description: "Shell type",
      options: ["bash", "zsh", "fish", "powershell"],
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(Completion);
    switch (args.shell) {
      case "bash":
        this.log(generateBashCompletion());
        break;
      case "zsh":
        this.log(generateZshCompletion());
        break;
      case "fish":
        this.log(generateFishCompletion());
        break;
      case "powershell":
        this.log(generatePowershellCompletion());
        break;
    }
  }
}

function generateBashCompletion(): string {
  return `# kirakira-agent bash completion
_kirakira_agent() {
  local cur prev commands
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="init exec login logout config session skill mcp plugin registry trace eval doctor completion self-update"
  COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
}
complete -F _kirakira_agent kirakira-agent`;
}

function generateZshCompletion(): string {
  return `#compdef kirakira-agent
_kirakira_agent() {
  local -a commands
  commands=(
    'init:Initialize workspace'
    'exec:Non-interactive execution'
    'login:Authenticate'
    'logout:Remove credentials'
    'config:Manage configuration'
    'session:Session management'
    'skill:Skill management'
    'mcp:MCP management'
    'plugin:Plugin management'
    'registry:Registry interaction'
    'trace:Trace and audit'
    'eval:Run evaluations'
    'doctor:Environment health check'
    'completion:Generate shell completion'
    'self-update:Update CLI'
  )
  _describe 'command' commands
}
_kirakira_agent`;
}

function generateFishCompletion(): string {
  return `# kirakira-agent fish completion
complete -c kirakira-agent -n '__fish_use_subcommand' -a 'init exec login logout config session skill mcp plugin registry trace eval doctor completion self-update'`;
}

function generatePowershellCompletion(): string {
  return `# kirakira-agent PowerShell completion
Register-ArgumentCompleter -CommandName kirakira-agent -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $commands = @('init','exec','login','logout','config','session','skill','mcp','plugin','registry','trace','eval','doctor','completion','self-update')
  $commands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
}`;
}
