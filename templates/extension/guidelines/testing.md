# Testing Guidelines

> Use this template to record project-level testing constraints so each business rule can be verified.

## 1. Test Layers

| Type | Scope | Command |
|------|-------|---------|
| Unit | [domain logic, utilities, service methods] | `[command]` |
| Integration | [API, database, messages, external adapters] | `[command]` |
| End-to-end | [critical user flows] | `[command]` |

## 2. Coverage Expectations

1. Every changed business rule in delta-spec.md should have at least one positive or negative test.
2. Error scenarios, boundary conditions, and permission constraints need tests or explicit manual checks.
3. DFX constraints should include feasible performance, security, or reliability verification.

## 3. Naming

| Target | Rule | Example |
|--------|------|---------|
| Test file | [rule] | `[feature].test.[ext]` |
| Test case | Describe scenario and expected behavior | `rejects invalid user role` |
| Test data | [rule] | `[feature]-fixtures.[ext]` |

## 4. Pre-Commit Checklist

- [ ] Local test commands were run.
- [ ] New or changed business rules have tests.
- [ ] Failure paths and boundaries are covered.
- [ ] Test data does not contain sensitive information.
