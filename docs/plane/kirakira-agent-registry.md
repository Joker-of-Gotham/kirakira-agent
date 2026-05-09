# kirakira-agent 管理面完整落地方案

## 设计边界与总原则

本方案只覆盖 kirakira-agent 的五个“管理面”组件：Private Package Registry、MCP Gateway / Adapter Layer、Workspace Config、Skills Registry、Model Gateway；不讨论编排内核、subagent 生成策略和后端运行时。结论先行：这五部分不应被设计成“各自独立的配置堆”，而应组成一个统一的企业级管理平面，目标是同时做到三件事：对外兼容主流开放标准，对内满足企业治理和审计要求，对用户保持一条命令即可安装、启用、升级与回滚。这个方向与 Codex、Claude Code、Copilot CLI、Gemini CLI、Cursor 等头部产品的共同趋势一致：都在加强 MCP、分层配置、技能包、会话内快捷控制与企业策略治理。citeturn9view1turn16search5turn22view0turn25view1turn26view0turn20view0

开放标准已经足够清晰，不需要 kirakira-agent 再发明一套封闭协议。MCP 规范明确要求实现基础协议和生命周期管理，并把工具、资源、提示词作为服务端核心能力；当前标准传输是 stdio 与 Streamable HTTP，且客户端应尽可能支持 stdio。Agent Skills 规范则已经把技能定义为包含 `SKILL.md` 的目录，采用 progressive disclosure：启动时只加载 `name` 和 `description`，激活时再加载正文与 supporting files。citeturn0search7turn15search18turn15search6turn0search5turn0search8turn0search14

从生态成熟度看，管理面设计也不该再假设“自建一切”。entity["company","GitHub","developer platform"] 主题页已经显示，`mcp-tools`、`agent-skills`、`agents` 等主题下存在大规模社区与官方项目；代表性项目包括 MiniMax-MCP、anthropics/skills、openai/skills、VoltAgent/awesome-agent-skills、LangChain MCP Adapters、FastMCP。这说明 kirakira-agent 最应该做的不是再造生态，而是做“兼容层 + 安装层 + 治理层 + 供应链安全层”。citeturn1search0turn1search1turn13search2turn13search3turn13search22turn13search0turn14search8

最新工具使用研究也支持这一判断。MCPToolBench++ 报告指出，真实 MCP 工具数量、工具描述长度、响应格式差异和上下文窗口限制，都会直接影响模型调用效果；MCP-Bench 强调多步、多工具协同和参数精确控制是现实难点；而函数调用鲁棒性研究进一步表明，当工具集扩张并出现语义相近工具时，模型稳定性会明显下降。因而，kirakira-agent 的管理面必须内建“工具搜索、延迟加载、模式归一化、权限约束与可观测性”，而不是把所有工具和技能一次性塞给模型。citeturn12search0turn12search3turn12search11turn23view2

## Private Package Registry

Private Package Registry 的核心职责不是“存包”，而是给 kirakira-agent 提供**单命令安装入口、统一命名空间、企业可控的软件供应链**。从现有官方能力看，最稳妥的注册表拓扑不是单一仓库，而是三层结构：内部托管仓库、上游代理仓库、聚合虚拟入口。entity["organization","PyPA","python packaging authority"] 文档明确提到私有索引、镜像、缓存与带 fall-through 的代理模式，甚至直接把这种代理模式列为缓解 dependency confusion 的手段；entity["company","Sonatype","repository software vendor"] Nexus 原生支持 hosted、proxy、group 三类仓库；entity["company","Google","technology company"] Artifact Registry 支持 remote 与 virtual repository，并覆盖 npm、Python、Docker/OCI 等多种格式。对于 kirakira-agent 来说，这意味着私有源完全可以做成一个像 `npm` 一样的统一入口，但背后仍保留 hosted/proxy/virtual 的企业控制面。citeturn33search10turn4search3turn4search7turn4search10turn4search18turn4search2

在包形态上，建议把 registry 里的可安装对象分为三类。第一类是**原生语言包**：Python wheel / sdist 与 npm tarball，用于发布真正的客户端插件、CLI helper、MCP server 启动器、校验器和构建工具，这直接复用 pip 与 npm 生态。第二类是**技能包**：本质上是 `SKILL.md` 目录树，可以由 registry 以 zip/tar/OCI artifact 发布，但安装到本地后仍还原为标准目录结构。第三类是**MCP 发行包**：既可以是启动某个 stdio server 的语言包，也可以是只包含 manifest、OAuth 元数据、图标、policy hints 和 installer hook 的“薄包”。这种拆分能把“如何执行”与“如何分发”解耦。citeturn4search13turn4search9turn4search12turn31search0turn31search1turn31search15

建议把 OCI artifact 作为大体积、多文件、跨语言 bundle 的标准二进制分发格式，而不是把所有东西都硬塞进 PyPI 或 npm。原因有三点：其一，entity["organization","Open Container Initiative","container standards org"] Distribution Spec 已经把 OCI registry 变成厂商中立的分发协议；其二，ORAS 官方文档明确支持把任意文件和自定义 media type 推送、拉取为 OCI artifact；其三，OCI referrers 已经被用来承载签名、SBOM 和 attestation。对于技能包、MCP 描述包、离线模板集、模型路由快照这类对象，OCI 比传统语言注册表更自然。citeturn31search0turn31search1turn31search5turn32search10turn32search4

供应链安全必须成为 registry 的一等能力，而不是补丁。npm 官方已经支持 provenance statement 与 trusted publishing；PyPI 侧的 Simple Repository API 现在支持 `data-provenance`，并且索引托管 attestation 已经被标准化；Sigstore/Cosign 官方则已经把签名、attestation 与 OCI registry 串起来。基于这些现成能力，kirakira-agent 的 registry 至少应该强制做四件事：保留内部命名空间保留策略；生成 lockfile；支持 provenance 验证；支持隔离/下线状态，例如 quarantined、yanked、archived。这样做不是锦上添花，而是企业内部允许“从 GitHub 安装外部 skill/MCP 后直接使用”的最低安全前提。entity["organization","Sigstore","software supply chain org"] 的相关规范已经足够成熟，不需要 kirakira-agent 自建签名体系。citeturn4search0turn4search8turn4search20turn33search3turn33search1turn33search4turn32search10turn32search0

落地上，建议 registry 对外只暴露一个统一安装命令，例如 `kirakira install <package>`，但解析时走“源类型解析器”。如果包是 Python/npm，则走包管理器；如果是 OCI，则走 ORAS/registry 客户端；如果是 GitHub/Git，则先拉 manifest 再转入本地 cache；安装结束后统一写入本地 lock/state。用户只看到一个命令，运维只治理一个入口，这才是企业内部“像 npm 一样一键安装”的真正含义。这个结论是对现有注册表能力的工程化组合，而不是另起炉灶。citeturn4search1turn4search3turn4search18turn31search1turn31search11

## MCP Gateway 与 Adapter Layer

MCP Gateway 的定位不是“再包一层代理”，而是 kirakira-agent 的**协议归一化、认证中介、权限裁决、可观测性与兼容性中枢**。因为现实世界里，并不存在一个完全同质的 MCP 生态：官方 MCP 规范目前强调 stdio 与 Streamable HTTP；Claude Code 已明确推荐远程场景优先 HTTP，并把 SSE 定义为 deprecated；Cursor 同时支持 stdio、SSE 与 Streamable HTTP；Codex 则支持 stdio 和 Streamable HTTP，并对 Bearer/OAuth 做了专门支持。kirakira-agent 若想“外部 MCP 即插即用”，就必须在网关内吸收这种差异。citeturn15search18turn22view0turn20view1turn16search5

因此，Gateway 最好拆成六个稳定子层。第一层是 **transport adapter**，负责 stdio、HTTP 与遗留 SSE；第二层是 **auth adapter**，负责 Bearer、OAuth、静态头、OIDC、环境变量注入；第三层是 **capability normalizer**，把 tools/resources/prompts/roots/elicitations/apps 统一成 kirakira-agent 内部模型；第四层是 **policy filter**，用于 tool allow/deny、domain allowlist、output token cap、只读/可写分类；第五层是 **search and index layer**，用于只在需要时把工具 schema 暴露给模型；第六层是 **audit and cache layer**，记录 server fingerprint、版本、连接状态、最近工具清单和认证状态。这样的拆法与 Claude Code 的 managed MCP、Tool Search、resources/prompts 命令映射，以及 Copilot/Cursor/Codex 的分层信任与会话内追加配置能力高度一致。citeturn23view2turn23view3turn25view0turn25view4turn20view0turn16search5

兼容性层面，kirakira-agent 不应要求外部 MCP 迁移到私有格式。最低要求应是：能读标准 `.mcp.json`；能导入 Cursor 的 `mcp.json`；能理解 Claude Code 的 `.mcp.json` 与 managed-mcp 控制方式；能读取 Codex 的 `[mcp_servers.<name>]` 配置；能兼容 Copilot CLI 的 `~/.copilot/mcp-config.json` 与单次会话 `--additional-mcp-config` 机制。注意这里的重点不是“语法逐字兼容”，而是**导入、规范化、保留原始来源和可回写能力**。一旦导入，kirakira-agent 内部应统一成自己的 normalized manifest，但始终保留外部源文件引用与只读/托管标记。citeturn20view1turn22view0turn25view0turn30search13turn30search3

MCP 的用户交互也应该直接对齐头部 CLI，而不是自己发明一套新手势。Cursor 文档说明 CLI 中 `agent mcp list`、`list-tools`、`login`、`enable`、`disable` 已经形成一套完整操作面；Claude Code 在会话内通过 `/mcp` 管理服务状态，并支持把 resources 暴露到 `@` 补全、把 prompts 映射为 `/mcp__server__prompt`；Copilot 和 Codex 也都把 `/mcp` 作为内联管理入口。kirakira-agent 因此应把 MCP 交互拆成两类：**外部命令面**负责安装、导入、登录、信任、禁用、删除；**会话内交互面**负责 `/mcp` 状态、`@server:protocol://...` 资源引用和 prompt-to-slash 的快速执行。citeturn20view0turn23view0turn23view1turn25view1turn16search2

安全上，MCP Gateway 必须坚持“默认不信任”的运行原则。Claude Code 明确提醒第三方 MCP server 可能带来 prompt injection 风险；Cursor 明确要求审查源、权限与 API key 范围；Copilot 把 remote server 视为低信任来源，并提供 enterprise allowlist；Claude Code 和 Copilot 都支持组织级 allowlist/denylist 或 managed 配置。基于这些共同趋势，kirakira-agent 应至少实现 fingerprint、首次启用审批、远程来源自动低信任、命令/URL allowlist、只读/读写工具分级、断线隔离与 crash containment。只要这些没有到位，“即插即用 MCP”在企业环境里就不可交付。citeturn22view0turn20view1turn25view4turn23view3

最后，Gateway 默认启用“工具搜索 + 延迟 schema 注入”是必要设计，不是优化项。Claude Code 已经把 Tool Search 设为默认，用来避免在 session start 阶段把所有工具上下文塞进模型；而 MCP 工具基准和函数调用鲁棒性研究也已经表明，工具变多、工具相似和描述过长会显著拖累效果。kirakira-agent 因此不应把所有 MCP tools 一次性暴露给模型，而应先暴露 server-level summary、在任务触发时做 tool search，再按需加载 schema。citeturn23view2turn12search0turn12search11turn12search3

## Workspace Config

kirakira-agent 的配置层必须把“兼容格式”和“治理格式”分离，否则最终一定会变成难以维护的混合状态。建议明确三份主文件的职责：`agent.toml` 是 kirakira-agent 的原生控制文件，负责 workspace、registries、models、skills、defaults、telemetry 与 feature flags；`policy.yaml` 专管审批、网络、数据域、命令约束、预算与信任策略；`.mcp.json` 则只承担 MCP 互操作职责，尽量贴近行业主流格式，不承载 kirakira-agent 私有治理逻辑。这个分工方式与 Codex 的 `config.toml`、Claude Code 的 `.mcp.json` 与 managed-mcp、Cursor 的 `mcp.json`、Copilot 的 settings/mcp-config 分离模式是一致的。citeturn30search0turn30search3turn22view0turn20view1turn25view3

分层加载顺序也应做成行业通用的四层：**system managed → user → repo root → nested workspace**。Codex 会加载 `~/.codex/config.toml` 和项目内 `.codex/config.toml`，并沿目录向下叠加；Cursor 明确采用 project→global→nested 的发现模式；Claude Code 有 local / project / user scope 以及 managed-mcp.json；Copilot 则区分 user、workspace、repository 与 enterprise allowlist。kirakira-agent 直接采用同类顺序，用户迁移成本最低，也最容易向企业策略文件做 fail-closed 覆盖。citeturn30search7turn20view0turn22view0turn25view4

基于这个分层，`agent.toml` 不应该是“什么都能写”的大杂烩，而应只保留稳定且跨模块的归一化配置。建议至少包含这几组语义：workspace trust 与 profile 选择；registry 与 install source 优先级；skills 扫描根目录与缓存策略；MCP 管理设置与默认搜索模式；model provider 列表与 default model set；telemetry/exporter；以及引用 `policy.yaml` 的路径。这样做的价值在于：MCP、skill、model 三个子系统都能被一个统一配置面驱动，而不会把企业 policy、互操作清单和运行时状态混在一起。citeturn30search0turn30search3turn30search7turn26view1

`policy.yaml` 应被视为“人类审阅文件”，而不是实现细节文件。因为审批、allowlist、数据域和预算约束天然适合 YAML：差异可读、便于 code review、便于 RBAC/OPA 等后续接入。建议它专门表达：允许的 registry 源；允许的 MCP server 指纹/URL/命令模板；允许的 shell 前缀；允许的模型集合与预算上限；远程网络域名规则；对敏感数据类型的 redaction/prompt logging 禁止项；是否允许写文件、运行脚本、访问浏览器、发起外部 HTTP。Azure AI gateway、Copilot enterprise allowlist 与 Codex managed configuration 的共同经验，就是治理规则必须独立于开发者偏好，否则迟早会被配置覆盖掉。citeturn35view1turn25view4turn30search2turn30search12

`.mcp.json` 的角色则应该非常克制：它是互操作层，不是控制中心。Cursor、Claude Code 和 Copilot 都把 MCP 配置看作单独文件；Cursor 还支持变量插值，Claude Code 支持 OAuth、scope 和 managed policy，Copilot 支持 session-only extra config。kirakira-agent 最好把 `.mcp.json` 保持成“可导入、可导出、可映射”的兼容文件，并在生成时自动回填必要字段，但不要把 registry、skills、model routing 之类非 MCP 语义塞进去。否则一旦用户要与其他 CLI 共享，它立刻就失去可移植性。citeturn20view1turn22view0turn25view0

除了三份主文件，还应有三类生成物：lockfile、resolved state、cache。lockfile 记录安装来源、版本、digest、签名状态与 trust bit；resolved state 记录当前生效的多层合并结果与指纹；cache 则存放下载的 bundle、MCP schema 快照与技能索引。这样既能做可重复环境，又不会把需要更新的中间态写回主配置。这个建议与现代包管理器和顶级 CLI 的配置演进方向一致，也是把“可配置”变成“可审计、可回滚”的必要条件。citeturn30search5turn4search1turn31search5

## Skills Registry

Skills Registry 的首要原则是：**把 `SKILL.md` 目录视为唯一标准技能单元，不额外发明私有主格式**。Agent Skills 规范、Claude Code 与 Codex 都已经收敛到同一个核心模型：技能是一个目录，必须有 `SKILL.md`，可以带 scripts、references、assets，发现阶段只读 metadata，真正使用时才展开正文和 supporting files。Claude Code 还进一步把 supporting files 与自动加载规则说得很清楚，Codex 同样强调 explicit invocation 与 implicit invocation 双路径。这意味着 kirakira-agent 做 registry 时，最该保护的是“生态兼容性”，而不是“自家 YAML 统一感”。citeturn0search5turn0search11turn23view5turn16search1turn13search18

从目录兼容性看，kirakira-agent 至少应原生支持两类本地技能根目录：Claude 风格的 `~/.claude/skills` 与 `.claude/skills`，以及 Codex 风格的 `$HOME/.agents/skills` 与 `.agents/skills`。对任何包含 `SKILL.md` 的目录，kirakira-agent 都应能直接 mount 进本地 skill index，而不是要求用户“重新发布到 kirakira 专用 registry 后才能使用”。这才符合用户“从 GitHub 或其他地方下载到本地后即可插拔”的要求。citeturn23view5turn30search9turn16search1

Registry 本身的职责应是四层：**发现、索引、分发、信任**。发现负责扫描 configured roots、本地路径、Git checkout 和 registry 安装目录；索引负责解析 frontmatter、抽取 `name`/`description`/allowed-tools/size/hash/脚本清单；分发负责从内部 registry、GitHub、压缩包、OCI、PyPI/npm wrapper 安装 bundle；信任负责判断该 skill 是否为 instruction-only、是否带可执行脚本、是否需要额外权限。Anthropic 官方技能 API 甚至把 skill execution 直接绑定到 code execution 容器，这本身就说明“脚本型 skill 不是纯提示词资产，而是要按可执行工件治理”。citeturn10search5turn11search7turn16search1turn23view5

触发机制上，kirakira-agent 应采用 progressive disclosure，而不是预加载所有 skill 内容。启动时只建立 catalog；用户通过 `$skill`、`/skills` 或自然语言触发时，再加载 `SKILL.md`；只有在正文明确引用 supporting files 或 scripts 时，才继续读取 reference 或执行脚本。这既符合 Agent Skills 规范，也与 Codex 和 Claude Code 的实际行为一致。对于大量金融图谱技能尤其重要，因为很多技能会附带行业 schema、SQL 模板、抽取规则和时序研究模版，如果一开始全部塞进上下文，模型的有效工作空间会被严重挤压。citeturn0search8turn16search1turn23view5

安全策略上，kirakira-agent 应把 skill 分成三档。**instruction-only skill** 可以默认 discover，但首次启用仍应展示来源；**带 scripts/ 的 skill** 必须默认 untrusted，并在首次执行前展示脚本路径、解释器、hash、请求的工具权限；**带外部依赖或需要写操作的 skill** 必须进入 policy 审批流。Claude Code 的 skill frontmatter 已支持 `allowed-tools` 一类的边界控制，Copilot/Codex 也都把技能与工具权限和自定义 agent 配置联动。kirakira-agent 最好把这些元数据内化为 `skill.lock` 与 registry side metadata，而不是在运行时重新猜测。citeturn23view5turn24view0turn30search4

Registry 的发布方式建议“内容标准不变，分发形式多样”。也就是说：无论 skill 来自 GitHub 仓库、zip、内部 npm/PyPI wrapper，还是 OCI artifact，解包落地后都还是标准 `SKILL.md` 目录树；registry 只负责把来源、版本、签名、digest 和 trust 状态写入本地 catalog。这样一来，kirakira-agent 与外部技能生态之间只有“安装方式”的差异，没有“内容格式”的断层。citeturn13search22turn13search2turn13search3turn31search1

## Model Gateway

Model Gateway 不应被理解成“换个 base URL”，而应定义为 kirakira-agent 的**能力抽象层、路由层、参数翻译层、预算层与审计层**。现实中，OpenAI、Anthropic、Azure Foundry、本地 vLLM、Ollama 虽然都能提供“像 OpenAI 一样”的接口，但它们在工具调用、结构化输出、批处理、上下文管理、延迟语义、授权方式和返回字段上并不完全一致。如果不显式做一层 capability registry，后续所有技能、MCP 调用与并行任务都会把 provider 差异泄漏到上层。citeturn9view1turn10search2turn35view0turn27search0turn27search1

对 entity["company","OpenAI","ai company"] 路径，建议把 Responses API 作为默认一等集成，而不是继续围绕 Chat Completions 构建新功能。官方文档已经明确写出：Responses 是新的 API primitive，推荐用于所有新项目，并且原生包含 built-in tools、remote MCP、stateful chaining 与更好的 tool usage；Structured Outputs 也明确推荐优先于旧式 JSON mode。对 kirakira-agent 来说，这意味着 OpenAI provider 的 canonical abstraction 应该是“agentic responses + typed items + structured output”，而不是“补丁式 function calling”。citeturn9view1turn9view3

对 entity["company","Anthropic","ai company"] 路径，建议把 Messages API 作为基础协议，把 Batches API 作为大规模异步评测/离线分析通道，把 Skills 视为远程执行能力而不是本地文件功能。Anthropic 文档已明确区分 Messages API 与 Managed Agents；Batches 适合高吞吐、成本优化场景，官方给出的表述是大多数批处理一小时内完成且成本降低 50%；同时 Anthropic Skills 依赖 code execution 容器并可与自定义 skills 混用。这对 kirakira-agent 的意义是：Model Gateway 要保留 “interactive run”和“async batch run” 两条通道，且不能把 provider-specific 的 code execution/container 语义简单抹平。citeturn10search2turn10search0turn10search5

对 entity["company","Microsoft","technology company"] Azure 路径，建议把 Foundry 与 AI gateway 分开看。Foundry model catalog 负责模型来源和部署类型，包含 Azure OpenAI 与部分其他顶级提供方；model router 允许把多个模型挂在一个 deployment 名下，并可路由到 subset；Azure API Management 的 AI gateway 则负责认证、负载均衡、配额、日志、MCP/A2A 治理与多后端统一接入。也就是说，若企业本来就在 Azure 体系里，kirakira-agent 不应重复实现“所有”网关能力，而应把 Azure gateway 视为可挂接上游，把自己保留为本地配置、能力矩阵和 CLI 运行语义层。citeturn35view2turn35view0turn35view1turn35view3

本地模型路径则应该明确支持两种主要落地：vLLM 与 Ollama。vLLM 官方明确提供 OpenAI-compatible server，可用官方 OpenAI client 直接调用；Ollama 官方则同时提供 OpenAI compatibility 和 Anthropic compatibility。对于 kirakira-agent，这两个后端的意义不同：vLLM 更适合统一接入自管 GPU 集群与 OpenAI-compatible 工具生态，Ollama 更适合开发者本机与轻量边缘部署。因此 Model Gateway 不应把“local”简化成单一 provider，而应做成 `local/vllm/...` 与 `local/ollama/...` 两个明确 provider family。citeturn27search0turn27search24turn27search1turn27search16

如果企业希望再上一层做多提供方转发与成本治理，外接 LiteLLM 或 Azure AI gateway 是合理选择。LiteLLM 官方文档已经把自己定位为 self-hosted LLM gateway / proxy，提供统一 OpenAI 输入输出格式、router、retry/fallback、virtual keys、spend tracking 与多项目预算；而 Azure AI gateway 则提供企业级 token 配额、监控和 A2A/MCP 治理能力。kirakira-agent 的 Model Gateway 因此更适合作为“本地语义网关”：负责 provider capability normalization、参数翻译、model alias、session stickiness、fallback policy、成本归属与 trace correlation；是否再向外接 LiteLLM/Azure 则作为 deployment profile 选择。citeturn28search2turn28search4turn28search6turn28search8turn28search14turn35view1

最终建议是，Model Gateway 内部维护一份**能力注册表**，而不是只维护一张“模型名到 URL”的映射。至少应记录：是否支持 MCP/函数调用、结构化输出、批处理、视觉、长上下文、reasoning controls、tool search、server-side memory、streaming、price class、latency class、max context、budget policy、data residency、approval requirements。只有这样，skills 选择、MCP 策略和未来的并发 worker 才能根据“能力”而不是“品牌名”编排。OpenAI 的 MultiProvider、Azure model router 和 Claude 的多模型能力差异，实际上都在说明同一个事实：模型路由必须是 capability-aware，而不是 string-based。citeturn3search15turn35view0turn10search2turn9view1

## 落地顺序与开放问题

建议按照“先兼容、后治理、再优化”的三阶段完整构建所有代码。首先做`agent.toml`、`.mcp.json` 兼容读写、`SKILL.md` 本地发现、OpenAI/Anthropic/Azure/Ollama/vLLM provider 抽象、内部 registry install/uninstall/lock。然后完成企业治理，包括managed policy、registry provenance verification、MCP allowlist/denylist、skill trust、预算与 observability。进一步落地体验增强：tool search、prompt-to-slash、resource autocomplete、跨 registry 搜索、版本回滚与策略分组。这个顺序能保证 kirakira-agent 先“可用”，再“可控”，最后“可扩展”。

同时有三点需要明确。第一，兼容 OCI + Git + zip多路径完整实现，保证足够的兼容性；第二，Model Gateway 要内建完整的成本网关能力，如果涉及到外包给 LiteLLM / Azure AI gateway、对应路径也需要做完整构建，且明确运维路径与个各径边界；第三，`.mcp.json` 与 `agent.toml` 的双写策略可采用“原文件保留 + resolved snapshot”，保证足够充分的可读性和审计性。并保证遵循**标准内容格式不改、统一安装入口、治理能力外提、运行语义内收**的设计原则。