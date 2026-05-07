# MetaSpec

Recover the system spec first. Change it safely after.

[中文说明](docs/zh-CN/README.md)

MetaSpec is a spec-driven development workflow for existing codebases. It scans a repository, recovers a full `spec.md` and `design.md`, then routes every new requirement through proposal, spec delta, design delta, tasks, validation, implementation, done finalization, and archive.

Most AI coding workflows start from the next feature request. MetaSpec starts one layer earlier: it rebuilds the current product and technical baseline so future changes have something stable to diff against.

## Why MetaSpec

AI agents are fast, but they are unreliable when the only source of truth is chat history. Incremental specs help, but an incremental change is only meaningful if the existing system has already been recovered.

MetaSpec gives an agent three things before it writes code:

1. A full business spec: `metaspec/specs/spec.md`
2. A full implementation design: `metaspec/specs/design.md`
3. A controlled change folder: `metaspec/changes/{REQ-ID}/`

That makes the workflow useful for brownfield projects, not just new apps.

## The Difference

Spec-driven tools usually optimize for one of two cases:

| Tool style | Best at | Gap MetaSpec focuses on |
|------------|---------|-------------------------|
| Spec Kit style | Greenfield spec-first planning and structured implementation | Existing repositories often do not start with a complete spec |
| OpenSpec style | Lightweight incremental change folders and agent commands | Incremental specs can drift if there is no recovered full baseline |
| Chat-only agents | Fast one-off edits | Requirements, design decisions, and validation disappear into conversation history |

MetaSpec is different because it is baseline-first:

```text
recover full spec/design -> propose change -> delta spec -> delta design -> tasks -> validation -> implementation -> done finalization -> archive
```

The key idea is simple: do not ask an agent to change a system until it can first explain the system.

## Core Workflow

```text
generate -> apply -> start -> go -> accept -> implement -> done finalization -> done
```

Full recovery:

```bash
metaspec init
metaspec generate
metaspec show
metaspec apply
```

Incremental change:

```bash
metaspec start REQ20260428-owner-phone-validation
metaspec go --json
metaspec accept
metaspec validate
metaspec done
```

Agent entry:

```text
/metaspec
```

MetaSpec keeps the CLI as the state machine. Agents read the current stage from `metaspec go --json`, write only the allowed artifact, and wait for user confirmation before advancing.

## What It Creates

```text
metaspec/
  specs/
    spec.md
    design.md
  changes/
    REQ20260428-owner-phone-validation/
      proposal.md
      delta-spec.md
      delta-design.md
      tasks.md
      validation.md
      .metaspec-state.json
    archives/

.metaspec-cli/
  config.yaml
  runs/
    {run-id}/
      manifest.json
      spec.md
      design.md
      plan.json
      modules/
      logs/
```

`generate` writes candidates into `.metaspec-cli/runs/`. `apply` publishes reviewed candidates into `metaspec/specs/`. Existing full specs are protected unless you pass `--force`.

`generate/apply` is for baseline recovery. Accepted changes evolve the baseline during done finalization: after implementation and verification, the coding agent refreshes `metaspec/specs/spec.md` from `delta-spec.md` and `metaspec/specs/design.md` from `delta-design.md`, then runs `metaspec done`.

## Agent Integrations

MetaSpec installs repository-level commands and skills for local coding agents:

```bash
metaspec integration install all
metaspec integration install opencode
metaspec integration install claude-code
metaspec integration install codex
```

Installed paths:

```text
.opencode/command/
  metaspec.md
  metaspec.proposal.md
  metaspec.delta-spec.md
  metaspec.delta-design.md
  metaspec.tasks.md
  metaspec.validation.md

.claude/commands/
  metaspec.md
  metaspec-proposal.md
  metaspec-delta-spec.md
  metaspec-delta-design.md
  metaspec-tasks.md
  metaspec-validation.md

.claude/skills/
  metaspec*/SKILL.md

.agents/skills/
  metaspec*/SKILL.md
```

Claude Code can use `/metaspec` and the stage commands directly. Codex can use the repository skills from `.agents/skills`. opencode uses `.opencode/command`.

## Generation Modes

MetaSpec can recover full documentation with local coding agents or a deterministic fallback:

```bash
metaspec generate --runner auto
metaspec generate --runner codex
metaspec generate --runner claude
metaspec generate --runner opencode
```

`auto` prefers locally authenticated tools:

```text
codex -> claude -> opencode -> deterministic stub
```

Generation modes:

```bash
metaspec generate --mode auto
metaspec generate --mode direct
metaspec generate --mode react
```

`direct` generates the whole design/spec pair in one pass. `react` first creates module-level documents under `modules/`, then composes the full `design.md` and `spec.md`. `auto` chooses based on scanned repository size.

Single-module recovery:

```bash
metaspec generate module src/auth
metaspec generate module src/auth --mode react
```

Module docs stay inside the run directory and are not applied to `metaspec/specs/`.

## Guardrails

MetaSpec is intentionally strict where agent workflows usually drift:

- `init` and `start` do not copy empty templates into business docs.
- Agents may only write the path returned by `metaspec go --json`.
- Every stage requires user confirmation before the CLI advances.
- `validation` checks the document chain before implementation.
- `done` is only for after implementation, verification, and done finalization, not immediately after validation.
- External runners are rejected if they modify source files, authoritative specs, or runtime config outside the current run.

## CLI Reference

| Command | Purpose |
|---------|---------|
| `metaspec init [path]` | Create the local MetaSpec structure |
| `metaspec generate` | Generate candidate full `spec.md` and `design.md` |
| `metaspec show` | Show the latest generation run |
| `metaspec apply` | Apply reviewed generated docs into `metaspec/specs/` |
| `metaspec start <change>` | Create a change directory and state file |
| `metaspec list` | List active changes |
| `metaspec status [change]` | Show stage status |
| `metaspec go [change]` | Return the current stage payload for agents |
| `metaspec accept [change]` | Confirm the current stage and advance |
| `metaspec validate [change]` | Validate structure and document consistency |
| `metaspec doctor` | Diagnose local project issues |
| `metaspec done [change]` | Archive after implementation, verification, and done finalization |
| `metaspec archive [change]` | Archive a completed change |
| `metaspec integration install all` | Install all supported agent integrations |

## Development

Requires Node.js 20 or newer.

```bash
npm test
node bin/metaspec.js --help
node bin/metaspec.js init ./demo
node bin/metaspec.js --path ./demo generate
```

Global local install while developing:

```bash
npm link
metaspec --help
```

## Docs

- [Method](docs/method.md)
- [Templates](docs/templates.md)
- [Slash commands](docs/slash-commands.md)
- [Manual smoke tests](docs/manual-smoke.md)

## Status

MetaSpec is early, pragmatic infrastructure for repository-aware SDD. The current implementation focuses on local CLI workflows, repository-level agent commands, full spec recovery, controlled incremental change folders, and testable guardrails.
