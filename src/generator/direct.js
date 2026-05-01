import fs from "node:fs";
import path from "node:path";
import { fakeCompletion } from "../llm.js";
import { ensureDir, rel, writeJson } from "../util.js";

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
  return `You are CodeSpec direct generator.
Task: generate design.md from scan and plan.
Do not write files. Return Markdown only.

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
  return `You are CodeSpec direct generator.
Task: generate spec.md from the generated design.md.
Important: derive the SPEC only from design.md content below. Do not use source files directly.
Return Markdown only.

Generated design.md:
${design}
`;
}
