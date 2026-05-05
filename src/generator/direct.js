import fs from "node:fs";
import path from "node:path";
import { fakeCompletion } from "../llm.js";
import { ensureDir, rel, writeJson } from "../util.js";
import { commonOutputRules, readFullTemplates, specBlackBoxRules } from "./templates.js";

export function runDirectGeneration({ paths, run, scan, plan, strategy }) {
  const promptsDir = path.join(run.dir, "logs/prompts");
  ensureDir(promptsDir);

  const designPrompt = buildDesignPrompt(scan, plan);
  const designPromptFile = path.join(promptsDir, "design.md");
  fs.writeFileSync(designPromptFile, designPrompt, "utf8");

  const designResult = fakeCompletion({
    task: "design",
    prompt: designPrompt,
    plan,
    model: strategy.model
  });
  const design = designResult.text;

  const specPrompt = buildSpecPrompt(design);
  const specPromptFile = path.join(promptsDir, "spec.md");
  fs.writeFileSync(specPromptFile, specPrompt, "utf8");

  const specResult = fakeCompletion({
    task: "spec",
    prompt: specPrompt,
    plan,
    design,
    model: strategy.model
  });

  const llmLog = {
    provider: strategy.provider,
    model: strategy.model,
    generationMode: strategy.generationMode,
    calls: [
      {
        task: "design",
        prompt: rel(run.dir, designPromptFile),
        usage: designResult.usage
      },
      {
        task: "spec",
        prompt: rel(run.dir, specPromptFile),
        usage: specResult.usage,
        derivedFrom: "design.md"
      }
    ],
    tokens: {
      input: designResult.usage.input + specResult.usage.input,
      output: designResult.usage.output + specResult.usage.output
    }
  };
  const llmLogFile = path.join(run.dir, "logs/llm.json");
  writeJson(llmLogFile, llmLog);

  return {
    design,
    spec: specResult.text,
    logs: {
      llm: rel(run.dir, llmLogFile),
      prompts: {
        design: rel(run.dir, designPromptFile),
        spec: rel(run.dir, specPromptFile)
      }
    },
    tokens: llmLog.tokens,
    provider: strategy.provider,
    model: strategy.model
  };
}

function buildDesignPrompt(scan, plan) {
  const templates = readFullTemplates();
  return `你是 CodeSpec direct design.md 生成 runner。
当前任务：基于 scan 和 plan 直接生成整体 design.md。

${commonOutputRules()}

模板要求：
1. 必须严格使用下面 DESIGN 模板的主章节结构和标题。
2. 保留模板中的一级/二级标题语义，但用真实项目内容替换占位内容。
3. 不适用的章节不要删除，写“无明确设计”或“待确认”，并说明依据。

DESIGN 模板：
${templates.design}

Project: ${plan.projectName}
Language: ${plan.language || "unknown"}
Primary extension: ${plan.primaryExtension || "unknown"}

Modules:
${plan.modules.map((module) => `- ${module.name}: ${module.path} - ${module.description}`).join("\n")}

README files:
${scan.readmeFiles.map((file) => `- ${file.path}`).join("\n") || "- none"}

Docs files:
${scan.docsFiles.map((file) => `- ${file.path}`).join("\n") || "- none"}

File tree:
${scan.fileTree}
`;
}

function buildSpecPrompt(design) {
  const templates = readFullTemplates();
  return `你是 CodeSpec direct spec.md 生成 runner。
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

Generated design.md:
${design}
`;
}
