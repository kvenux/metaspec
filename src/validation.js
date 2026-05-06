import fs from "node:fs";
import path from "node:path";
import { STAGES } from "./constants.js";
import { projectPaths } from "./project.js";
import { listChanges, loadState, stageStatus } from "./state.js";

const finding = (level, code, filePath, message) => ({ level, code, path: filePath, message });

export function validateProject(options = {}, explicitChange) {
  const paths = projectPaths(options);
  const findings = [];
  if (!fs.existsSync(paths.metaspec)) findings.push(finding("error", "CS001", "metaspec", "缺少 metaspec/ 目录。"));
  if (!fs.existsSync(paths.specs)) findings.push(finding("error", "CS002", "metaspec/specs", "缺少 metaspec/specs/ 目录。"));
  if (!fs.existsSync(path.join(paths.specs, "spec.md"))) {
    findings.push(finding("warn", "CS003", "metaspec/specs/spec.md", "缺少 metaspec/specs/spec.md；请生成或导入真实全量 spec.md。"));
  }
  if (!fs.existsSync(path.join(paths.specs, "design.md"))) {
    findings.push(finding("warn", "CS004", "metaspec/specs/design.md", "缺少 metaspec/specs/design.md；请生成或导入真实全量 design.md。"));
  }
  if (!fs.existsSync(paths.changes)) findings.push(finding("error", "CS005", "metaspec/changes", "缺少 metaspec/changes/ 目录。"));
  if (!fs.existsSync(paths.archives)) findings.push(finding("error", "CS006", "metaspec/changes/archives", "缺少 metaspec/changes/archives/ 目录。"));
  if (!fs.existsSync(path.join(paths.runtime, "config.yaml"))) {
    findings.push(finding("error", "CS007", ".metaspec-cli/config.yaml", "缺少 .metaspec-cli/config.yaml。"));
  }
  const dataDir = path.join(paths.metaspec, "data");
  if (fs.existsSync(dataDir)) {
    const jsonFiles = fs.readdirSync(dataDir).filter((name) => name.endsWith(".json"));
    for (const name of jsonFiles) findings.push(finding("error", "CS008", `metaspec/data/${name}`, "禁止把 JSON 数据文件作为核心规格资产。"));
  }

  const changes = explicitChange ? [explicitChange] : listChanges(options);
  for (const change of changes) validateChange(paths.root, change, findings);
  return findings;
}

export function doctor(options = {}) {
  const paths = projectPaths(options);
  const findings = validateProject(options);
  if (!fs.existsSync(path.join(paths.root, ".gitignore"))) {
    findings.push(finding("warn", "CSD001", ".gitignore", "缺少 .gitignore。"));
  }
  return findings;
}

function validateChange(root, change, findings) {
  const dir = path.join(root, "metaspec/changes", change);
  if (!fs.existsSync(dir)) {
    findings.push(finding("error", "CS100", `metaspec/changes/${change}`, "指定变更目录不存在。"));
    return;
  }
  const state = loadState(root, change);
  let previousConfirmed = true;
  for (const stage of STAGES) {
    const file = path.join(dir, stage.file);
    const exists = fs.existsSync(file);
    const status = stageStatus(root, change, state, stage);
    if (exists && !previousConfirmed) {
      findings.push(finding("warn", "CS102", `metaspec/changes/${change}/${stage.file}`, "后序阶段文件存在但前序阶段未完成。"));
    }
    if (exists && status !== "confirmed" && status !== "template") {
      findings.push(finding("warn", "CS103", `metaspec/changes/${change}/${stage.file}`, "阶段文件未经过用户确认。"));
    }
    if (exists && stage.key === "delta-spec") validateDeltaSpec(file, change, findings);
    if (exists && stage.key === "tasks") validateTasks(file, change, findings);
    if (exists && stage.key === "validation") validateValidation(file, change, findings);
    previousConfirmed = status === "confirmed";
  }
}

function validateDeltaSpec(file, change, findings) {
  const content = fs.readFileSync(file, "utf8");
  for (const title of ["ADDED Requirements", "MODIFIED Requirements", "REMOVED Requirements"]) {
    if (!content.includes(title)) {
      findings.push(finding("warn", "CS201", `metaspec/changes/${change}/delta-spec.md`, `delta-spec.md 缺少 ${title} 标题。`));
    }
  }
}

function validateTasks(file, change, findings) {
  const content = fs.readFileSync(file, "utf8");
  if (!/测试|验证|test|validation/i.test(content)) {
    findings.push(finding("warn", "CS301", `metaspec/changes/${change}/tasks.md`, "tasks.md 未引用或包含验证任务。"));
  }
}

function validateValidation(file, change, findings) {
  const content = fs.readFileSync(file, "utf8");
  if (!/允许进入实现|可进入实现|进入实现/.test(content)) {
    findings.push(finding("warn", "CS401", `metaspec/changes/${change}/validation.md`, "validation.md 缺少进入实现结论。"));
  }
}
