# MetaSpec Generate Manual Smoke

本手工验收不会进入 CI。真实 Codex/Claude 调用可能消耗 token，并依赖本机 CLI 登录状态。

## 1. 准备 demo project

PowerShell 示例：

```powershell
$demo = Join-Path $env:TEMP "metaspec-smoke-demo"
Remove-Item $demo -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "$demo/src/auth" -Force | Out-Null
New-Item -ItemType Directory -Path "$demo/docs" -Force | Out-Null
Set-Content -Path "$demo/README.md" -Value "# Smoke Demo`n`nSmall project for metaspec generate smoke."
Set-Content -Path "$demo/docs/api.md" -Value "# API`n`nAuth API notes."
Set-Content -Path "$demo/src/auth/login.js" -Value "export function login(user) { return Boolean(user); }"
git -C $demo init
git -C $demo add .
git -C $demo commit -m "init smoke demo"
```

## 2. 初始化 metaspec

从 `metaspec-community` 仓库执行：

```powershell
node bin/metaspec.js init $demo --integration none --json
```

确认输出中包含本机 agent 检测结果，例如 `codex`、`claude`、`opencode`。

## 3. Codex runner

确认本机已安装并登录 Codex CLI 后执行：

```powershell
node bin/metaspec.js --path $demo generate --runner codex --json
node bin/metaspec.js --path $demo show
```

检查：

```powershell
Get-ChildItem "$demo/.metaspec-cli/runs" -Directory | Sort-Object Name -Descending | Select-Object -First 1
Get-ChildItem "$demo/.metaspec-cli/runs/<run-id>/logs"
Get-Content "$demo/.metaspec-cli/runs/<run-id>/manifest.json"
```

预期：

1. `manifest.json` 中 `runner` 为 `codex`。
2. `generationMode` 为 `direct` 或 `react`。
3. `logs/prompts/design.md` 和 `logs/prompts/spec.md` 存在。
4. `logs/external.json` 存在。
5. `spec.md` 和 `design.md` 存在且非空。

## 4. Claude runner

确认本机已安装并登录 Claude Code 后执行：

```powershell
node bin/metaspec.js --path $demo generate --runner claude --json
node bin/metaspec.js --path $demo show
```

检查点同 Codex。Claude JSON 输出应能从 `result` 字段解析最终 Markdown。

## 5. psmux Agent E2E smoke

该 smoke 用 Windows 上的 `psmux` 启动真实 Agent 会话，适合验证仓库级命令/技能是否能被真实 CLI 发现，以及 transcript 中是否出现关键阶段门禁。它可能消耗 token，不进入 CI。

### 5.1 Codex TUI 启动与捕获

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\psmux-e2e.ps1 `
  -Agent codex `
  -Project $PWD `
  -Session metaspec-e2e-codex-smoke `
  -StartupSeconds 4 `
  -Expect "OpenAI Codex"
```

### 5.2 opencode run 输出捕获

opencode TUI 使用 alternate screen 时，`capture-pane` 可能抓不到普通 scrollback。自动化断言优先使用 `opencode run --format json`：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\psmux-e2e.ps1 `
  -Agent opencode `
  -Mode run `
  -Project $PWD `
  -Session metaspec-e2e-opencode-smoke `
  -Prompt "Reply exactly PSMUX_OPENCODE_OK and do not run tools." `
  -TurnSeconds 40 `
  -Expect "PSMUX_OPENCODE_OK"
```

### 5.3 MetaSpec SDD 端到端测试思路

1. 准备临时项目并执行 `metaspec init`、`metaspec start REQ...`。
2. 用 `psmux-e2e.ps1` 启动 Codex TUI，发送 `$metaspec` 或 `$metaspec-proposal <模糊需求>`。
3. 断言 transcript 先出现 `澄清中`、`Q1`、`为什么问`，而不是直接写入 `proposal.md`。
4. 逐轮发送用户回答、`可以生成`、`确认/下一步`，直到 `validation.md`。
5. 断言 validation 后出现 `文档链已验证，可进入实现`，且没有出现 `metaspec done` 或 `归档完成`。
6. 检查 `metaspec/changes/{REQ}/` 下五个阶段文档存在，并且文档包含 `决策台账` 或实现前风险门禁内容。

## 6. Apply

确认最近 run 内容可接受后执行：

```powershell
node bin/metaspec.js --path $demo apply --force --json
```

检查：

```powershell
Test-Path "$demo/metaspec/specs/spec.md"
Test-Path "$demo/metaspec/specs/design.md"
git -C $demo diff --stat
git -C $demo diff -- metaspec/specs/spec.md metaspec/specs/design.md
```

预期 `git diff` 只包含：

```text
metaspec/specs/spec.md
metaspec/specs/design.md
```

以及初始化时明确创建的 metaspec 本地结构。外部 runner 不应修改源码文件或 `.metaspec-cli/config.yaml`。

## 7. 只打印命令

如果只想复制命令、不想立即调用真实 CLI，可以先运行：

```powershell
@"
node bin/metaspec.js init $demo --integration none --json
node bin/metaspec.js --path $demo generate --runner codex --json
node bin/metaspec.js --path $demo generate --runner claude --json
node bin/metaspec.js --path $demo show
node bin/metaspec.js --path $demo apply --force --json
"@
```
