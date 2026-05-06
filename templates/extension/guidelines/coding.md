# Coding Guidelines

> Use this template to record repository-level coding constraints for developers and AI agents.

## 1. Principles

1. Follow the existing architecture and code style.
2. New code must trace back to accepted delta-spec.md rules or delta-design.md decisions.
3. Do not introduce complex abstractions for unconfirmed future needs.

## 2. Naming

| Target | Rule | Example |
|--------|------|---------|
| File | [rule] | `[example]` |
| Class or type | [rule] | `[ExampleService]` |
| Function or method | [rule] | `[createExample]` |
| Configuration | [rule] | `[EXAMPLE_TIMEOUT]` |

## 3. Layering and Dependencies

1. [Allowed dependency direction]
2. [Forbidden cross-layer calls]
3. [Shared module reuse rules]

## 4. Error Handling

1. [Error code or exception rules]
2. [Required log fields]
3. [Retry, fallback, and idempotency rules]

## 5. Pre-Commit Checklist

- [ ] Code follows this file.
- [ ] Critical logic has tests.
- [ ] Behavior does not conflict with spec.md.
- [ ] Configuration, logging, or monitoring changes are reflected in docs.
