export const STAGES = [
  {
    index: 1,
    key: "proposal",
    file: "proposal.md",
    agentCommand: "/codespec.proposal",
    name: "需求澄清",
    objective: "明确业务目标、范围、约束、非目标和验收标准。"
  },
  {
    index: 2,
    key: "delta-spec",
    file: "delta-spec.md",
    agentCommand: "/codespec.delta-spec",
    name: "Spec 增量设计",
    objective: "把需求转成可验证业务规则，并标明新增、修改和删除。"
  },
  {
    index: 3,
    key: "delta-design",
    file: "delta-design.md",
    agentCommand: "/codespec.delta-design",
    name: "Design 增量设计",
    objective: "设计实现方案，覆盖规格规则、接口、数据、流程和风险。"
  },
  {
    index: 4,
    key: "tasks",
    file: "tasks.md",
    agentCommand: "/codespec.tasks",
    name: "任务拆解",
    objective: "拆出开发者或 AI Agent 可直接执行、可验证的任务。"
  },
  {
    index: 5,
    key: "validation",
    file: "validation.md",
    agentCommand: "/codespec.validation",
    name: "一致性验证",
    objective: "检查 Proposal、Spec、Design、Tasks 的覆盖关系，并给出是否进入实现的结论。"
  }
];

export const CONFIG_YAML = `version: 1
profile: industrial
structure: codespec-dir
paths:
  docs: codespec
  specs: codespec/specs
  changes: codespec/changes
  archives: codespec/changes/archives
  runtime: .codespec-cli
change:
  id_prefix: AR
  single_active_change: false
validation:
  require_validation_doc: true
codewiki:
  token_env: CODESPEC_CODEWIKI_TOKEN
`;

export const RUNTIME_DIRS = [
  ".codespec-cli",
  ".codespec-cli/manifests",
  ".codespec-cli/manifests/integrations",
  ".codespec-cli/workflows",
  ".codespec-cli/presets",
  ".codespec-cli/integrations",
  ".codespec-cli/extensions",
  ".codespec-cli/runs",
  ".codespec-cli/cache",
  ".codespec-cli/tmp"
];

export const DOC_DIRS = [
  "codespec/specs",
  "codespec/changes",
  "codespec/changes/archives",
  "codespec/guidelines"
];
