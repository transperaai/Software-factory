# Spike 4: token telemetry

16 Oct 2026. Answer, so far: yes, as far as I can see. A tagged cloud run reached the ledger with exactly the run's own token counts, and the slice ID was on every row. Two results still need you to read the dashboard: a cloud run that exported straight to the dashboard, and the S0-6 Action. A finding: this build session itself is not reporting, because the cloud environment has no OTel exporter variables.

## Question

Do runs from Actions and from cloud sessions land in `token_events` with the slice ID? Do their totals agree, within 5%, with the run's own report and with `ccusage`? And how should the launcher set tags per agent and slice?

## What we tried

All cloud runs were `claude -p --model sonnet --output-format json --setting-sources project --strict-mcp-config`, started from this session in a scratch copy of `factory-test-project`. Each run set the exporter variables in its own environment, with tags in `OTEL_RESOURCE_ATTRIBUTES` (`factory.project`, `factory.client`, `factory.agent`, `factory.slice=SPIKE-4`). The proxy adds the ingest token to `/api/otel/` requests, so no token was set in the session.

| Test | How it exported | Result |
| --- | --- | --- |
| 1. Cloud, through a relay | To a local relay that kept a copy of each batch, forwarded it to `/api/otel` and logged the reply | 5 log and 2 metric batches, all HTTP 200. Totals match exactly (below) |
| 2. Cloud, direct | Straight to `https://transpera-factory.vercel.app/api/otel`, two short runs, agent tag `spike4-direct` | No exporter errors. Arrival not yet confirmed: I can't read production rows, and Vercel's log stream fails through the proxy |
| 3. Cloud, project settings | Exporter variables in the project's `.claude/settings.json` `env`, nothing in the shell | **Nothing exported.** Claude Code 2.1.301 doesn't take OTel settings from project settings |
| 4. Actions (S0-6) | The action's `settings` input (user-level settings), as in `agent-run.yml` | Run's own report read from the logs. Ledger rows need your dashboard check |

## What happened

**Test 1 totals.** The relay copies were parsed with the dashboard's own `parseLogs`, so these are the rows the ingest stored.

| Source | Requests | Input | Output | Cache read | Cache write | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| Run's own JSON (`modelUsage`) | 5 turns | 8 | 658 | 125,968 | 7,376 | $0.0486968 |
| Ledger rows (`token_events`) | 4 rows | 8 | 658 | 125,968 | 7,376 | $0.048696 |
| `ccusage session` | n/a | 8 | 658 | 125,968 | 7,376 | $0.0486968 |

- The difference is 0%. The cost differs only in the 7th decimal place, because the ledger stores 6.
- All 4 rows had `slice_id = SPIKE-4`, every tag set, no `missing_tags`, and 4 unique request IDs.
- "Turns" (5) is not a request count (4). Count rows, not turns.

**Test 4: the Actions side (S0-6, 16 Oct).** Two runs got as far as the model. The two before them failed on the OAuth token before any call.

| Run | Sonnet tokens (in / out / cache read / cache write) | Sonnet cost | Haiku | Total |
| --- | --- | --- | --- | --- |
| [38844314914](https://github.com/transperaai/factory-test-project/actions/runs/38844314914) | 10 / 501 / 12,727 / 4,750 | $0.0253027 | 1,292 / 24, $0.0001412 | $0.0254439 |
| [38844551894](https://github.com/transperaai/factory-test-project/actions/runs/38844551894) | 10 / 501 / 17,477 / 0 | $0.0067777 | 1,292 / 24, $0.0001412 | $0.0069189 |

Both carry `factory.slice=ISSUE-2`. No log line shows an export error. The logs can't show success either.

**Findings**
- **This build session is not reporting.** It has `CLAUDE_CODE_ENABLE_TELEMETRY=1` but no `OTEL_*` variables, so nothing exports. After test 1, `ccusage` showed it at $2.17, none of it in the ledger. Only the child runs above reported.
- **The token header is not needed in cloud.** The proxy adds the ingest token. `OTEL_EXPORTER_OTLP_HEADERS` can be left out of the environment, which keeps the token out of the session.
- **A child run shares its parent's `session.id`.** Every run here reported this session's ID. Don't use `session.id` to tell runs apart; use the tags or the request IDs.
- **Haiku shows up in Actions.** Claude Code makes one small Haiku call per run (about 1,300 tokens, $0.00014) even with `--model sonnet`. My cloud runs made none. Spike 3 noted the same.

## To confirm when you sign in (exit check 4)

On the home page, "Cost ledger, last 7 days", 16 Oct, project `factory-test-project`, client `transpera`:

| Agent | Model | Expected |
| --- | --- | --- |
| `scribe` | `claude-sonnet-5-5` | $0.0321 |
| `scribe` | `claude-haiku-5-5` | $0.0003, if Haiku calls are exported |
| `spike4-cloud` | `claude-sonnet-5-5` | $0.0487 |
| `spike4-direct` | `claude-sonnet-5-5` | $0.0527 |
| `spike4-settings` | any | No row (test 3 exported nothing) |

The page should also show no line saying requests arrived without a full set of tags. If the `scribe` and `spike4-direct` rows match within 5%, the spike passes.

## Decision (proposed)

How the launcher sets tags:
- **Actions:** in the action's `settings` env, per job, as `agent-run.yml` does now. Project and client come from the repo, the agent from the job, and the slice from the issue or slice ID. Proven for the run itself; the ledger side is waiting on your check.
- **Agent runs started from a cloud session:** the launcher starts `claude -p` with the exporter variables and tags in the child's environment. Test 1 proved this.
- **Interactive cloud sessions (like this one):** environment variables are set per cloud environment, not per session or repo, so they can't carry a project or slice. Set the exporter variables plus `factory.client=transpera,factory.agent=build-session` in the environment. Leave project and slice to a later step: a kit SessionStart hook that sends the session ID, repo and branch to the dashboard, so the ingest can fill them in. That hook belongs in F-09 (cost tracking), not Stage 0.
- **Not project settings.** Test 3 shows Claude Code ignores OTel variables there.

## What you need to do

Fix A6 step 3. In the cloud environment, add these as plain variables:
- `OTEL_LOGS_EXPORTER=otlp`
- `OTEL_METRICS_EXPORTER=otlp`
- `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`
- `OTEL_EXPORTER_OTLP_ENDPOINT=https://transpera-factory.vercel.app/api/otel`
- `OTEL_RESOURCE_ATTRIBUTES=factory.client=transpera,factory.agent=build-session`

`CLAUDE_CODE_ENABLE_TELEMETRY=1` is already there. Leave out the headers variable: the proxy adds the token. Do this after the sign-in check: new sessions will then report, and their rows count as untagged until the SessionStart hook exists.
