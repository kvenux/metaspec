export const STAGES = [
  {
    index: 1,
    key: "proposal",
    file: "proposal.md",
    agentCommand: "/metaspec.proposal",
    name: "Requirement clarification",
    objective: "Discover the real need behind the requested change, then clarify scope boundary, non-goals, confirmed decisions, and acceptance criteria.",
    inputs: ["metaspec/specs/spec.md", "metaspec/specs/design.md", "metaspec/service-context.md"],
    requiresFullSpec: false,
    requiresFullDesign: false
  },
  {
    index: 2,
    key: "delta-spec",
    file: "delta-spec.md",
    agentCommand: "/metaspec.delta-spec",
    name: "Spec delta",
    objective: "Turn the requirement into verifiable business-rule deltas and mark added, modified, and removed behavior.",
    inputs: ["metaspec/specs/spec.md", "proposal.md"],
    requiresFullSpec: true,
    requiresFullDesign: false
  },
  {
    index: 3,
    key: "delta-design",
    file: "delta-design.md",
    agentCommand: "/metaspec.delta-design",
    name: "Design delta",
    objective: "Design the implementation approach across rules, APIs, data, flows, and risks.",
    inputs: ["metaspec/specs/design.md", "proposal.md", "delta-spec.md"],
    requiresFullSpec: false,
    requiresFullDesign: true
  },
  {
    index: 4,
    key: "tasks",
    file: "tasks.md",
    agentCommand: "/metaspec.tasks",
    name: "Task breakdown",
    objective: "Break the design into executable and verifiable tasks for developers or AI agents.",
    inputs: ["metaspec/specs/spec.md", "metaspec/specs/design.md", "delta-spec.md", "delta-design.md"],
    requiresFullSpec: true,
    requiresFullDesign: true
  },
  {
    index: 5,
    key: "validation",
    file: "validation.md",
    agentCommand: "/metaspec.validation",
    name: "Consistency validation",
    objective: "Validate coverage across proposal, spec, design, and tasks, then decide whether implementation may start.",
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
