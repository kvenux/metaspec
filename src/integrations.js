import fs from "node:fs";
import path from "node:path";
import { sha256, writeJson } from "./util.js";

const INTEGRATIONS = {
  opencode: {
    path: ".opencode/command",
    description: "opencode repository commands"
  },
  "claude-code": {
    path: ".claude/commands + .claude/skills",
    description: "Claude Code project slash commands and skills"
  },
  codex: {
    path: ".agents/skills",
    description: "Codex repository skills"
  }
};

const OPENCODE_FILES = {
  "codespec.md": `# /codespec

先执行 \`codespec go --json\` 获取当前阶段，然后根据返回的 stage.agentCommand 进入对应阶段。每轮最多问 3 个澄清问题。用户未明确确认前，不调用 \`codespec accept --json\`。
`,
  "codespec.proposal.md": stagePrompt("proposal.md", "需求澄清", "只写 proposal.md，明确背景、范围、非目标、影响和验收标准。"),
  "codespec.delta-spec.md": stagePrompt("delta-spec.md", "Spec 增量设计", "只写 delta-spec.md，使用 ADDED / MODIFIED / REMOVED 描述可验证业务规则。"),
  "codespec.delta-design.md": stagePrompt("delta-design.md", "Design 增量设计", "只写 delta-design.md，覆盖设计决策、接口、数据、流程和风险。"),
  "codespec.tasks.md": stagePrompt("tasks.md", "任务拆解", "只写 tasks.md，拆到模块、文件、接口或责任边界级，并包含测试和文档任务。"),
  "codespec.validation.md": stagePrompt("validation.md", "一致性验证", "只写 validation.md，检查文档链覆盖关系并给出是否允许进入实现的结论。")
};

const COMMANDS = [
  {
    id: "codespec",
    title: "CodeSpec",
    description: "Inspect the current CodeSpec change and route to the active stage.",
    body: `先执行 \`codespec go --json\` 获取当前阶段。

根据返回结果处理：
1. \`open_agent_stage\`：进入当前阶段，按 stage.objective 生成或更新阶段文档。
2. \`await_user_accept\`：提示用户检查阶段文档；用户明确确认后，才执行 \`codespec accept --json\`。
3. \`complete_previous_stage\`：提示先完成前序阶段。
4. \`done\`：提示执行 \`codespec validate\` 与 \`codespec archive\`。

约束：
1. 每轮最多问 3 个澄清问题。
2. 不直接修改 \`.codespec-state.json\`。
3. 不修改实现代码。
4. 不创建空模板文档冒充真实产物。
`
  },
  {
    id: "codespec-proposal",
    title: "CodeSpec Proposal",
    description: "Write the proposal stage for a CodeSpec change.",
    body: commandBody("proposal.md", "需求澄清", "只写 proposal.md，明确背景、范围、非目标、影响和验收标准。")
  },
  {
    id: "codespec-delta-spec",
    title: "CodeSpec Delta Spec",
    description: "Write business-rule delta specifications for a CodeSpec change.",
    body: commandBody("delta-spec.md", "Spec 增量设计", "只写 delta-spec.md，使用 ADDED / MODIFIED / REMOVED 描述可验证业务规则。")
  },
  {
    id: "codespec-delta-design",
    title: "CodeSpec Delta Design",
    description: "Write implementation delta design for a CodeSpec change.",
    body: commandBody("delta-design.md", "Design 增量设计", "只写 delta-design.md，覆盖设计决策、接口、数据、流程和风险。")
  },
  {
    id: "codespec-tasks",
    title: "CodeSpec Tasks",
    description: "Break a CodeSpec change into executable implementation and verification tasks.",
    body: commandBody("tasks.md", "任务拆解", "只写 tasks.md，拆到模块、文件、接口或责任边界级，并包含测试和文档任务。")
  },
  {
    id: "codespec-validation",
    title: "CodeSpec Validation",
    description: "Validate coverage from proposal to tasks before implementation.",
    body: commandBody("validation.md", "一致性验证", "只写 validation.md，检查文档链覆盖关系并给出是否允许进入实现的结论。")
  }
];

function stagePrompt(file, name, rule) {
  return `# /codespec.${file.replace(".md", "")}

当前阶段：${name}

执行规则：
1. 先调用 \`codespec go --json\` 确认当前 change、阶段和产物路径。
2. ${rule}
3. 不直接修改 \`.codespec-state.json\`。
4. 写入阶段产物后输出相对路径，等待用户确认。
`;
}

function commandBody(file, name, rule) {
  return `当前阶段：${name}

执行规则：
1. 先调用 \`codespec go --json\` 确认当前 change、阶段和产物路径。
2. ${rule}
3. 不直接修改 \`.codespec-state.json\`。
4. 不修改实现代码。
5. 写入阶段产物后输出相对路径，等待用户确认。
`;
}

export function listIntegrations() {
  return Object.entries(INTEGRATIONS).map(([name, value]) => ({ name, ...value }));
}

export function installIntegration(root, name, options = {}) {
  if (name === "all") {
    const results = Object.keys(INTEGRATIONS).map((integration) => installIntegration(root, integration, options));
    return {
      ok: true,
      integration: "all",
      results,
      files: results.flatMap((result) => result.files),
      message: "已安装全部 Agent 集成。"
    };
  }
  if (name === "opencode") return installOpencode(root, options);
  if (name === "claude-code") return installClaudeCode(root, options);
  if (name === "codex") return installCodex(root, options);
  throw new Error(`不支持的集成：${name}`);
}

function installOpencode(root, options = {}) {
  const dir = path.join(root, INTEGRATIONS.opencode.path);
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (const [fileName, content] of Object.entries(OPENCODE_FILES)) {
    const file = path.join(dir, fileName);
    writeTrackedFile(file, content, files, root, options);
  }
  writeManifest(root, "opencode", files);
  return { ok: true, integration: "opencode", files };
}

function installClaudeCode(root, options = {}) {
  const files = [];
  const commandDir = path.join(root, ".claude/commands");
  fs.mkdirSync(commandDir, { recursive: true });
  for (const command of COMMANDS) {
    writeTrackedFile(path.join(commandDir, `${command.id}.md`), claudeCommand(command), files, root, options);
  }

  const skillsDir = path.join(root, ".claude/skills");
  fs.mkdirSync(skillsDir, { recursive: true });
  for (const command of COMMANDS) {
    writeTrackedFile(path.join(skillsDir, command.id, "SKILL.md"), skillMarkdown(command, "claude"), files, root, options);
  }

  writeManifest(root, "claude-code", files);
  return { ok: true, integration: "claude-code", files };
}

function installCodex(root, options = {}) {
  const files = [];
  const skillsDir = path.join(root, ".agents/skills");
  fs.mkdirSync(skillsDir, { recursive: true });
  for (const command of COMMANDS) {
    writeTrackedFile(path.join(skillsDir, command.id, "SKILL.md"), skillMarkdown(command, "codex"), files, root, options);
  }

  writeManifest(root, "codex", files);
  return { ok: true, integration: "codex", files };
}

function writeTrackedFile(file, content, files, root, options) {
  if (!fs.existsSync(file) || options.force) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  }
  files.push({ path: path.relative(root, file).replaceAll(path.sep, "/"), sha256: sha256(file) });
}

function writeManifest(root, integration, files) {
  writeJson(path.join(root, `.codespec-cli/manifests/integrations/${integration}.json`), {
    integration,
    installedAt: new Date().toISOString(),
    files
  });
}

function claudeCommand(command) {
  return `---
description: ${command.description}
---

# ${command.title}

${command.body}

$ARGUMENTS
`;
}

function skillMarkdown(command, provider) {
  const providerLine =
    provider === "codex"
      ? "This repository skill is discovered by Codex from `.agents/skills`."
      : "This project skill is discovered by Claude Code from `.claude/skills`.";
  return `---
name: ${command.id}
description: ${command.description}
---

# ${command.title}

${providerLine}

${command.body}
`;
}

export function removeIntegration(root, name, options = {}) {
  if (name === "all") {
    const results = Object.keys(INTEGRATIONS).map((integration) => removeIntegration(root, integration, options));
    return {
      ok: true,
      integration: "all",
      removed: results.flatMap((result) => result.removed),
      kept: results.flatMap((result) => result.kept),
      message: "已移除全部 Agent 集成。"
    };
  }
  if (!INTEGRATIONS[name]) throw new Error(`不支持的集成：${name}`);
  const manifestFile = path.join(root, `.codespec-cli/manifests/integrations/${name}.json`);
  if (!fs.existsSync(manifestFile)) {
    return { ok: true, integration: name, removed: [], kept: [], message: `未发现 ${name} 集成 manifest。` };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const removed = [];
  const kept = [];
  for (const entry of manifest.files || []) {
    const file = path.join(root, entry.path);
    if (!fs.existsSync(file)) continue;
    const modified = sha256(file) !== entry.sha256;
    if (modified && !options.force) {
      kept.push(entry.path);
      continue;
    }
    fs.unlinkSync(file);
    removed.push(entry.path);
  }
  fs.unlinkSync(manifestFile);
  return { ok: true, integration: name, removed, kept, message: `已移除 ${name} 集成。` };
}
