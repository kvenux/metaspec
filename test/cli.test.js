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
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    ...options
  });
  return result;
}

function json(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
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

test("validate reports required structure errors", () => {
  const root = tempProject();
  const result = run(["--path", root, "validate", "--json"]);
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.ok(payload.findings.some((finding) => finding.code === "CS001"));
});
