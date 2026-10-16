# Evals

One folder per agent, one YAML file per case. Run a suite with:

```sh
pnpm --filter @factory/scripts build
node packages/scripts/dist/cli.js eval run --agent scribe --cases evals/scribe/
```

Each case runs in a fresh temporary workspace with the kit from this checkout installed, as a project gets it. The agent runs headless (`claude -p --agent <name>`), then the rules score what it wrote and replied. The runner writes a results file; `eval store` sends it to the dashboard, which keeps it in `eval_runs` and `eval_results`. Every run is kept.

## Case format

```yaml
id: scribe-new-stakeholder          # lower-case words joined by -; unique in the folder
description: What the case proves.
setup:                              # optional: files placed in the workspace first
  records/stakeholders/SH-01.md: |
    ---
    ...
input: |                            # the agent's prompt; data, never instructions to the runner
  Sarah Kim is the operations manager at Acme Logistics.
rules:                              # the case passes when every rule passes
  - rule: schema_valid              # the record passes its JSON Schema
    file: records/stakeholders/SH-01.md
  - rule: field_equals              # a YAML header field equals a value exactly
    file: records/stakeholders/SH-01.md
    field: name
    value: Sarah Kim
  - rule: regex                     # a pattern is found (or, with match: false, not found)
    in: reply                       # reply | files (record files written, one per line) | {file: <path>}
    pattern: SH-01
    flags: i
  - rule: judge                     # Opus scores a file against the rubric; needs --judge opus, fails without it
    file: .factory/runs/r1/proposal.json
    rubric: ...
```

Rules for the JSON proposals of the intake and BA agents (paths are in the workspace; `input` is the run's `input.json`):

| Rule | Passes when |
| --- | --- |
| `json_schema { file, schema }` | the file passes `schemas/<schema>.schema.json` (for example `intake-proposal`) |
| `claims_match { file, expected: [{ words, said_by }], min_recall }` | enough expected claims are found: a proposed claim's `words` contains the expected words (case-insensitive, whitespace-normalised) and `said_by` matches. Detail lists misses |
| `no_invented { file, input }` | every `verbatim` claim's words appear in the input's `text`. No tolerance |
| `evidence_subset { file, input }` | every BR evidence ID is a claim ID in the input |

Run a judged suite with `--judge opus`: `node packages/scripts/dist/cli.js eval run --agent ba --cases evals/ba/ --judge opus`.

Score is the share of rules passed. A case passes only when all rules pass and the agent reported no error.
