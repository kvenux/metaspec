# Agent Commands

MetaSpec can install repository-level instructions for Codex, Claude Code, and opencode.

```bash
metaspec init --integration codex
metaspec init --integration claude
metaspec init --integration opencode
```

The installed command teaches the agent to:

1. Read `metaspec/specs/spec.md` and `metaspec/specs/design.md`.
2. Keep one active change under `metaspec/changes/<REQ>/`.
3. Clarify first when the requirement is ambiguous.
4. Generate exactly one stage artifact at a time.
5. Ask for user confirmation before advancing stages.
6. Treat validation as permission to implement, not permission to archive.
7. Treat `metaspec generate && metaspec apply` as baseline recovery, not accepted-change evolution.
8. After implementation and verification, perform done finalization by updating `metaspec/specs/spec.md` and `metaspec/specs/design.md` before calling `metaspec done`.

## Language

The default CLI and agent instruction surface is English. Use `--lang zh-CN` or `METASPEC_LANG=zh-CN` for Chinese CLI output.
