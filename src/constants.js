export const STAGES = [
  {
    index: 1,
    key: "proposal",
    file: "proposal.md",
    agentCommand: "/metaspec.proposal",
    name: "需求澄清",
    objective: "明确业务目标、范围、约束、非目标和验收标准。",
    inputs: ["metaspec/specs/spec.md", "metaspec/specs/design.md", "metaspec/service-context.md"],
    requiresFullSpec: false,
    requiresFullDesign: false
  },
  {
    index: 2,
    key: "delta-spec",
    file: "delta-spec.md",
    agentCommand: "/metaspec.delta-spec",
    name: "Spec 增量设计",
    objective: "把需求转成可验证业务规则，并标明新增、修改和删除。",
    inputs: ["metaspec/specs/spec.md", "proposal.md"],
    requiresFullSpec: true,
    requiresFullDesign: false
  },
  {
    index: 3,
    key: "delta-design",
    file: "delta-design.md",
    agentCommand: "/metaspec.delta-design",
    name: "Design 增量设计",
    objective: "设计实现方案，覆盖规格规则、接口、数据、流程和风险。",
    inputs: ["metaspec/specs/design.md", "proposal.md", "delta-spec.md"],
    requiresFullSpec: false,
    requiresFullDesign: true
  },
  {
    index: 4,
    key: "tasks",
    file: "tasks.md",
    agentCommand: "/metaspec.tasks",
    name: "任务拆解",
    objective: "拆出开发者或 AI Agent 可直接执行、可验证的任务。",
    inputs: ["metaspec/specs/spec.md", "metaspec/specs/design.md", "delta-spec.md", "delta-design.md"],
    requiresFullSpec: true,
    requiresFullDesign: true
  },
  {
    index: 5,
    key: "validation",
    file: "validation.md",
    agentCommand: "/metaspec.validation",
    name: "一致性验证",
    objective: "检查 Proposal、Spec、Design、Tasks 的覆盖关系，并给出是否进入实现的结论。",
    inputs: ["metaspec/specs/spec.md", "metaspec/specs/design.md", "proposal.md", "delta-spec.md", "delta-design.md", "tasks.md"],
    requiresFullSpec: true,
    requiresFullDesign: true
  }
];

export const CONFIG_YAML = `version: 1
profile: industrial
structure: metaspec-dir
paths:
  docs: metaspec
  specs: metaspec/specs
  changes: metaspec/changes
  archives: metaspec/changes/archives
  runtime: .metaspec-cli
change:
  id_prefix: REQ
  single_active_change: false
validation:
  require_validation_doc: true
`;

export const RUNTIME_DIRS = [
  ".metaspec-cli",
  ".metaspec-cli/manifests",
  ".metaspec-cli/manifests/integrations",
  ".metaspec-cli/workflows",
  ".metaspec-cli/presets",
  ".metaspec-cli/integrations",
  ".metaspec-cli/extensions",
  ".metaspec-cli/runs",
  ".metaspec-cli/cache",
  ".metaspec-cli/tmp"
];

export const DOC_DIRS = [
  "metaspec/specs",
  "metaspec/changes",
  "metaspec/changes/archives",
  "metaspec/guidelines"
];
