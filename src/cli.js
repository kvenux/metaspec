import path from "node:path";
import { parseArgs } from "./args.js";
import { STAGES } from "./constants.js";
import { initProject, projectPaths } from "./project.js";
import { acceptStage, archiveChange, getStatus, listChanges, resolveChange, startChange } from "./state.js";
import { doctor, validateProject } from "./validation.js";
import { hasError } from "./util.js";
import { installIntegration, listIntegrations, removeIntegration } from "./integrations.js";
import { runCodeWikiScript, setupCodeWiki, syncCodeWiki } from "./codewiki.js";
import { applyLatestRun, generateDocs, generateModule, showLatestRun } from "./runs.js";

export async function main(argv = []) {
  const parsed = parseArgs(argv);
  const { command, args, options } = parsed;
  if (options.help || command === "help") return print(help(), options);

  let result;
  switch (command) {
    case "init":
      result = initProject(args[0], options);
      break;
    case "start":
    case "new":
      result = startChange(args[0], options);
      break;
    case "list":
      result = listCommand(options);
      break;
    case "status":
      result = statusCommand(options, args[0]);
      break;
    case "go":
    case "next":
      result = goCommand(options, args[0]);
      break;
    case "accept":
      result = acceptStage(options, args[0]);
      break;
    case "confirm":
      result = acceptStage(options, args[1], args[0]);
      break;
    case "validate":
      result = findingsCommand(validateProject(options, args[0]));
      break;
    case "doctor":
      result = findingsCommand(doctor(options));
      break;
    case "done":
      result = doneCommand(options, args[0]);
      break;
    case "archive":
      result = archiveChange(options, args[0]);
      break;
    case "integration":
      result = integrationCommand(options, args);
      break;
    case "codewiki":
      result = codewikiCommand(options, args);
      break;
    case "generate":
      result = generateCommand(options, args);
      break;
    case "show":
      result = showLatestRun(options);
      break;
    case "apply":
      result = applyLatestRun(options);
      break;
    case "sync":
      result = options.generate ? generateDocs(options) : syncCodeWiki(options);
      break;
    default:
      throw new Error(`未知命令：${command}`);
  }

  print(result, options);
  if (result.findings && hasError(result.findings)) process.exitCode = 1;
  if (result.ok === false && result.code !== "NO_ACTIVE_CHANGE") process.exitCode = 1;
}

function listCommand(options) {
  const changes = listChanges(options);
  return {
    ok: true,
    changes,
    message: changes.length ? "活动变更" : "没有活动变更",
    items: changes
  };
}

function statusCommand(options, explicit) {
  const result = getStatus(options, explicit);
  if (!result.ok) return result;
  return {
    ...result,
    message: `变更状态：${result.change}`,
    items: result.stages.map((stage) => `${stage.status.padEnd(9)} ${stage.key} ${stage.filePath}`)
  };
}

function goCommand(options, explicit) {
  const paths = projectPaths(options);
  const change = resolveChange(options, explicit);
  if (!change) {
    return {
      ok: false,
      code: "NO_ACTIVE_CHANGE",
      message: "未发现活动的 CodeSpec 变更。",
      next: ["codespec start AR202604270001-feature-name"]
    };
  }
  const status = getStatus(options, change);
  const current = status.stages.find((stage) => stage.key === status.currentStage) ?? status.stages.find((stage) => stage.status !== "confirmed");
  if (!current) {
    return { ok: true, change, nextAction: "done", message: "所有阶段已确认。", next: ["codespec done"] };
  }
  const nextAction = current.status === "draft" ? "await_user_accept" : current.status === "blocked" ? "complete_previous_stage" : "open_agent_stage";
  return {
    ok: true,
    change,
    stage: {
      index: current.index,
      total: STAGES.length,
      key: current.key,
      name: current.name,
      status: current.status,
      file: path.join(paths.root, current.filePath).replaceAll(path.sep, "/"),
      agentCommand: current.agentCommand,
      entryCommand: "/codespec",
      objective: current.objective
    },
    nextAction,
    next: nextAction === "await_user_accept" ? ["确认后执行 codespec accept"] : ["在 opencode 中执行 /codespec"]
  };
}

function findingsCommand(findings) {
  return { ok: !hasError(findings), findings, message: findings.length ? "发现以下问题：" : "未发现问题。" };
}

function doneCommand(options, explicit) {
  const findings = validateProject(options, explicit);
  if (hasError(findings)) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: "变更未通过校验，不能完成。",
      findings
    };
  }
  return archiveChange(options, explicit);
}

function integrationCommand(options, args) {
  const action = args[0] || "list";
  const name = args[1] || "opencode";
  const root = projectPaths(options).root;
  if (action === "list") {
    const integrations = listIntegrations();
    return { ok: true, integrations, message: "支持的 Agent 集成", items: integrations.map((item) => `${item.name} -> ${item.path}`) };
  }
  if (action === "install") {
    const result = installIntegration(root, name, options);
    return { ...result, message: result.message || `已安装 ${name} 集成。`, items: result.files.map((file) => file.path) };
  }
  if (action === "remove") return removeIntegration(root, name, options);
  throw new Error(`未知 integration 命令：${action}`);
}

function codewikiCommand(options, args) {
  const action = args[0];
  if (action === "setup") return setupCodeWiki(options);
  if (action === "pull") return syncCodeWiki(options);
  if (["push", "report", "mr"].includes(action)) return runCodeWikiScript(action, args.slice(1), options);
  throw new Error(`未知 codewiki 命令：${action}`);
}

function generateCommand(options, args) {
  const action = args[0];
  if (!action) return generateDocs(options);
  if (action === "module") return generateModule(args[1], options);
  throw new Error(`未知 generate 命令：${action}`);
}

function print(result, options) {
  if (typeof result === "string") {
    console.log(result);
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.findings) return printFindings(result.findings);
  if (result.message) console.log(result.message);
  if (Array.isArray(result.items)) {
    for (const item of result.items) console.log(item);
  }
  if (Array.isArray(result.next) && result.next.length) {
    console.log("下一步：");
    for (const item of result.next) console.log(`  ${item}`);
  }
}

function printFindings(findings) {
  if (!findings.length) {
    console.log("未发现问题。");
    return;
  }
  for (const finding of findings) {
    console.log(`[${finding.level}] ${finding.code} ${finding.path} - ${finding.message}`);
  }
}

function help() {
  return `CodeSpec CLI

用法：
  codespec init [path]
  codespec start <change>
  codespec list
  codespec status [change]
  codespec go [change] --json
  codespec accept [change]
  codespec confirm <stage> [change]
  codespec validate [change]
  codespec doctor
  codespec done [change]
  codespec archive [change] [--force]
  codespec integration list
  codespec integration install|remove opencode|claude-code|codex|all
  codespec codewiki setup|pull|push|report|mr
  codespec generate [--runner auto]
  codespec generate module <path>
  codespec show [--json]
  codespec apply [--force] [--json]
  codespec sync [--generate]
`;
}
