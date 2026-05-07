# MetaSpec Slash Commands

This document summarizes the public MetaSpec Agent command workflow.

## Core Shape

- `/metaspec` is the main entry. It calls `metaspec go --json`, reads the active change and current stage, then routes the Agent.
- The five stage commands own exactly one artifact each: `proposal.md`, `delta-spec.md`, `delta-design.md`, `tasks.md`, and `validation.md`.
- State transition is centralized in the CLI. After user confirmation, the Agent calls `metaspec accept --json`.
- Every stage requires clarification or explicit generation approval before writing its artifact.
- Confirming `validation.md` means the document chain is ready for implementation. It does not mean implementation is complete, and it must not trigger immediate `done` / archive.

## Main Flow

The main command must:

1. Call `metaspec go --json`.
2. Render the MetaSpec SDD stage panel when entering or switching stages.
3. Read `stage.inputs`, `stage.allowedWritePath`, and `stage.requiresFullSpec` / `stage.requiresFullDesign`.
4. Ask high-value clarification questions, or present a generation summary and ask the user to reply "可以生成".
5. Write only `stage.allowedWritePath`.
6. Ask the user to confirm the artifact.
7. On user confirmation, call `metaspec accept --json`.
8. If `accept` returns `nextStage`, immediately enter the next stage and start clarification or generation approval.
9. If `metaspec go --json` returns `nextAction: "implementation"`, read `tasks.md`, `delta-spec.md`, `delta-design.md`, and `validation.md`, then perform implementation and tests. After implementation is complete, perform done finalization by refreshing full `spec.md` / `design.md` before asking about `metaspec done`.

## Stage Commands

| Stage | Command | Artifact | Goal |
|------|---------|----------|------|
| 1 | `/metaspec.proposal` | `proposal.md` | Discover the real need behind the requested change, then clarify scope boundary, non-goals, confirmed decisions, and acceptance criteria. |
| 2 | `/metaspec.delta-spec` | `delta-spec.md` | Convert the proposal into verifiable business-rule deltas. |
| 3 | `/metaspec.delta-design` | `delta-design.md` | Design an implementation approach that covers the spec deltas. |
| 4 | `/metaspec.tasks` | `tasks.md` | Break design decisions into executable and verifiable tasks. |
| 5 | `/metaspec.validation` | `validation.md` | Check coverage, conflicts, gaps, and whether implementation may proceed. |

## Non-Negotiable Rules

- Do not modify implementation code while a document stage is active. Implementation code changes happen only after `validation.md` is confirmed and `metaspec go --json` reports `nextAction: "implementation"`.
- Do not directly edit `.metaspec-state.json`.
- Do not create, rename, or infer `metaspec/changes/*` directories. Only `metaspec start` creates changes.
- Do not write empty template artifacts.
- Do not proceed to the next stage before the user confirms the current artifact.
- A user's "确认/下一步" for one stage does not authorize generating the next stage artifact.
- A user's confirmation of `validation.md` only authorizes implementation work; it does not authorize archive.
- Missing full documents must not be faked. Use `metaspec generate && metaspec apply`, import real documents, or mark the risk according to the stage rules.
- Do not run `metaspec generate` to evolve an accepted change. `generate/apply` is for baseline recovery; accepted changes refresh full `spec.md` / `design.md` through the coding agent during done finalization.

## Missing Full Document Policy

- `proposal`: may continue, but must mark the missing full-context risk.
- `delta-spec`: requires a real `metaspec/specs/spec.md`; otherwise ask the user to generate/apply or import it.
- `delta-design`: requires a real `metaspec/specs/design.md`; otherwise ask the user to generate/apply or import it.
- `tasks` and `validation`: missing full `spec.md` or `design.md` should block or be explicitly marked as high risk.
