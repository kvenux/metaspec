import fs from "node:fs";
import path from "node:path";

export function resolveGenerationStrategy(paths, options = {}, env = process.env, context = {}) {
  const runner = normalizeProvider(options.runner || readConfigDefaultRunner(paths) || "auto");
  const requestedMode = normalizeProvider(options.mode || env.CODESPEC_GENERATION_MODE || "auto");
  if (!["auto", "direct", "react"].includes(requestedMode)) {
    return {
      ok: false,
      code: "MODE_NOT_IMPLEMENTED",
      mode: requestedMode,
      message: `暂未实现 --mode ${requestedMode}。请使用 auto、direct 或 react。`,
      next: ["codespec generate --mode auto"]
    };
  }

  if (runner === "opencode") {
    return {
      ok: false,
      code: "RUNNER_NOT_IMPLEMENTED",
      runner,
      message: "P4 暂未实现 --runner opencode。",
      next: ["codespec generate --runner auto", "codespec generate --runner codex", "codespec generate --runner claude"]
    };
  }
  if (!["auto", "codex", "claude"].includes(runner)) {
    return {
      ok: false,
      code: "RUNNER_NOT_IMPLEMENTED",
      runner,
      message: `暂未实现 --runner ${runner}。`,
      next: ["codespec generate --runner auto"]
    };
  }

  const provider = normalizeProvider(env.CODESPEC_LLM_PROVIDER || env.LLM_PROVIDER || readConfigProvider(paths));
  if (provider === "fake") {
    const selection = selectGenerationMode({ requestedMode });
    return {
      ok: true,
      generationMode: selection.generationMode,
      generationReason: selection.reason,
      runner: "auto",
      provider: "fake",
      model: options.model || env.CODESPEC_LLM_MODEL || env.LLM_MODEL || "fake-codespec-model"
    };
  }

  if (["openai", "anthropic"].includes(provider)) {
    const apiKey = env.CODESPEC_LLM_API_KEY || env.LLM_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        code: "LLM_NOT_CONFIGURED",
        provider,
        message: `缺少 ${provider} LLM 配置。请设置 CODESPEC_LLM_API_KEY 或改用 CODESPEC_LLM_PROVIDER=fake。`,
        next: ["unset CODESPEC_LLM_PROVIDER", "codespec generate --runner auto"]
      };
    }
  }

  if (provider && provider !== "stub") {
    return {
      ok: false,
      code: "LLM_PROVIDER_NOT_IMPLEMENTED",
      provider,
      message: `P2 暂未实现 LLM provider：${provider}。`,
      next: ["unset CODESPEC_LLM_PROVIDER", "codespec generate --runner auto"]
    };
  }

  const selected = selectRunner(runner, env);
  if (!selected.ok) return selected;
  if (selected.runner === "stub") {
    return {
      ok: true,
      generationMode: "stub",
      generationReason: "no_local_runner",
      runner: "auto",
      provider: null,
      model: options.model || null
    };
  }

  const selection = selectGenerationMode({ requestedMode });
  return {
    ok: true,
    generationMode: selection.generationMode,
    generationReason: selection.reason,
    runner: selected.runner,
    provider: selected.runner,
    model: options.model || defaultExternalModel(selected.runner),
    fallbackModel: options.model ? null : fallbackExternalModel(selected.runner),
    executable: selected.executable
  };
}

function selectGenerationMode({ requestedMode }) {
  if (requestedMode === "direct") return { generationMode: "direct", reason: "forced_whole_project_direct" };
  if (requestedMode === "react") return { generationMode: "react", reason: "forced_module_first" };
  return { generationMode: "react", reason: "module_first_pipeline" };
}

function defaultExternalModel(runner) {
  if (runner === "codex") return "gpt-5.3-codex-spark";
  if (runner === "claude") return "claude-sonnet-4-6";
  return null;
}

function fallbackExternalModel(runner) {
  if (runner === "codex") return "gpt-5.5";
  return null;
}

function selectRunner(requestedRunner, env) {
  if (requestedRunner === "auto") {
    for (const candidate of ["codex", "claude"]) {
      const executable = findExecutable(candidate, env);
      if (executable) return { ok: true, runner: candidate, executable };
    }
    return { ok: true, runner: "stub" };
  }

  const executable = findExecutable(requestedRunner, env);
  if (!executable) {
    return {
      ok: false,
      code: "RUNNER_NOT_FOUND",
      runner: requestedRunner,
      message: `未找到 ${requestedRunner}。请安装并登录对应 CLI，或改用 codespec generate --runner auto。`,
      next: ["codespec generate --runner auto", `确认 ${requestedRunner} 已安装并登录`]
    };
  }
  return { ok: true, runner: requestedRunner, executable };
}

function findExecutable(command, env = process.env) {
  const extensions = process.platform === "win32" ? [".cmd", ".exe", ".bat", ".com", ".ps1", ""] : [""];
  for (const dir of (env.PATH || env.Path || env.path || "").split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${command}${extension}`);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export function fakeCompletion({ task, prompt, plan, design, model }) {
  if (task === "module") {
    return {
      text: `# Module Design: ${plan.name}

<!-- generated by codespec fake react -->

Path: ${plan.path}

## 1. 模块定位

Fake react module document for ${plan.path}.

## 2. 核心流程

This module document is generated before project-level design synthesis.
`,
      usage: { input: estimateTokens(prompt), output: 0 }
    };
  }

  if (task === "design") {
    const modules = plan.modules
      .map((module) => `- ${module.name}: ${module.path} - ${module.description}`)
      .join("\n");
    return {
      text: `# CodeSpec 实现设计文档

<!-- generated by codespec fake direct -->

Provider: fake
Model: ${model}

## 1. 设计概述

### 1.1 设计目标

Fake direct design generated from scan and plan.

Project: ${plan.projectName}
Language: ${plan.language || "unknown"}
Primary extension: ${plan.primaryExtension || "unknown"}

### 1.2 设计约束

候选文档必须先进入 run 目录，确认后才能 apply。

## 2. 系统架构

### 2.1 架构概览

Fake provider uses a deterministic local implementation.

### 2.2 模块职责

${modules}

### 2.3 技术栈

CLI: Node.js ESM.

## 3. 数据模型

Run manifest records generated artifacts and status.

## 4. 接口设计

用户入口为 codespec generate、codespec show、codespec apply。

## 5. 核心流程设计

The direct generator first scans the repository, then plans modules, then produces this design artifact.

## 6. 算法设计

无复杂算法设计。

## 7. 缓存设计

无明确缓存设计。

## 8. 异常处理设计

Fake provider does not call a network API.

## 9. 监控与日志

Generation artifacts remain isolated under .codespec-cli/runs before apply.

## 10. 安全设计

This is deterministic fake direct output for tests.
`,
      usage: { input: estimateTokens(prompt), output: 0 }
    };
  }

  return {
    text: `# CodeSpec SPEC

<!-- generated by codespec fake direct -->

Derived from design.
Provider: fake
Model: ${model}

## 1. 组件定位

This fake spec is derived from the generated design document, not directly from repository source files.

## 2. 领域术语

- Design-derived specification: a SPEC artifact generated after design.md exists.

## 3. 角色与边界

CodeSpec CLI owns artifact writing and apply protection.

## 4. DFX约束

Generated documents are staged in a run directory before apply.

## 5. 核心能力

- Produce spec.md only after design.md generation.
- Preserve apply overwrite protection.
- Derived from design marker is retained for tests.

## 6. 数据约束

- 候选文档必须包含 spec.md 与 design.md。
- apply 默认不得覆盖已有权威文档。

Design summary:
${design.split(/\r?\n/).slice(0, 8).join("\n")}
`,
    usage: { input: estimateTokens(prompt), output: 0 }
  };
}

function normalizeProvider(provider) {
  return String(provider || "").trim().toLowerCase();
}

function readConfigProvider(paths) {
  const file = path.join(paths.runtime, "config.yaml");
  if (!fs.existsSync(file)) return "";
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line === "generation:");
  if (start === -1) return "";
  const generation = [];
  for (const line of lines.slice(start + 1)) {
    if (line && !line.startsWith(" ")) break;
    generation.push(line);
  }
  return generation.join("\n").match(/^  provider:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1] || "";
}

function readConfigDefaultRunner(paths) {
  const file = path.join(paths.runtime, "config.yaml");
  if (!fs.existsSync(file)) return "";
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line === "generation:");
  if (start === -1) return "";
  const generation = [];
  for (const line of lines.slice(start + 1)) {
    if (line && !line.startsWith(" ")) break;
    generation.push(line);
  }
  return generation.join("\n").match(/^  defaultRunner:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1] || "";
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}
