# F-01 Plan: the factory's tracer bullet

Oct 16, 2026 · Draft for Austin's approval

## Status

| State | Items |
| --- | --- |
| Waiting on you | Approve this plan, and answer the decisions in D1 to D6 |
| Blocked on you | OTel variables in the cloud environment (A6 step 3). Still missing on 16 Oct: `env` shows no `OTEL_*` variables, so build sessions still don't report to the ledger |
| Next | C0 contracts PR, then streams S1 to S7 in parallel |

## Goal and demo check

One workshop transcript goes from the dashboard inbox to an approved business requirement you can trace back to the quote it came from (build plan, F-01, steps 1 to 8).

**Done when:** an automated test runs steps 1 to 8 on a sample transcript and passes, and you've done it once yourself from the dashboard.

## Read list

Every stream reads `CLAUDE.md`, this plan, and its own plan file. Then only these sections (find with `grep -n "^## <heading>"`):

| Doc | Section | Streams |
| --- | --- | --- |
| `build-plan.md` | F-01: the factory's tracer bullet | All |
| `design-doc.md` | ID and trace schema (agreed 15 Oct): parts 1 to 8 | All |
| `design-doc.md` | Ingestion and attribution | S2, S5 |
| `design-doc.md` | Traceability | S1, S3 |
| `design-doc.md` | Approval points; Dashboard | S7 |
| `agent-specs.md` | How a spec is built; Agent 1: Intake; Agent 2: BA agent | S5 |
| `agent-specs.md` | Scripts and tools: rules, Use hook or build, Intake and records, Traceability, Plumbing | S1, S2, S3, S4 |
| `spikes/S1-running-agents.md` | 1a, 1c, Follow-ups | S5, S6 |
| `spikes/S2-model-hand-off.md` | Decision | Build method |
| `spikes/S3-mcp-access.md` | Decision, Follow-ups | S3, S4 |
| `spikes/S4-token-telemetry.md` | Decision | S6 |
| `spikes/S5-preview-databases.md` | Decision | S3 |
| `design/README.md`, `design/dashboard/` Overview and Thread explorer | Structure only | S7 |
| `schemas/README.md`, `evals/README.md` | Whole file (short) | S1, S5 |

## Decisions for you

Each has a recommendation. The contracts below assume the recommendation.

| # | Question | Recommendation | Why |
| --- | --- | --- | --- |
| D1 | Claims must be confirmed before they become evidence, but the F-01 steps skip confirmation. Add it? | **Yes: one "Confirm claims from SRC-001" card** between intake and the BA agent | Keeps the rule "you confirm before anything becomes evidence", and matches the BA agent's spec trigger ("claims confirmed after a source"). Unknown and unlabelled speakers stay in F-02 |
| D2 | Who merges an agent's records PR in a project repo? | **The workflow merges it** after its own checks pass, using the App token | Drafts aren't approvals; the APR record is the gate. Branch protection and auto-merge aren't available on private repos on GitHub Free. The PR stays as the audit trail |
| D3 | Where does the automated end-to-end test run its project? | **A new repo, `transperaai/factory-e2e`**, reset to a seed commit at the start of each run | Each run writes new SRC, CLM, BR and APR records. Resetting `factory-test-project` would delete requirements content, which needs your yes every time. The e2e repo holds sample data only, so resetting it is allowed by this decision |
| D4 | Where do the Sonnet build runs for F-01 run? | **Actions**, from a small `build-run.yml` in Software-factory | Spike 1: Actions for agent runs, about a quarter of the cost, every run tagged `factory.slice=F-01-Sn`. It also gets F-01's build into the ledger while the cloud OTel variables are missing |
| D5 | Merging stream PRs | **Stream PRs merge into an `f01` branch** after green CI and my Opus review, without asking. **One `f01` → `main` PR** needs your yes | Seven streams would mean seven production deploys and seven asks. `f01` gets a preview with its own Neon branch |
| D6 | The claim schema lacks two things the Intake spec requires: claim type `measure`, and a trust level | **Fix the schema** (it is generated and was meant to follow the spec): add `measure` to `claim_type`, add `trust: strong \| medium \| unverified` and `quote: verbatim \| paraphrase`, required from `review` | Docs win over code; this brings the schema back in line |

## How we build it

Spike 2 and spike 1 decisions, applied to F-01:

1. **Opus plans.** I write one plan file per stream, `plans/F-01-S<n>.md` (files, functions, tests by name, done check), in this session.
2. **Sonnet builds, in a separate run.** `build-run.yml` (workflow_dispatch: plan path, branch) runs `claude-code-action` with `--model sonnet`, on branch `f01/s<n>-<name>`, and opens a PR into `f01`. No Haiku (`ANTHROPIC_DEFAULT_HAIKU_MODEL`). OTel tags: `factory.project=Software-factory, factory.agent=coder-build, factory.slice=F-01-S<n>`. The allowlist lets it run compound test commands (spike 2's 11 denials).
3. **Opus reviews** each PR here. A fix round is a new Sonnet run with my review notes appended to the plan file.
4. **At most 8 runs at once.** `build-run.yml` uses a concurrency group with 8 slots; I start at most 7 streams together, leaving room for an eval run.

## Contracts (fixed here, built in C0)

C0 is one PR I build before the streams start. It holds only shared definitions, so streams never edit each other's shared files.

**K1. Project repo layout and IDs**

- Sources: `records/sources/SRC-001/<original file, untouched>` plus `meta.yaml` (the `source` record). The sorter's normalised text goes in `records/sources/SRC-001/text.md` (generated, line-numbered turns).
- ID widths: SRC 3 digits, CLM and APR 4, everything else 2 (`SRC-001`, `CLM-0003`, `BR-01`, `APR-0012`), as in the design doc. The schemas already accept these.
- Inbox: the dashboard commits uploads to `inbox/<yyyymmdd-hhmmss>-<safe name>` on a branch `intake/<same stamp>`. The sorter moves the file into `records/sources/` with `git mv`.

**K2. Records written in F-01**

| Record | Written by | Key fields | Links |
| --- | --- | --- | --- |
| SRC (`meta.yaml`) | Intake sorter | `source_type: transcript`, `date`, `raw_file`, `participants: [{label, stakeholder}]`, `sha256`, `status: draft` | none |
| CLM | Record writer, from the intake proposal | `words`, `location` (`L42` or `00:12:40`), `claim_type`, `trust`, `quote`, `confirmation: pending`, `status: draft` | `from_source: [SRC-001]`, `said_by: [SH-01]` |
| BR | Record writer, from the BA proposal | `title` (the outcome), `value`, `priority`, `owner`, `status: review` | `evidence: [CLM-…]` (confirmed only) |
| APR | Approval recorder | `decision`, `approver: SH-00` (you), `role: delivery lead`, `date`, `comment` | `approves: [BR-01@1]` or `[CLM-0001@1, …]` |

Approving sets the target's `status: approved` and `approval: APR-…` in the same commit, version unchanged. Confirming claims (D1) sets `confirmation: confirmed` on each and writes one APR for the batch. `created_by` is `script:intake-sorter`, `agent:intake`, `agent:ba`, `human:austin`.

You need a stakeholder record: C0 adds `SH-00` (Austin Smith, delivery lead, Transpera) to the sample projects.

**K3. Agent proposals.** Agents never write `records/`. Each writes one JSON file, `.factory/runs/<run-id>/proposal.json`; the record writer allocates IDs and writes Markdown. JSON Schemas live in `schemas/proposals/`.

- Intake: `{source: "SRC-001", claims: [{words, location, claim_type, trust, quote, said_by: "SH-01" | null, flags: []}]}`.
- BA: `{brs: [{title, value, priority, owner, evidence: ["CLM-…"]}], parked: [{ask, reason, question, evidence: []}]}`. Parked asks go in the run summary in F-01; they become records in F-02.
- The record writer rejects any transcript claim whose `words` are not found verbatim in `text.md` at its location, and any BR citing a claim that isn't confirmed. Invented claims fail deterministically, not only in evals.

**K4. Run input bundle.** A script prepares each agent's input, so agents start with clean data and evals stay offline: `.factory/runs/<run-id>/input.json`.

- Intake: source ID, line-numbered text, participants mapped to SH IDs, project profile.
- BA: confirmed claims (ID, words, speaker, location), stakeholders, project profile. Built from the index through `/api/index/query`, or from the working tree with `--offline` (evals, tests).

**K5. Database (migration `0003_index`)**

| Table | Columns | Notes |
| --- | --- | --- |
| `records` (extended) | + `version int`, `source_path`, `deleted_at` | Existing table from spike 3 |
| `record_links` | `project, from_id, link_type, to_id, to_version` | PK on all but version. Reverse links are a query, never stored twice |
| `index_syncs` | `project, commit_sha, synced_at, record_count, ok, findings jsonb` | One row per sync; `findings` holds trace checker output |
| `id_counters` | `project, prefix, last int` | Allocation is `UPDATE … SET last = greatest(last, $max_in_tree) + n RETURNING` |

**K6. HTTP APIs (dashboard)**

| Route | Token | Body / result |
| --- | --- | --- |
| `POST /api/index/sync` | `INDEX_TOKEN` (new; spike 3 follow-up) | `{project, commitSha, files: [{path, content}], findings}` → replaces the project's rows in one transaction |
| `POST /api/ids` | `INDEX_TOKEN` | `{project, prefix, count, maxInTree}` → `{ids: ["CLM-0001", …]}` |
| `POST /api/index/query` | `INDEX_TOKEN` | `{project, type?, status?, confirmation?, from_source?}` → records, for input bundles |
| `/api/e2e/*` (`inbox`, `cards`, `act`, `thread/:id`) | `FACTORY_API_TOKEN` (new) | API twins of the dashboard actions. Refused for any project except `factory-e2e` |

`/api/records` is removed once `factory-test-project` uses `/api/index/sync`.

**K7. MCP read tools.** `get_record` (exists), `list_records(project, type?, status?)`, `search(project, text, type?)`, `trace_up(project, id, depth?)`, `trace_down(project, id, depth?)`. `.mcp.json` sends `X-Factory-Agent: ${FACTORY_AGENT}`; the server limits what each agent may read (Intake: SRC, SH, TERM, CLM; never BR or later). `find_orphans` waits for F-03, when stories exist.

**K8. Dashboard cards** (computed from the index, no card table)

| Card | Shown when | Action |
| --- | --- | --- |
| Confirm claims | A source has attributed claims with `confirmation: pending` | Confirm all (with per-claim untick) → APR, then starts `ba.yml` |
| Approve | A record has `status: review` and no approval | Approve or Reject with comment → APR |
| Broken link | The latest sync's findings list a link that doesn't resolve | Opens the record |

**K9. Workflow triggers in a project repo.** The dashboard starts `intake.yml` (inputs `inbox_path`) and `ba.yml` (inputs `source`) with `workflow_dispatch`, using the App token. Agents never run on `push` (the action rejects it). Index sync runs on push to `main` touching `records/`. All commits and merges by workflows and the dashboard use the App token, so they trigger the next workflow.

## Streams

| Stream | What it builds | Starts | Merges after |
| --- | --- | --- | --- |
| **C0** Contracts (me) | K1 to K9 as code: schema fix (D6), proposal schemas, migration 0003 and Drizzle tables, TypeScript types and function signatures, `SH-00`, sample transcript fixtures, `build-run.yml`, the `f01` branch | **First** | Your yes (touches schemas and workflows) |
| **S1** Records toolkit | `packages/records`, bundled to `kit/tools/`: read and write records, ID allocator client (online and `--offline`), record writer, record validator (schema, links resolve, ID reuse), trace checker (F-01 rules), approval builder. Kit hook `validate-records.mjs` on Write/Edit | At once | C0 |
| **S2** Intake sorter | `kit/tools/intake-sort.mjs`: `.txt`, `.vtt` and `.md` transcripts; hash dedupe; SRC ID; `git mv`; `meta.yaml` and `text.md`; speaker matching by name, alias or email; intake input bundle | At once | S1 (uses its allocator and writer) |
| **S3** Index and allocator | `/api/index/sync`, `/api/ids`, `/api/index/query`; DB functions: sync, list, search, trace up and down, cards, latest findings | At once | C0 |
| **S4** MCP read tools | K7 tools and per-agent read scopes | At once | S3 (uses its DB functions) |
| **S5** Agents and evals | `kit/agents/intake.md`, `kit/agents/ba.md`; specs moved to `kit/agents/<agent>/spec.md` with pointers left in `agent-specs.md`; write scopes; eval cases (intake 4, BA 3); new rules `claims_match`, `attribution`, `no_invented`; the `judge` rule made real (Opus) | At once | C0 |
| **S6** Project workflows | `kit/workflows/`: `intake.yml`, `ba.yml`, `records-check.yml` (PR check), `index-sync.yml` (replaces spike 3's); kit installer learns workflows; App token minting | At once | S1, S2, S5 for its live run |
| **S7** Dashboard | Inbox upload; Overview card list (K8); confirm and approve actions (approval recorder via the App); Thread explorer top level: BR list, then a BR's claims with quote, speaker and source location; `/api/e2e/*` twins | At once (against a seeded test DB) | S1, S3 |
| **S8** End to end | `factory-e2e` seed and reset; `f01-e2e.yml` that runs steps 1 to 8 through `/api/e2e/*` with real Actions and real agents; kit `v0.3.0` release and kit update PRs; the demo with you | **Waits for all** | Everything |

So: C0 first (about half a day). Then **S1 to S7 start together: 7 runs, under the cap of 8.** S4, S2, S6 and S7 can be built at once against the contracts but merge in the order above. S8 starts when S1 to S7 are on `f01`.

## Files and tests by stream

| Stream | Main files | Tests (all `vitest`, PGlite for DB) |
| --- | --- | --- |
| C0 | `packages/schemas/src/definitions.ts`, `schemas/proposals/*.json`, `packages/db/migrations/0003_index.sql`, `packages/db/src/schema.ts`, `packages/records/src/types.ts`, `fixtures/f01/`, `.github/workflows/build-run.yml` | Schemas regenerate clean; migration applies on PGlite; fixtures pass the schema check |
| S1 | `packages/records/src/{io,ids,writer,validate,trace,approve}.ts`, `kit/hooks/validate-records.mjs` | Round-trip read and write; writer rejects a non-verbatim claim and a BR citing a pending claim; validator catches a dead link and a reused ID; trace checker on a fixture repo; approval builder output passes the APR schema; hook blocks a bad record |
| S2 | `packages/records/src/sorter/*.ts`, `kit/tools/intake-sort.mjs` | Each format parses to the same turns; a duplicate upload is refused; raw file byte-identical after the move; alias match; unmatched speaker left without SH; re-run changes nothing |
| S3 | `packages/db/src/{index-sync,ids,query,cards}.ts`, `apps/dashboard/app/api/{index,ids}/…` | Sync replaces and deletes; reverse links; parallel allocation gives no duplicates; 401 without token; cards from fixture data |
| S4 | `apps/dashboard/lib/mcp/{tools,scopes}.ts` | Each tool on fixture data; Intake asking for a BR is refused; existing `get_record` tests still pass |
| S5 | `kit/agents/{intake,ba}.md`, `kit/agents/{intake,ba}/spec.md`, `kit/skills/{intake-claims,ba-discovery}/SKILL.md`, `kit/hooks/write-scopes.json`, `evals/{intake,ba}/*.yaml`, `packages/scripts/src/eval/rules.ts` | Rule unit tests; eval suites run in Actions and their results reach `eval_runs`. Bar: invented claims 0, attribution 100% on labelled speakers, evidence-backed BRs 100%, solution words 0 |
| S6 | `kit/workflows/*.yml`, `kit/kit.json`, `packages/scripts/src/kit/install.ts` | Installer test for workflows; `actionlint`; a live run in `factory-test-project` from a kit update branch |
| S7 | `apps/dashboard/app/(overview,thread,inbox)/…`, `apps/dashboard/lib/{github-app,approvals,cards}.ts` | Approval recorder builds the right commit (GitHub API mocked at the HTTP edge only); pages render from a seeded DB; sign-in lock still holds on every new route; e2e routes refuse other projects |
| S8 | `.github/workflows/f01-e2e.yml`, `scripts/e2e/f01.ts`, `factory-e2e` seed | The e2e itself: SRC, claims, confirmation APR, BR, approval APR in git; index matches the commit; trace findings empty; thread API returns BR → claims → quote |

## What you need to do

1. **OTel variables** in the cloud environment (A6 step 3, listed in the spike 4 write-up). Still missing.
2. **App permissions:** give `transpera-kit-bot` Actions (write) and Workflows (write), and install it on `factory-e2e` (D3).
3. **Secrets** (I'll tell you exactly where when C0 is ready):
   - Vercel, sensitive: App ID and private key; `INDEX_TOKEN`; `FACTORY_API_TOKEN`.
   - `factory-test-project` and `factory-e2e`: App ID and private key; `INDEX_TOKEN`.
   - Software-factory: `FACTORY_API_TOKEN`.
4. **Create `transperaai/factory-e2e`** (private, empty) if you agree to D3.
5. **The demo:** drop the sample transcript in the inbox, confirm the claims, approve the BR, and walk the thread.

## Risks

| Risk | What it would look like | Mitigation |
| --- | --- | --- |
| Neon branch limit | Free plan has 9 preview branches; `f01` plus 7 stream branches plus this branch is 9. A tenth fails to deploy | At most 7 stream branches live; the cleanup workflow removes closed ones; I delete stale `preview/` branches before starting |
| Workflows not triggering | A merge or commit made with `GITHUB_TOKEN` doesn't start index sync | App token for every commit, merge and dispatch (K9) |
| Agent sees the App token | Action secrets in `settings` env are readable by the agent process | Agent steps get only the OAuth, MCP and OTel values. The App token is minted in a later step |
| Kit changes not live | On PR events the action uses `main`'s `.claude/` | Agents run on `workflow_dispatch`. New agents reach projects only through kit `v0.3.0` and its update PR, before S8 |
| Agent definition and spec clash | Claude Code may load `kit/agents/intake/spec.md` as an agent | The kit installer copies only top-level `*.md` agent files; a test checks it |
| Parallel merge conflicts | Streams edit the same exports or the lockfile | C0 owns shared files; streams add new files; the lockfile is regenerated on merge, never edited |
| Invented or reshaped claims | Plausible claims that aren't in the transcript | The writer's verbatim check (K3), the `no_invented` eval, and your confirmation card |
| Opus cost | The BA agent and reviews drain the 5-hour window | 8-run cap; e2e runs on demand only; I check the meter from each run's `rate_limit_event` before starting a wave |
| Vercel request limits | Large uploads fail on Hobby | Text transcripts only in F-01, capped at 1 MB; audio and video wait for F-02 |
| Scope creep | Unknown speakers, dedupe, attention cards for every escalation | Out of F-01. Listed below |

## Not in F-01

Unknown or unlabelled speakers and their cards, possible stakeholders, Keep or Remove cards, conflict detection, claim dedupe, audio and video, the Brief, pains and KPIs, parked asks as records, per-project MCP tokens (F-02); the Thread explorer below the BR's claims and `find_orphans` (F-03).
