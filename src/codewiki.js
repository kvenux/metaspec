import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { projectPaths } from "./project.js";
import { writeJson } from "./util.js";

const TOKEN_ENV = "CODESPEC_CODEWIKI_TOKEN";
const SCRIPT_ENV = "CODESPEC_CODEWIKI_SCRIPTS";

export function setupCodeWiki(options = {}) {
  const paths = projectPaths(options);
  const config = {
    tokenEnv: TOKEN_ENV,
    scriptDirEnv: SCRIPT_ENV,
    scriptDir: options.script_dir || process.env[SCRIPT_ENV] || "",
    projectUrl: options.project_url || "",
    projectId: options.project_id || ""
  };
  if (options.token) process.env[TOKEN_ENV] = options.token;
  if (config.scriptDir) process.env[SCRIPT_ENV] = config.scriptDir;
  writeJson(path.join(paths.runtime, "codewiki.json"), config);
  return {
    ok: true,
    message: "已写入 CodeWiki 非敏感配置。",
    next: ["codespec sync"]
  };
}

export function syncCodeWiki(options = {}) {
  const token = options.token || process.env[TOKEN_ENV];
  if (!token) throw new Error(`缺少 CodeWiki token，请设置 ${TOKEN_ENV} 或使用 --token。`);
  const paths = projectPaths(options);
  const spec = path.join(paths.specs, "spec.md");
  const design = path.join(paths.specs, "design.md");
  const existing = [spec, design].filter((file) => fs.existsSync(file));
  if (existing.length && !options.force) {
    const err = new Error("同步会覆盖本地全量文档，请使用 --force。");
    err.code = "CODESPEC_SYNC_OVERWRITE_REQUIRED";
    throw err;
  }
  if (!options.generate) {
    throw new Error("当前复刻版未连接 CodeWiki API；未发现可同步的现成文档。需要真实平台适配或使用 --generate 接入生成流程。");
  }
  throw new Error("当前复刻版不触发 CodeWiki 生成；请接入企业 CodeWiki API 后实现。");
}

export function runCodeWikiScript(action, passthrough, options = {}) {
  const scripts = { push: "md_commit_push.py", report: "generate_sync_report.py", mr: "create_merge_request.py" };
  const script = scripts[action];
  if (!script) throw new Error(`未知 CodeWiki 动作：${action}`);
  const token = options.token || process.env[TOKEN_ENV];
  if (!token) throw new Error(`缺少 CodeWiki token，请设置 ${TOKEN_ENV} 或使用 --token。`);
  const scriptDir = options.script_dir || process.env[SCRIPT_ENV];
  if (!scriptDir) throw new Error(`缺少 CodeWiki 脚本目录，请设置 ${SCRIPT_ENV} 或使用 --script-dir。`);
  const scriptPath = path.join(scriptDir, script);
  if (!fs.existsSync(scriptPath)) throw new Error(`脚本不存在：${scriptPath}`);
  const result = spawnSync("python", [scriptPath, ...passthrough], { encoding: "utf8" });
  process.stdout.write(redact(result.stdout || "", token));
  process.stderr.write(redact(result.stderr || "", token));
  if (result.status !== 0) throw new Error(`CodeWiki 脚本执行失败：${script}`);
  return { ok: true, action, message: `CodeWiki ${action} 执行完成。` };
}

function redact(text, token) {
  return text.replaceAll(token, "<redacted>").replace(/Bearer\s+\S+/g, "Bearer <redacted>");
}
