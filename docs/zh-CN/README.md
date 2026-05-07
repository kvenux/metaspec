# MetaSpec

先恢复系统全量规格，再安全地做增量变更。

MetaSpec 是面向已有代码库的规格驱动开发工作流。它先扫描仓库，恢复全量 `spec.md` 和 `design.md`，再把每个新需求放进 proposal、spec 增量、design 增量、任务拆解、一致性验证、实现和归档流程。

## 核心差异

很多 AI coding 工作流从“下一个需求”开始。MetaSpec 从更早的一层开始：先让 agent 解释当前系统，形成稳定的业务规格和实现设计基线，然后再修改。

```text
恢复全量 spec/design -> 需求澄清 -> spec 增量 -> design 增量 -> 任务拆解 -> 一致性验证 -> 实现 -> done finalization -> 归档
```

这使它更适合 brownfield 项目，而不只是新项目。

## 快速开始

```bash
metaspec init
metaspec generate
metaspec show
metaspec apply
```

新需求：

```bash
metaspec start REQ20260428-owner-phone-validation
metaspec go --json
metaspec accept
metaspec validate
metaspec done
```

Agent 入口：

```text
/metaspec
```

## 中文命令行

MetaSpec 默认英文输出。需要中文输出时使用：

```bash
metaspec --lang zh-CN --help
metaspec --lang zh-CN init
```

或设置环境变量：

```bash
$env:METASPEC_LANG = "zh-CN"
metaspec --help
```

## 目录结构

```text
metaspec/
  specs/
    spec.md
    design.md
  changes/
    REQ20260428-owner-phone-validation/
      proposal.md
      delta-spec.md
      delta-design.md
      tasks.md
      validation.md
      .metaspec-state.json
    archives/

.metaspec-cli/
  config.yaml
  runs/
```

`generate` 只写入 `.metaspec-cli/runs/` 候选产物。`apply` 才会把审查后的文档发布到 `metaspec/specs/`。已有全量规格默认不会被覆盖，除非显式传 `--force`。

`generate/apply` 只用于 baseline recovery。已确认变更的全量文档演进发生在 done finalization：实现和验证完成后，coding agent 根据 `delta-spec.md` 更新 `metaspec/specs/spec.md`，根据 `delta-design.md` 更新 `metaspec/specs/design.md`，然后再执行 `metaspec done`。

## 为什么不是普通增量 spec

OpenSpec 类工具很适合轻量增量变更，但如果没有恢复当前系统的全量基线，增量 spec 容易漂移。MetaSpec 的重点是：

- 先恢复全量业务规格 `spec.md`
- 先恢复全量实现设计 `design.md`
- 每个增量变更都必须对齐这两个基线
- Agent 只能写 CLI 授权的阶段产物
- validation 之后不能立刻 done，必须先实现、验证，并在 done finalization 更新全量 `spec.md` / `design.md`

## Agent 集成

```bash
metaspec integration install all
```

支持仓库级：

- opencode commands
- Claude Code commands and skills
- Codex repository skills

## 开发验证

```bash
npm test
node bin/metaspec.js --help
node bin/metaspec.js --lang zh-CN --help
```
