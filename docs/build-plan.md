# ADLC Factory — Build Plan

Oct 15, 2026 · @Austin Smith

## How we build it

We build the factory the way it will build client work: one thin end-to-end slice first (F-01), then one stage at a time, with a demo check at the end of each slice. From F-02 on, slices are thick: each one leaves its stage usable for real project work (Austin, 16 Oct), because thin slices drew out the build.

- **Tracer bullet first.** Slice F-01 runs a single requirement from a dropped-in source to an approved record on the dashboard. It's thin, but every layer is real: git records, index, dashboard, approval and trace check.
- **One stage per slice after that.** Each slice adds one phase of the life cycle (discovery, stories, build, test, release, operate) and its agents, scripts and dashboard screen.
- **A demo checkpoint per slice.** Each ends with an automated run of its written check and a short summary to you. The build runs full auto: no waiting for your approval, acceptance or merge yes.
- **The factory starts building itself.** Early slices are built by Claude Code with you steering. From F-05, when the build loop exists, the factory's own conductor, coder and reviewers build the remaining slices, so we test the factory on itself.
- **Agents get evals before they get work.** Each agent's evals from its spec are written in the same slice as the agent, so quality is measured from day one.
- **Built only when needed.** Boilerplates, modules and the design kit grow when a slice needs them, not ahead of time.

## Decisions before we start

All nine choices are settled, and none costs extra: everything starts on free tiers and your subscription.

| Decision | Recommendation | Why |
| --- | --- | --- |
| Dashboard stack | Next.js and TypeScript on Vercel | Matches the agreed Vercel dashboard and the first boilerplate, so the factory dogfoods its own stack |
| Index database | Postgres on Neon, through the Vercel Marketplace | Serverless, and a database branch per preview environment |
| Dashboard login | GitHub sign-in, locked to your account | Only you for now; client logins are phase 2 |
| Scripts and MCP server language | TypeScript | One language across dashboard, scripts and hooks |
| How agents run | Claude Code cloud sessions for interactive work; Claude Code in GitHub Actions, signed in with your subscription, for event-triggered work (PR reviews, schedules) | No separate API billing. All agents share your subscription's usage limits, so the Stage 0 spike checks how many can run in parallel before hitting them |
| GitHub layout | The transperaai organisation: a kit repo plus one repo per project | Matches one repo per project in the trace schema |
| Secrets vault | None to start: Vercel sensitive environment variables and GitHub secrets; test account passwords stored encrypted in Postgres | Free and enough for one person. Add a vault later if client numbers or a client's security rules call for one |
| Factory monitoring | Sentry and Vercel logs | The same observability kit client projects get |
| Dashboard domain | The free vercel.app address, for example transpera-factory.vercel.app | Works with GitHub sign-in; a custom domain can be added any time |

## Stage 0: foundations and spikes

Stage 0 sets up the empty factory and answers five unknowns before we rely on them. Exit check: an agent triggered from GitHub writes a record to a test repo, its tokens show up in the cost ledger, and you can log in to the empty dashboard.

**Set up**

1. GitHub organisation, the kit repo (agents, skills, hooks, scripts, templates, evals) and a test project repo.
2. Record schemas for every ID type in the trace schema, as JSON Schema in the kit, so the record validator has something to check against.
3. Dashboard shell on Vercel: Next.js, GitHub sign-in locked to you, connected to a Neon database.
4. Cost tracking from day one: Claude Code usage exported through OpenTelemetry into a ledger table, so the build of the factory is itself costed.
5. Eval harness skeleton: a runner that takes an agent, a set of cases and a scoring rule, and stores the result.

**Spikes** (time-boxed, each ends in a short written answer)

1. **Running agents:** cloud sessions versus GitHub Actions; how many agents can run in parallel within your subscription's usage limits; whether agents, skills and hooks load from the kit repo in both.
2. **Model hand-off:** Opus planning and Sonnet building inside one slice, with the plan file passed between them.
3. **MCP access:** agents in cloud sessions can reach the factory's MCP server to query records.
4. **Token telemetry:** per-session token counts reach the ledger with the slice ID attached.
5. **Preview databases:** a Neon branch per Vercel preview, created and removed automatically.

## F-01: the factory's tracer bullet

F-01 takes one workshop transcript all the way to an approved business requirement you can trace back to the quote it came from. Each step is the thinnest real version; later slices thicken it.

1. You drop a transcript into the dashboard inbox.
2. The intake sorter script converts it, gives it a SRC ID and matches speakers to the stakeholder list.
3. The intake agent extracts claims, each linked to its quote and speaker.
4. The BA agent drafts one business requirement from the claims, with the claim links stored on the record.
5. Records are committed to the project repo; the record validator hook checks them on commit.
6. Index sync copies them into Postgres; the trace checker confirms every link resolves.
7. An approval card appears on the Overview. You approve, and the approval recorder writes an APR record.
8. The Thread explorer shows the requirement, its claims and the source quote.

**Built in F-01:** intake sorter, ID allocator, record validator, approval recorder, index sync, trace checker (scripts and hooks); intake and BA agents with their first evals; the MCP server's read tools; the Overview card list and the top level of the Thread explorer.

**Done when:** an automated test runs steps 1 to 8 on a sample transcript and passes, and you've done it once yourself from the dashboard.

## F-02 to F-12: one stage per slice

F-02 to F-07 run in order, because each stage feeds the next. Once F-05's build loop exists, F-08 to F-12 can run in parallel, built by the factory itself. Size is relative: S about a few days of agent work, L about two weeks.

| Slice | Adds | Agents and scripts | Dashboard | Demo check | Size |
| --- | --- | --- | --- | --- | --- |
| F-02 Discovery | Stakeholders and attribution, speaker confirmation, Keep or Remove cards for sensitive details, interaction log, brief | Intake (full), BA agent Discovery skill; dedupe | Sources inbox, Needs you cards, project records | Three sources including an unlabelled speaker go through; you approve the brief | M |
| F-03 Analysis and requirements | Use cases, workflows, rules, glossary, fit-gap, stories with acceptance criteria, batch approval | BA agent Analysis skill, story writer; impact finder | Full Thread explorer drill-down | You approve 5 stories and trace each back to its source | M |
| F-04 Architecture | ADRs with back and forth, threat model, privacy and compliance, slice plan with tracer | Architect, security agent, slice planner; overlap checker | ADR review, board planned column | You approve the architecture and a 3-slice plan | M |
| F-05 Build loop | Conductor, Opus plans and Sonnet builds, reviews, PR gates, integration branch, questions to you, escalation after 3 rounds | Conductor, coder, code reviewer, UX reviewer; token meter, code linker, scanner runner | Full board with Needs you column, agent feed | A sample tracer slice is built, reviewed and merged to the integration branch without you touching code | L |
| F-06 Test | Test writing, exploration, test environments, UAT checklists, test accounts, defects | Test author, QA explorer; test environment manager, checklist renderer | Testing, Test accounts | You run UAT, fail one step, and see the defect fixed and re-tested | M |
| F-07 Release | Release packaging, dev docs, patch notes, production approval by phone, hypercare | Docs writer; release packager, report renderer, notifier | Releases and docs | The sample app reaches production after your one-tap approval | M |
| F-08 Operate | Triage, error grouping, monitoring kit, proactive checklist, integration watch | Triage, maintenance planner; job scheduler, integration fetcher, expiry checker, restore tester | Health, Integrations | A planted error becomes an issue, a fix and a patch; the weekly digest is generated | L |
| F-09 Cost | Full ledger with Vercel, GitHub and services, subscription allocation, budgets and warnings | Cost ledger | Cost | October's rollup matches the bills within 5% | S |
| F-10 Learning | Signals, scrubbing, eval runs, lesson cards, trials, rollback | Learning agent; signal collector, data scrubber, eval runner | Factory lessons | A planted repeated mistake becomes an approved, trialled lesson | M |
| F-11 Design | Kit picker with mix and match, design library, kit import | Designer; kit installer | Design library | You pick a minimal kit and the dashboard is restyled through it | M |
| F-12 Profiles | Lite, Client, SaaS and Headless overlays, Handover mode, ASVS L3 evidence pack, client reports | All overlays; project bootstrap | Projects list, client reports | One project bootstrapped per profile; a handover pack generated | M |

## Where everything runs

Git is the record; everything else either writes to it or reads an index of it.

```text
You (dashboard and phone)
   | approve, test, review
   v
Vercel:        Dashboard (Next.js) | MCP server (agents query records) | Postgres index (records, links, cost ledger)
                                       ^ query records                    ^ index sync (from GitHub Actions)
Claude Code:   Hooks (rules agents cannot skip) | Agent sessions (17 agents, Opus and Sonnet) | Skills (loaded from the kit repo)
                                       | commit records, open PRs
                                       v
GitHub:        Kit repo (agents, skills, scripts) | Project repos (records and code) | Actions (CI, schedules, index sync)
                                       ^ alerts become issues              | approved deploys
Outside:       Secrets (Vercel and GitHub secrets) | Monitoring (errors, uptime, analytics) | Client apps (deployed to Vercel)
```

Agents run as Claude Code sessions, started by you or by GitHub Actions on events and schedules. They read records through the MCP server and commit records and code to the project repo. Actions sync each repo into Postgres, which the dashboard reads. Secrets live in Vercel and GitHub, never the repo, and monitoring feeds the triage agent.

## Risks and mitigations

The biggest risk is building too much factory before it has done any real work; every slice ends at a demo of real use to stop that.

| Risk | What it would look like | Mitigation |
| --- | --- | --- |
| Over-building | Months of factory, no client value | One stage per slice, each usable for real work as soon as it lands; demo check per slice; first real project can start after F-07 |
| Agent quality | Agents produce plausible but wrong requirements or code | Evals written with each agent; human approval gates stay; learning loop only after F-10 |
| Cost | Opus-heavy roles burn the budget | Cost ledger from Stage 0; token meter per slice; roles move to Sonnet when evals show equal quality |
| Platform limits | Claude Code cloud or Actions can't run an agent the way the spec assumes | Stage 0 spikes answer this before any slice depends on it |
| Usage limits | Parallel agents hit the subscription's usage limits | Spike 1 measures it; the conductor lowers parallel slices when limits get close |
| Spec drift | The build drifts from the design doc and agent specs | The factory's own trace checker runs on the factory repo from F-01 |
| Scope creep from polish | Time goes into visual design before the loop works | Visual polish waits until F-11, done through the kit picker |

## After the build

The factory is proven in two steps: a dry run on a pretend project, then one small real project.

1. **Dry run.** A pretend client project goes through every stage, from intake to a live KPI review, using sample transcripts and a sample app. We log every gap, confusing screen and wrong agent output, and fix them before real work.
2. **First real project.** Pick something small and low-risk, ideally an internal tool or an automation, in the Lite or Headless profile. It proves the loop on real requirements without client pressure.
3. **Then a client project** in the Client profile, with the learning loop switched on.

If the first seven slices (to F-07 release) are working and a small project is waiting, it can start before Operate, cost dashboards and learning are finished; those slices can follow in parallel.
