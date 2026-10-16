# Spike 1: running agents and kit distribution

16 Oct 2026. Answers:

- **1a:** install the kit by copying it into `.claude/`. It loads in cloud sessions and in Actions. A plugin marketplace failed in both.
- **1b:** kit update PRs come from a fan-out workflow using the `transpera-kit-bot` App. Its dry run passed; the live run follows the merge of #27.
- **1c:** run GitHub-triggered agents in Actions. They cost a quarter of what a cloud session does. Use cloud sessions for interactive work.
- **1d:** 8 at once caused no throttling in either place. The limit is the usage budget, not concurrency.

Test fixtures were on draft PR transperaai/factory-test-project#8, closed and never merged.

## 1a. Loading the kit

| Where | Copied kit (`.claude/`) | Marketplace |
| --- | --- | --- |
| Cloud session on `factory-test-project` | `scribe` agent and `factory-records` skill listed. The write-guard hook ran on a Write (`PreToolUse:Write`, exit 0; it allows writes when `FACTORY_AGENT` is unset) | Declared in project settings (`extraKnownMarketplaces`, `enabledPlugins`): **not installed**. `claude plugin list` was empty |
| `claude-code-action` | Agent and skill listed. With `FACTORY_AGENT=scribe`, the hook **blocked** `notes/probe.md`: "Agent "scribe" may only write in: records/stakeholders/". $0.026 | `plugin_marketplaces` with `#branch`: rejected as "Invalid marketplace URL format". Bare URL: clone failed, "unable to get password from user" (private repo, no git credentials). Project settings: not loaded |

**Decision: install by copying, as planned.** A marketplace would need a public repo, or a git credential set up before the action runs. Neither is worth it while copying works in both places.

Two things learned:

- **On PR events, the action replaces the PR's `.claude/` with `main`'s** ("PR head is untrusted"). An agent run on a PR uses the old kit, not the one under review. So a kit update PR can't test its own agents with an agent run. The kit's evals in Software-factory cover that (1b). `kit-check` still reads the PR's files directly.
- **The action rejects `push` events** ("Unsupported event type: push"). Use labels, PRs, comments or `workflow_dispatch`.

## 1b. Kit update PRs

- **Built:** `.github/workflows/kit-update.yml` and `kit/projects.json` in #27. After Kit release tags a new version, the workflow does three things for each project:
  - mints an App token scoped to that one repo;
  - installs the kit at the tag and opens `kit/update-<tag>`;
  - starts the Evals workflow for affected agents.
- **Release:** the kit is already at 0.2.0, so this releases 0.2.1, not the planned 0.1.1. The change is real: the `factory-records` skill now says to read records by ID with `get_record`.
- **Dry run on #27:** passed. The token was minted as `transpera-kit-bot`, the project checked out with it, and installing 0.2.1 changed only the skill and `kit.lock.json`. Nothing was pushed.
- **Still to see, after you merge #27:** the update PR appears in `factory-test-project`, `kit-check` passes on it, and the lockfile shows 0.2.1. I'll add the result here.

## 1c. Cloud sessions versus Actions

Same small Sonnet task in both places (read 3 files, write 5 bullets), n = 14 each, from 1d.

| | Cloud session | Actions (`claude-code-action`) |
| --- | --- | --- |
| Start-up | About 5 to 6s from create to first turn (a warm spare is claimed) | About 22 to 30s from job start to Claude starting; installing Claude Code takes 15 to 19s of that |
| Task time | 11 to 19s | Model time 6 to 10s; the whole job takes 35 to 45s |
| Tokens and cost per run | About 150k tokens, $0.11. The first request alone is about 70k tokens of tools, connectors and system prompt | About 41k tokens, $0.012 to $0.042 |
| Network | Allowlist through the proxy | Open |
| Secrets | Network secrets added by the proxy; the agent never sees them | Repo secrets through `settings` env, readable by the agent's process |
| GitHub | GitHub MCP tools, scoped to the session's repos | `GITHUB_TOKEN` or an App token |
| Factory MCP | `.mcp.json` (spike 3) | `.mcp.json` plus the token in `settings` env (spike 3) |
| Other tools | Your connectors (Gmail, Drive, Notion and others) load by default | Only what the workflow gives |
| Triggers | A person in the app, another session (`create_session`), scheduled tasks, PR events to a subscribed session | Issue labels, PRs, comments, `workflow_dispatch`, schedules; not `push` |
| Kit on PRs | The branch's own `.claude/` | `main`'s `.claude/` (see 1a) |
| Cost tags | Per environment only (spike 4); child `claude -p` runs can tag | Per job, through `settings` env (S0-6) |
| Small Haiku call | None seen | One per run, about 1,300 tokens (see follow-ups) |

**Decision (proposed):**
- **Actions** for agent runs that GitHub triggers or the conductor fans out: labelled issues, PR checks, kit updates, evals and the build line. They are about a quarter of the cost, every run is tagged, and secrets stay in GitHub.
- **Cloud sessions** for interactive work with you: build sessions like this one, and anything that needs back and forth or your connectors.
- **Cheaper cloud sessions:** trim the cloud environment's connectors and tools for agent work. The ~70k-token start-up is most of a cloud run's cost.

## 1d. How many agents in parallel

The same task at 2, then 4, then 8 at once, in both places at the same time. The usage meter was read from each run's own `rate_limit_event`, so you didn't need to watch claude.ai.

| Step | Actions runs | Cloud sessions | Errors or throttling | 5-hour meter | 7-day meter |
| --- | --- | --- | --- | --- | --- |
| a: 2 at once | 2 ok | 2 ok | None | 14% | 50% |
| b: 4 at once | 4 ok | 4 ok | None | 15 to 16% | 50% |
| c: 8 at once | 8 ok | 8 ok | None | 16 to 17% | 50% |

- **No 429s, no "overloaded", no model fallback.** All 8 Actions jobs got runners within a second. Model time stayed flat (6 to 10s) as concurrency rose.
- **What it cost:** about $1.87 in list-price terms for all 28 runs ($0.34 Actions, $1.53 cloud). The 5-hour meter moved 3 points, which includes this session's own work. The 7-day meter didn't move. It reports whole percents only.
- **Overage is off** (`overageStatus: rejected`, `out_of_credits`). Hitting the limit is a hard stop, not a bill.
- **The meter can be read by code.** Every run reports `five_hour` and `seven_day` utilization, in Actions output and in cloud session events.

**Decision (proposed):** start the conductor at **8 parallel agent runs in Actions**, below GitHub's limit on concurrent jobs (20 on the Free plan). Add a budget guard instead of a lower cap: the conductor reads `rate_limit_event` from each run, and stops starting new runs above 80% of the 5-hour window, or when the 7-day window is ahead of pace for the week. Raise the limit from live data in F-05.

Caveats: small tasks (about 40k tokens each), one round per step. Long coding runs will load the meter far faster, and the guard matters more than the cap.

## Follow-ups

- **Haiku:** the small Haiku call in Actions goes against the no-Haiku rule. Your call: route it to Sonnet with `ANTHROPIC_DEFAULT_HAIKU_MODEL` in the agent runs' `settings` env, or accept it as Claude Code's own background call.
- **OAuth token secret:** the first S0-6 runs failed because `CLAUDE_CODE_OAUTH_TOKEN` was saved with a line break. Paste it on one line when you renew it.
- **The scribe's PR step** first failed with "GitHub Actions is not permitted to create or approve pull requests" until Actions was allowed to create PRs in the repo settings, as far as the logs show. Note this in the project bootstrap (F-12).
