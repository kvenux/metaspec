import fs from "node:fs";
import path from "node:path";
import { STAGES } from "./constants.js";
import { nowStamp, readJson, slugify, today, writeJson } from "./util.js";
import { projectPaths } from "./project.js";

export function normalizeChangeName(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("缺少变更名称。");
  const slug = slugify(raw);
  if (/^[a-z]{2,}\d{6,}/i.test(raw)) {
    return slug.replace(/^([a-z]+)(\d+)/, (_, prefix, digits) => `${prefix.toUpperCase()}${digits}`);
  }
  return `REQ${nowStamp()}-${slug}`;
}

export function startChange(input, options = {}) {
  const paths = projectPaths(options);
  const change = normalizeChangeName(input);
  const dir = path.join(paths.changes, change);
  if (fs.existsSync(dir)) throw new Error(`变更已存在：${change}`);
  fs.mkdirSync(dir, { recursive: true });
  const state = initialState(change);
  writeJson(stateFile(paths.root, change), state);
  return {
    ok: true,
    change,
    path: path.relative(paths.root, dir).replaceAll(path.sep, "/"),
    message: `已创建 CodeSpec 变更：${change}`,
    next: ["在 opencode 中执行 /codespec"]
  };
}

export function initialState(change) {
  return {
    version: 1,
    change,
    currentStage: "proposal",
    stages: {
      proposal: {
        status: "clarifying",
        clarified: false,
        confirmed: false,
        file: "proposal.md"
      }
    },
    history: [{ action: "create-change", stage: "proposal", timestamp: new Date().toISOString() }]
  };
}

export function stateFile(root, change) {
  return path.join(root, "codespec/changes", change, ".codespec-state.json");
}

export function listChanges(options = {}) {
  const paths = projectPaths(options);
  if (!fs.existsSync(paths.changes)) return [];
  return fs
    .readdirSync(paths.changes, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "archives")
    .map((entry) => entry.name)
    .sort();
}

export function resolveChange(options = {}, explicit) {
  if (explicit) return explicit;
  if (options.change) return options.change;
  const changes = listChanges(options);
  if (changes.length === 0) return null;
  if (changes.length > 1) throw new Error(`存在多个活动变更，请使用 --change 指定：${changes.join(", ")}`);
  return changes[0];
}

export function loadState(root, change) {
  return readJson(stateFile(root, change), initialState(change));
}

export function saveState(root, change, state) {
  writeJson(stateFile(root, change), state);
}

export function ensureStageRecord(state, stage) {
  state.stages[stage.key] ??= {
    status: "pending",
    clarified: false,
    confirmed: false,
    file: stage.file
  };
  return state.stages[stage.key];
}

export function stageStatus(root, change, state, stage) {
  const record = ensureStageRecord(state, stage);
  if (record.confirmed) return "confirmed";
  const previous = STAGES.slice(0, stage.index - 1);
  if (previous.some((item) => !ensureStageRecord(state, item).confirmed)) return "blocked";
  const file = path.join(root, "codespec/changes", change, stage.file);
  if (!fs.existsSync(file)) return record.status === "clarifying" ? "clarifying" : "pending";
  const content = fs.readFileSync(file, "utf8");
  if (isTemplateContent(content, stage.file)) return "template";
  return "draft";
}

export function isTemplateContent(content, fileName = "") {
  const text = content.trim();
  if (!text) return true;
  if (text === `# ${fileName}`) return true;
  return (
    /\[[^\]\n]*(?:占位符|需求编号|功能名|组件|服务|字段|名称|描述|来源|目标|系统|角色|规则|接口|流程|对象|算法|路径|类型|优先级)[^\]\n]*]/.test(text) ||
    /F-01\s*\|\s*\[功能名]|US-01/.test(text)
  );
}

export function getStatus(options = {}, explicit) {
  const paths = projectPaths(options);
  const change = resolveChange(options, explicit);
  if (!change) return { ok: false, code: "NO_ACTIVE_CHANGE", message: "未发现活动的 CodeSpec 变更。" };
  const state = loadState(paths.root, change);
  const stages = STAGES.map((stage) => ({
    ...stage,
    status: stageStatus(paths.root, change, state, stage),
    filePath: `codespec/changes/${change}/${stage.file}`
  }));
  return { ok: true, change, currentStage: state.currentStage, stages };
}

export function acceptStage(options = {}, explicitChange, explicitStage) {
  const paths = projectPaths(options);
  const change = resolveChange(options, explicitChange);
  if (!change) throw new Error("未发现活动的 CodeSpec 变更。");
  const state = loadState(paths.root, change);
  const stage = STAGES.find((item) => item.key === (explicitStage || state.currentStage));
  if (!stage) throw new Error(`未知阶段：${explicitStage}`);
  const status = stageStatus(paths.root, change, state, stage);
  if (status === "blocked") throw new Error(`前序阶段未完成，不能确认 ${stage.key}。`);
  if (status === "pending" || status === "clarifying") throw new Error(`缺少阶段文件：${stage.file}`);
  if (status === "template") throw new Error(`阶段文件仍像模板，不能确认：${stage.file}`);
  const record = ensureStageRecord(state, stage);
  record.status = "confirmed";
  record.clarified = true;
  record.confirmed = true;
  record.confirmedAt = new Date().toISOString();
  state.history.push({ action: "confirm-stage", stage: stage.key, timestamp: record.confirmedAt });
  const next = STAGES[stage.index];
  if (next) {
    state.currentStage = next.key;
    const nextRecord = ensureStageRecord(state, next);
    if (nextRecord.status === "pending") nextRecord.status = "clarifying";
  } else {
    state.currentStage = "completed";
  }
  saveState(paths.root, change, state);
  return {
    ok: true,
    change,
    acceptedStage: stage.key,
    acceptedLabel: stage.name,
    nextStage: next ?? null,
    completed: !next,
    readyForImplementation: !next,
    message: next ? `已确认 ${stage.key}，进入 ${next.name}。` : `已确认 ${stage.key}，文档链已验证，可进入实现。`,
    next: next ? ["继续在 opencode 中执行 /codespec"] : ["执行实现任务", "实现完成并验证通过后执行 codespec done"]
  };
}

export function archiveChange(options = {}, explicitChange) {
  const paths = projectPaths(options);
  const change = resolveChange(options, explicitChange);
  if (!change) throw new Error("未发现活动的 CodeSpec 变更。");
  const source = path.join(paths.changes, change);
  if (!fs.existsSync(source)) throw new Error(`变更目录不存在：${change}`);
  const state = loadState(paths.root, change);
  if (!options.force) {
    for (const stage of STAGES) {
      if (stageStatus(paths.root, change, state, stage) !== "confirmed") {
        throw new Error(`变更尚未完成，不能归档：${stage.key}`);
      }
      if (!fs.existsSync(path.join(source, stage.file))) {
        throw new Error(`缺少阶段文件，不能归档：${stage.file}`);
      }
    }
  }
  fs.mkdirSync(paths.archives, { recursive: true });
  const target = path.join(paths.archives, `${today()}-${change}`);
  if (fs.existsSync(target)) throw new Error(`归档目录已存在：${path.relative(paths.root, target)}`);
  fs.renameSync(source, target);
  return {
    ok: true,
    change,
    archive: path.relative(paths.root, target).replaceAll(path.sep, "/"),
    message: `已归档变更：${change}`,
    next: ["将 delta-spec.md 合并到全量 spec.md", "将 delta-design.md 合并到全量 design.md"]
  };
}
