import fs from "node:fs";
import path from "node:path";
import { sha256, writeJson } from "./util.js";

const INTEGRATIONS = {
  opencode: {
    path: ".opencode/command",
    description: "opencode repository commands"
  },
  "claude-code": {
    path: ".claude/commands + .claude/skills",
    description: "Claude Code project slash commands and skills"
  },
  codex: {
    path: ".agents/skills",
    description: "Codex repository skills"
  }
};

function opencodeFiles() {
  return {
  "codespec.md": opencodeCommand("codespec", "CodeSpec 主流程", mainFlowBody()),
  "codespec.proposal.md": opencodeCommand("codespec.proposal", "CodeSpec 需求澄清", stageCommandBody(stageDefinitions.proposal)),
  "codespec.delta-spec.md": opencodeCommand("codespec.delta-spec", "CodeSpec Spec 增量设计", stageCommandBody(stageDefinitions["delta-spec"])),
  "codespec.delta-design.md": opencodeCommand("codespec.delta-design", "CodeSpec Design 增量设计", stageCommandBody(stageDefinitions["delta-design"])),
  "codespec.tasks.md": opencodeCommand("codespec.tasks", "CodeSpec 任务拆解", stageCommandBody(stageDefinitions.tasks)),
  "codespec.validation.md": opencodeCommand("codespec.validation", "CodeSpec 一致性验证", stageCommandBody(stageDefinitions.validation))
  };
}

function commands() {
  return [
  {
    id: "codespec",
    title: "CodeSpec",
    description: "Inspect the current CodeSpec change and route to the active stage.",
    body: mainFlowBody()
  },
  {
    id: "codespec-proposal",
    title: "CodeSpec Proposal",
    description: "Write the proposal stage for a CodeSpec change.",
    body: stageCommandBody(stageDefinitions.proposal)
  },
  {
    id: "codespec-delta-spec",
    title: "CodeSpec Delta Spec",
    description: "Write business-rule delta specifications for a CodeSpec change.",
    body: stageCommandBody(stageDefinitions["delta-spec"])
  },
  {
    id: "codespec-delta-design",
    title: "CodeSpec Delta Design",
    description: "Write implementation delta design for a CodeSpec change.",
    body: stageCommandBody(stageDefinitions["delta-design"])
  },
  {
    id: "codespec-tasks",
    title: "CodeSpec Tasks",
    description: "Break a CodeSpec change into executable implementation and verification tasks.",
    body: stageCommandBody(stageDefinitions.tasks)
  },
  {
    id: "codespec-validation",
    title: "CodeSpec Validation",
    description: "Validate coverage from proposal to tasks before implementation.",
    body: stageCommandBody(stageDefinitions.validation)
  }
  ];
}

const stageDefinitions = {
  proposal: {
    key: "proposal",
    index: 1,
    total: 5,
    name: "需求澄清",
    file: "proposal.md",
    command: "/codespec.proposal",
    objective: "明确 Why、What、Impact、非目标、验收标准和 DFX 约束。",
    inputs: ["全量 spec.md（如存在）", "全量 design.md（如存在）", "service-context.md（如存在）", "当前 change 已有文档"],
    nextName: "Spec 增量设计",
    artifactRule: "只描述 Why、What Changes、Impact、DFX 约束和非目标，不写实现细节。",
    contextRule: "全量 spec.md/design.md 缺失时可以继续需求澄清，但必须在 proposal.md 标注全量上下文缺失风险。",
    clarificationFocus: "需求背景、范围、非目标、优先级、验收标准、影响面和 DFX 约束",
    generationFocus: "proposal 拟生成要点",
    completionFocus: "范围、非目标、验收标准和破坏性变更"
  },
  "delta-spec": {
    key: "delta-spec",
    index: 2,
    total: 5,
    name: "Spec 增量设计",
    file: "delta-spec.md",
    command: "/codespec.delta-spec",
    objective: "将 proposal 转换为可验证的业务规则增量。",
    inputs: ["全量 codespec/specs/spec.md", "proposal.md", "已有 delta-spec.md（如存在）"],
    nextName: "Design 增量设计",
    artifactRule: "只写业务规则，使用 ADDED / MODIFIED / REMOVED，每条规则必须有可判定验收条件。",
    contextRule: "如果全量 spec.md 不存在，不要伪造；提示用户先执行 codespec generate && codespec apply，或导入真实 spec.md。",
    clarificationFocus: "业务规则、验收条件、状态流转、权限、数据约束、异常路径和 DFX 约束",
    generationFocus: "delta-spec 拟生成的业务规则要点",
    completionFocus: "ADDED/MODIFIED/REMOVED、验收条件和与全量 spec.md 的冲突"
  },
  "delta-design": {
    key: "delta-design",
    index: 3,
    total: 5,
    name: "Design 增量设计",
    file: "delta-design.md",
    command: "/codespec.delta-design",
    objective: "为 delta-spec 的业务规则设计实现方案。",
    inputs: ["全量 codespec/specs/design.md", "proposal.md", "delta-spec.md", "已有 delta-design.md（如存在）"],
    nextName: "任务拆解",
    artifactRule: "设计必须承接 delta-spec，覆盖关键决策、备选方案、风险、兼容性、数据模型、接口和发布影响。",
    contextRule: "如果全量 design.md 不存在，不要伪造；提示用户先执行 codespec generate && codespec apply，或导入真实 design.md。",
    clarificationFocus: "架构影响、接口契约、数据模型、兼容性、迁移、发布策略、风险和验证策略",
    generationFocus: "delta-design 拟生成的设计要点",
    completionFocus: "规格覆盖、方案取舍、风险缓解和后续 tasks 可拆解性"
  },
  tasks: {
    key: "tasks",
    index: 4,
    total: 5,
    name: "任务拆解",
    file: "tasks.md",
    command: "/codespec.tasks",
    objective: "将设计拆成可执行、可验证的开发任务。",
    inputs: ["全量 spec.md", "全量 design.md", "delta-spec.md", "delta-design.md", "已有 tasks.md（如存在）"],
    nextName: "一致性验证",
    artifactRule: "任务必须能被开发者或 coding agent 执行，按模块、文件或责任边界拆分，并包含测试和文档任务。",
    contextRule: "如果全量 spec.md 或 design.md 不存在，应阻断任务拆解或明确标记为高风险，不要伪造上下文。",
    clarificationFocus: "任务边界、文件范围、依赖顺序、并行性、测试策略和验收方式",
    generationFocus: "tasks 拟拆解的任务范围",
    completionFocus: "任务粒度、依赖关系、测试覆盖和文档更新"
  },
  validation: {
    key: "validation",
    index: 5,
    total: 5,
    name: "一致性验证",
    file: "validation.md",
    command: "/codespec.validation",
    objective: "检查 proposal、delta-spec、delta-design、tasks 与全量文档的覆盖和冲突。",
    inputs: ["全量 spec.md", "全量 design.md", "proposal.md", "delta-spec.md", "delta-design.md", "tasks.md"],
    nextName: "实现",
    artifactRule: "检查文档链覆盖关系、冲突、遗漏场景、DFX 约束和测试任务，结尾必须给出是否允许进入实现的结论。",
    contextRule: "如果全量 spec.md 或 design.md 不存在，应阻断一致性验证或明确标记为高风险，不要伪造上下文。",
    clarificationFocus: "覆盖关系、冲突判断标准、遗漏场景、验证口径和是否允许进入实现",
    generationFocus: "validation 拟检查项和预期结论口径",
    completionFocus: "覆盖结论、冲突项、阻断问题和是否允许进入实现"
  }
};

function opencodeCommand(command, title, body) {
  return `# /${command}

# ${title}

${body}
`;
}

function mainFlowBody() {
  return `你正在一个使用 CodeSpec 的仓库中工作。/codespec 是用户主入口；用户进入本命令后，不应被要求在终端和 Agent 之间反复切换。

工作方式：
1. 先调用 \`codespec go --json\`，读取当前 change、阶段、产物路径、nextAction、stage.inputs 和 stage.allowedWritePath。
2. 如果 nextAction 是 \`implementation\`，展示实现阶段卡片，读取 \`tasks.md\`、\`delta-design.md\` 和 \`validation.md\`，然后执行实现与测试；不要生成新的阶段文档，也不要调用 \`codespec done\`。
3. 根据 JSON 渲染阶段状态。首次进入、阶段切换、用户询问状态或 CLI 报错时展示 CodeSpec SDD 阶段面板；普通对话只展示轻量状态栏。
4. 按当前阶段执行对应工作：需求澄清、Spec 增量设计、Design 增量设计、任务拆解或一致性验证。
5. 每进入一个新阶段，生成阶段产物前必须至少有一轮面向用户的阶段确认或澄清；信息不足时先问问题，信息足够时也要先给出拟生成要点并请求用户回复“可以生成”。
6. 写入阶段产物后，必须请求用户确认。用户未确认时继续修改当前阶段。
7. 用户明确回复“确认”“下一步”或等价表达后，立即调用 \`codespec accept --json\`，不要要求用户回终端执行确认命令。
8. 如果 \`codespec accept --json\` 返回 nextStage，不要停在“已确认/下一步是...”的提示上；必须立即进入 nextStage，展示阶段切换卡片，读取上下文，然后提出澄清问题或请求生成前确认。
9. 如果所有文档阶段已确认，不要急着调用 \`codespec done --json\`；先进入实现阶段，按 \`tasks.md\` 执行代码变更和测试验证。只有用户明确表示实现已完成且验证通过，才询问是否归档并调用 \`codespec done --json\`。

推进规则：
- 当前阶段的“确认/下一步”只代表确认当前产物并进入下一阶段；确认 validation 只代表文档链允许进入实现，不代表实现已完成或可以归档。
- 每个阶段首次写入产物前，必须能在当前阶段对话中找到用户对该阶段的明确生成授权，例如“可以生成”“确认生成”“按这个生成”。
- 只有等待用户回答澄清问题、等待用户确认阶段产物、等待用户授权归档，或实现遇到必须由用户决策的阻塞问题时，才允许停下来。

${sharedDisplayRules()}

${sharedPathRules()}

全量文档缺失处理：
- proposal：可以继续澄清，但必须标注全量上下文缺失风险。
- delta-spec：缺少全量 spec.md 时，提示先执行 \`codespec generate && codespec apply\`，或导入真实 spec.md。
- delta-design：缺少全量 design.md 时，提示先执行 \`codespec generate && codespec apply\`，或导入真实 design.md。
- tasks / validation：缺少全量 spec.md 或 design.md 时，应阻断或明确标记为高风险，不要伪造上下文。

约束：
1. 不修改实现代码。
2. 不直接修改 \`.codespec-state.json\`。
3. 只有 CLI 可以推进阶段状态。
4. 保留用户已写内容，除非用户明确要求重写。
5. 阶段产物不应保留模板占位符。
6. 禁止向 \`codespec/\` 写入空模板文档。
7. 禁止创建新的 \`codespec/changes/*\` 目录；变更目录只能由 \`codespec start\` 创建。
`;
}

function stageCommandBody(stage) {
  return `当前阶段：${stage.index}/${stage.total} ${stage.key} / ${stage.name}

强制流程：
1. 先调用 \`codespec go --json\`，读取当前活动变更、stage.key、stage.file、stage.allowedWritePath 和 stage.inputs。
2. 如果当前阶段不是 \`${stage.key}\`，停止并提示用户回到 \`/codespec\` 主流程。
3. 只能写入 \`codespec go --json\` 返回的 stage.allowedWritePath，禁止自行推导或创建 \`codespec/changes/{change}\`。
4. 先展示本阶段面板。
5. 写入前必须至少完成一轮本阶段用户交互；即使上下文看似充足，也要先列出${stage.generationFocus}，并请求用户回复“可以生成”。
6. 用户在上一阶段回复的“确认/下一步”只代表进入本阶段，不代表授权生成 \`${stage.file}\`。
7. 在用户明确回复“可以生成”“确认生成”“按这个生成”或等价表达前，禁止直接生成文档。
8. 写入 \`${stage.file}\` 后，必须说明相对路径，并给出清晰确认指引。
9. 用户确认后，调用 \`codespec accept --json\`，不要要求用户回终端执行确认命令。
10. 如果确认 \`validation.md\` 后返回 completed/readyForImplementation，不要调用 \`codespec done\`；提示文档链可进入实现，并回到 \`/codespec\` 主流程执行实现。

阶段目标：
${stage.objective}

阶段输入：
${stage.inputs.map((input) => `- ${input}`).join("\n")}

产物：
- ${stage.file}

执行规则：
1. ${stage.artifactRule}
2. ${stage.contextRule}
3. 澄清问题必须影响${stage.clarificationFocus}；如果没有这类高价值问题，改用生成前确认。
4. 每轮最多问 3 个澄清问题，问题必须说明为什么会影响当前阶段产物。
5. 用户回复后要明确说明将如何影响 \`${stage.file}\`。
6. 不修改实现代码。
7. 不直接修改 \`.codespec-state.json\`。
8. 禁止写入空模板文档。

完成后重点请用户检查：
- ${stage.completionFocus}

${sharedDisplayRules()}

${sharedPathRules()}
`;
}

function sharedDisplayRules() {
  return `状态展示格式：

完整阶段面板：
\`\`\`text
CodeSpec SDD · {change}
模式：澄清优先 · 用户确认 · CLI 推进

流程全景：
[1 需求澄清 {mark1}] -> [2 Spec 增量 {mark2}] -> [3 Design 增量 {mark3}] -> [4 任务拆解 {mark4}] -> [5 一致性验证 {mark5}]

当前阶段：{index}/{total} {key} / {name}
状态：{status}
目标：{objective}
产物：codespec/changes/{change}/{file}
完成：阶段产物非模板，用户明确确认
\`\`\`

普通交互状态栏：
\`\`\`text
CodeSpec [{index}/{total} {key} · {name} · {status}]
\`\`\`

阶段切换卡片：
\`\`\`text
已确认 {previous_file}，状态已推进。

CodeSpec SDD · {change}
[✓ 需求澄清] -> [● Spec 增量] -> [○ Design 增量] -> [○ 任务拆解] -> [○ 一致性验证]

阶段已确认：
[✓] {previous_index}/{total} {previous_name} {previous_file}

正在进入：
[●] {index}/{total} {name} {file}

本阶段目标：
{objective}

我接下来会：
1. 读取本阶段输入文档
2. 检查是否存在会影响验收或设计的问题
3. 先提出澄清问题，或在信息足够时请求你确认生成
\`\`\`

实现阶段卡片：
\`\`\`text
文档链已验证，可进入实现。

CodeSpec SDD · {change}
[✓ 需求澄清] -> [✓ Spec 增量] -> [✓ Design 增量] -> [✓ 任务拆解] -> [✓ 一致性验证] -> [● 实现]

我接下来会：
1. 按 tasks.md 执行实现任务
2. 修改必要代码、测试和文档
3. 运行验证命令并报告结果

只有实现完成且验证通过后，才会请求你确认归档并调用 codespec done。
\`\`\`

澄清问题卡片：
\`\`\`text
CodeSpec [{index}/{total} {key} · 澄清中]

Q{n}. {question}

推荐：{recommended_option} - {reason}

为什么问：
{impact}

你可以回复选项、recommended，或给出短答案。回答后我会更新本阶段规则草案；如果没有新的阻塞点，会请求你确认生成 {file}。
\`\`\`

生成前确认：
\`\`\`text
CodeSpec [{index}/{total} {key} · 生成前确认]

我没有发现必须阻塞的问题。准备按以下要点生成 {file}：
- {point_1}
- {point_2}
- {point_3}

不会写入：
- 与本阶段无关的实现细节
- 未经确认的新范围
- 空模板或占位符

请回复“可以生成”继续，或指出要调整的点。
\`\`\`

写入后确认：
\`\`\`text
已生成：codespec/changes/{change}/{file}

请确认 {file} 内容是否符合预期。

下一步你可以：
- 回复“确认”或“下一步”：我将确认当前阶段，并进入下一阶段。
- 继续说明要调整的点：我会留在当前阶段继续优化 {file}。
\`\`\``;
}

function sharedPathRules() {
  return `路径约束：
1. 必须以 \`codespec go --json\` 返回的 change、stage.key、stage.file 和 stage.allowedWritePath 作为唯一权威来源。
2. 只能写入 \`codespec go --json\` 返回的 stage.allowedWritePath。
3. 禁止根据用户需求标题、功能名、slug 或自然语言自行推导 \`codespec/changes/{change}\`。
4. 禁止执行 \`mkdir codespec/changes/...\`、\`New-Item codespec/changes/...\` 或任何创建/重命名变更目录的操作。
5. 如果 \`codespec go --json\` 没有返回活动变更，停止并提示用户先执行 \`codespec start REQ202604270001-feature-name\`。
6. 如果发现存在没有 \`.codespec-state.json\` 的额外变更目录，停止并提示用户运行 \`codespec doctor\`，不要继续写入该目录。`;
}

export function listIntegrations() {
  return Object.entries(INTEGRATIONS).map(([name, value]) => ({ name, ...value }));
}

export function installIntegration(root, name, options = {}) {
  if (name === "all") {
    const results = Object.keys(INTEGRATIONS).map((integration) => installIntegration(root, integration, options));
    return {
      ok: true,
      integration: "all",
      results,
      files: results.flatMap((result) => result.files),
      message: "已安装全部 Agent 集成。"
    };
  }
  if (name === "opencode") return installOpencode(root, options);
  if (name === "claude-code") return installClaudeCode(root, options);
  if (name === "codex") return installCodex(root, options);
  throw new Error(`不支持的集成：${name}`);
}

function installOpencode(root, options = {}) {
  const dir = path.join(root, INTEGRATIONS.opencode.path);
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (const [fileName, content] of Object.entries(opencodeFiles())) {
    const file = path.join(dir, fileName);
    writeTrackedFile(file, content, files, root, options);
  }
  writeManifest(root, "opencode", files);
  return { ok: true, integration: "opencode", files };
}

function installClaudeCode(root, options = {}) {
  const files = [];
  const commandDir = path.join(root, ".claude/commands");
  fs.mkdirSync(commandDir, { recursive: true });
  for (const command of commands()) {
    writeTrackedFile(path.join(commandDir, `${command.id}.md`), claudeCommand(command), files, root, options);
  }

  const skillsDir = path.join(root, ".claude/skills");
  fs.mkdirSync(skillsDir, { recursive: true });
  for (const command of commands()) {
    writeTrackedFile(path.join(skillsDir, command.id, "SKILL.md"), skillMarkdown(command, "claude"), files, root, options);
  }

  writeManifest(root, "claude-code", files);
  return { ok: true, integration: "claude-code", files };
}

function installCodex(root, options = {}) {
  const files = [];
  const skillsDir = path.join(root, ".agents/skills");
  fs.mkdirSync(skillsDir, { recursive: true });
  for (const command of commands()) {
    writeTrackedFile(path.join(skillsDir, command.id, "SKILL.md"), skillMarkdown(command, "codex"), files, root, options);
  }

  writeManifest(root, "codex", files);
  return { ok: true, integration: "codex", files };
}

function writeTrackedFile(file, content, files, root, options) {
  if (!fs.existsSync(file) || options.force) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  }
  files.push({ path: path.relative(root, file).replaceAll(path.sep, "/"), sha256: sha256(file) });
}

function writeManifest(root, integration, files) {
  writeJson(path.join(root, `.codespec-cli/manifests/integrations/${integration}.json`), {
    integration,
    installedAt: new Date().toISOString(),
    files
  });
}

function claudeCommand(command) {
  return `---
description: ${command.description}
---

# ${command.title}

${command.body}

$ARGUMENTS
`;
}

function skillMarkdown(command, provider) {
  const providerLine =
    provider === "codex"
      ? "This repository skill is discovered by Codex from `.agents/skills`."
      : "This project skill is discovered by Claude Code from `.claude/skills`.";
  return `---
name: ${command.id}
description: ${command.description}
---

# ${command.title}

${providerLine}

${command.body}
`;
}

export function removeIntegration(root, name, options = {}) {
  if (name === "all") {
    const results = Object.keys(INTEGRATIONS).map((integration) => removeIntegration(root, integration, options));
    return {
      ok: true,
      integration: "all",
      removed: results.flatMap((result) => result.removed),
      kept: results.flatMap((result) => result.kept),
      message: "已移除全部 Agent 集成。"
    };
  }
  if (!INTEGRATIONS[name]) throw new Error(`不支持的集成：${name}`);
  const manifestFile = path.join(root, `.codespec-cli/manifests/integrations/${name}.json`);
  if (!fs.existsSync(manifestFile)) {
    return { ok: true, integration: name, removed: [], kept: [], message: `未发现 ${name} 集成 manifest。` };
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
  return { ok: true, integration: name, removed, kept, message: `已移除 ${name} 集成。` };
}
