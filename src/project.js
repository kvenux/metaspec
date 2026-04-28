import fs from "node:fs";
import path from "node:path";
import { CONFIG_YAML, DOC_DIRS, RUNTIME_DIRS } from "./constants.js";
import { ensureDir, rel, resolveRoot, writeFileIfNeeded } from "./util.js";
import { installIntegration } from "./integrations.js";

const GITIGNORE_LINES = [".codespec-cli/runs/", ".codespec-cli/cache/", ".codespec-cli/tmp/"];

export function initProject(targetPath, options = {}) {
  const root = path.resolve(targetPath || options.path || process.cwd());
  const created = [];
  const skipped = [];

  for (const dir of [...DOC_DIRS, ...RUNTIME_DIRS]) {
    ensureDir(path.join(root, dir), created, root);
  }

  writeFileIfNeeded(path.join(root, ".codespec-cli/config.yaml"), CONFIG_YAML, {
    force: Boolean(options.force),
    created,
    skipped,
    root
  });

  updateGitignore(root, created, skipped);

  let integrationResult = null;
  const integration = options.integration ?? "opencode";
  if (integration !== "none") {
    integrationResult = installIntegration(root, integration, options);
  }

  const existingDocs = ["codespec/specs/spec.md", "codespec/specs/design.md"].filter((file) =>
    fs.existsSync(path.join(root, file))
  );

  return {
    ok: true,
    root,
    created,
    skipped,
    integration: integrationResult,
    items: [
      ...created.map((item) => `已补齐：${item}`),
      ...skipped.map((item) => `已存在：${item}`),
      ...existingDocs.map((item) => `已存在真实全量文档，请按需执行 codespec sync --force：${item}`)
    ],
    message: `已检查 CodeSpec 项目：${root}`,
    next: ["codespec start AR202604270001-feature-name", "打开 opencode 后执行 /codespec"]
  };
}

function updateGitignore(root, created, skipped) {
  const file = path.join(root, ".gitignore");
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = current.split(/\r?\n/).filter(Boolean);
  let changed = false;
  for (const line of GITIGNORE_LINES) {
    if (!lines.includes(line)) {
      lines.push(line);
      changed = true;
    }
  }
  if (changed || !fs.existsSync(file)) {
    fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
    created.push(rel(root, file));
  } else {
    skipped.push(rel(root, file));
  }
}

export function projectPaths(options = {}) {
  const root = resolveRoot(options);
  return {
    root,
    codespec: path.join(root, "codespec"),
    specs: path.join(root, "codespec/specs"),
    changes: path.join(root, "codespec/changes"),
    archives: path.join(root, "codespec/changes/archives"),
    runtime: path.join(root, ".codespec-cli")
  };
}
