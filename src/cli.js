import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "./args.js";
import { STAGES } from "./constants.js";
import { detectExternalAgents, initProject, projectPaths } from "./project.js";
import { acceptStage, archiveChange, getStatus, listChanges, resolveChange, startChange } from "./state.js";
import { doctor, validateProject } from "./validation.js";
import { hasError } from "./util.js";
import { installIntegration, listIntegrations, removeIntegration } from "./integrations.js";
import { applyLatestRun, generateDocs, generateModule, showLatestRun } from "./runs.js";
import { printProgress, printProgressTitle, printResult, style } from "./output.js";

export async function main(argv = []) {
  const parsed = parseArgs(argv);
  const { command, args, options } = parsed;
  if (options.help || command === "help") return printResult(help(), options);

  let result;
  switch (command) {
    case "init":
      result = await initCommand(args[0], options);
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
    case "generate":
      result = generateCommand(options, args);
      break;
    case "show":
      result = showLatestRun(options);
      break;
    case "apply":
      result = applyLatestRun(options);
      break;
    default:
      throw new Error(`未知命令：${command}`);
  }

  printResult(result, options);
  if (result.findings && hasError(result.findings)) process.exitCode = 1;
  if (result.ok === false && result.code !== "NO_ACTIVE_CHANGE") process.exitCode = 1;
}

async function initCommand(targetPath, options) {
  const externalAgents = detectExternalAgents();
  if (!options.default_runner && shouldPrompt(options)) {
    options.default_runner = await promptDefaultRunner(externalAgents);
  }
  const validation = validateDefaultRunner(options.default_runner, externalAgents);
  if (validation) return validation;
  return initProject(targetPath, options);
}

function shouldPrompt(options) {
  return !options.json && process.stdin.isTTY && process.stdout.isTTY;
}

async function promptDefaultRunner(externalAgents) {
  const choices = ["auto"];
  if (externalAgents.codex.available) choices.push("codex");
  if (externalAgents.claude.available) choices.push("claude");

  console.log(style("CodeSpec init", "title"));
  console.log("选择默认文档生成工具。之后执行 codespec generate 时会默认使用该选择。");
  console.log("");
  console.log("  auto   推荐：codex -> claude -> deterministic stub");
  if (choices.includes("codex")) console.log("  codex  使用本机已登录 Codex CLI");
  if (choices.includes("claude")) console.log("  claude 使用本机已登录 Claude Code");
  if (externalAgents.opencode.available) console.log("  opencode 已检测到，但当前 generate runner 未实现");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`\n默认工具 [${choices.join("/")}] (auto): `)).trim().toLowerCase();
    return choices.includes(answer) ? answer : "auto";
  } finally {
    rl.close();
  }
}

function validateDefaultRunner(defaultRunner, externalAgents = null) {
  if (!defaultRunner) return null;
  if (["codex", "claude"].includes(defaultRunner) && externalAgents && !externalAgents[defaultRunner]?.available) {
    return {
      ok: false,
      code: "RUNNER_NOT_FOUND",
      runner: defaultRunner,
      message: `未找到 ${defaultRunner}，不能设为默认生成工具。`,
      next: ["codespec init --default-runner auto", `安装并登录 ${defaultRunner} 后重试`]
    };
  }
  if (["auto", "codex", "claude"].includes(defaultRunner)) return null;
  if (defaultRunner === "opencode") {
    return {
      ok: false,
      code: "RUNNER_NOT_IMPLEMENTED",
      runner: defaultRunner,
      message: "当前 generate runner 暂未实现 opencode，请选择 auto、codex 或 claude。",
      next: ["codespec init --default-runner auto"]
    };
  }
  return {
    ok: false,
    code: "RUNNER_NOT_IMPLEMENTED",
    runner: defaultRunner,
    message: `不支持的默认生成工具：${defaultRunner}。请使用 auto、codex 或 claude。`,
    next: ["codespec init --default-runner auto"]
  };
}

function attachGenerateProgress(options) {
  if (options.json) return options;
  return {
    ...options,
    progress(message) {
      printProgress(message);
    }
  };
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
      next: ["codespec start REQ202604270001-feature-name"]
    };
  }
  const status = getStatus(options, change);
  const current = status.stages.find((stage) => stage.key === status.currentStage) ?? status.stages.find((stage) => stage.status !== "confirmed");
  if (!current) {
    return {
      ok: true,
      change,
      nextAction: "implementation",
      message: "文档链已验证，可进入实现。实现完成并验证通过后再归档。",
      next: ["按 tasks.md 执行实现", "运行必要测试和验证", "完成后执行 codespec done"]
    };
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
      filePath: current.filePath,
      allowedWritePath: current.filePath,
      inputs: stageInputs(current, change, paths.root),
      requiresFullSpec: Boolean(current.requiresFullSpec),
      requiresFullDesign: Boolean(current.requiresFullDesign),
      requiresUserGenerationApproval: true,
      agentCommand: current.agentCommand,
      entryCommand: "/codespec",
      objective: current.objective
    },
    nextAction,
    next: nextAction === "await_user_accept" ? ["确认后执行 codespec accept"] : ["在 opencode 中执行 /codespec"]
  };
}

function stageInputs(stage, change, root) {
  return (stage.inputs || []).map((input) => {
    const filePath = input.endsWith(".md") && !input.startsWith("codespec/")
      ? `codespec/changes/${change}/${input}`
      : input;
    return {
      path: filePath,
      required: isRequiredStageInput(stage, filePath),
      exists: pathExists(root, filePath)
    };
  });
}

function isRequiredStageInput(stage, filePath) {
  if (filePath === "codespec/specs/spec.md") return Boolean(stage.requiresFullSpec);
  if (filePath === "codespec/specs/design.md") return Boolean(stage.requiresFullDesign);
  if (filePath === "codespec/service-context.md") return false;
  return true;
}

function pathExists(root, filePath) {
  return fs.existsSync(path.join(root, filePath));
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

function generateCommand(options, args) {
  const action = args[0];
  const generateOptions = attachGenerateProgress(options);
  if (!options.json) {
    if (!action) printProgressTitle("CodeSpec generate");
    if (action === "module") printProgressTitle("CodeSpec generate module");
  }
  if (!action) return generateDocs(generateOptions);
  if (action === "module") return generateModule(args[1], generateOptions);
  throw new Error(`未知 generate 命令：${action}`);
}

function help() {
  return `╭─ CodeSpec CLI ─────────────────────────────────────────╮
│ Repo-aware specs from local coding agents               │
╰─────────────────────────────────────────────────────────╯

常用流程：
  codespec init [path]
  codespec generate
  codespec show
  codespec apply

生成文档：
  codespec generate [--runner auto|codex|claude|opencode] [--mode auto|direct|react] [--model model]
  codespec generate module <path>

项目变更：
  codespec start <change>
  codespec list
  codespec status [change]
  codespec go [change] --json
  codespec accept [change]
  codespec confirm <stage> [change]
  codespec validate [change]
  codespec doctor
  codespec done [change]                         实现完成并验证通过后归档
  codespec archive [change] [--force]

集成：
  codespec integration list
  codespec integration install|remove opencode|claude-code|codex|all

选项：
  --runner auto|codex|claude|opencode   生成工具，默认 auto
  --mode auto|direct|react              生成模式，默认 auto
  --model model                         覆盖 runner 默认模型
  --json                                输出机器可读 JSON

说明：
  默认不需要 API key。auto 会优先复用本机已登录的 Codex/Claude CLI；
  没有可用本地工具时会 fallback 到 deterministic stub。
  opencode runner 当前未实现。
`;
}
