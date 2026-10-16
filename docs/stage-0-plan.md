# Stage 0 Plan

Oct 15, 2026 · Approved 15 Oct

## Status

Updated 16 Oct.

| State | Items |
| --- | --- |
| Done | Plan approved (#2). Design doc fixes (#1). **S0-1** monorepo, bare dashboard, CI (#3), Vercel framework fix (#7), Hobby check passed (#8, `docs/spikes/S0-1-hobby-check.md`). **S0-2** record schemas (#4). **S0-5** kit skeleton (#5), released as `kit-v0.1.0`. Running status (#6). Docs map and lean-context rules (#9). **S0-3** dashboard sign-in and Neon (#10). **S0-4** cost ledger and OTel ingest (#11), live on production. **S0-7** eval harness (#12), live on production. A1 Vercel, A2 Neon, A3 OAuth app, A5 ingest token. Production: https://transpera-factory.vercel.app |
| Waiting on your merge | Nothing yet. Spike 5 PR goes up for the live tests |
| In progress | **Spike 5** preview databases: migration guard and cleanup built; live tests need A8 |
| Blocked on you | A8 for spike 5's live tests. A4 and A5 step 4 for evals from Actions. Deleting the merged branches on GitHub (this session can't delete branches) |
| Next | S0-6 agent run in the test project (needs A4). A6 lets sessions report their own usage to the ledger |

## Goal and exit check

Stage 0 builds the empty factory and answers five unknowns. It is done when:

1. An agent triggered from GitHub (an issue label in `factory-test-project`) writes a record and opens a PR.
2. The record passes a JSON Schema check in the same Action.
3. That run's tokens show up in the cost ledger, tagged with project, agent and slice ID.
4. You can log in to the empty dashboard on vercel.app, and nobody else can.

## What we already know (checked against current Claude Code docs)

These facts shape the plan. Spikes confirm them in practice.

- **Cloud sessions don't install plugins declared in a repo's settings.** They do read files committed under `.claude/` (agents, skills, commands, hooks in `settings.json`) and `.mcp.json`. So the main way to install the kit is to copy pinned files into the project's `.claude/`, which also suits handover. A plugin marketplace is tested in spike 1 for comparison only.
- **GitHub Actions:** `anthropics/claude-code-action` accepts `claude_code_oauth_token`, a one-year token from `claude setup-token` that is tied to your subscription. `claude_args` passes any CLI flag, such as `--model`.
- **Telemetry:** Claude Code exports OpenTelemetry over `http/json`. Each `claude_code.api_request` event carries the model, input, output and cache tokens, `cost_usd` and `request_id`. Logs export every 5s by default and metrics every 60s, so short runs need the intervals shortened. In cloud sessions the variables go in the cloud environment settings, not the repo, and the collector's domain must be on the network allowlist.
- **MCP:** a repo's `.mcp.json` can name a remote HTTP server, with `${VAR}` used in its headers. Cloud sessions load it without a prompt, but the host must be on the network allowlist.
- **Model hand-off:** subagents take `model: opus | sonnet | inherit`. There is also an `opusplan` alias, which runs Opus in plan mode and Sonnet for the rest.
- **A known trap:** PRs opened with the default `GITHUB_TOKEN` don't trigger other workflows, so a kit-update PR opened that way would skip its tests. We need a GitHub App token (free).

## Repo layout

This repo is the factory: the kit plus the dashboard, as a pnpm + Turborepo monorepo.

```text
apps/
  dashboard/           Next.js (App Router), Auth.js, reads Postgres. Hosts /api/otel and /api/mcp
packages/
  db/                  Drizzle schema and migrations (cost ledger, eval runs, spike tables), shared
  schemas/             loader and validator for schemas/ (Ajv), used by the CI check and later the F-01 hook
  scripts/             factory CLI: kit install, kit update, schema check, eval runner
  mcp-server/          MCP tool definitions; mounted by the dashboard at /api/mcp (one Vercel project)
kit/                   what projects install, versioned by tags kit-vX.Y.Z
  kit.json             kit name, version, file manifest
  agents/              agent instruction files (Stage 0: one "scribe" test agent)
  skills/
  hooks/               hook scripts, plus a settings fragment that wires them in
schemas/               JSON Schema per record type, plus project.yaml and source meta.yaml
evals/                 cases and scoring rules per agent (results go to Postgres)
docs/                  design docs, this plan, spikes/
design/                prototypes (unchanged)
.github/workflows/     CI, kit release, kit update fan-out
```

**What a project gets** (proven on `factory-test-project`):

```text
.claude/agents/  .claude/skills/  .claude/hooks/   copied from kit at a pinned tag
.claude/settings.json                              hooks wired in; project settings merged, not overwritten
.factory/schemas/                                  copied from schemas/ at the same tag
kit.lock.json                                      kit version, source commit SHA, sha256 of every installed file
.github/workflows/agent-run.yml                    issue label → agent run → schema check → PR
.github/workflows/kit-check.yml                    installed files match kit.lock.json (local edits show as deviations)
project.yaml  records/                             per the trace schema
```

The pinned files don't depend on the factory repo at runtime, so a project survives handover with no access to Software-factory.

## Items

Each item is one branch and one PR. Branch names are given in brackets.

### S0-1 Monorepo skeleton and Vercel Hobby check `[stage0/monorepo]`

- **Create:** pnpm workspace, Turborepo, shared TS config, lint (ESLint), format (Prettier), Vitest, a CI workflow (lint, typecheck, test, build), and a bare Next.js app in `apps/dashboard`.
- **Hobby check, done first because it can change the plan:**
  1. You import the repo into Vercel Hobby (A1).
  2. I push a commit authored by Claude, and a second commit is made by `github-actions[bot]`.
  3. We confirm both deploy, for production and previews.
- **Works when:** CI is green, and both bot-authored commits deploy on Hobby.
- **If Hobby blocks bot commits, the free workaround:** deploy from a GitHub Action with the Vercel CLI (`vercel build` then `vercel deploy --prebuilt`, using a Vercel token in GitHub secrets). I'll report before switching.

### S0-2 Record schemas `[stage0/schemas]`

- **Create:**
  - `schemas/_base.schema.json`, the shared header: id, type, title, status, version, owner, links, approval, created_by.
  - One schema per ID prefix in the trace schema (about 30).
  - `project.yaml` and `meta.yaml` schemas.
  - The validator package.
- **What each schema enforces:** the ID pattern per prefix, status values, and the required link types from the "Must link to" table. Field details come from the phase deep-dives. Where a phase doesn't name a field, the schema allows extra fields rather than guessing.
- **Not covered:** links that point at records that exist. Those need the whole repo and belong to F-01's validator and trace checker.
- **Works when:** every schema compiles, and each type has one valid and at least one invalid fixture, tested in CI.
- **Risk:** some record types are thinly specified. I'll list the ones where I had to choose, for you to confirm in the PR.

### S0-3 Dashboard shell with login and Neon `[stage0/dashboard-auth]`

- **Create:**
  - Auth.js v5 with GitHub. The sign-in callback allows only your numeric GitHub user ID; everyone else gets "Not allowed".
  - An empty dashboard page showing the database status.
  - Drizzle connected to Neon, with migrations run in the Vercel build.
- **Works when:**
  - You log in on the vercel.app address.
  - A second GitHub account is refused (a unit test covers the allowlist; you can try a second account if you have one).
  - The page shows "Database: connected".
- **Preview URLs:** an OAuth app allows one callback URL, so in Stage 0 login works on production only. Previews show a "log in on production" message. Auth.js has a redirect-proxy option if previews need login later.
- **You:** A2 (Neon) and A3 (OAuth app).

### S0-4 Cost ledger and token ingest `[stage0/cost-ledger]`

- **Create:**
  - `POST /api/otel/v1/logs` and `/v1/metrics` endpoints that accept OTLP http/json and check a bearer token.
  - Tables:
    - `token_events`: one row per `api_request`, holding time, session ID, request ID, project, client, agent, slice ID, model and the four token counts. The `cost_usd` field is kept as the API-equivalent cost.
    - `cost_ledger`: the design columns (date, project, client, source, category, amount, basis), one row per project, agent, model and day, rebuilt from `token_events`. On Max the basis is `allocated`.
  - Metrics are stored raw for cross-checking only.
- **Re-runs:** ingest is safe to repeat. `request_id` is unique, so a resent batch changes nothing.
- **Tags:** set through `OTEL_RESOURCE_ATTRIBUTES` (`factory.project`, `factory.client`, `factory.agent`, `factory.slice`). Rows without a slice are written with an empty slice and flagged; they aren't dropped.
- **Works when:** a local `claude -p` run pointed at the endpoint produces matching rows, and an integration test posts a recorded payload twice and gets one set of rows.
- **Costing the factory's own build:** once S0-4 is live, this session and later build sessions export to it (A6).

### S0-5 Kit skeleton, installer and lockfile `[stage0/kit]`

- **Create:**
  - `kit/` with `kit.json`, one test agent ("scribe": writes one stakeholder record from an issue body; Sonnet) and one hook (blocks writes outside `records/`, so we can prove hooks load).
  - `factory kit install <tag>`, which copies the files, merges the settings fragment and writes `kit.lock.json`.
  - `factory kit check`, which compares the files with the lockfile.
  - A release workflow that tags `kit-vX.Y.Z`.
- **Works when:**
  - Install is safe to repeat: a second run changes nothing.
  - A hand-edited kit file fails `kit check`.
  - Unit tests run on a temporary repo.

### S0-6 Agent run in the test project `[stage0/test-agent-run, PR in factory-test-project]`

- **Create in `factory-test-project`:**
  - A minimal `project.yaml` and `records/`.
  - Kit `v0.1.0` installed.
  - `agent-run.yml`, which runs when an issue gets the label `agent:scribe`. It:
    1. runs `claude-code-action` with Sonnet and the OTel variables;
    2. lets the agent write the record;
    3. checks it against `.factory/schemas/` in a separate step;
    4. opens a PR that links the issue.
- **Works when:**
  - Labelling an issue produces a PR with a valid `SH-001.md`.
  - A deliberately broken record fails the schema step.
- **You:** A4 (Claude token) and A5 (ingest token).

### S0-7 Eval harness skeleton `[stage0/evals]`

- **Create:**
  - `factory eval run --agent <name> --cases evals/<agent>/` runs each case through `claude -p` with the agent's instruction file, then applies the scoring rule.
  - Scoring rules for Stage 0: schema-valid, field equals, regex. A rule that uses Opus as the judge exists as an interface only; the first real one comes with the intake agent in F-01.
  - Results go to `eval_runs` and `eval_results` in Postgres.
  - Three cases for the scribe agent.
  - A `workflow_dispatch` Action to run it.
- **Works when:** a run stores three scored results, and running it twice gives two separate runs, both kept.

### Spikes

Each spike ends with `docs/spikes/S<n>-<name>.md`: what we tried, what happened, the decision.

**Spike 1: running agents and kit distribution** `[stage0/spike-1]`

- **a. Loading the kit.** Do the agent, skill and hook installed in `.claude/` load:
  - in a cloud session on `factory-test-project`?
  - in `claude-code-action`?

  Compare with a plugin marketplace: settings-declared in cloud, and the action's `plugin_marketplaces` input in Actions. Expected result: the copied files work in both and the marketplace doesn't work in cloud. Decision: confirm the install-by-copy method.
- **b. Kit update PRs.**
  1. Release kit `v0.1.1`.
  2. A fan-out workflow in Software-factory opens one update PR per project repo (listed in `kit/projects.json`), using a GitHub App token.
  3. Each PR runs `kit-check`, the project's tests, and the kit's evals for the changed agents.
  4. You approve and merge.

  **Works when:** an update PR appears in `factory-test-project` with green checks and the lockfile updated. **You:** A7.
- **c. Cloud sessions versus Actions.** Compare start-up time, what each can reach (network, MCP, secrets), how each is triggered, and how logs reach the dashboard. Decision: which work runs where.
- **d. How many agents can run in parallel.** I run the same small task (about 20k tokens) at 2, then 4, then 8 at once, in both Actions and cloud sessions. Between steps you read the usage meter at claude.ai → Settings → Usage. I stop at about 5% of the weekly allowance, or as soon as the limit behaviour (errors, slowdowns, queueing) is clear. Decision: the conductor's starting parallel limit.

**Spike 2: model hand-off** `[stage0/spike-2]`

On one toy change in the test project, Opus writes `plans/SL-000.md` and Sonnet builds from it. Three versions:

1. Opus main session plus a Sonnet subagent.
2. Two separate runs (`--model opus` to plan, then `--model sonnet` to build).
3. The `opusplan` alias.

Measure tokens per model (from S0-4), whether the build followed the plan, and the hand-off friction. Decision: the coder's pattern for F-05.

**Spike 3: MCP access** `[stage0/spike-3]`

- **Create:**
  - A minimal MCP server at `/api/mcp`, using Vercel's maintained `mcp-handler` package, with a bearer token.
  - One tool, `get_record`, reading a small `records` table seeded from the test repo by a one-off script. The real index sync is F-01.
- **Test:** the test repo's `.mcp.json` points at it with `${FACTORY_MCP_TOKEN}`. Query it from a cloud session and from Actions.
- **Works when:** both return SH-001.
- **You:** A6 (allowlist plus token in the cloud environment).

**Spike 4: token telemetry** `[stage0/spike-4]`

- **Test:** the S0-6 run and one cloud session both land in `token_events` with the slice ID.
- **Cross-check:** compare totals with the action's own execution log and with `ccusage` (or `/usage`) for the cloud session.
- **Works when:** totals agree within 5%, and the slice ID is on every row.
- **Decision:** how the launcher sets tags per agent and slice.

**Spike 5: preview databases** `[stage0/spike-5]`

- **Test:**
  - Turn on the Neon Vercel integration's "branch per preview".
  - Open a PR and check a Neon branch is created, migrated and used by the preview.
  - Close the PR and check the branch is removed.
- **Watch:** the free plan's branch limit and compute hours.
- **Fallback (free):** Neon's create-branch and delete-branch GitHub Actions.
- **Works when:** create and remove both happen without anyone touching them.

## Your steps

I'll ask for each one when its item is ready, not all at once. Never paste a token or password into the chat. Each one goes straight into Vercel or GitHub.

**A1 Vercel (for S0-1)**

1. Go to vercel.com → Sign up with GitHub (Hobby). Skip if you have an account.
2. Click Add New → Project. If `transperaai` isn't listed, click "Adjust GitHub App permissions", choose the `transperaai` organisation and give access to `Software-factory` only.
3. Import `Software-factory` and set Root Directory to `apps/dashboard`. Leave the framework as Next.js and click Deploy.
4. Tell me the vercel.app address. If you like, rename the project to `transpera-factory` under Settings → General.

**A2 Neon (for S0-3)**

1. In the Vercel project, open the Storage tab → Create Database → Neon → Free plan. Choose the region nearest you, for example Sydney (`aws-ap-southeast-2`).
2. Connect it to the project for Production, Preview and Development.
3. Leave preview branching off for now. Spike 5 turns it on.

**A3 GitHub OAuth app (for S0-3)**

1. On GitHub, open the `transperaai` organisation → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Fill in:
   - Name: Transpera Factory
   - Homepage URL: `https://<your-address>.vercel.app`
   - Callback URL: `https://<your-address>.vercel.app/api/auth/callback/github`
3. Register it, then click Generate a new client secret.
4. In Vercel, open the project → Settings → Environment Variables. Add each of these for Production and tick Sensitive:
   - `AUTH_GITHUB_ID`: the client ID.
   - `AUTH_GITHUB_SECRET`: the client secret.
   - `AUTH_SECRET`: the output of `openssl rand -base64 33`, run on your computer.
5. Tell me when it's done. I'll add your GitHub user ID as `ALLOWED_GITHUB_USER_ID`. It isn't a secret.

**A4 Claude token for Actions (for S0-6)**

1. On your computer, run `claude setup-token`, sign in, and copy the token it prints.
2. On GitHub, open `factory-test-project` → Settings → Secrets and variables → Actions → New repository secret.
3. Name it `CLAUDE_CODE_OAUTH_TOKEN` and paste the token. Later, add the same secret to Software-factory for evals.

**A5 Ingest token (for S0-4 and S0-6)**

1. Run `openssl rand -hex 32` on your computer.
2. Add the result in Vercel as `OTEL_INGEST_TOKEN` (Production, Sensitive).
3. Add the same value as a GitHub secret `OTEL_INGEST_TOKEN` in `factory-test-project`.
4. Add it again as a GitHub secret `OTEL_INGEST_TOKEN` in `Software-factory`, so the Evals Action can store its results.

**A6 Cloud environment (for spikes 3 and 4, and costing this build)**

1. In this session's title bar, open the cloud environment menu → Edit.
2. Under Network access, add `<your-address>.vercel.app` to Allowed domains. Leave "Allow package managers" ticked.
3. Add these environment variables:
   - `CLAUDE_CODE_ENABLE_TELEMETRY=1`
   - `OTEL_LOGS_EXPORTER=otlp`
   - `OTEL_METRICS_EXPORTER=otlp`
   - `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`
   - `OTEL_EXPORTER_OTLP_ENDPOINT=https://<your-address>.vercel.app/api/otel`
   - `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <ingest token>`
   - `FACTORY_MCP_TOKEN=<a second token from openssl rand -hex 32, also added in Vercel as MCP_TOKEN>`

   If the menu offers a Network secrets section, put the two tokens there instead of plain variables.
4. New sessions pick these up.

**A7 GitHub App for kit updates (for spike 1b)**

1. Open the `transperaai` organisation → Settings → Developer settings → GitHub Apps → New GitHub App.
2. Fill in:
   - Name: transpera-kit-bot
   - Homepage URL: the dashboard address
   - Webhook: untick Active
3. Repository permissions: Contents read and write, Pull requests read and write, Workflows read and write. Choose "Only on this account".
4. Create it, note the App ID, then click Generate a private key. A `.pem` file downloads.
5. Click Install App → `transperaai` → choose `Software-factory` and `factory-test-project`.
6. In Software-factory → Settings → Secrets → Actions, add `KIT_BOT_APP_ID` and `KIT_BOT_PRIVATE_KEY` (the whole `.pem` contents). Then delete the `.pem` file from your computer.

**A8 Preview databases (for spike 5)**

1. In Vercel, open the project → Storage → your Neon database. Open its settings for `transpera-factory`.
2. Under Advanced Options → Deployments Configuration, turn on **Preview**.
3. Make sure **"Resource must be active before deployment"** is on. Save.
4. Click Open in Neon. On the Branches page, open the production branch (`main` or `production`).
5. Under Computes, copy the endpoint ID. It starts with `ep-`. It isn't a secret.
6. In Vercel → Settings → Environment Variables, add `FACTORY_PROD_DB_ENDPOINT` with that ID. Tick Production and Preview. Leave Sensitive off.
7. In Neon → Project settings, copy the Project ID.
8. In GitHub → Software-factory → Settings → Secrets and variables → Actions → Variables, add `NEON_PROJECT_ID` with it.
9. In Neon → account or organisation settings → API keys, create a key named `github-preview-cleanup`. Choose this project only, if offered.
10. In GitHub → Software-factory → Settings → Environments, create `neon-cleanup`. Under Deployment branches, choose "Selected branches" and add `main`.
11. In that environment, add a secret `NEON_API_KEY` and paste the key there. Nowhere else.
12. Optional: GitHub → Settings → General → tick "Automatically delete head branches", so merged branches free their Neon slot at once.

## Order of work

```text
Wave 1 (parallel):  S0-1 monorepo + Hobby check  |  S0-2 schemas  |  S0-5 kit skeleton
Wave 2:             S0-3 dashboard + auth + Neon   (needs S0-1, A1–A3)
Wave 3 (parallel):  S0-4 cost ledger  |  S0-7 eval harness  |  spike 5 preview DBs   (need S0-3)
Wave 4:             S0-6 agent run in test repo     (needs S0-2, S0-4, S0-5, A4, A5)
Wave 5 (parallel):  spike 1a/1c/1d  |  spike 2  |  spike 3  |  spike 4   (need S0-6, A6)
                    spike 1b kit update PRs          (needs S0-5, S0-6, A7)
Exit check:         label an issue → PR with valid record → rows in ledger → you log in
```

The Hobby check comes first because a blocked deploy changes S0-3 onward. I'll keep at most two PRs open waiting on you, in line with the WIP limit.

## Risks and unknowns

| Risk | Effect | Plan |
| --- | --- | --- |
| Hobby blocks deploys of bot commits on private org repos, or its terms on commercial use | Dashboard can't deploy from agent PRs | Checked in S0-1. Free workaround: deploy with the Vercel CLI from Actions. The commercial-use terms are your call; flagged only |
| PRs opened with `GITHUB_TOKEN` skip CI | Kit update and agent PRs merge untested | Use the GitHub App token (A7) for any PR that must run checks |
| Telemetry doesn't export from `claude-code-action`, or cloud egress is blocked | Exit check part 3 fails | Spike 4. Fallbacks: post the action's execution log usage to the ingest endpoint; for cloud, ccusage from a session-end hook |
| Cost on Max is notional | `cost_usd` is the API-equivalent price, not money spent | Ledger basis `allocated`. Real allocation by token share comes in F-09 |
| Usage meter is coarse | Spike 1d gives a rough parallel limit, not an exact one | Step up gently, stop at 5%, and let the conductor adjust from live data later |
| Neon free plan limits: 10 branches (9 previews), 100 CU-hours a month shared with production | Previews fail, or eat production's compute | Spike 5: cleanup on PR close or branch delete, merged branches deleted, usage measured |
| Thin field specs for some record types | Schemas too loose or too strict | Listed in the S0-2 PR for you to confirm |
| Preview deployments can't log in | You can't review previews behind auth in Stage 0 | Production-only login now; redirect proxy later if needed |
| Setup-token is personal and expires after a year | Actions stop on expiry | Expiry date recorded; the F-08 expiry checker will warn |

## Decisions for you in this plan

1. **Test agent:** a throwaway "scribe" agent proves the loop. The real intake agent waits for F-01, as the build plan says.
2. **Ledger shape:** raw `token_events` plus a daily `cost_ledger` rebuilt from them. Is that OK?
3. **MCP server:** mounted inside the dashboard's Vercel project rather than as a second project. One deploy, free.
4. **Kit install by copy, with a lockfile:** the plugin marketplace is tested only for comparison, because cloud sessions don't install settings-declared plugins.
