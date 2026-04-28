import fs from "node:fs";
import path from "node:path";
import { sha256, writeJson } from "./util.js";

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

export function listIntegrations() {
  return [{ name: "opencode", path: ".opencode/command" }];
}

export function installIntegration(root, name, options = {}) {
  if (name !== "opencode") throw new Error(`不支持的集成：${name}`);
  const dir = path.join(root, ".opencode/command");
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (const [fileName, content] of Object.entries(OPENCODE_FILES)) {
    const file = path.join(dir, fileName);
    if (!fs.existsSync(file) || options.force) fs.writeFileSync(file, content, "utf8");
    files.push({ path: path.relative(root, file).replaceAll(path.sep, "/"), sha256: sha256(file) });
  }
  const manifest = {
    integration: "opencode",
    installedAt: new Date().toISOString(),
    files
  };
  writeJson(path.join(root, ".codespec-cli/manifests/integrations/opencode.json"), manifest);
  return { ok: true, integration: "opencode", files };
}

export function removeIntegration(root, name, options = {}) {
  if (name !== "opencode") throw new Error(`不支持的集成：${name}`);
  const manifestFile = path.join(root, ".codespec-cli/manifests/integrations/opencode.json");
  if (!fs.existsSync(manifestFile)) {
    return { ok: true, integration: "opencode", removed: [], kept: [], message: "未发现 opencode 集成 manifest。" };
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
  return { ok: true, integration: "opencode", removed, kept, message: "已移除 opencode 集成。" };
}
