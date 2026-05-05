# CodeSpec Generate Manual Smoke

本手工验收不会进入 CI。真实 Codex/Claude 调用可能消耗 token，并依赖本机 CLI 登录状态。

## 1. 准备 demo project

PowerShell 示例：

```powershell
$demo = Join-Path $env:TEMP "codespec-smoke-demo"
Remove-Item $demo -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "$demo/src/auth" -Force | Out-Null
New-Item -ItemType Directory -Path "$demo/docs" -Force | Out-Null
Set-Content -Path "$demo/README.md" -Value "# Smoke Demo`n`nSmall project for CodeSpec generate smoke."
Set-Content -Path "$demo/docs/api.md" -Value "# API`n`nAuth API notes."
Set-Content -Path "$demo/src/auth/login.js" -Value "export function login(user) { return Boolean(user); }"
git -C $demo init
git -C $demo add .
git -C $demo commit -m "init smoke demo"
```

## 2. 初始化 CodeSpec

从 `codespec-community` 仓库执行：

```powershell
node bin/codespec.js init $demo --integration none --json
```

确认输出中包含本机 agent 检测结果，例如 `codex`、`claude`、`opencode`。

## 3. Codex runner

确认本机已安装并登录 Codex CLI 后执行：

```powershell
node bin/codespec.js --path $demo generate --runner codex --json
node bin/codespec.js --path $demo show
```

检查：

```powershell
Get-ChildItem "$demo/.codespec-cli/runs" -Directory | Sort-Object Name -Descending | Select-Object -First 1
Get-ChildItem "$demo/.codespec-cli/runs/<run-id>/logs"
Get-Content "$demo/.codespec-cli/runs/<run-id>/manifest.json"
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
node bin/codespec.js --path $demo generate --runner claude --json
node bin/codespec.js --path $demo show
```

检查点同 Codex。Claude JSON 输出应能从 `result` 字段解析最终 Markdown。

## 5. Apply

确认最近 run 内容可接受后执行：

```powershell
node bin/codespec.js --path $demo apply --force --json
```

检查：

```powershell
Test-Path "$demo/codespec/specs/spec.md"
Test-Path "$demo/codespec/specs/design.md"
git -C $demo diff --stat
git -C $demo diff -- codespec/specs/spec.md codespec/specs/design.md
```

预期 `git diff` 只包含：

```text
codespec/specs/spec.md
codespec/specs/design.md
```

以及初始化时明确创建的 CodeSpec 本地结构。外部 runner 不应修改源码文件或 `.codespec-cli/config.yaml`。

## 6. 只打印命令

如果只想复制命令、不想立即调用真实 CLI，可以先运行：

```powershell
@"
node bin/codespec.js init $demo --integration none --json
node bin/codespec.js --path $demo generate --runner codex --json
node bin/codespec.js --path $demo generate --runner claude --json
node bin/codespec.js --path $demo show
node bin/codespec.js --path $demo apply --force --json
"@
```
