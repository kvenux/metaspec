# CodeSpec Community

CodeSpec 是规格驱动开发方法与本地 CLI 工具的复刻实现。它把需求澄清、业务规格、实现设计、任务拆解、验证和归档串成可追溯闭环。

## 方法论

核心流程固定为：

```text
proposal -> delta-spec -> delta-design -> tasks -> validation -> implementation -> archive
```

关键约束：

1. `spec.md` 是业务真理源，回答 What / Why。
2. `design.md` 承接规格，回答 How。
3. 每个需求变更进入 `codespec/changes/{AR-ID}/`。
4. 用户确认前 CLI 不推进阶段。
5. `init` 和 `start` 不把空模板写入业务文档，避免模板冒充真实规格。

完整方法论见 [docs/method.md](docs/method.md)。

## 模板

模板从 [docs/templates.md](docs/templates.md) 拆分还原：

```text
templates/
  full/
    SPEC.md
    SPEC-annotated.md
    DESIGN.md
  delta/
    proposal.md
    delta-spec.md
    delta-design.md
    tasks.md
    validation.md
  extension/
    service-context.md
    guidelines/
      coding.md
      testing.md
```

模板只作为写作参考，不会被 CLI 自动复制到业务项目的全量规格目录。

## CLI

本项目提供 Node 20 ESM CLI：

```bash
npm test
node bin/codespec.js --help
node bin/codespec.js init ./demo --no-codewiki
node bin/codespec.js --path ./demo start AR20260428-user-login
node bin/codespec.js --path ./demo go --json
```

主要命令：

| 命令 | 用途 |
|------|------|
| `codespec init [path]` | 幂等创建 `codespec/` 与 `.codespec-cli/` 结构 |
| `codespec start <change>` | 创建变更目录和状态文件 |
| `codespec status [change]` | 查看五阶段状态 |
| `codespec go [change]` | 输出 Agent 当前阶段 payload |
| `codespec accept [change]` | 确认当前阶段并推进 |
| `codespec confirm <stage> [change]` | 确认指定阶段 |
| `codespec validate [change]` | 校验项目结构和文档链 |
| `codespec archive [change]` | 归档已完成变更 |
| `codespec integration list` | 列出支持的 Agent 集成 |
| `codespec integration install opencode` | 安装 opencode 命令文件 |
| `codespec integration install claude-code` | 安装 Claude Code 仓库级命令和技能 |
| `codespec integration install codex` | 安装 Codex 仓库级技能 |
| `codespec integration install all` | 安装全部 Agent 集成 |
| `codespec sync` | CodeWiki 同步入口 |

`codespec init` 默认安装全部 Agent 集成；使用 `--integration none` 可跳过，或用 `--integration opencode|claude-code|codex` 只安装一种。

Agent 集成写入位置：

```text
.opencode/command/
  codespec.md
  codespec.proposal.md
  codespec.delta-spec.md
  codespec.delta-design.md
  codespec.tasks.md
  codespec.validation.md
.claude/commands/
  codespec.md
  codespec-proposal.md
  codespec-delta-spec.md
  codespec-delta-design.md
  codespec-tasks.md
  codespec-validation.md
.claude/skills/
  codespec*/SKILL.md
.agents/skills/
  codespec*/SKILL.md
```

Claude Code 可直接使用 `/codespec`、`/codespec-proposal` 等项目命令；新版本也会发现 `.claude/skills`。Codex 按官方仓库级技能路径发现 `.agents/skills`，在 CLI/IDE 中通过技能选择或 `$codespec` 方式调用。

## 项目结构

```text
bin/codespec.js
src/
  cli.js
  project.js
  state.js
  validation.js
  integrations.js
  codewiki.js
templates/
docs/
test/
```

## 验证

```bash
npm test
```

测试覆盖 init 幂等、start 不生成模板、阶段状态、阶段确认、归档、集成安装移除和基础校验码。
