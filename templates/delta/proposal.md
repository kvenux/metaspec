# [REQ ID] Requirement Clarification

## 0. User Clarification Log

### 0.1 Confirmed Decisions

- [Decision 1: confirmed by the user, existing spec/design, or repository facts]
- [Decision 2: confirmed by the user, existing spec/design, or repository facts]

### 0.2 Open Questions

- [ ] [Question 1: must be answered before later stages]
- [ ] [Question 2: write "None" when there are no open questions]

### 0.3 Decision Ledger

| Decision | Source | Status | Impact |
|----------|--------|--------|--------|
| [Key decision 1] | [user/spec/design/code fact/agent inference] | [confirmed/needs-confirmation] | [scope, acceptance, or implementation impact] |
| [Key decision 2] | [source] | [status] | [impact] |

> Any agent inference that affects business scope, data model, migration, compatibility, permissions, testability, or acceptance criteria must be confirmed before the next stage.

## 1. Background and Motivation

### 1.1 Current Pain

[Describe the current limitation or user pain.]

### 1.2 Business Driver

[Describe the expected value and why the change matters now.]

## 2. Change Scope

### 2.1 Capabilities

| ID | Capability | Priority | Notes |
|----|------------|----------|-------|
| F-01 | [Capability name] | P0 | [One sentence summary] |
| F-02 | [Capability name] | P1 | [One sentence summary] |

Priority: P0 is required for the minimum usable change; P1 is important but not blocking; P2 is deferred.

### 2.2 User Stories

**US-01**: As a [role], I want [behavior], so that [value].

Acceptance criteria:
- [ ] [Criterion 1]
- [ ] [Criterion 2]

### 2.3 Out of Scope

- [Explicitly excluded capability]
- [Deferred capability]

## 3. Impact Analysis

### 3.1 Affected Spec Areas

| Spec Area | Change Type | Notes |
|-----------|-------------|-------|
| Core Capabilities | [added/modified/removed] | [notes] |
| Data Constraints | [added/modified/removed] | [notes] |

### 3.2 Affected Design Areas

| Design Area | Change Type | Notes |
|-------------|-------------|-------|
| Data Model | [added/modified/removed] | [notes] |
| Interface Design | [added/modified/removed] | [notes] |

### 3.3 Breaking Changes

- **Breaking change**: [yes/no]
- **Impact**: [affected users, APIs, data, or operations]
- **Migration**: [migration path if needed]

### 3.4 Dependencies

- [External team, system, release, or data dependency]

## 4. New DFX Constraints

| Category | Constraint | Priority |
|----------|------------|----------|
| Performance | [latency/throughput/resource limit] | [P0/P1/P2] |
| Reliability | [availability/fallback/data consistency] | [P0/P1/P2] |
| Security | [auth/data protection/audit] | [P0/P1/P2] |

## 5. Milestones

| Milestone | Deliverable | Done Means |
|-----------|-------------|------------|
| M1 | [deliverable] | [verifiable completion signal] |
