import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CLI = path.resolve("bin/codespec.js");

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codespec-test-"));
}

function run(args, options = {}) {
  const { env, ...spawnOptions } = options;
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      CODESPEC_LLM_PROVIDER: "",
      LLM_PROVIDER: "",
      CODESPEC_LLM_API_KEY: "",
      LLM_API_KEY: "",
      CODESPEC_LLM_MODEL: "",
      LLM_MODEL: "",
      ...env
    },
    ...spawnOptions
  });
  return result;
}

function json(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function makeMockCommand(dir, name, output) {
  const extension = process.platform === "win32" ? ".cmd" : "";
  const file = path.join(dir, `${name}${extension}`);
  const body = process.platform === "win32" ? `@echo off\r\necho ${output}\r\n` : `#!/usr/bin/env sh\necho "${output}"\n`;
  fs.writeFileSync(file, body, "utf8");
  if (process.platform !== "win32") fs.chmodSync(file, 0o755);
  return file;
}

function writeProjectFile(root, file, content = "") {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

test("init is idempotent and does not copy business templates", () => {
  const root = tempProject();
  const first = json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  assert.equal(first.ok, true);
  assert.ok(fs.existsSync(path.join(root, "codespec/specs")));
  assert.ok(fs.existsSync(path.join(root, ".codespec-cli/config.yaml")));
  assert.equal(fs.existsSync(path.join(root, "codespec/specs/spec.md")), false);
  assert.equal(fs.existsSync(path.join(root, "codespec/specs/design.md")), false);

  const second = json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  assert.equal(second.ok, true);
  assert.ok(second.skipped.includes(".codespec-cli/config.yaml"));
});

test("init records local coding agent detection in result and config", () => {
  const root = tempProject();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "codespec-bin-"));
  makeMockCommand(binDir, "codex", "codex mock 1.0.0");

  const env = { ...process.env, PATH: binDir, Path: binDir };
  const result = json(run(["init", root, "--integration", "none", "--no-codewiki", "--probe-models", "--json"], { env }));
  assert.equal(result.generation.probeModels.requested, true);
  assert.equal(result.generation.probeModels.status, "not_implemented");
  assert.equal(result.generation.externalAgents.codex.available, true);
  assert.equal(result.generation.externalAgents.codex.version, "codex mock 1.0.0");
  assert.equal(result.generation.externalAgents.codex.recommendedModel, "gpt-5.3-codex-spark");
  assert.equal(result.generation.externalAgents.codex.fallbackModel, "gpt-5.5");
  assert.equal(result.generation.externalAgents.claude.available, false);
  assert.equal(result.generation.externalAgents.claude.recommendedModel, "claude-sonnet-4-6");

  const config = fs.readFileSync(path.join(root, ".codespec-cli/config.yaml"), "utf8");
  assert.match(config, /generation:/);
  assert.match(config, /requested: true/);
  assert.match(config, /status: not_implemented/);
  assert.match(config, /externalAgents:/);
  assert.match(config, /codex:\n      available: true/);
  assert.match(config, /claude:\n      available: false/);
});

test("init preserves user-owned generation config while refreshing agent detection", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  const configFile = path.join(root, ".codespec-cli/config.yaml");
  const original = fs.readFileSync(configFile, "utf8");
  fs.writeFileSync(configFile, original.replace("generation:\n", "generation:\n  customKey: keep-me\n"), "utf8");

  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  const config = fs.readFileSync(configFile, "utf8");
  assert.match(config, /customKey: keep-me/);
  assert.match(config, /externalAgents:/);
  assert.equal((config.match(/generation:/g) || []).length, 1);
});

test("start creates only change directory and state", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  const result = json(run(["--path", root, "start", "AR20260428-user-login", "--json"]));
  assert.equal(result.change, "AR20260428-user-login");
  assert.ok(fs.existsSync(path.join(root, "codespec/changes/AR20260428-user-login/.codespec-state.json")));
  assert.equal(fs.existsSync(path.join(root, "codespec/changes/AR20260428-user-login/proposal.md")), false);
});

test("status, go, accept, and archive follow the stage model", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  json(run(["--path", root, "start", "AR20260428-user-login", "--json"]));
  let status = json(run(["--path", root, "status", "--json"]));
  assert.equal(status.stages[0].status, "pending");
  assert.equal(status.stages[1].status, "blocked");

  const changeDir = path.join(root, "codespec/changes/AR20260428-user-login");
  fs.writeFileSync(path.join(changeDir, "proposal.md"), "# 登录需求澄清\n\n范围已明确，包含验收标准。\n", "utf8");
  let go = json(run(["--path", root, "go", "--json"]));
  assert.equal(go.nextAction, "await_user_accept");

  const accepted = json(run(["--path", root, "accept", "--json"]));
  assert.equal(accepted.acceptedStage, "proposal");
  status = json(run(["--path", root, "status", "--json"]));
  assert.equal(status.stages[0].status, "confirmed");
  assert.equal(status.stages[1].status, "pending");

  for (const [file, body] of [
    ["delta-spec.md", "# 增量规格\n\n## ADDED Requirements\n无\n## MODIFIED Requirements\n无\n## REMOVED Requirements\n无\n"],
    ["delta-design.md", "# 增量设计\n\n设计覆盖规格。\n"],
    ["tasks.md", "# 任务\n\n- 实现登录\n- 增加测试验证\n"],
    ["validation.md", "# 验证\n\n结论：允许进入实现。\n"]
  ]) {
    fs.writeFileSync(path.join(changeDir, file), body, "utf8");
    json(run(["--path", root, "accept", "--json"]));
  }

  const archived = json(run(["--path", root, "archive", "--json"]));
  assert.match(archived.archive, /codespec\/changes\/archives\/\d{4}-\d{2}-\d{2}-AR20260428-user-login/);
});

test("integration install/remove preserves modified files", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  const installed = json(run(["--path", root, "integration", "install", "opencode", "--json"]));
  assert.equal(installed.integration, "opencode");
  const commandFile = path.join(root, ".opencode/command/codespec.md");
  fs.appendFileSync(commandFile, "\n用户修改\n", "utf8");
  const removed = json(run(["--path", root, "integration", "remove", "opencode", "--json"]));
  assert.ok(removed.kept.includes(".opencode/command/codespec.md"));
  assert.ok(fs.existsSync(commandFile));
});

test("integration install supports Claude Code and Codex repository commands", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));

  const claude = json(run(["--path", root, "integration", "install", "claude-code", "--json"]));
  assert.equal(claude.integration, "claude-code");
  assert.ok(fs.existsSync(path.join(root, ".claude/commands/codespec.md")));
  assert.ok(fs.existsSync(path.join(root, ".claude/commands/codespec-proposal.md")));
  assert.ok(fs.existsSync(path.join(root, ".claude/skills/codespec/SKILL.md")));

  const codex = json(run(["--path", root, "integration", "install", "codex", "--json"]));
  assert.equal(codex.integration, "codex");
  assert.ok(fs.existsSync(path.join(root, ".agents/skills/codespec/SKILL.md")));
  assert.ok(fs.existsSync(path.join(root, ".agents/skills/codespec-validation/SKILL.md")));

  const list = json(run(["--path", root, "integration", "list", "--json"]));
  assert.deepEqual(
    list.integrations.map((integration) => integration.name),
    ["opencode", "claude-code", "codex"]
  );
});

test("init installs all supported integrations by default", () => {
  const root = tempProject();
  const result = json(run(["init", root, "--no-codewiki", "--json"]));
  assert.equal(result.integration.integration, "all");
  assert.ok(fs.existsSync(path.join(root, ".opencode/command/codespec.md")));
  assert.ok(fs.existsSync(path.join(root, ".claude/commands/codespec.md")));
  assert.ok(fs.existsSync(path.join(root, ".agents/skills/codespec/SKILL.md")));
});

test("validate reports required structure errors", () => {
  const root = tempProject();
  const result = run(["--path", root, "validate", "--json"]);
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.ok(payload.findings.some((finding) => finding.code === "CS001"));
});

test("show reports a clear message when no generated run exists", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  const result = run(["--path", root, "show", "--json"]);
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "NO_GENERATED_RUN");
  assert.match(payload.message, /codespec generate/);
});

test("generate creates a run with manifest, spec, and design stub artifacts", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));

  const generated = json(run(["--path", root, "generate", "--json"]));
  assert.equal(generated.ok, true);
  assert.equal(generated.status, "generated");

  const runDir = path.join(root, ".codespec-cli/runs", generated.runId);
  const manifest = JSON.parse(fs.readFileSync(path.join(runDir, "manifest.json"), "utf8"));
  assert.equal(manifest.runId, generated.runId);
  assert.equal(manifest.runner, "auto");
  assert.equal(manifest.generationMode, "stub");
  assert.equal(manifest.artifacts.spec, "spec.md");
  assert.equal(manifest.artifacts.design, "design.md");
  assert.match(fs.readFileSync(path.join(runDir, "spec.md"), "utf8"), /generated by codespec stub/);
  assert.match(fs.readFileSync(path.join(runDir, "design.md"), "utf8"), /generated by codespec stub/);
});

test("generate scans repository and plans src modules", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  writeProjectFile(root, "README.md", "# Demo\n");
  writeProjectFile(root, "docs/api.md", "# API\n");
  writeProjectFile(root, "src/auth/login.js", "export function login() {}\n");
  writeProjectFile(root, "src/build/index.js", "export function buildFeature() {}\n");
  writeProjectFile(root, "src/payment/pay.js", "export function pay() {}\n");
  writeProjectFile(root, "node_modules/ignored/index.js", "ignored\n");
  writeProjectFile(root, ".git/config", "ignored\n");
  writeProjectFile(root, "dist/bundle.js", "ignored\n");
  writeProjectFile(root, "coverage/report.txt", "ignored\n");
  writeProjectFile(root, ".codespec-cli/ignored.txt", "ignored\n");

  const generated = json(run(["--path", root, "generate", "--json"]));
  const runDir = path.join(root, ".codespec-cli/runs", generated.runId);
  const scanFile = path.join(runDir, "logs/scan.json");
  const planFile = path.join(runDir, "plan.json");
  assert.ok(fs.existsSync(scanFile));
  assert.ok(fs.existsSync(planFile));

  const scan = JSON.parse(fs.readFileSync(scanFile, "utf8"));
  assert.ok(scan.includedFiles.includes("src/auth/login.js"));
  assert.ok(scan.includedFiles.includes("src/build/index.js"));
  assert.ok(scan.includedFiles.includes("src/payment/pay.js"));
  assert.ok(scan.includedFiles.includes("README.md"));
  assert.ok(scan.includedFiles.includes("docs/api.md"));
  assert.equal(scan.includedFiles.includes("node_modules/ignored/index.js"), false);
  assert.equal(scan.includedFiles.includes("dist/bundle.js"), false);
  assert.equal(scan.includedFiles.includes("coverage/report.txt"), false);
  assert.equal(scan.includedFiles.includes(".codespec-cli/ignored.txt"), false);
  assert.match(scan.fileTree, /^docs\/$/m);
  assert.match(scan.fileTree, /^  api\.md$/m);
  assert.match(scan.fileTree, /^src\/$/m);
  assert.match(scan.fileTree, /^  auth\/$/m);
  assert.match(scan.fileTree, /^    login\.js$/m);
  assert.match(scan.fileTree, /^  build\/$/m);
  assert.match(scan.fileTree, /^    index\.js$/m);
  assert.deepEqual(
    scan.readmeFiles.map((file) => file.path),
    ["README.md"]
  );
  assert.deepEqual(
    scan.docsFiles.map((file) => file.path),
    ["docs/api.md"]
  );

  const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
  assert.deepEqual(
    plan.modules.map((module) => module.path),
    ["src/auth", "src/build", "src/payment"]
  );
  assert.equal(plan.primaryExtension, ".js");

  const manifest = JSON.parse(fs.readFileSync(path.join(runDir, "manifest.json"), "utf8"));
  assert.equal(manifest.artifacts.plan, "plan.json");
  assert.equal(manifest.logs.scan, "logs/scan.json");
  assert.equal(manifest.planSummary.modules, 3);
  assert.equal(manifest.scanSummary.includedFiles, scan.includedFiles.length);
});

test("generate planning falls back to Project Root when no obvious module exists", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  writeProjectFile(root, "index.js", "console.log('small project');\n");

  const generated = json(run(["--path", root, "generate", "--json"]));
  const plan = JSON.parse(fs.readFileSync(path.join(root, ".codespec-cli/runs", generated.runId, "plan.json"), "utf8"));
  assert.deepEqual(plan.modules, [
    {
      name: "Project Root",
      path: ".",
      description: "Fallback module for a small project without obvious source module directories."
    }
  ]);
});

test("scan ignores monorepo package artifacts without hiding source build modules", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  writeProjectFile(root, "packages/api/src/index.ts", "export const api = true;\n");
  writeProjectFile(root, "packages/api/src/build/task.ts", "export const task = true;\n");
  writeProjectFile(root, "packages/api/dist/index.js", "compiled\n");
  writeProjectFile(root, "packages/@acme/api/src/index.ts", "export const scoped = true;\n");
  writeProjectFile(root, "packages/@acme/api/src/build/task.ts", "export const scopedTask = true;\n");
  writeProjectFile(root, "packages/@acme/api/dist/index.js", "compiled\n");
  writeProjectFile(root, "packages/@acme/api/build/app.js", "compiled\n");
  writeProjectFile(root, "packages/web/build/app.js", "compiled\n");
  writeProjectFile(root, "apps/web/.next/server.js", "compiled\n");
  writeProjectFile(root, "apps/web/coverage/report.js", "compiled\n");
  writeProjectFile(root, "apps/admin/web/src/index.ts", "export const admin = true;\n");
  writeProjectFile(root, "apps/admin/web/src/build/task.ts", "export const adminTask = true;\n");
  writeProjectFile(root, "apps/admin/web/dist/index.js", "compiled\n");
  writeProjectFile(root, "apps/admin/web/build/app.js", "compiled\n");
  writeProjectFile(root, "src/build/index.js", "export const build = true;\n");

  const generated = json(run(["--path", root, "generate", "--json"]));
  const scan = JSON.parse(fs.readFileSync(path.join(root, ".codespec-cli/runs", generated.runId, "logs/scan.json"), "utf8"));
  assert.ok(scan.includedFiles.includes("packages/api/src/index.ts"));
  assert.ok(scan.includedFiles.includes("packages/api/src/build/task.ts"));
  assert.ok(scan.includedFiles.includes("packages/@acme/api/src/index.ts"));
  assert.ok(scan.includedFiles.includes("packages/@acme/api/src/build/task.ts"));
  assert.ok(scan.includedFiles.includes("apps/admin/web/src/index.ts"));
  assert.ok(scan.includedFiles.includes("apps/admin/web/src/build/task.ts"));
  assert.ok(scan.includedFiles.includes("src/build/index.js"));
  assert.equal(scan.includedFiles.includes("packages/api/dist/index.js"), false);
  assert.equal(scan.includedFiles.includes("packages/@acme/api/dist/index.js"), false);
  assert.equal(scan.includedFiles.includes("packages/@acme/api/build/app.js"), false);
  assert.equal(scan.includedFiles.includes("packages/web/build/app.js"), false);
  assert.equal(scan.includedFiles.includes("apps/web/.next/server.js"), false);
  assert.equal(scan.includedFiles.includes("apps/web/coverage/report.js"), false);
  assert.equal(scan.includedFiles.includes("apps/admin/web/dist/index.js"), false);
  assert.equal(scan.includedFiles.includes("apps/admin/web/build/app.js"), false);
  assert.equal(scan.primaryExtension, ".ts");
});

test("generate rejects non-auto runners in P0 without creating a stub run", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));

  const result = run(["--path", root, "generate", "--runner", "codex", "--json"]);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "RUNNER_NOT_IMPLEMENTED");
  assert.equal(payload.runner, "codex");
  assert.equal(fs.readdirSync(path.join(root, ".codespec-cli/runs")).filter((entry) => entry !== "latest.json").length, 0);
});

test("generate returns JSON on stdout when project is not initialized", () => {
  const root = tempProject();
  const result = run(["--path", root, "generate", "--json"]);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "CODESPEC_NOT_INITIALIZED");
});

test("help does not advertise unimplemented external runners", () => {
  const result = run(["help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /codespec generate \[--runner auto\]/);
  assert.doesNotMatch(result.stdout, /codespec generate .*codex/);
});

test("show --json returns the latest run manifest", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  const generated = json(run(["--path", root, "generate", "--json"]));

  const shown = json(run(["--path", root, "show", "--json"]));
  assert.equal(shown.runId, generated.runId);
  assert.equal(shown.status, "generated");
  assert.equal(shown.artifacts.spec, "spec.md");
});

test("show displays scan and planning summary", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  writeProjectFile(root, "src/auth/login.js", "export function login() {}\n");
  writeProjectFile(root, "src/payment/pay.js", "export function pay() {}\n");
  json(run(["--path", root, "generate", "--json"]));

  const shown = run(["--path", root, "show"]);
  assert.equal(shown.status, 0, shown.stderr);
  assert.match(shown.stdout, /included files: \d+/);
  assert.match(shown.stdout, /planned modules: 2/);
});

test("fake direct generate writes prompts, llm log, and design-derived spec", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  writeProjectFile(root, "src/auth/login.js", "export function login() {}\n");
  writeProjectFile(root, "src/payment/pay.js", "export function pay() {}\n");

  const generated = json(run(["--path", root, "generate", "--json"], { env: { CODESPEC_LLM_PROVIDER: "fake" } }));
  const runDir = path.join(root, ".codespec-cli/runs", generated.runId);
  for (const file of ["design.md", "spec.md", "logs/prompts/design.md", "logs/prompts/spec.md", "logs/llm.json"]) {
    assert.ok(fs.existsSync(path.join(runDir, file)), file);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(runDir, "manifest.json"), "utf8"));
  assert.equal(manifest.generationMode, "direct");
  assert.equal(manifest.provider, "fake");
  assert.equal(manifest.model, "fake-codespec-model");
  assert.equal(manifest.logs.llm, "logs/llm.json");
  assert.equal(manifest.logs.prompts.design, "logs/prompts/design.md");
  assert.equal(manifest.logs.prompts.spec, "logs/prompts/spec.md");
  assert.equal(typeof manifest.tokens.input, "number");
  assert.equal(typeof manifest.tokens.output, "number");

  const design = fs.readFileSync(path.join(runDir, "design.md"), "utf8");
  assert.match(design, /src\/auth/);
  assert.match(design, /src\/payment/);

  const spec = fs.readFileSync(path.join(runDir, "spec.md"), "utf8");
  assert.match(spec, /Derived from design/);
  const specPrompt = fs.readFileSync(path.join(runDir, "logs/prompts/spec.md"), "utf8");
  assert.match(specPrompt, /Generated design\.md:/);
  assert.match(specPrompt, /src\/auth/);
});

test("sync --generate uses fake direct generation when fake provider is selected", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  writeProjectFile(root, "src/auth/login.js", "export function login() {}\n");

  const generated = json(run(["--path", root, "sync", "--generate", "--json"], { env: { CODESPEC_LLM_PROVIDER: "fake" } }));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".codespec-cli/runs", generated.runId, "manifest.json"), "utf8"));
  assert.equal(manifest.generationMode, "direct");
  assert.equal(manifest.provider, "fake");
  assert.ok(fs.existsSync(path.join(root, ".codespec-cli/runs", generated.runId, "logs/llm.json")));
});

test("show displays fake direct generation metadata", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  writeProjectFile(root, "src/auth/login.js", "export function login() {}\n");
  json(run(["--path", root, "generate", "--json"], { env: { CODESPEC_LLM_PROVIDER: "fake" } }));

  const shown = run(["--path", root, "show"]);
  assert.equal(shown.status, 0, shown.stderr);
  assert.match(shown.stdout, /generation mode: direct/);
  assert.match(shown.stdout, /provider: fake/);
  assert.match(shown.stdout, /model: fake-codespec-model/);
});

test("explicit real provider without API key fails before creating a run", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));

  const result = run(["--path", root, "generate", "--json"], { env: { CODESPEC_LLM_PROVIDER: "openai" } });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "LLM_NOT_CONFIGURED");
  assert.equal(payload.provider, "openai");
  assert.equal(fs.readdirSync(path.join(root, ".codespec-cli/runs")).filter((entry) => entry !== "latest.json").length, 0);
});

test("apply writes latest spec and design, protects existing files, and supports force", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  const generated = json(run(["--path", root, "generate", "--json"]));

  const applied = json(run(["--path", root, "apply", "--json"]));
  assert.equal(applied.ok, true);
  assert.ok(fs.existsSync(path.join(root, "codespec/specs/spec.md")));
  assert.ok(fs.existsSync(path.join(root, "codespec/specs/design.md")));

  const blocked = run(["--path", root, "apply", "--json"]);
  assert.equal(blocked.status, 1);
  const blockedPayload = JSON.parse(blocked.stdout);
  assert.equal(blockedPayload.code, "APPLY_OVERWRITE_REQUIRED");
  assert.match(blockedPayload.message, /--force/);

  const runSpec = path.join(root, ".codespec-cli/runs", generated.runId, "spec.md");
  fs.writeFileSync(runSpec, "<!-- generated by codespec stub -->\n# Forced SPEC\n", "utf8");
  const forced = json(run(["--path", root, "apply", "--force", "--json"]));
  assert.equal(forced.ok, true);
  assert.match(fs.readFileSync(path.join(root, "codespec/specs/spec.md"), "utf8"), /Forced SPEC/);
});

test("sync --generate is equivalent to generate and does not require CodeWiki token", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));

  const generated = json(run(["--path", root, "sync", "--generate", "--json"]));
  assert.equal(generated.ok, true);
  assert.ok(fs.existsSync(path.join(root, ".codespec-cli/runs", generated.runId, "manifest.json")));
  assert.ok(fs.existsSync(path.join(root, ".codespec-cli/runs", generated.runId, "spec.md")));
  assert.ok(fs.existsSync(path.join(root, ".codespec-cli/runs", generated.runId, "logs/scan.json")));
  assert.ok(fs.existsSync(path.join(root, ".codespec-cli/runs", generated.runId, "plan.json")));
});

test("generate module writes a module stub into the current run", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  const generated = json(run(["--path", root, "generate", "--json"]));

  const module = json(run(["--path", root, "generate", "module", "src/auth", "--json"]));
  assert.equal(module.ok, true);
  assert.equal(module.runId, generated.runId);
  assert.equal(module.module, "src/auth");

  const moduleFile = path.join(root, ".codespec-cli/runs", generated.runId, "modules/src-auth.md");
  assert.match(fs.readFileSync(moduleFile, "utf8"), /generated by codespec stub/);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".codespec-cli/runs", generated.runId, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.artifacts.modules, ["modules/src-auth.md"]);
});

test("generate module creates a run when no current run exists", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));

  const module = json(run(["--path", root, "generate", "module", "lib/core", "--json"]));
  assert.equal(module.ok, true);
  assert.equal(module.module, "lib/core");
  assert.ok(fs.existsSync(path.join(root, ".codespec-cli/runs", module.runId, "manifest.json")));
  assert.ok(fs.existsSync(path.join(root, ".codespec-cli/runs", module.runId, "modules/lib-core.md")));
});

test("generate module records warning when module path is missing", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));

  const module = json(run(["--path", root, "generate", "module", "missing/module", "--json"]));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".codespec-cli/runs", module.runId, "manifest.json"), "utf8"));
  assert.ok(manifest.warnings.includes("module path not found: missing/module"));
});

test("show guides module-only runs back to generate instead of apply", () => {
  const root = tempProject();
  json(run(["init", root, "--integration", "none", "--no-codewiki", "--json"]));
  json(run(["--path", root, "generate", "module", "src/auth", "--json"]));

  const shown = run(["--path", root, "show"]);
  assert.equal(shown.status, 0, shown.stderr);
  assert.match(shown.stdout, /module-only run/);
  assert.match(shown.stdout, /codespec generate/);
  assert.doesNotMatch(shown.stdout, /\n  codespec apply\n/);
});
