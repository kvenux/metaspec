import fs from "node:fs";
import path from "node:path";
import { fakeCompletion } from "../llm.js";
import { ensureDir, rel, slugify, writeJson } from "../util.js";
import { createWorkspaceGuard, runRunnerTask } from "./external.js";
import { commonOutputRules, readFullTemplates, specBlackBoxRules } from "./templates.js";

export function runReactGeneration({ paths, run, scan, plan, strategy, progress = null }) {
  const modulesDir = path.join(run.dir, "modules");
  const modulePromptsDir = path.join(run.dir, "logs/prompts/modules");
  const promptsDir = path.join(run.dir, "logs/prompts");
  ensureDir(modulesDir);
  ensureDir(modulePromptsDir);

  const isFake = strategy.provider === "fake";
  const guard = isFake ? null : createWorkspaceGuard(paths, run);
  const moduleResults = [];
  for (const [index, module] of plan.modules.entries()) {
    const slug = `${slugify(module.path) || "project-root"}.md`;
    progress?.(`模块 ${index + 1}/${plan.modules.length}: ${module.name} (${module.path})`);
    const prompt = buildModulePrompt(scan, module);
    const promptFile = path.join(modulePromptsDir, slug);
    fs.writeFileSync(promptFile, prompt, "utf8");

    const result = isFake
      ? fakeCompletion({
          task: "module",
          prompt,
          plan: module,
          model: strategy.model
        })
      : externalCompletion({
          paths,
          run,
          strategy,
          task: `module-${slugify(module.path) || "project-root"}`,
          prompt
        });
    if (!result.ok && !result.text) return result;

    const moduleFile = path.join(modulesDir, slug);
    fs.writeFileSync(moduleFile, result.text, "utf8");
    moduleResults.push({
      module,
      content: result.text,
      artifact: rel(run.dir, moduleFile),
      prompt: rel(run.dir, promptFile),
      usage: result.usage,
      runnerLog: result.log
    });
  }

  progress?.("合成 design.md");
  const designPrompt = buildDesignPrompt(plan, moduleResults);
  const designPromptFile = path.join(promptsDir, "design.md");
  fs.writeFileSync(designPromptFile, designPrompt, "utf8");
  const designResult = isFake
    ? {
        text: fakeReactDesign(plan, moduleResults, strategy.model),
        usage: { input: estimateTokens(designPrompt), output: 0 }
      }
    : externalCompletion({ paths, run, strategy, task: "design", prompt: designPrompt });
  if (!designResult.ok && !designResult.text) return designResult;
  const design = designResult.text;

  progress?.("从 design.md 反推 spec.md");
  const specPrompt = buildSpecPrompt(design);
  const specPromptFile = path.join(promptsDir, "spec.md");
  fs.writeFileSync(specPromptFile, specPrompt, "utf8");
  const specResult = isFake
    ? fakeCompletion({
        task: "spec",
        prompt: specPrompt,
        plan,
        design,
        model: strategy.model
      })
    : externalCompletion({ paths, run, strategy, task: "spec", prompt: specPrompt });
  if (!specResult.ok && !specResult.text) return specResult;

  const workspaceError = guard?.changed();
  if (workspaceError) return workspaceError;

  const tokens = {
    input:
      moduleResults.reduce((total, module) => total + module.usage.input, 0) +
      designResult.usage.input +
      specResult.usage.input,
    output:
      moduleResults.reduce((total, module) => total + module.usage.output, 0) +
      designResult.usage.output +
      specResult.usage.output
  };
  const reactLog = {
    runner: strategy.runner,
    provider: strategy.provider,
    model: strategy.model,
    reason: strategy.generationReason,
    modules: moduleResults.map((module) => ({
      name: module.module.name,
      path: module.module.path,
      artifact: module.artifact,
      prompt: module.prompt,
      usage: module.usage,
      runnerLog: module.runnerLog
    })),
    prompts: {
      design: rel(run.dir, designPromptFile),
      spec: rel(run.dir, specPromptFile)
    },
    calls: [
      ...moduleResults.map((module) => module.runnerLog).filter(Boolean),
      designResult.log,
      specResult.log
    ].filter(Boolean),
    tokens
  };
  const reactLogFile = path.join(run.dir, "logs/react.json");
  writeJson(reactLogFile, reactLog);
  progress?.("模块优先生成完成");

  return {
    ok: true,
    design,
    spec: specResult.text,
    modules: moduleResults.map((module) => module.artifact),
    logs: {
      react: rel(run.dir, reactLogFile),
      prompts: {
        design: rel(run.dir, designPromptFile),
        spec: rel(run.dir, specPromptFile)
      }
    },
    tokens,
    provider: strategy.provider,
    model: strategy.model,
    reason: strategy.generationReason
  };
}

function externalCompletion({ paths, run, strategy, task, prompt }) {
  const result = runRunnerTask({ paths, run, strategy, task, prompt });
  if (!result.ok) return result;
  return {
    ok: true,
    text: result.content,
    usage: {
      input: estimateTokens(prompt),
      output: estimateTokens(result.content)
    },
    log: result.log
  };
}

function buildModulePrompt(scan, module) {
  const moduleFiles = scan.includedFiles.filter((file) => module.path === "." || file === module.path || file.startsWith(`${module.path}/`));
  const moduleTree = buildTree(moduleFiles);
  const readmeContext = scan.readmeFiles.map((file) => `--- ${file.path}${file.truncated ? " (truncated)" : ""} ---\n${file.content}`).join("\n\n");
  const docsContext = scan.docsFiles.map((file) => `--- ${file.path}${file.truncated ? " (truncated)" : ""} ---\n${file.content}`).join("\n\n");
  return `你是 MetaSpec 模块文档生成 runner。
当前任务：为一个模块生成中间模块设计文档，供后续合成 design.md 使用。

${commonOutputRules()}

模块文档要求：
1. 模块文档是白盒中间材料，可以包含文件、类、框架、数据表等实现细节。
2. 必须说明模块定位、目录结构、核心组件、核心流程、接口与数据结构、关键约束。
3. 内容必须基于给定模块路径和仓库只读分析，不要编造不存在的文件。

模块：${module.name}
路径：${module.path}
描述：${module.description}

Module files:
${moduleFiles.slice(0, 40).map((file) => `- ${file}`).join("\n") || "- none"}

Module tree:
${moduleTree || "(empty)"}

README context:
${readmeContext || "(none)"}

Docs context:
${docsContext || "(none)"}
`;
}

function buildDesignPrompt(plan, moduleResults) {
  const templates = readFullTemplates();
  return `你是 MetaSpec design.md 生成 runner。
当前任务：基于模块文档合成项目级实现设计文档。

${commonOutputRules()}

模板要求：
1. 必须严格使用下面 DESIGN 模板的主章节结构和标题。
2. 保留模板中的一级/二级标题语义，但用真实项目内容替换占位内容。
3. 不适用的章节不要删除，写“无明确设计”或“待确认”，并说明依据。
4. design.md 是白盒实现设计，可以写技术栈、模块、接口、数据模型、部署、安全、监控等实现信息。

DESIGN 模板：
${templates.design}

项目：${plan.projectName}
语言：${plan.language || "unknown"}
模块：
${moduleResults.map((module) => `- ${module.module.name}: ${module.module.path}`).join("\n")}

模块文档：
${moduleResults.map((module) => module.content).join("\n\n")}
`;
}

function buildSpecPrompt(design) {
  const templates = readFullTemplates();
  return `你是 MetaSpec spec.md 生成 runner。
当前任务：只从已生成的 design.md 反推出 SPEC。

${commonOutputRules()}

${specBlackBoxRules()}

模板要求：
1. 必须严格使用下面 SPEC 模板的主章节结构和标题。
2. 保留模板章节：组件定位、领域术语、角色与边界、DFX约束、核心能力、数据约束。
3. 用业务语言替换占位内容，不要保留“[组件名称]”“[功能模块名称]”等占位符。
4. 不要输出 SPEC-annotated 中的写作指导，只输出最终 SPEC 正文。

SPEC 模板：
${templates.spec}

SPEC 方法论参考：
${templates.specAnnotated}

已生成 design.md：
${design}
`;
}

function buildTree(files) {
  const tree = {};
  for (const file of files) {
    let cursor = tree;
    for (const part of file.split("/")) {
      cursor[part] ??= {};
      cursor = cursor[part];
    }
  }
  const lines = [];
  renderTree(tree, 0, lines);
  return lines.join("\n");
}

function renderTree(node, depth, lines) {
  for (const name of Object.keys(node).sort((a, b) => a.localeCompare(b))) {
    const isDirectory = Object.keys(node[name]).length > 0;
    lines.push(`${"  ".repeat(depth)}${name}${isDirectory ? "/" : ""}`);
    if (isDirectory) renderTree(node[name], depth + 1, lines);
  }
}

function fakeReactDesign(plan, moduleResults, model) {
  return `# MetaSpec 实现设计文档

<!-- generated by metaspec fake react -->

Provider: fake
Model: ${model}

## 1. 设计概述

Fake react design synthesized from module documents.

## 2. 系统架构

Project: ${plan.projectName}

### 2.1 架构概览

Module-first mode generates module documents before project-level synthesis.

### 2.2 模块职责

${moduleResults.map((module) => `- ${module.module.name}: ${module.module.path}`).join("\n")}

### 2.3 技术栈

Fake provider does not infer real technology stack.

## 3. 数据模型

Run manifest stores artifact paths and generation metadata.

## 4. 接口设计

用户入口为 metaspec generate、metaspec show、metaspec apply。

## 5. 核心流程设计

React mode generates module documents first, synthesizes design.md, then derives spec.md from design.md.

## 6. 算法设计

无复杂算法设计。

## 7. 缓存设计

无明确缓存设计。

## 8. 异常处理设计

Fake react provider does not call a network API.

## 9. 监控与日志

Generation artifacts remain isolated under .metaspec-cli/runs before apply.

## 10. 安全设计

This is deterministic fake react output for tests.
`;
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}
