import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { ensureDir, rel, slugify, writeJson } from "../util.js";
import { commonOutputRules, readFullTemplates, specBlackBoxRules } from "./templates.js";

export function runExternalGeneration({ paths, run, scan, plan, strategy }) {
  const executable = strategy.executable || findExecutable(strategy.runner);
  if (!executable) {
    return failure("RUNNER_NOT_FOUND", `未找到外部 runner：${strategy.runner}`, { runner: strategy.runner });
  }

  const guard = createWorkspaceGuard(paths, run);
  const promptsDir = path.join(run.dir, "logs/prompts");
  ensureDir(promptsDir);

  const designPrompt = buildDesignPrompt(scan, plan, strategy.runner);
  const designPromptFile = path.join(promptsDir, "design.md");
  fs.writeFileSync(designPromptFile, designPrompt, "utf8");
  const designResult = runRunnerTask({
    paths,
    run,
    executable,
    strategy,
    task: "design",
    prompt: designPrompt
  });
  if (!designResult.ok) return designResult;

  const effectiveStrategy = designResult.model && designResult.model !== strategy.model ? { ...strategy, model: designResult.model, fallbackModel: null } : strategy;
  const specPrompt = buildSpecPrompt(designResult.content, strategy.runner);
  const specPromptFile = path.join(promptsDir, "spec.md");
  fs.writeFileSync(specPromptFile, specPrompt, "utf8");
  const specResult = runRunnerTask({
    paths,
    run,
    executable,
    strategy: effectiveStrategy,
    task: "spec",
    prompt: specPrompt
  });
  if (!specResult.ok) return specResult;

  const workspaceError = guard.changed();
  if (workspaceError) return workspaceError;

  const tokens = {
    input: estimateTokens(designPrompt) + estimateTokens(specPrompt),
    output: estimateTokens(designResult.content) + estimateTokens(specResult.content)
  };
  const externalLog = {
    runner: strategy.runner,
    model: specResult.model || designResult.model || strategy.model,
    executable: executable.replaceAll(path.sep, "/"),
    calls: [designResult.log, specResult.log],
    prompts: {
      design: rel(run.dir, designPromptFile),
      spec: rel(run.dir, specPromptFile)
    },
    tokens
  };
  const externalLogFile = path.join(run.dir, "logs/external.json");
  writeJson(externalLogFile, externalLog);

  return {
    ok: true,
    design: designResult.content,
    spec: specResult.content,
    logs: {
      external: rel(run.dir, externalLogFile),
      prompts: externalLog.prompts
    },
    tokens,
    provider: strategy.runner,
    model: specResult.model || designResult.model || strategy.model
  };
}

export function runRunnerTask({ paths, run, executable, strategy, task, prompt }) {
  const resolvedExecutable = executable || strategy.executable || findExecutable(strategy.runner);
  if (!resolvedExecutable) {
    return failure("RUNNER_NOT_FOUND", `未找到外部 runner：${strategy.runner}`, { runner: strategy.runner });
  }

  const attempts = [strategy.model, strategy.fallbackModel].filter(Boolean);
  const taskSlug = slugify(task) || "task";
  const attemptLogs = [];
  let lastFailure = null;

  for (const [index, model] of attempts.entries()) {
    const attemptName = index === 0 ? taskSlug : `${taskSlug}-fallback`;
    const attemptStrategy = { ...strategy, model };
    const stdoutFile = path.join(run.dir, `logs/${strategy.runner}-${attemptName}.stdout.log`);
    const stderrFile = path.join(run.dir, `logs/${strategy.runner}-${attemptName}.stderr.log`);
    const outputFile = path.join(run.dir, `logs/${strategy.runner}-${attemptName}-last-message.md`);
    const args = buildArgs({ paths, strategy: attemptStrategy, outputFile });
    const result = spawnRunner(resolvedExecutable, args, paths.root, prompt);
    fs.writeFileSync(stdoutFile, result.stdout || "", "utf8");
    fs.writeFileSync(stderrFile, result.stderr || "", "utf8");

    const commandLog = {
      task,
      model,
      status: result.status,
      command: `${strategy.runner} ${args.map(shellToken).join(" ")}`,
      stdoutLog: rel(run.dir, stdoutFile),
      stderrLog: rel(run.dir, stderrFile)
    };
    attemptLogs.push(commandLog);

    if (result.error || result.status !== 0) {
      lastFailure = failure("EXTERNAL_RUNNER_FAILED", `外部 runner 执行失败：${strategy.runner} ${task}`, {
        runner: strategy.runner,
        task,
        status: result.status,
        log: commandLog,
        attempts: attemptLogs,
        stderr: result.stderr
      });
      continue;
    }

    const parsed = parseOutput({ strategy: attemptStrategy, task, stdout: result.stdout || "", outputFile });
    if (!parsed.ok) {
      lastFailure = failure(parsed.code, parsed.message, {
        runner: strategy.runner,
        task,
        log: commandLog,
        attempts: attemptLogs
      });
      continue;
    }

    return {
      ok: true,
      content: parsed.content,
      model,
      log: {
        ...commandLog,
        attempts: attemptLogs,
        outputSource: parsed.source
      }
    };
  }

  return lastFailure || failure("EXTERNAL_RUNNER_FAILED", `外部 runner 执行失败：${strategy.runner} ${task}`, { runner: strategy.runner, task });
}

function buildArgs({ paths, strategy, outputFile }) {
  if (strategy.runner === "codex") {
    return ["exec", "-C", paths.root, "--model", strategy.model, "--sandbox", "read-only", "--output-last-message", outputFile, "-"];
  }
  return [
    "--model",
    strategy.model,
    "-p",
    "--output-format",
    "json",
    "--max-turns",
    "3",
    "--permission-mode",
    "plan",
    "--tools",
    "Read,Grep,Glob"
  ];
}

function spawnRunner(executable, args, cwd, prompt) {
  return spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    input: prompt,
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(executable),
    windowsHide: true,
    timeout: 120000
  });
}

function parseOutput({ strategy, task, stdout, outputFile }) {
  if (strategy.runner === "codex" && fs.existsSync(outputFile)) {
    const rawContent = fs.readFileSync(outputFile, "utf8").trim();
    const content = extractMarkdown(rawContent);
    if (content) return { ok: true, content, source: rel(path.dirname(outputFile), outputFile) };
    if (rawContent) {
      return {
        ok: false,
        code: "EXTERNAL_RUNNER_UNPARSEABLE_OUTPUT",
        message: `外部 runner 未输出可解析的 Markdown：${strategy.runner} ${task}`
      };
    }
  }

  const trimmed = stdout.trim();
  if (!trimmed) {
    return { ok: false, code: "EXTERNAL_RUNNER_EMPTY_OUTPUT", message: `外部 runner 输出为空：${strategy.runner} ${task}` };
  }

  try {
    const json = JSON.parse(trimmed);
    const content = extractMarkdown(json.content || json.markdown || json.final || json.result);
    if (content) return { ok: true, content, source: "stdout-json" };
  } catch {
    // Fall through to markdown parsing.
  }

  const jsonl = extractMarkdown(parseJsonl(trimmed));
  if (jsonl) return { ok: true, content: jsonl, source: "stdout-jsonl" };

  const markdown = extractMarkdown(trimmed);
  if (markdown) return { ok: true, content: markdown, source: "stdout-markdown" };
  return {
    ok: false,
    code: "EXTERNAL_RUNNER_UNPARSEABLE_OUTPUT",
    message: `外部 runner 未输出可解析的 Markdown：${strategy.runner} ${task}`
  };
}

function buildDesignPrompt(scan, plan, runner) {
  const templates = readFullTemplates();
  return `你是 MetaSpec 文档生成 runner（${runner}）。
当前任务只允许读取和分析仓库。
禁止修改任何文件。
禁止调用 git apply。
禁止写入 metaspec/specs。
MetaSpec CLI 会负责保存文件。
请只输出 design.md 的最终 Markdown。

${commonOutputRules()}

模板要求：
1. 必须严格使用下面 DESIGN 模板的主章节结构和标题。
2. 保留模板中的一级/二级标题语义，但用真实项目内容替换占位内容。
3. 不适用的章节不要删除，写“无明确设计”或“待确认”，并说明依据。

DESIGN 模板：
${templates.design}

Project: ${plan.projectName}
Modules:
${plan.modules.map((module) => `- ${module.name}: ${module.path}`).join("\n")}

File tree:
${scan.fileTree}
`;
}

function buildSpecPrompt(design, runner) {
  const templates = readFullTemplates();
  return `你是 MetaSpec 文档生成 runner（${runner}）。
禁止修改任何文件。
禁止调用 git apply。
禁止写入 metaspec/specs。
MetaSpec CLI 会负责保存文件。
请只输出 spec.md 的最终 Markdown。
必须只从下面生成后的 design.md 反推 spec.md，不要直接使用源码上下文。

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

export function createWorkspaceGuard(paths, run = null) {
  const allowedRunDir = run?.dir ? rel(paths.root, run.dir) : null;
  const before = snapshotWorkspace(paths.root, allowedRunDir);
  return {
    changed() {
      const after = snapshotWorkspace(paths.root, allowedRunDir);
      const changed = [];
      for (const [file, content] of after.entries()) {
        if (!before.has(file) || before.get(file) !== content) changed.push(file);
      }
      for (const file of before.keys()) {
        if (!after.has(file)) changed.push(file);
      }
      return workspaceFailure([...new Set(changed)].filter((file) => !isAllowedRunPath(file, allowedRunDir)));
    }
  };
}

function workspaceFailure(changedFiles) {
  if (!changedFiles.length) return null;
  const modifiedSpecs = changedFiles.filter((file) => file === "metaspec/specs/spec.md" || file === "metaspec/specs/design.md");
  if (modifiedSpecs.length === changedFiles.length) {
    return failure("EXTERNAL_RUNNER_MODIFIED_SPECS", "外部 runner 修改了 metaspec/specs，生成已中止。请检查 git diff。", {
      modifiedSpecs
    });
  }
  return failure("EXTERNAL_RUNNER_MODIFIED_WORKTREE", "外部 runner 修改了 run 目录之外的工作区文件，生成已中止。请检查 git diff。", {
    modifiedFiles: changedFiles
  });
}

function snapshotWorkspace(root, allowedRunDir) {
  const snapshot = new Map();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const relative = rel(root, absolute);
      if (entry.isDirectory()) {
        if ([".git", "node_modules"].includes(entry.name)) continue;
        if (isAllowedRunPath(relative, allowedRunDir)) continue;
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isAllowedRunPath(relative, allowedRunDir)) continue;
      snapshot.set(relative, fileHash(absolute));
    }
  }
  walk(root);
  return snapshot;
}

function fileHash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function isAllowedRunPath(file, allowedRunDir) {
  return Boolean(allowedRunDir && (file === allowedRunDir || file.startsWith(`${allowedRunDir}/`)));
}

function parseJsonl(text) {
  let content = "";
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      const candidate = event.content || event.markdown || event.final || event.result || event.message?.content;
      const role = event.role || event.type || event.event || event.message?.role;
      if (typeof candidate === "string" && candidate.trim() && /assistant|final|message|result/i.test(String(role || "final"))) {
        content = candidate.trim();
      }
    } catch {
      // Ignore non-JSON log lines.
    }
  }
  return content;
}

function extractMarkdown(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const markdownStart = text.indexOf("# ");
  if (markdownStart >= 0) return text.slice(markdownStart).trim();
  return "";
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

function failure(code, message, extra = {}) {
  return { ok: false, code, message, ...extra, next: extra.next || nextForError(code) };
}

function nextForError(code) {
  switch (code) {
    case "RUNNER_NOT_FOUND":
      return ["metaspec generate --runner auto", "确认对应 CLI 已安装并登录"];
    case "EXTERNAL_RUNNER_FAILED":
      return ["查看 run 目录 logs/*stdout.log 和 logs/*stderr.log", "metaspec generate --runner auto"];
    case "EXTERNAL_RUNNER_EMPTY_OUTPUT":
    case "EXTERNAL_RUNNER_UNPARSEABLE_OUTPUT":
      return ["查看 run 目录 logs/*stdout.log 和 logs/*stderr.log", "确认 runner 最终输出 Markdown 标题"];
    case "EXTERNAL_RUNNER_MODIFIED_WORKTREE":
    case "EXTERNAL_RUNNER_MODIFIED_SPECS":
      return ["git diff", "检查外部 runner 修改后再重新生成"];
    default:
      return ["metaspec show"];
  }
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function shellToken(value) {
  return String(value).includes(" ") ? JSON.stringify(value) : String(value);
}
