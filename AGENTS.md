# Agent Guide

本文档是后续 Agent 介入 `pi-hunk-review` 项目时的入口说明。

## 项目目标

`pi-hunk-review` 是连接 Pi 与实时 Hunk diff review 会话的 Pi 扩展。

扩展本身不执行代码审查，也不直接生成 review 结论。它负责：

1. 加载 Hunk 自带的 `hunk-review` Skill。
2. 确认当前仓库存在对应的实时 Hunk 会话。
3. 构建受约束的 review 或 fix 提示词。
4. 通过 `pi.sendUserMessage()` 启动或排队一个 Pi Agent 任务。
5. 由 Agent 根据 Hunk Skill 调用 `hunk session ...` 命令读取 diff、添加评论或处理评论。

Pi 与 Hunk 应保持在两个独立终端中运行。

## 项目结构

- `src/index.ts`：扩展入口；发现 Hunk Skill、探测会话、注册命令、更新 UI 状态、派发 Agent 任务。
- `src/prompts.ts`：构建 review/fix 提示词，解析语言代码及额外命令参数。
- `test/index.test.ts`：使用模拟 Pi API/Context 测试扩展行为。
- `test/prompts.test.ts`：测试提示词及参数解析。
- `README.md`：安装与用户使用说明。
- `package.json`：Pi 扩展声明、依赖及验证命令。

不要依赖 `.pi-subagents/` 中的内容；它是被忽略的本地 Agent 运行产物，不是产品源码。

## Review 完整流程

### 1. 加载 Hunk Skill

Pi 触发 `resources_discover` 时，`discoverHunkSkill()` 执行：

```bash
${HUNK_BIN:-hunk} skill path
```

扩展检查返回路径是否存在，然后通过 `skillPaths` 将该 Skill 提供给 Pi。

安装在本机的 Hunk Skill 是 `hunk session` 命令、参数和 payload 格式的事实来源。如果修改 Hunk CLI 集成，应先运行：

```bash
hunk skill path
```

然后完整阅读返回的 `SKILL.md`，不要依赖旧版本命令假设。

如果 Hunk 不存在或 Skill 路径不可读，资源发现会返回空结果，而不是阻止 Pi 启动。

### 2. 探测实时会话

`probeHunkSession()` 执行等价命令：

```bash
hunk session get --repo <absolute-cwd> --json
```

结果分为：

- `connected`
- `missing`
- `no-session`
- `error`

`/hunk-review` 和 `/hunk-fix` 在派发 Agent 任务前必须通过此检查。如果没有会话，用户需在另一个终端运行：

```bash
hunk diff --watch
```

### 3. 将任务派发给 Pi Agent

命令处理器使用 `buildReviewPrompt()` 或 `buildFixPrompt()` 构建提示词，然后调用 `sendAgentTask()`：

- Pi 空闲：`pi.sendUserMessage(prompt)`，立即开始任务。
- Pi 忙碌：`pi.sendUserMessage(prompt, { deliverAs: "followUp" })`，排队为后续任务。

这里是重要边界：Slash Command 只负责任务编排，review 推理发生在后续普通 Pi Agent turn 中，而不是命令 handler 内部。

### 4. Agent 读取 diff

被派发的 Agent 根据已加载的 `hunk-review` Skill，通常先执行：

```bash
hunk session review --repo . --json
```

先读取紧凑的文件和 hunk 结构，仅在判断具体问题需要时再执行：

```bash
hunk session review --repo . --include-patch --json
```

Agent 也可以使用 Pi 的正常读取、搜索工具检查仓库代码。

执行 `/hunk-review` 时不得修改项目文件。只报告具体的正确性、回归、安全性或可维护性问题，不应为纯主观代码风格添加评论。

### 5. 将 Review 评论发送到 Hunk

评论通过 Hunk CLI 写入实时会话，本项目没有自行实现 HTTP 评论接口。

单条评论示例：

```bash
hunk session comment add \
  --repo . \
  --file src/example.ts \
  --new-line 42 \
  --summary "简短的问题摘要" \
  --rationale "问题影响和可执行的修改建议"
```

存在多条评论时，应优先使用一次批量提交：

```bash
printf '%s\n' '{"comments":[{"filePath":"src/example.ts","newLine":42,"summary":"简短的问题摘要","rationale":"问题影响和修改建议"}]}' \
  | hunk session comment apply --repo . --stdin
```

每个批量评论项目需要：

- `filePath`
- `summary`
- Hunk Skill 支持的一个且仅一个定位字段，例如 `newLine`、`oldLine`、`hunk` 或 `hunkNumber`
- 可选的 `rationale`

行号必须对应 diff 的正确一侧。`comment apply` 会先验证整个批次，再修改实时会话。

### 6. 处理 Review 评论

`/hunk-fix` 要求 Agent：

1. 列出用户和 Agent 的现有 Hunk 评论。
2. 检查相关代码和上下文。
3. 只应用正确且范围明确的修复。
4. 使用 Pi 的正常编辑工具修改文件。
5. 运行聚焦的测试或检查。
6. 报告未处理评论及原因。

错误、过期或需要产品/架构决策的评论不能盲目执行。扩展不会自动删除或清空 Hunk 评论。

## Slash Commands

- `/hunk-status`：检查当前仓库是否连接到实时 Hunk 会话。
- `/hunk-review [language-code] [instructions]`：审查实时 diff，并添加有价值的行内 Agent 评论。
- `/hunk-fix [language-code] [instructions]`：读取评论、修改代码并验证修复。

如果参数的第一个 token 是 `src/prompts.ts` 中支持的语言代码，则 Agent 编写的用户可见内容使用对应语言，包括 Hunk 评论摘要、理由和最终报告。剩余内容作为额外指令。无法识别的首个 token 不会被丢弃，完整参数会作为额外指令。

## 必须维持的边界

- 不要从扩展或 Agent 任务中启动交互式 Hunk TUI。
- 使用 `--repo <cwd>` 选择当前 checkout 对应的会话。
- Review 提示词必须保持只读；只有 Fix 流程可以修改项目文件。
- Hunk 命令语义以 Hunk 自带 Skill 为准，不要在扩展中复制完整 Hunk 客户端。
- 保持“扩展负责调度、Agent 负责推理和 CLI 操作”的职责划分。
- 保留 `HUNK_BIN` 环境变量支持。
- 扩展自行执行的发现和探测命令必须设置超时。
- 不要自动清除 Hunk 评论。

## 开发与验证

环境要求：Node.js 20+、Pi、Hunk。

```bash
npm install
npm run validate
```

`npm run validate` 会依次运行 TypeScript 检查和测试。

手动集成测试：

```bash
# 终端 1：在有变更的目标仓库中
hunk diff --watch

# 终端 2：在同一仓库中加载本扩展
pi -e /absolute/path/to/pi-hunk-review
```

然后运行：

```text
/hunk-status
/hunk-review
```

修改扩展源码后，在 Pi 中运行 `/reload`。

发布前检查 npm 包内容：

```bash
npm pack --dry-run
```

包中应包含 `src/index.ts`、`src/prompts.ts`、`README.md`、`LICENSE` 和 `package.json`。

## 测试要求

修改 `src/index.ts` 时，应使用模拟的 `ExtensionAPI` 和 `ExtensionCommandContext` 覆盖：

- Skill 发现成功与失败
- 会话结果分类
- Slash Command 注册
- 无实时会话时的命令拦截
- 立即发送与 `followUp` 排队
- 状态和通知行为

修改 `src/prompts.ts` 时，应覆盖：

- 参数 trim
- 已识别和未识别语言代码
- 额外用户指令
- Review 只读约束
- Fix 行为约束
- 输出语言要求

单元测试不应依赖真实 Hunk daemon；真实会话只用于手动集成测试。

## 后续 Agent 修改清单

1. 阅读 `README.md`、`src/index.ts`、`src/prompts.ts` 和相关测试。
2. 运行 `git status`，保留无关的用户改动。
3. 涉及 Hunk CLI 时，运行 `hunk skill path` 并阅读当前安装版本的 `SKILL.md`。
4. 保持本文描述的扩展/Agent/Hunk 职责边界。
5. 添加或更新聚焦测试。
6. 运行 `npm run validate`。
7. 改动打包配置时运行 `npm pack --dry-run`。
8. 最终报告变更文件、验证结果及未执行的手动 Hunk 检查。
