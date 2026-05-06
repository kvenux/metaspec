# MetaSpec Community

MetaSpec 是规格驱动开发方法与本地 CLI 工具的复刻实现。它把需求澄清、业务规格、实现设计、任务拆解、验证和归档串成可追溯闭环。

## 方法论

核心流程固定为：

```text
proposal -> delta-spec -> delta-design -> tasks -> validation -> implementation -> archive
```

关键约束：

1. `spec.md` 是业务真理源，回答 What / Why。
2. `design.md` 承接规格，回答 How。
3. 每个需求变更进入 `metaspec/changes/{REQ-ID}/`。
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
node bin/metaspec.js --help
node bin/metaspec.js init ./demo
node bin/metaspec.js --path ./demo start REQ20260428-user-login
node bin/metaspec.js --path ./demo go --json
```

主要命令：

| 命令 | 用途 |
|------|------|
| `metaspec init [path]` | 幂等创建 `metaspec/` 与 `.metaspec-cli/` 结构 |
| `metaspec start <change>` | 创建变更目录和状态文件 |
| `metaspec status [change]` | 查看五阶段状态 |
| `metaspec go [change]` | 输出 Agent 当前阶段 payload |
| `metaspec accept [change]` | 确认当前阶段并推进 |
| `metaspec confirm <stage> [change]` | 确认指定阶段 |
| `metaspec validate [change]` | 校验项目结构和文档链 |
| `metaspec done [change]` | 实现完成并验证通过后归档变更 |
| `metaspec archive [change]` | 归档已完成变更 |
| `metaspec integration list` | 列出支持的 Agent 集成 |
| `metaspec integration install opencode` | 安装 opencode 命令文件 |
| `metaspec integration install claude-code` | 安装 Claude Code 仓库级命令和技能 |
| `metaspec integration install codex` | 安装 Codex 仓库级技能 |
| `metaspec integration install all` | 安装全部 Agent 集成 |
| `metaspec generate` | 扫描仓库并生成候选 `spec.md` / `design.md` 到 run 目录 |
| `metaspec generate module <path>` | 为单个模块生成候选模块文档 |
| `metaspec show` | 查看最近一次生成 run 的摘要 |
| `metaspec apply` | 将最近一次候选文档应用到 `metaspec/specs/` |

`metaspec init` 默认安装全部 Agent 集成；使用 `--integration none` 可跳过，或用 `--integration opencode|claude-code|codex` 只安装一种。

## 文档生成

生成命令不会直接覆盖权威文档。所有产物先写入：

```text
.metaspec-cli/runs/{run-id}/
  manifest.json
  spec.md
  design.md
  plan.json
  modules/
  logs/
```

常用流程：

```bash
node bin/metaspec.js --path ./demo generate
node bin/metaspec.js --path ./demo show
node bin/metaspec.js --path ./demo apply
node bin/metaspec.js --path ./demo apply --force
```

`apply` 默认不覆盖已有 `metaspec/specs/spec.md` 和 `metaspec/specs/design.md`；确认覆盖时显式传 `--force`。

生成 runner：

```bash
metaspec generate --runner auto
metaspec generate --runner codex
metaspec generate --runner claude
metaspec generate --runner opencode
```

`--runner auto` 是默认值。默认不需要配置 API key，会优先复用本机已安装并登录的 CLI：

```text
codex -> claude -> deterministic stub
```

`opencode` 入口已保留，但当前仍返回 `RUNNER_NOT_IMPLEMENTED`。如果没有可用的 Codex/Claude CLI，`metaspec generate` 会 fallback 到 deterministic stub，基础命令仍可完成。

生成 mode：

```bash
metaspec generate --mode auto
metaspec generate --mode direct
metaspec generate --mode react
```

`direct` 表示整体生成链路：先生成 `design.md`，再从生成后的 `design.md` 反推 `spec.md`。`react` 表示先生成 `modules/*.md` 中间模块文档，再合成整体 `design.md` 和 `spec.md`。`auto` 会根据扫描上下文大小选择 direct 或 react。

单模块文档：

```bash
metaspec generate module src/auth
metaspec generate module src/auth --mode react
```

模块文档只写入当前 run 的 `modules/`，不会由 `apply` 写入权威规格目录。

真实 Codex/Claude CLI 的手工 smoke 步骤见 [docs/manual-smoke.md](docs/manual-smoke.md)。该流程不进入 CI，避免自动消耗 token。
Agent slash command 工作流见 [docs/slash-commands.md](docs/slash-commands.md)。

Agent 集成写入位置：

```text
.opencode/command/
  metaspec.md
  metaspec.proposal.md
  metaspec.delta-spec.md
  metaspec.delta-design.md
  metaspec.tasks.md
  metaspec.validation.md
.claude/commands/
  metaspec.md
  metaspec-proposal.md
  metaspec-delta-spec.md
  metaspec-delta-design.md
  metaspec-tasks.md
  metaspec-validation.md
.claude/skills/
  metaspec*/SKILL.md
.agents/skills/
  metaspec*/SKILL.md
```

Claude Code 可直接使用 `/metaspec`、`/metaspec-proposal` 等项目命令；新版本也会发现 `.claude/skills`。Codex 按官方仓库级技能路径发现 `.agents/skills`，在 CLI/IDE 中通过技能选择或 `$metaspec` 方式调用。

## 项目结构

```text
bin/metaspec.js
src/
  cli.js
  project.js
  state.js
  validation.js
  integrations.js
templates/
docs/
test/
```

## 验证

```bash
npm test
```

测试覆盖 init 幂等、start 不生成模板、阶段状态、阶段确认、归档、集成安装移除和基础校验码。
