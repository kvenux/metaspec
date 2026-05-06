# Manual Smoke Checks

These checks are not part of CI because real Codex or Claude calls can consume tokens and depend on local CLI authentication.

## Local CLI

```powershell
npm test
node bin\metaspec.js --help
node bin\metaspec.js --lang zh-CN --help
```

Expected:

1. Tests pass.
2. Default help is English.
3. Chinese help appears only when requested.

## Full Recovery Smoke

Run against a disposable project:

```powershell
node C:\path\to\metaspec\bin\metaspec.js init C:\tmp\demo --integration none
node C:\path\to\metaspec\bin\metaspec.js --path C:\tmp\demo generate --runner auto --mode react
node C:\path\to\metaspec\bin\metaspec.js --path C:\tmp\demo show
```

Expected:

1. A run appears under `.metaspec-cli/runs/`.
2. `spec.md` and `design.md` candidates are non-empty.
3. `apply` refuses to overwrite existing full docs unless `--force` is provided.

## Agent E2E Smoke

Use a clean target repository:

```powershell
metaspec init --integration codex
metaspec start REQYYYYMMDDNNNN-feature-name
codex exec -C . "Use the MetaSpec workflow for: <requirement>"
```

Expected:

1. The agent clarifies ambiguous requirements before writing proposal.md.
2. Stage artifacts are generated in order.
3. Validation says whether implementation may start.
4. The agent does not run `metaspec done` immediately after validation.
5. Implementation and project tests happen before archive.
