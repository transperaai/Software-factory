# Spike 2: model hand-off

16 Oct 2026. Answer: use two separate runs (Opus plans to `plans/SL-xxx.md`, Sonnet builds from it). It was the cheapest, the hand-off is a file in git, and Sonnet followed the plan exactly. `opusplan` does not work headless.

## Question

For the coder in F-05, how should Opus hand a plan to Sonnet: a subagent in one session, two separate runs, or the `opusplan` alias? We measured tokens per model, plan adherence and friction on one toy change (`scripts/record-count.mjs` plus a `node:test` test).

## What we tried

All runs: `claude -p --output-format json --setting-sources project --strict-mcp-config --no-session-persistence --allowedTools "Read,Write,Edit,Glob,Grep,Bash(node:*),Task,Agent"`, prompt on stdin, fresh copy of the test project each. `Agent` was added because Claude Code 2.1.301 names the subagent tool `Agent`. FACTORY_AGENT was not set.

| Variant | Extra flags | Models used | Tokens per model (input incl. cache / output) | Cost | Turns | Time | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Opus + Sonnet subagent | `--model opus --permission-mode acceptEdits --agents '{"builder":{...,"model":"sonnet"}}'` | Opus, Sonnet | Opus 389,325 / 5,785 ($0.345). Sonnet 92,719 / 4,402 ($0.089) | $0.434 | 14 | 98s | 5/5 pass* |
| 2. Two runs | A: `--model opus`. B: `--model sonnet`. Both `--permission-mode acceptEdits` | Opus (A), Sonnet (B) | Opus 249,937 / 6,206 ($0.291). Sonnet 313,360 / 4,038 ($0.127) | $0.417 | 7 + 10 = 17 | 77s + 37s = 114s | 5/5 pass* |
| 3a. `opusplan`, plan mode | `--model opusplan --permission-mode plan` | Opus only | Opus 190,111 / 5,565 | $0.284 | 5 | 59s | Nothing built |
| 3b. `opusplan`, fallback | `--model opusplan --permission-mode acceptEdits` | **Sonnet only** | Sonnet 339,028 / 7,597 | $0.173 | 13 | 53s | 4/4 pass* |

Costs are list-price equivalents from `total_cost_usd`; on the subscription they come out of usage limits. Variant 3 in total (3a + 3b) cost $0.457.

\* `node --test scripts/` exits 1 in all three builds. Node 22.22.0 treats the folder as a module (`Cannot find module .../scripts`), so no tests run. This is a fault in the toy spec, not in any build. `node --test 'scripts/*.test.mjs'` passes in all three (counts above). Every build prints `stakeholder 1` on the real repo.

## What happened

**Variant 1: Opus + Sonnet subagent**
- Opus wrote a 109-line plan, delegated to `builder`, then checked the files itself. Sonnet usage (4,402 output tokens) shows the subagent did the build. We could not see the transcript (no session persistence), so "Opus did not write code" is inferred from token counts and its report.
- Plan adherence: exact. Both files, the exported `countRecords`, and all 5 tests named in the plan, with the same names. Nothing extra.
- Friction: 5 Bash calls denied. `Bash(node:*)` blocks any compound command (`;`, pipes, `echo`). Opus burned 370k cached input tokens orchestrating and re-checking. That is why Opus was 80% of the cost.

**Variant 2: two runs**
- Run A wrote only `plans/SL-000.md` (143 lines). `git status` after run A showed only `plans/`. Planning stayed code-free.
- Run B (Sonnet) built both files and the 5 tests the plan named. Nothing extra or missing. It reported the `node --test scripts/` failure and asked rather than editing the plan.
- Opus flagged the `node --test scripts/` risk in the plan but concluded wrongly that it would pass. Its test of the theory was blocked by permissions.
- Friction: 4 Bash denials across both runs (same compound-command cause). No hand-off friction: the plan file was the whole contract.
- No Opus review step ran here. Variant 1 included one. Adding a review run would raise variant 2's Opus cost.

**Variant 3: `opusplan`**
- 3a: headless plan mode cannot exit. There is no "approve plan" step in `-p` mode. Opus wrote the plan to `~/.claude/plans/` (outside the repo), wrote no `plans/SL-000.md`, and stopped to ask for approval. Sonnet never ran.
- 3b: outside plan mode, `opusplan` is just Sonnet. modelUsage shows zero Opus tokens. So the plan (30 lines, thinner) was written by Sonnet, not Opus.
- Sonnet first tried to write the plan and both code files in one Bash heredoc (denied), so planning and building were not separated. It then built 4 tests, which matched its own plan.

## Decision

Use **two separate runs** as the coder's pattern for F-05: Opus plans to `plans/SL-xxx.md`, then Sonnet builds from it.
- Cheapest of the working options: $0.417 against $0.434 for the subagent. Opus was 70% of the cost against 80%.
- Clean hand-off: the plan is a file in git, which fits "git is the record". Each run gets its own model, permissions and write scope (FACTORY_AGENT), and maps directly onto GitHub Actions jobs.
- Sonnet followed the plan exactly: same files, same 5 tests.
- Keep the subagent pattern as an option where Opus must review in the same session. It worked, but it cost more in Opus orchestration tokens.
- Drop `opusplan` for headless agents. Plan mode never hands over, and without plan mode it never uses Opus.

Caveats:
- One toy change, one run each (n=1). Costs will vary run to run.
- Variant 2 had no Opus review step and variant 1 did, so the cost gap partly reflects that.
- Fix before F-05: let the coder run compound test commands (the allowlist caused 11 denials), and run tests as `node --test 'scripts/*.test.mjs'` on Node 22, not `node --test scripts/`.

Where the numbers come from: each run's own JSON report from `claude -p --output-format json` (`modelUsage`, `total_cost_usd`). The plan said to read them from the S0-4 ledger, but this build session doesn't report to the ledger until A6. Runs were made in scratch copies of `factory-test-project`; nothing from them was committed.
