# 2026-05-11 TUI Card, Drawer, Tool, Markdown, Hotkey Fix

## 背景

本次修正针对终端正式交互页的五类问题：

- 消息、思考、工具卡片左侧色条过粗，并且卡片顶部出现空行。
- MCP 等 toggle/drawer 面板没有真实搜索输入，背景层级混乱。
- MCP 工具结果直接泄露原始 JSON 和 `\n` 转义文本，长结果被拆成多张碎卡。
- Markdown 的 `**bold**` 和表格没有在终端中正确渲染。
- 底部和隐藏快捷键口径过多，需要收敛到命令交互，保留 `ctrl+r` 展开/收起工具结果。

## 设计依据

- `terminal-ui-design-system` 的终端组件原则：等宽字体、4px 级间距、明确语义色、暖色主色和灰阶背景分层。
- `cli-guidelines-zh` 的 CLI 交互原则：命令入口清晰、输出可读、减少隐式操作。
- `OpenCode TUI` 的信息组织方式：以 `/commands` 作为主入口，工具过程用结构化摘要而不是原始协议数据。
- `tui-studio` 的设计目标：把 TUI 当作组件化界面设计，而不是线性日志输出。

## 修改内容

### 卡片与左侧轨道

- 修改 `packages/cli/src/tui/Timeline.tsx`：
  - `MessageCard`、`ToolCard`、`ActivityPanel` 的左轨从 2 列改为 1 列真实背景色块。
  - 移除卡片内部 `paddingY={1}`，避免首行空白。
  - 工具、思考、错误和用户消息都保持统一的灰色块背景与细左轨。
- 修改 `packages/cli/src/tui/InputArea.tsx`：
  - 输入框左侧不再用两个字符模拟色条，改为完整高度的 1 列背景色块。
  - 去掉输入框上下空白，避免左线只覆盖局部。

### 工具调用展示

- 修改 `packages/cli/src/tui/timeline-lines.ts`：
  - 工具调用和工具结果不再预先按文本宽度拆成多条 timeline line。
  - 一条工具事件只生成一张工具卡，由卡片内部负责摘要、折叠和预览。
- 修改 `packages/cli/src/tui/Timeline.tsx`：
  - 工具卡第一行展示状态、功能区和方法名。
  - 第二行展示目标对象，例如 path、file、url、cwd、command。
  - 第三块展示清洗后的结果预览。
  - 对 MCP `content[].text`、`structuredContent`、转义 JSON 字符串进行解析，尽量转成目录项、路径、命令、错误等摘要。
  - `\n` 转义会被还原为真实换行，不再作为文本堆在屏幕上。
  - `ctrl+r` 控制工具结果预览展开/收起。
- 修改 `packages/cli/src/tui/hooks/useChat.ts`：
  - 工具结果预览不再把所有 whitespace 压成一行，保留结构供 TUI 解析。

### Markdown 渲染

- 重写 `packages/cli/src/tui/md-render.tsx`：
  - 使用 Ink React 组件直接渲染 `**bold**`、`__bold__`、inline code、heading、blockquote、list。
  - Markdown 表格会转换为带边框的终端表格。
  - 不再依赖 ANSI 字符串塞进 `<Text>`，避免样式被普通文本吞掉。

### Drawer 与搜索

- 修改 `packages/cli/src/tui/App.tsx` 和 `packages/cli/src/tui/ContextDrawer.tsx`：
  - Drawer 增加 `query` 状态。
  - Drawer 打开后，普通输入进入搜索框，Backspace 删除搜索文本。
  - MCP、Context、Skills、Tasks、Agents、Memory、Trace、Sessions 均支持当前面板内过滤。
  - Drawer 行样式改为统一灰色背景块和 1 列左轨。
  - 移除 `toggle space` 等残留提示。

### 鼠标和快捷键口径

- 修改 `packages/cli/src/tui/App.tsx`、`packages/cli/src/tui/ProviderSetup.tsx`：
  - 鼠标 CSI/SGR 序列无论是否启用鼠标模式，都先经过 decoder 消费，避免碎片进入输入框或搜索框。
- 修改 `packages/cli/src/tui/key-handler.ts`：
  - 移除 Ctrl+O、Ctrl+T、Ctrl+B 和 leader chord 入口。
  - 保留 Ctrl+C 退出、PgUp/PgDn 滚动、基础编辑键，以及 `ctrl+r` 工具结果展开。
- 修改 `packages/cli/src/tui/HotkeyBar.tsx`、`packages/cli/src/tui/HomeScreen.tsx`：
  - 底部提示收敛为 `/ commands` 和 `ctrl+r tool details`。
  - MCP、Sessions、Config 等面板通过 `/mcp`、`/sessions`、`/config` 等命令进入。

### 配色

- 修改 `packages/cli/src/tui/theme.ts`：
  - 默认 `kirakira` 主题改为更低饱和的 Morandi 灰粉/灰褐暗色系统。
  - 背景不再接近纯黑，卡片块使用更明显的浅灰背景层级。
  - 工具、思考、成功、警告、错误等功能色统一降饱和。

## 验证

- `pnpm.cmd --filter @kirakira/cli typecheck`：通过。
- `pnpm.cmd vitest run test\tui\mouse.test.ts test\unit\cli\tui\key-handler.test.ts`：13 个测试通过。
- `pnpm.cmd --filter @kirakira/cli build`：通过。
- `pnpm.cmd start -- --help`：CLI help 正常输出。该命令仍会触发 Docker runtime image build，属于启动脚本/镜像缓存链路问题，本次未改动。

## 注意事项

- 本次没有修改 MCP 协议执行逻辑，只改 TUI 展示和输入事件处理。
- 工具结果摘要是尽力解析：若第三方 MCP 返回非标准文本，仍会退回文本预览，但不会再按单行碎卡方式拆屏。
